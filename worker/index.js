// Rayhana's Repositorium: Cloudflare Worker entry.
//
// The site deploys as a Worker with static assets: requests that match a file
// in ./dist are served by the edge before this runs, so `fetch` only sees
// paths with no matching asset. We handle /api/ebru/* here and hand everything
// else back to the assets (which serves the site's 404 page).
//
// Ebru gallery: anyone can share a print from the marbling tray. Only the
// newest KEEP prints are kept; each has an optional "made by" name and the
// time it was shared.

const KEEP = 100;
const MAX_BYTES = 600 * 1024; // a 1000px JPEG print is ~100-300 KB
const MAX_SIDE = 1400;
const MAX_NAME = 40;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 6; // shares per visitor per 10 minutes

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
        ip_hash TEXT
      )`
    ),
    db.prepare('CREATE INDEX IF NOT EXISTS ebru_prints_created ON ebru_prints (created_at)'),
  ]);
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
});

async function listPrints(env) {
  await ensureSchema(env.DB);
  const { results } = await env.DB
    .prepare('SELECT id, created_at, name, width, height FROM ebru_prints ORDER BY created_at DESC LIMIT ?')
    .bind(KEEP)
    .all();
  return json({ prints: results.map(toItem) });
}

async function getImage(env, id) {
  if (!ID_RE.test(id)) return fail(404, 'Not found');
  await ensureSchema(env.DB);
  const row = await env.DB.prepare('SELECT image FROM ebru_prints WHERE id = ?').bind(id).first();
  if (!row) return fail(404, 'Not found');
  return new Response(new Uint8Array(row.image), {
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
  if (declared > MAX_BYTES + 4096) return fail(413, 'That print is too large');

  let form;
  try {
    form = await request.formData();
  } catch {
    return fail(400, 'Expected a form with an image');
  }
  const file = form.get('image');
  if (!file || typeof file === 'string') return fail(400, 'No image');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > MAX_BYTES) return fail(413, 'That print is too large');
  const size = jpegSize(bytes);
  if (!size || size.width > MAX_SIDE || size.height > MAX_SIDE) return fail(400, 'Not a print from the tray');
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
      .prepare('INSERT INTO ebru_prints (id, created_at, name, width, height, image, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, now, name, size.width, size.height, bytes, who),
    env.DB
      .prepare('DELETE FROM ebru_prints WHERE id NOT IN (SELECT id FROM ebru_prints ORDER BY created_at DESC LIMIT ?)')
      .bind(KEEP),
  ]);
  return json({ print: toItem({ id, created_at: now, name, width: size.width, height: size.height }) }, 201);
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
      const m = path.match(/^\/api\/ebru\/prints\/([^/]+)\.jpg$/);
      if (m) {
        if (request.method !== 'GET' && request.method !== 'HEAD') return fail(405, 'Method not allowed');
        return await getImage(env, m[1]);
      }
      return fail(404, 'Not found');
    } catch (e) {
      console.error('[ebru] request failed', e);
      return fail(500, 'Something went wrong');
    }
  },
};
