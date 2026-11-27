// Rayhana's Repositorium: Cloudflare Worker entry.
//
// The site deploys as a Worker with static assets: requests that match a file
// in ./dist are served by the edge before this runs, so `fetch` only sees
// paths with no matching asset. We handle /api/ebru/* here and hand everything
// else back to the assets (which serves the site's 404 page).
//
// Ebru gallery: anyone can share a print from the marbling tray. Only the
// newest KEEP prints are kept. Each has an optional "made by" name, the time
// it was shared, and two pictures:
//   image  the print as its maker framed it (shape, layout, paper)
//   sheet  the whole uncropped tray (1000x1400 proportions) on the maker's
//          paper, so viewers can re-cut it to another shape or layout
// plus the maker's paper colour, shape and layout.

const KEEP = 100;
const MAX_BYTES = 700 * 1024; // per picture; a 1000x1400 JPEG print is ~150-500 KB
const MAX_SIDE = 1400;
const MAX_NAME = 40;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 6; // shares per visitor per 10 minutes
const SHAPES = new Set(['portrait', 'square', 'landscape', 'strip']);
const LAYOUTS = new Set(['full', 'album', 'mount']);
const HEX_RE = /^#[0-9a-f]{6}$/i;

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extra,
    },
  });
const fail = (status, message) => json({ error: message }, status);

