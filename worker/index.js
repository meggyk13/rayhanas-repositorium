// Rayhana's Repositorium: Cloudflare Worker entry.
//
// The site deploys as a Worker with static assets: requests that match a file
// in ./dist are served by the edge before this runs, so `fetch` only sees
// paths with no matching asset. We handle /api/ebru/* and the print share pages
// at /tools/ebru/p/<id> here, and hand everything else back to the assets
// (which serves the site's 404 page).
//
// Ebru gallery: anyone can share a print from the marbling tray. Prints are kept
// for as long as the database has room (see STORE_BUDGET). Each has an optional
// title, an optional "made by" name (prints shared before titles existed only
// have the name), the time it was shared, a count of hearts, and two pictures:
//   image  the print as its maker framed it (shape, layout, paper)
//   sheet  the whole uncropped tray (1000x1400 proportions) on the maker's
//          paper, so viewers can re-cut it to another shape or layout
// plus the maker's paper colour, shape and layout.
//
// Hearts: anyone can heart a print once. The browser keeps a random voter id in
// localStorage and sends it with each heart; only its hash is stored, one row per
// print and voter, so a heart can be taken back. It's a friendly count, not a
// vote: clearing the browser's storage lets someone heart again.
//
// Share pages: /tools/ebru/p/<id> is the link people send by Messages or social
// apps. It carries the print as its preview picture, then opens the gallery with
// that print showing.

// The gallery keeps every print until its pictures add up to STORE_BUDGET bytes
// (D1's free plan allows 500 MB per database; this leaves room for the rest).
// Past that, each new share makes room: the oldest prints first lose their
// uncropped sheet (they still show, but can no longer be re-cut), and once no old
// sheets are left, the oldest prints go. The newest KEEP_SHEETS always keep theirs.
// The pictures' own sizes are counted, not the database file's: SQLite keeps freed
// space for reuse, so the file never shrinks and can't show what is free.
const STORE_BUDGET = 420 * 1024 * 1024;
const KEEP_SHEETS = 200;
const PAGE_MAX = 60;
const MAX_BYTES = 700 * 1024; // per picture; a 1000x1400 JPEG print is ~150-500 KB
const MAX_SIDE = 1400;
const MAX_NAME = 40;
const MAX_TITLE = 60;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 6; // shares per visitor per 10 minutes
const HEART_RATE_MAX = 120; // hearts per visitor per 10 minutes
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
        title TEXT,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        image BLOB NOT NULL,
        sheet BLOB,
        paper TEXT,
        shape TEXT,
        layout TEXT,
        ip_hash TEXT,
        hearts INTEGER NOT NULL DEFAULT 0,
        color TEXT,
        color2 TEXT,
        color_v INTEGER
      )`
    ),
    db.prepare('CREATE INDEX IF NOT EXISTS ebru_prints_created ON ebru_prints (created_at)'),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS ebru_hearts (
        print_id TEXT NOT NULL,
        voter TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        ip_hash TEXT,
        PRIMARY KEY (print_id, voter)
      )`
    ),
    db.prepare('CREATE INDEX IF NOT EXISTS ebru_hearts_ip ON ebru_hearts (ip_hash, created_at)'),
  ]);
  // A table made by an earlier version of the gallery lacks later columns; add any that are missing.
  const { results } = await db.prepare('PRAGMA table_info(ebru_prints)').all();
  const have = new Set(results.map((c) => c.name));
  const added = [
    ['sheet', 'BLOB'], ['paper', 'TEXT'], ['shape', 'TEXT'], ['layout', 'TEXT'], ['title', 'TEXT'],
    ['hearts', 'INTEGER NOT NULL DEFAULT 0'], ['color', 'TEXT'], ['color2', 'TEXT'], ['color_v', 'INTEGER'],
  ]
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

function cleanText(v, max) {
  if (typeof v !== 'string') return null;
  const s = v
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const cut = Array.from(s).slice(0, max).join('').trim();
  return cut || null;
}

async function hash16(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d).slice(0, 16)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
const ipHash = (request) => hash16('ebru-gallery:' + (request.headers.get('cf-connecting-ip') || 'local'));

