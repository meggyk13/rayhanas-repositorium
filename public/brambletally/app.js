/* Brambletally — client app.
 * This file currently handles auth (sign-in gate + magic-link request).
 * noodlr's project/step/supply/timeline/focus-session screens are ported in
 * on top of this in later commits. */

'use strict';

const TURNSTILE_SITE_KEY = '0x4AAAAAAEqk-rZUelo-uw8q';
const APP_PATH = '/tools/brambletally/';

// ── API ────────────────────────────────────────────────────────────────────
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ── DOM helpers ────────────────────────────────────────────────────────────
const root = () => document.getElementById('bt-app');

function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ── Theme ──────────────────────────────────────────────────────────────────
function applyTheme() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const set = () => {
    document.documentElement.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
  };
  set();
  mq.addEventListener('change', set);
}

// ── State ──────────────────────────────────────────────────────────────────
const state = { user: null };

async function boot() {
  applyTheme();
  try {
    const me = await api('/api/auth/me');
    state.user = me.user;
  } catch {
    state.user = null;
  }
  render();
}

function render() {
  if (state.user) renderApp();
  else renderAuth();
}

// ── Sign-in ────────────────────────────────────────────────────────────────
let tsWidgetId = null;

function renderAuth() {
  const invalid = new URLSearchParams(location.search).get('auth') === 'invalid';

  root().replaceChildren(
    h(`
    <div class="bt-auth">
      <div class="wordmark">brambletally<span>.</span></div>
      <div class="tagline">project tracker</div>

      <h1>Sign in</h1>
      <p class="sub">Enter your email and we'll send a one-time link. No password.</p>

      ${invalid ? '<div class="msg err">That link was invalid or expired. Request a new one.</div>' : ''}
      <div class="msg ok" id="bt-auth-ok" hidden></div>
      <div class="msg err" id="bt-auth-err" hidden></div>

      <form id="bt-auth-form">
        <label for="bt-email">Email</label>
        <input type="email" id="bt-email" autocomplete="email" required placeholder="you@example.com" />
        <div id="bt-ts"></div>
        <button type="submit" class="btn-primary" id="bt-auth-submit">Send link</button>
      </form>

      <a class="back" href="/">← Rayhana's Repositorium</a>
    </div>
  `)
  );

  mountTurnstile();

  const form = document.getElementById('bt-auth-form');
  form.addEventListener('submit', onRequestLink);
}

function mountTurnstile() {
  const box = document.getElementById('bt-ts');
  if (!box) return;
  let tries = 0;
  const tick = () => {
    if (window.turnstile) {
      tsWidgetId = window.turnstile.render(box, { sitekey: TURNSTILE_SITE_KEY });
    } else if (tries++ < 60) {
      setTimeout(tick, 200);
    }
  };
  tick();
}

async function onRequestLink(e) {
  e.preventDefault();
  const email = document.getElementById('bt-email').value.trim();
  const btn = document.getElementById('bt-auth-submit');
  const ok = document.getElementById('bt-auth-ok');
  const err = document.getElementById('bt-auth-err');
  ok.hidden = true;
  err.hidden = true;

  const token = window.turnstile && tsWidgetId != null ? window.turnstile.getResponse(tsWidgetId) : '';

  btn.disabled = true;
  btn.textContent = 'Sending…';
  try {
    await api('/api/auth/request-link', { method: 'POST', body: { email, turnstileToken: token } });
    ok.textContent = `Check ${email} for a sign-in link. It expires in 15 minutes.`;
    ok.hidden = false;
    document.getElementById('bt-auth-form').reset();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send link';
    if (window.turnstile && tsWidgetId != null) window.turnstile.reset(tsWidgetId);
  }
}

// ── Signed-in shell (placeholder — real app ported in next) ─────────────────
function renderApp() {
  const u = state.user;
  root().replaceChildren(
    h(`
    <div class="bt-signed">
      <div class="wordmark">brambletally<span>.</span></div>
      <p class="who">Signed in as ${esc(u.name || u.email)} &middot; ${esc(u.email)}</p>
      <button class="btn-sm btn-sm-ghost" id="bt-logout">Sign out</button>
      <p class="who" style="margin-top:32px">The project screens are still being ported in.</p>
      <a class="back" href="/" style="display:block;margin-top:24px">← Rayhana's Repositorium</a>
    </div>
  `)
  );
  document.getElementById('bt-logout').addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    location.href = APP_PATH;
  });
}

boot();