let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS ebru_prints (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        name TEXT,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        image BLOB NOT NULL,
        sheet BLOB,
        paper TEXT,
        shape TEXT,
        layout TEXT,
        ip_hash TEXT
      )`
    ),
    db.prepare('CREATE INDEX IF NOT EXISTS ebru_prints_created ON ebru_prints (created_at)'),
  ]);
  // A table made by the first version of the gallery lacks the re-cut columns; add any that are missing.
  const { results } = await db.prepare('PRAGMA table_info(ebru_prints)').all();
  const have = new Set(results.map((c) => c.name));
  const added = [['sheet', 'BLOB'], ['paper', 'TEXT'], ['shape', 'TEXT'], ['layout', 'TEXT']]
    .filter(([name]) => !have.has(name))
    .map(([name, type]) => db.prepare(`ALTER TABLE ebru_prints ADD COLUMN ${name} ${type}`));
  if (added.length) {
    try {
      await db.batch(added);
    } catch (e) {
      // another request may have added them at the same moment
      if (!/duplicate column/i.test(String(e && e.message))) throw e;
    }
  }
  schemaReady = true;
}

// Width and height from a baseline or progressive JPEG's SOF marker; null if
// the bytes aren't a well-formed JPEG.
function jpegSize(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2) return null;
    if ((m >= 0xc0 && m <= 0xcf) && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      const height = (b[i + 5] << 8) | b[i + 6];
      const width = (b[i + 7] << 8) | b[i + 8];
      return width && height ? { width, height } : null;
    }
    i += 2 + len;
  }
  return null;
}

// Read one JPEG field from the form; returns { bytes, size } or an error string.
async function jpegField(form, key) {
  const file = form.get(key);
  if (!file || typeof file === 'string') return 'missing';
  if (file.size > MAX_BYTES) return 'too large';
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > MAX_BYTES) return 'too large';
  const size = jpegSize(bytes);
  if (!size || size.width > MAX_SIDE || size.height > MAX_SIDE) return 'invalid';
  return { bytes, size };
}

function cleanName(v) {
  if (typeof v !== 'string') return null;
  const s = v
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const cut = Array.from(s).slice(0, MAX_NAME).join('').trim();
  return cut || null;
}

async function ipHash(request) {
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ebru-gallery:' + ip));
  return [...new Uint8Array(d).slice(0, 16)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

const toItem = (r) => ({
  id: r.id,
  name: r.name || null,
  createdAt: r.created_at,
  width: r.width,
  height: r.height,
  url: `/api/ebru/prints/${r.id}.jpg`,
  sheetUrl: r.has_sheet ? `/api/ebru/prints/${r.id}/sheet.jpg` : null,
  paper: r.paper || null,
  shape: r.shape || null,
  layout: r.layout || null,
});

async function listPrints(env) {
  await ensureSchema(env.DB);
  const { results } = await env.DB
    .prepare(
      `SELECT id, created_at, name, width, height, paper, shape, layout, sheet IS NOT NULL AS has_sheet
       FROM ebru_prints ORDER BY created_at DESC LIMIT ?`
    )
    .bind(KEEP)
    .all();
  return json({ prints: results.map(toItem) });
}

async function getPicture(env, id, column) {
  if (!ID_RE.test(id)) return fail(404, 'Not found');
  await ensureSchema(env.DB);
  // column is one of two fixed names chosen by the router, never user input
  const row = await env.DB.prepare(`SELECT ${column} AS pic FROM ebru_prints WHERE id = ?`).bind(id).first();
  if (!row || !row.pic) return fail(404, 'Not found');
  return new Response(new Uint8Array(row.pic), {
    headers: {
      'content-type': 'image/jpeg',
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
}

async function sharePrint(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  if (!origin || new URL(origin).host !== url.host) return fail(403, 'Share from the tray page');
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > 2 * MAX_BYTES + 8192) return fail(413, 'That print is too large');

  let form;
  try {
    form = await request.formData();
  } catch {
    return fail(400, 'Expected a form with an image');
  }
  const image = await jpegField(form, 'image');
  const sheet = await jpegField(form, 'sheet');
  for (const f of [image, sheet]) {
    if (f === 'too large') return fail(413, 'That print is too large');
    if (typeof f === 'string') return fail(400, 'Not a print from the tray');
  }
  // the sheet is the whole tray, which is 1000 x 1400
  if (Math.abs(sheet.size.height / sheet.size.width - 1.4) > 0.02) return fail(400, 'Not a print from the tray');
  const paper = String(form.get('paper') || '');
  const shape = String(form.get('shape') || '');
  const layout = String(form.get('layout') || '');
  if (!HEX_RE.test(paper) || !SHAPES.has(shape) || !LAYOUTS.has(layout)) return fail(400, 'Not a print from the tray');
  const name = cleanName(form.get('name'));

  await ensureSchema(env.DB);
  const now = Date.now();
  const who = await ipHash(request);
  const recent = await env.DB
    .prepare('SELECT COUNT(*) AS n FROM ebru_prints WHERE ip_hash = ? AND created_at > ?')
    .bind(who, now - RATE_WINDOW_MS)
    .first();
  if (recent && recent.n >= RATE_MAX) return fail(429, 'That’s a lot of prints! Try again in a few minutes.');

  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB
      .prepare(
        `INSERT INTO ebru_prints (id, created_at, name, width, height, image, sheet, paper, shape, layout, ip_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, now, name, image.size.width, image.size.height, image.bytes, sheet.bytes, paper.toLowerCase(), shape, layout, who),
    env.DB
      .prepare('DELETE FROM ebru_prints WHERE id NOT IN (SELECT id FROM ebru_prints ORDER BY created_at DESC LIMIT ?)')
      .bind(KEEP),
  ]);
  return json(
    {
      print: toItem({
        id, created_at: now, name, width: image.size.width, height: image.size.height,
        has_sheet: 1, paper: paper.toLowerCase(), shape, layout,
      }),
    },
    201
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');

    if (!path.startsWith('/api/')) {
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
    }

    try {
      if (path === '/api/ebru/prints') {
        if (request.method === 'GET') return await listPrints(env);
        if (request.method === 'POST') return await sharePrint(request, env);
        return fail(405, 'Method not allowed');
      }
      const m = path.match(/^\/api\/ebru\/prints\/([^/]+?)(\.jpg|\/sheet\.jpg)$/);
      if (m) {
        if (request.method !== 'GET' && request.method !== 'HEAD') return fail(405, 'Method not allowed');
        return await getPicture(env, m[1], m[2] === '.jpg' ? 'image' : 'sheet');
      }
      return fail(404, 'Not found');
    } catch (e) {
      console.error('[ebru] request failed', e);
      return fail(500, 'Something went wrong');
    }
  },
};