// Changes must come from this site's own pages.
function sameOrigin(request) {
  const origin = request.headers.get('origin');
  try {
    return !!origin && new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

const toItem = (r) => ({
  id: r.id,
  name: r.name || null,
  title: r.title || null,
  createdAt: r.created_at,
  width: r.width,
  height: r.height,
  url: `/api/ebru/prints/${r.id}.jpg`,
  sheetUrl: r.has_sheet ? `/api/ebru/prints/${r.id}/sheet.jpg` : null,
  shareUrl: `/tools/ebru/p/${r.id}`,
  paper: r.paper || null,
  shape: r.shape || null,
  layout: r.layout || null,
  hearts: r.hearts || 0,
  color: r.color || null,
  color2: r.color2 || null,
  colorV: r.color ? r.color_v || 1 : null,
});

const COLS = 'id, created_at, name, title, width, height, paper, shape, layout, hearts, color, color2, color_v, sheet IS NOT NULL AS has_sheet';

// Color families, for the gallery's filter: `color` is the family most of a
// print's ink belongs to (paper left out), and `color2` the next most, when there
// is enough of it to notice. A print in several strong colors with none leading is
// 'rainbow', with its biggest color second. The tray works both out from the print
// as it is shared; prints from before then get theirs from the gallery page, which
// works them out from the picture it has shown.
// COLOR_V is the version of that sorting rule (1: families only; 2: rainbow too).
// A print's colors can be set once per version: a print sorted by an older rule
// (color_v below COLOR_V, or none, which is 1) can be sorted again, and the gallery
// page does so as it shows it. Prints waiting for that count as unsorted.
const COLORS = new Set(['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'brown', 'rainbow', 'neutral']);
const COLOR_V = 2;
const UNSORTED = `(color IS NULL OR COALESCE(color_v, 1) < ${COLOR_V})`;

// The sorts: newest first, oldest first, or most hearts (newest first among equals).
// Each pages on a cursor of the sort's own keys, so ?before=<next> picks up after
// the last print of the page before.
const SORTS = {
  new: {
    order: 'created_at DESC, id DESC',
    after: 'created_at < ?1 OR (created_at = ?1 AND id < ?2)',
    cursor: /^(\d{1,15})\.([0-9a-f-]{36})$/,
    key: (r) => `${r.created_at}.${r.id}`,
  },
  old: {
    order: 'created_at ASC, id ASC',
    after: 'created_at > ?1 OR (created_at = ?1 AND id > ?2)',
    cursor: /^(\d{1,15})\.([0-9a-f-]{36})$/,
    key: (r) => `${r.created_at}.${r.id}`,
  },
  hearts: {
    order: 'hearts DESC, created_at DESC, id DESC',
    after: 'hearts < ?3 OR (hearts = ?3 AND (created_at < ?1 OR (created_at = ?1 AND id < ?2)))',
    cursor: /^(\d{1,9})\.(\d{1,15})\.([0-9a-f-]{36})$/,
    key: (r) => `${r.hearts || 0}.${r.created_at}.${r.id}`,
  },
};

// A page at a time: ?limit=24&sort=new|old|hearts&colors=<family>[,<family>], then
// add &before=<next> (from the previous answer) for the page after it.
// A print's colors are its two main families (color and color2); choosing families
// shows the prints that have all of them:
//   one family    prints with it as either of their two main colors
//   two families  prints whose two main colors are those two, either way round
// The answer counts, for the filter's chips, how many prints have each family
// (`families`) and, with one family chosen, how many of those also have each other
// family (`pairs`): each chip's number is what tapping it would show.
// ?uncolored=1 lists only prints with no family yet.
async function listPrints(env, url) {
  await ensureSchema(env.DB);
  const q = url.searchParams;
  const limit = Math.max(1, Math.min(PAGE_MAX, parseInt(q.get('limit'), 10) || 24));
  const sort = SORTS[q.get('sort')] ? q.get('sort') : 'new';
  const S = SORTS[sort];
  const picked = [...new Set(String(q.get('colors') || q.get('color') || '').split(','))].filter((c) => COLORS.has(c)).slice(0, 2);
  const [c1, c2] = picked;
  const uncolored = q.get('uncolored') === '1';
  const m = S.cursor.exec(q.get('before') || '');
  // ?1 created_at, ?2 id, ?3 hearts (from the cursor), ?4 and ?6 the families, ?5 the limit;
  // a value is bound only if its number appears (?6 only when two families are chosen)
  const cur = m ? (sort === 'hearts' ? [+m[2], m[3], +m[1]] : [+m[1], m[2], 0]) : [0, '', 0];
  const match = c2 ? '((color = ?4 AND color2 = ?6) OR (color = ?6 AND color2 = ?4))' : c1 ? '(color = ?4 OR color2 = ?4)' : null;
  const where = [m ? `(${S.after})` : null, match, uncolored ? UNSORTED : null].filter(Boolean);
  const W = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const countW = [match, uncolored ? UNSORTED : null].filter(Boolean);
  const queries = [
    env.DB.prepare(`SELECT ${COLS} FROM ebru_prints${W} ORDER BY ${S.order} LIMIT ?5`).bind(...[...cur, c1 || '', limit + 1, c2 || ''].slice(0, c2 ? 6 : 5)),
    // the count has no cursor; ?1-?3 are bound only so ?4-?6 line up
    env.DB.prepare(`SELECT COUNT(*) AS n FROM ebru_prints${countW.length ? ' WHERE ' + countW.join(' AND ') : ''} LIMIT ?5`)
      .bind(...[0, '', 0, c1 || '', 1, c2 || ''].slice(0, c2 ? 6 : 5)),
    // a print's two families are always different, so it counts once under each
    env.DB.prepare(
      `SELECT f, COUNT(*) AS n FROM (
         SELECT color AS f FROM ebru_prints WHERE color IS NOT NULL
         UNION ALL SELECT color2 AS f FROM ebru_prints WHERE color2 IS NOT NULL
       ) GROUP BY f`
    ),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM ebru_prints WHERE ${UNSORTED}`),
  ];
  if (c1 && !c2) {
    queries.push(
      env.DB
        .prepare(
          `SELECT other, COUNT(*) AS n FROM (
             SELECT color2 AS other FROM ebru_prints WHERE color = ?1
             UNION ALL SELECT color AS other FROM ebru_prints WHERE color2 = ?1
           ) WHERE other IS NOT NULL GROUP BY other`
        )
        .bind(c1)
    );
  }
  const [{ results }, count, fams, unknown, pairs] = await env.DB.batch(queries);
  const rows = results.slice(0, limit);
  const last = rows[rows.length - 1];
  return json({
    prints: rows.map(toItem),
    total: count.results[0].n,
    families: Object.fromEntries(fams.results.map((r) => [r.f, r.n])),
    pairs: pairs ? Object.fromEntries(pairs.results.map((r) => [r.other, r.n])) : null,
    uncolored: unknown.results[0].n,
    next: results.length > limit && last ? S.key(last) : null,
  });
}

// POST {color, color2, v}: sort a print into its color families by rule version v.
// Taken only if the print has none yet, or was sorted by an older rule.
// color2 may be null (one family covers nearly all of its ink).
async function colorPrint(request, env, id) {
  if (!sameOrigin(request)) return fail(403, 'Only from the gallery');
  if (!ID_RE.test(id)) return fail(404, 'Not found');
  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'Expected JSON');
  }
  const color = body && typeof body.color === 'string' ? body.color : '';
  const color2 = body && typeof body.color2 === 'string' && COLORS.has(body.color2) && body.color2 !== color ? body.color2 : null;
  if (!COLORS.has(color)) return fail(400, 'Not a color family');
  const v = body.v === undefined ? 1 : body.v;
  if (!Number.isInteger(v) || v < 1 || v > COLOR_V) return fail(400, 'Unknown sorting rule');
  await ensureSchema(env.DB);
  const res = await env.DB
    .prepare('UPDATE ebru_prints SET color = ?, color2 = ?, color_v = ? WHERE id = ? AND (color IS NULL OR COALESCE(color_v, 1) < ?)')
    .bind(color, color2, v, id, v)
    .run();
  return json({ ok: true, set: !!(res.meta && res.meta.changes) });
}

async function findPrint(env, id) {
  if (!ID_RE.test(id)) return null;
  await ensureSchema(env.DB);
  return env.DB.prepare(`SELECT ${COLS} FROM ebru_prints WHERE id = ?`).bind(id).first();
}

async function onePrint(env, id) {
  const row = await findPrint(env, id);
  return row ? json({ print: toItem(row) }) : fail(404, 'Not found');
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

// After a share, make room while the pictures add up to more than the budget: the
// oldest print that still has a sheet (outside the newest KEEP_SHEETS) loses it, or
// when none is left, the oldest print goes. A share adds one print, so freeing what
// it added takes only a step or two; MAX_STEPS bounds the work of any one share.
const MAX_STEPS = 8;
async function makeRoom(env) {
  const db = env.DB;
  // LENGTH() of a blob reads only its stored size, not the picture
  const sum = await db
    .prepare('SELECT COALESCE(SUM(LENGTH(image) + COALESCE(LENGTH(sheet), 0)), 0) AS used FROM ebru_prints')
    .first();
  let used = sum ? sum.used : 0;
  let removed = false;
  for (let step = 0; step < MAX_STEPS && used > STORE_BUDGET; step++) {
    const old = await db
      .prepare(
        `SELECT id, LENGTH(sheet) AS n FROM ebru_prints WHERE sheet IS NOT NULL
         AND id NOT IN (SELECT id FROM ebru_prints ORDER BY created_at DESC LIMIT ?)
         ORDER BY created_at ASC LIMIT 1`
      )
      .bind(KEEP_SHEETS)
      .first();
    if (old) {
      await db.prepare('UPDATE ebru_prints SET sheet = NULL WHERE id = ?').bind(old.id).run();
      used -= old.n;
      continue;
    }
    const gone = await db
      .prepare('SELECT id, LENGTH(image) + COALESCE(LENGTH(sheet), 0) AS n FROM ebru_prints ORDER BY created_at ASC LIMIT 1')
      .first();
    if (!gone) break;
    await db.prepare('DELETE FROM ebru_prints WHERE id = ?').bind(gone.id).run();
    used -= gone.n;
    removed = true;
  }
  if (removed) await db.prepare('DELETE FROM ebru_hearts WHERE print_id NOT IN (SELECT id FROM ebru_prints)').run();
}

async function sharePrint(request, env) {
  if (!sameOrigin(request)) return fail(403, 'Share from the tray page');
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
  const name = cleanText(form.get('name'), MAX_NAME);
  const title = cleanText(form.get('title'), MAX_TITLE);
  const fam = String(form.get('color') || '');
  const color = COLORS.has(fam) ? fam : null;
  const fam2 = String(form.get('color2') || '');
  const color2 = color && COLORS.has(fam2) && fam2 !== color ? fam2 : null;
  const cv = parseInt(form.get('colorv'), 10);
  const colorV = color ? (cv >= 1 && cv <= COLOR_V ? cv : 1) : null;

  await ensureSchema(env.DB);
  const now = Date.now();
  const who = await ipHash(request);
  const recent = await env.DB
    .prepare('SELECT COUNT(*) AS n FROM ebru_prints WHERE ip_hash = ? AND created_at > ?')
    .bind(who, now - RATE_WINDOW_MS)
    .first();
  if (recent && recent.n >= RATE_MAX) return fail(429, 'That’s a lot of prints! Try again in a few minutes.');

  const id = crypto.randomUUID();
  await env.DB
    .prepare(
      `INSERT INTO ebru_prints (id, created_at, name, title, width, height, image, sheet, paper, shape, layout, ip_hash, color, color2, color_v)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, now, name, title, image.size.width, image.size.height, image.bytes, sheet.bytes, paper.toLowerCase(), shape, layout, who, color, color2, colorV)
    .run();
  await makeRoom(env);
  return json(
    {
      print: toItem({
        id, created_at: now, name, title, width: image.size.width, height: image.size.height,
        has_sheet: 1, paper: paper.toLowerCase(), shape, layout, hearts: 0, color, color2, color_v: colorV,
      }),
    },
    201
  );
}

// POST {voter, on}: heart a print (on: true) or take the heart back (on: false).
async function heartPrint(request, env, id) {
  if (!sameOrigin(request)) return fail(403, 'Heart from the gallery');
  if (!ID_RE.test(id)) return fail(404, 'Not found');
  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'Expected JSON');
  }
  const token = body && typeof body.voter === 'string' ? body.voter : '';
  if (!/^[0-9a-f-]{20,64}$/i.test(token)) return fail(400, 'Missing voter');
  const on = body.on !== false;
  await ensureSchema(env.DB);
  const exists = await env.DB.prepare('SELECT 1 FROM ebru_prints WHERE id = ?').bind(id).first();
  if (!exists) return fail(404, 'Not found');
  const voter = await hash16('ebru-heart:' + token.toLowerCase());
  const now = Date.now();
  const who = await ipHash(request);
  if (on) {
    const recent = await env.DB
      .prepare('SELECT COUNT(*) AS n FROM ebru_hearts WHERE ip_hash = ? AND created_at > ?')
      .bind(who, now - RATE_WINDOW_MS)
      .first();
    if (recent && recent.n >= HEART_RATE_MAX) return fail(429, 'That’s a lot of hearts! Try again in a few minutes.');
  }
  const change = on
    ? env.DB
        .prepare('INSERT OR IGNORE INTO ebru_hearts (print_id, voter, created_at, ip_hash) VALUES (?, ?, ?, ?)')
        .bind(id, voter, now, who)
    : env.DB.prepare('DELETE FROM ebru_hearts WHERE print_id = ? AND voter = ?').bind(id, voter);
  const out = await env.DB.batch([
    change,
    env.DB.prepare('UPDATE ebru_prints SET hearts = (SELECT COUNT(*) FROM ebru_hearts WHERE print_id = ?) WHERE id = ?').bind(id, id),
    env.DB.prepare('SELECT hearts FROM ebru_prints WHERE id = ?').bind(id),
  ]);
  const row = out[2].results[0];
  return json({ hearts: row ? row.hearts : 0, hearted: on });
}

const escHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The page a shared link opens: the print as its preview picture, then on to the gallery.
async function sharePage(env, url, id) {
  const galleryHome = new URL('/tools/ebru/gallery/', url).toString();
  const p = await findPrint(env, id);
  if (!p) return Response.redirect(galleryHome, 302);
  const gallery = `/tools/ebru/gallery/#p=${p.id}`;
  const title = p.title ? `“${p.title}”, a marbled print` : 'A marbled print';
  const desc = (p.name ? `Made by: ${p.name}. ` : '') + 'Marbled in the Ebru Marbling Tray at Rayhana’s Repositorium. Make your own.';
  const page = `${url.origin}/tools/ebru/p/${p.id}`;
  const img = `${url.origin}/api/ebru/prints/${p.id}.jpg`;
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(title)} · Ebru Gallery</title>
<meta name="description" content="${escHtml(desc)}">
<link rel="canonical" href="${page}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Rayhana's Repositorium">
<meta property="og:title" content="${escHtml(title)}">
<meta property="og:description" content="${escHtml(desc)}">
<meta property="og:url" content="${page}">
<meta property="og:image" content="${img}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="${p.width}">
<meta property="og:image:height" content="${p.height}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/tools/ebru/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/tools/ebru/apple-touch-icon.png">
<meta http-equiv="refresh" content="0; url=${gallery}">
<style>body{margin:0;background:#211813;color:#f3ead9;font:18px/1.4 Georgia,serif;text-align:center;padding:24px}img{max-width:min(90vw,500px);height:auto}a{color:#d2ac55}</style>
</head><body>
<p><img src="/api/ebru/prints/${p.id}.jpg" alt="${escHtml(title)}" width="${p.width}" height="${p.height}"></p>
<p><a href="${gallery}">See it in the Ebru Gallery</a></p>
<script>location.replace(${JSON.stringify(gallery)})</script>
</body></html>`;
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'x-content-type-options': 'nosniff',
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');

    const share = path.match(/^\/tools\/ebru\/p\/([^/]+)$/);
    if (share && (request.method === 'GET' || request.method === 'HEAD')) {
      try {
        return await sharePage(env, url, share[1]);
      } catch (e) {
        console.error('[ebru] share page failed', e);
        return Response.redirect(new URL('/tools/ebru/gallery/', url).toString(), 302);
      }
    }
    if (!path.startsWith('/api/')) {
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
    }

    try {
      if (path === '/api/ebru/prints') {
        if (request.method === 'GET') return await listPrints(env, url);
        if (request.method === 'POST') return await sharePrint(request, env);
        return fail(405, 'Method not allowed');
      }
      const col = path.match(/^\/api\/ebru\/prints\/([^/]+)\/color$/);
      if (col) {
        if (request.method !== 'POST') return fail(405, 'Method not allowed');
        return await colorPrint(request, env, col[1]);
      }
      const heart = path.match(/^\/api\/ebru\/prints\/([^/]+)\/heart$/);
      if (heart) {
        if (request.method !== 'POST') return fail(405, 'Method not allowed');
        return await heartPrint(request, env, heart[1]);
      }
      const m = path.match(/^\/api\/ebru\/prints\/([^/]+?)(\.jpg|\/sheet\.jpg)$/);
      if (m) {
        if (request.method !== 'GET' && request.method !== 'HEAD') return fail(405, 'Method not allowed');
        return await getPicture(env, m[1], m[2] === '.jpg' ? 'image' : 'sheet');
      }
      const one = path.match(/^\/api\/ebru\/prints\/([^/.]+)$/);
      if (one) {
        if (request.method !== 'GET') return fail(405, 'Method not allowed');
        return await onePrint(env, one[1]);
      }
      return fail(404, 'Not found');
    } catch (e) {
      console.error('[ebru] request failed', e);
      return fail(500, 'Something went wrong');
    }
  },
};
