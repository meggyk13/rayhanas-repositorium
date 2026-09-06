/* Brambletally — client app.
 * Auth gate + the project / inbox / weekly-review screens. Rebuilt against the
 * API (not a line-for-line port of noodlr); noodlr's stylesheet supplies the
 * look. Focus-session timer and cross-project search come later. */

'use strict';

const TURNSTILE_SITE_KEY = '0x4AAAAAAEqk-rZUelo-uw8q';
const APP_PATH = '/tools/brambletally/';

const STATUSES = ['Active', 'Waiting For', 'Someday', 'Paused', 'Done'];
const STATUS_COLOR = {
  Active: '#6B8E23',
  'Waiting For': '#d97706',
  Someday: '#8b5cf6',
  Paused: '#6b7280',
  Done: '#059669',
};
const TYPE_LABEL = { office: 'Office', research: 'Research', as: 'A&S' };
const CONTEXTS = ['@machine', '@handsewing', '@research', '@errand', '@email'];

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
    /* no body */
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const API = {
  me: () => api('/api/auth/me'),
  logout: () => api('/api/auth/logout', { method: 'POST' }),
  requestLink: (email, turnstileToken) =>
    api('/api/auth/request-link', { method: 'POST', body: { email, turnstileToken } }),

  listProjects: () => api('/api/projects'),
  createProject: (b) => api('/api/projects', { method: 'POST', body: b }),
  getProject: (id) => api('/api/projects/' + id),
  updateProject: (id, b) => api('/api/projects/' + id, { method: 'PATCH', body: b }),
  deleteProject: (id) => api('/api/projects/' + id, { method: 'DELETE' }),

  addStep: (pid, b) => api(`/api/projects/${pid}/steps`, { method: 'POST', body: b }),
  updateStep: (pid, sid, b) =>
    api(`/api/projects/${pid}/steps/${sid}`, { method: 'PATCH', body: b }),
  deleteStep: (pid, sid) => api(`/api/projects/${pid}/steps/${sid}`, { method: 'DELETE' }),

  addSupply: (pid, b) => api(`/api/projects/${pid}/supplies`, { method: 'POST', body: b }),
  updateSupply: (pid, sid, b) =>
    api(`/api/projects/${pid}/supplies/${sid}`, { method: 'PATCH', body: b }),
  deleteSupply: (pid, sid) =>
    api(`/api/projects/${pid}/supplies/${sid}`, { method: 'DELETE' }),

  addJournal: (pid, text) =>
    api(`/api/projects/${pid}/journal`, { method: 'POST', body: { text } }),

  listInbox: () => api('/api/inbox'),
  addInbox: (text) => api('/api/inbox', { method: 'POST', body: { text } }),
  deleteInbox: (id) => api('/api/inbox/' + id, { method: 'DELETE' }),

  review: () => api('/api/review'),
};

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

function on(el, sel, evt, fn) {
  el.querySelectorAll(sel).forEach((n) => n.addEventListener(evt, fn));
}

const parseTs = (s) => new Date(String(s).replace(' ', 'T') + 'Z');

function timeAgo(s) {
  const diff = (Date.now() - parseTs(s).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return parseTs(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function toast(msg) {
  const t = h(`<div class="bt-toast">${esc(msg)}</div>`);
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 2600);
}

async function guard(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e.status === 401) {
      state.user = null;
      render();
    } else {
      toast(e.message || 'Something went wrong');
    }
    throw e;
  }
}

// ── Theme ──────────────────────────────────────────────────────────────────
function applyTheme() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const set = () =>
    document.documentElement.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
  set();
  mq.addEventListener('change', set);
}

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  user: null,
  view: 'home', // home | project | inbox | review
  projects: [],
  filterStatus: 'Active',
  filterType: 'all',
  project: null, // full bundle when view === 'project'
  detailTab: 'steps',
};

async function boot() {
  applyTheme();
  try {
    const me = await API.me();
    state.user = me.user;
  } catch {
    state.user = null;
  }
  render();
}

function render() {
  if (!state.user) return renderAuth();
  renderApp();
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
  document.getElementById('bt-auth-form').addEventListener('submit', onRequestLink);
}

function mountTurnstile() {
  const box = document.getElementById('bt-ts');
  if (!box) return;
  let tries = 0;
  const tick = () => {
    if (window.turnstile) tsWidgetId = window.turnstile.render(box, { sitekey: TURNSTILE_SITE_KEY });
    else if (tries++ < 60) setTimeout(tick, 200);
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
    await API.requestLink(email, token);
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

// ── App shell ──────────────────────────────────────────────────────────────
function header() {
  const nav = [
    ['home', 'Projects'],
    ['inbox', 'Inbox'],
    ['review', 'Review'],
  ];
  const el = h(`
    <div class="header">
      <div class="header-row">
        <div>
          <div class="wordmark">brambletally<span>.</span></div>
          <div class="tagline">project tracker</div>
        </div>
        <button class="btn-sm btn-sm-ghost" id="bt-signout">Sign out</button>
      </div>
      <div class="tabs" id="bt-nav">
        ${nav
          .map(
            ([v, label]) =>
              `<button class="tab${state.view === v ? ' active' : ''}" data-view="${v}">${label}</button>`
          )
          .join('')}
      </div>
    </div>
  `);
  on(el, '#bt-signout', 'click', async () => {
    try {
      await API.logout();
    } catch {
      /* ignore */
    }
    location.href = APP_PATH;
  });
  on(el, '[data-view]', 'click', (e) => {
    state.view = e.currentTarget.dataset.view;
    state.project = null;
    render();
  });
  return el;
}

function renderApp() {
  const app = root();
  app.replaceChildren();
  if (state.view === 'project') {
    renderProject(app);
    return;
  }
  app.appendChild(header());
  const main = h('<div class="project-list"></div>');
  app.appendChild(main);
  if (state.view === 'home') renderHome(main);
  else if (state.view === 'inbox') renderInbox(main);
  else if (state.view === 'review') renderReview(main);
}

// ── Home / project list ────────────────────────────────────────────────────
async function renderHome(main) {
  main.replaceChildren(h('<div class="empty">Loading…</div>'));
  let projects;
  try {
    ({ projects } = await guard(() => API.listProjects()));
  } catch {
    return;
  }
  state.projects = projects;

  const counts = {};
  STATUSES.forEach((s) => (counts[s] = projects.filter((p) => p.status === s).length));

  const wrap = h('<div></div>');

  const statusTabs = h(`<div class="tabs" style="margin-bottom:8px"></div>`);
  STATUSES.forEach((s) => {
    const b = h(
      `<button class="tab${state.filterStatus === s ? ' active' : ''}" style="--tab-color:${STATUS_COLOR[s]}">${s}${
        counts[s] ? `<span class="tab-count">${counts[s]}</span>` : ''
      }</button>`
    );
    b.addEventListener('click', () => {
      state.filterStatus = s;
      renderApp();
    });
    statusTabs.appendChild(b);
  });
  wrap.appendChild(statusTabs);

  const typeRow = h(`<div class="tabs" style="margin-bottom:14px"></div>`);
  [['all', 'All types'], ['office', 'Office'], ['research', 'Research'], ['as', 'A&S']].forEach(
    ([v, label]) => {
      const b = h(
        `<button class="tab${state.filterType === v ? ' active' : ''}" style="--tab-color:#9966CC">${label}</button>`
      );
      b.addEventListener('click', () => {
        state.filterType = v;
        renderApp();
      });
      typeRow.appendChild(b);
    }
  );
  wrap.appendChild(typeRow);

  const bar = h(`<div class="newbar"><button class="btn-sm btn-sm-sage" id="bt-new">+ New project</button></div>`);
  on(bar, '#bt-new', 'click', () => openProjectForm(null));
  wrap.appendChild(bar);

  let list = projects.filter((p) => p.status === state.filterStatus);
  if (state.filterType !== 'all') list = list.filter((p) => p.project_type === state.filterType);

  if (!list.length) {
    wrap.appendChild(
      h(`<div class="empty">Nothing ${esc(state.filterStatus)}${
        state.filterType !== 'all' ? ' in ' + esc(TYPE_LABEL[state.filterType]) : ''
      }.</div>`)
    );
  } else {
    list.forEach((p) => wrap.appendChild(projectCard(p)));
  }

  main.replaceChildren(wrap);
}

function projectCard(p) {
  const total = p.step_count || 0;
  const done = p.step_done || 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const card = h(`
    <div class="card" role="button" tabindex="0">
      <div class="card-top">
        <h3 class="card-title">${esc(p.title)}</h3>
        <span class="status-pill" style="--tab-color:${STATUS_COLOR[p.status]}">${esc(p.status)}</span>
      </div>
      <div class="card-meta">
        ${esc(TYPE_LABEL[p.project_type] || p.project_type)}
        ${total ? ` · ${done}/${total} steps` : ''}
        ${p.deadline ? ` · due ${esc(fmtDate(p.deadline))}` : ''}
        ${p.role !== 'owner' ? ` · ${esc(p.role)}` : ''}
      </div>
      ${
        total
          ? `<div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${pct}%;background:${STATUS_COLOR[p.status]}"></div></div>`
          : ''
      }
      ${p.pickup_note ? `<div class="card-footer">${esc(p.pickup_note)}</div>` : ''}
    </div>
  `);
  const open = () => openProject(p.id);
  card.addEventListener('click', open);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  });
  return card;
}

// ── New / edit project form ────────────────────────────────────────────────
// opts: { prefillTitle, onCreate(project) } — onCreate runs after a successful
// create, before navigating to the new project.
function openProjectForm(existing, opts = {}) {
  const p = existing || (opts.prefillTitle ? { title: opts.prefillTitle } : {});
  const overlay = h(`
    <div class="modal-overlay open">
      <div class="modal">
        <div class="modal-header"><span class="modal-title">${existing ? 'Edit project' : 'New project'}</span>
          <button class="modal-close" aria-label="Close">×</button></div>
        <form id="bt-pform">
          <label class="sp-label">Title</label>
          <input class="sp-input" name="title" required value="${esc(p.title || '')}" />
          <label class="sp-label">Type</label>
          <select class="sp-select" name="project_type" required>
            <option value="" ${!p.project_type ? 'selected' : ''} disabled>Choose…</option>
            <option value="office" ${p.project_type === 'office' ? 'selected' : ''}>Office</option>
            <option value="research" ${p.project_type === 'research' ? 'selected' : ''}>Research</option>
            <option value="as" ${p.project_type === 'as' ? 'selected' : ''}>A&amp;S</option>
          </select>
          <label class="sp-label">Status</label>
          <select class="sp-select" name="status">
            ${STATUSES.map(
              (s) => `<option ${(p.status || 'Active') === s ? 'selected' : ''}>${s}</option>`
            ).join('')}
          </select>
          <label class="sp-label">Deadline</label>
          <input class="sp-input" type="date" name="deadline" value="${esc(p.deadline || '')}" />
          <label class="sp-label">Description</label>
          <textarea class="sp-input" name="description" rows="2">${esc(p.description || '')}</textarea>
          <label class="sp-label">Pick up here</label>
          <textarea class="sp-input" name="pickup_note" rows="2" placeholder="The next concrete action">${esc(
            p.pickup_note || ''
          )}</textarea>
          <div style="display:flex;gap:8px;margin-top:14px">
            <button type="submit" class="btn-sm btn-sm-sage">${existing ? 'Save' : 'Create'}</button>
            <button type="button" class="btn-sm btn-sm-ghost" data-cancel>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `);
  const close = () => overlay.remove();
  on(overlay, '.modal-close, [data-cancel]', 'click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  on(overlay, '#bt-pform', 'submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = {
      title: f.get('title').trim(),
      project_type: f.get('project_type'),
      status: f.get('status'),
      deadline: f.get('deadline') || null,
      description: f.get('description').trim() || null,
      pickup_note: f.get('pickup_note').trim() || null,
    };
    if (!body.project_type) return toast('Pick a type');
    try {
      if (existing) {
        await guard(() => API.updateProject(existing.id, body));
        close();
        openProject(existing.id);
      } else {
        const { project } = await guard(() => API.createProject(body));
        if (opts.onCreate) {
          try {
            await opts.onCreate(project);
          } catch {
            /* non-fatal */
          }
        }
        close();
        openProject(project.id);
      }
    } catch {
      /* toast already shown */
    }
  });
  document.body.appendChild(overlay);
  overlay.querySelector('input[name=title]').focus();
}

// ── Project detail ─────────────────────────────────────────────────────────
async function openProject(id) {
  state.view = 'project';
  state.project = null;
  state.detailTab = 'steps';
  renderApp();
  try {
    state.project = await guard(() => API.getProject(id));
  } catch {
    state.view = 'home';
    renderApp();
    return;
  }
  renderApp();
}

function renderProject(app) {
  app.replaceChildren();
  const b = state.project;
  if (!b) {
    app.appendChild(h('<div class="detail-body"><div class="empty">Loading…</div></div>'));
    return;
  }
  const p = b.project;
  const canEdit = p.role === 'owner' || p.role === 'editor';
  const done = b.steps.filter((s) => s.completed).length;
  const pct = b.steps.length ? Math.round((done / b.steps.length) * 100) : 0;

  const view = h(`
    <div>
      <div class="detail-cover" style="background:${STATUS_COLOR[p.status]}22">
        <button class="detail-back" id="bt-back">← Back</button>
        ${canEdit ? '<button class="detail-export" id="bt-editproj">Edit</button>' : ''}
      </div>
      <div class="detail-body">
        <h1 class="detail-title">${esc(p.title)}</h1>
        <div class="detail-meta">
          <span class="status-pill" style="--tab-color:${STATUS_COLOR[p.status]}">${esc(p.status)}</span>
          <span>${esc(TYPE_LABEL[p.project_type] || p.project_type)}</span>
          ${p.deadline ? `<span>due ${esc(fmtDate(p.deadline))}</span>` : ''}
          <span>${esc(p.role)}</span>
        </div>
        ${p.description ? `<p style="color:var(--text-muted);font-size:15px;line-height:1.55;margin-bottom:14px">${esc(p.description)}</p>` : ''}
        <div class="pickup-box">
          <div class="pickup-label">Pick up here</div>
          <div class="pickup-text" id="bt-pickup">${p.pickup_note ? esc(p.pickup_note) : '<span style="color:var(--text-faint)">—</span>'}</div>
        </div>
        ${b.steps.length ? `<div class="progress-bar-wrap" style="margin:14px 0"><div class="progress-bar-fill" style="width:${pct}%;background:${STATUS_COLOR[p.status]}"></div></div>` : ''}
        <button class="noodle-detail-btn" id="bt-focus">▶ Start a focus session</button>
        <div class="detail-tabs">
          ${['steps', 'supplies', 'timeline']
            .map(
              (t) =>
                `<button class="detail-tab${state.detailTab === t ? ' active' : ''}" data-tab="${t}">${
                  t[0].toUpperCase() + t.slice(1)
                }</button>`
            )
            .join('')}
        </div>
        <div id="bt-panel"></div>
      </div>
    </div>
  `);

  on(view, '#bt-back', 'click', () => {
    state.view = 'home';
    state.project = null;
    renderApp();
  });
  on(view, '#bt-focus', 'click', () => openFocusSession(state.project));
  if (canEdit) on(view, '#bt-editproj', 'click', () => openProjectForm(p));
  on(view, '[data-tab]', 'click', (e) => {
    state.detailTab = e.currentTarget.dataset.tab;
    view
      .querySelectorAll('.detail-tab')
      .forEach((t) => t.classList.toggle('active', t.dataset.tab === state.detailTab));
    renderPanel(view.querySelector('#bt-panel'));
  });

  app.appendChild(view);
  renderPanel(view.querySelector('#bt-panel'));
}

function renderPanel(panel) {
  const b = state.project;
  const p = b.project;
  const canEdit = p.role === 'owner' || p.role === 'editor';
  panel.replaceChildren();

  if (state.detailTab === 'steps') panel.appendChild(stepsPanel(b, canEdit));
  else if (state.detailTab === 'supplies') panel.appendChild(suppliesPanel(b, canEdit));
  else panel.appendChild(timelinePanel(b, canEdit));
}

// Refetch the project bundle and rebuild the open panel (header counts included).
async function refreshDetail() {
  try {
    state.project = await guard(() => API.getProject(state.project.project.id));
  } catch {
    return;
  }
  const panel = document.getElementById('bt-panel');
  if (panel) renderPanel(panel);
}

function sectionHeader(label, count, onAdd) {
  const el = h(`
    <div class="section-header">
      <span class="section-label">${label}${count != null ? ` <span class="section-count">${count}</span>` : ''}</span>
      ${onAdd ? '<button class="btn-section-add" aria-label="Add">+</button>' : ''}
    </div>
  `);
  if (onAdd) on(el, '.btn-section-add', 'click', onAdd);
  return el;
}

// steps
function stepsPanel(b, canEdit) {
  const wrap = h('<div class="detail-panel"></div>');
  const listEl = h('<div></div>');
  const rerender = refreshDetail;
  const fill = () => {
    listEl.replaceChildren();
    if (!b.steps.length) listEl.appendChild(h('<div class="empty-section">No steps yet.</div>'));
    b.steps.forEach((s) => listEl.appendChild(stepRow(b, s, canEdit, rerender)));
  };

  wrap.appendChild(
    sectionHeader(
      'Steps',
      b.steps.length,
      canEdit ? () => openStepForm(b, null, rerender) : null
    )
  );
  wrap.appendChild(listEl);
  fill();
  return wrap;
}

function stepRow(b, s, canEdit, rerender) {
  const row = h(`
    <div class="check-row${s.completed ? ' checked' : ''}">
      <button class="checkbox" ${s.completed ? 'aria-checked="true"' : ''} ${canEdit ? '' : 'disabled'}>${
        s.completed ? '✓' : ''
      }</button>
      <div class="check-content">
        <div class="check-title">${esc(s.title)} ${s.context ? `<span class="cat-badge">${esc(s.context)}</span>` : ''}</div>
        ${
          s.due_date || s.notes
            ? `<div class="check-sub">${s.due_date ? 'due ' + esc(fmtDate(s.due_date)) : ''}${
                s.due_date && s.notes ? ' · ' : ''
              }${s.notes ? esc(s.notes) : ''}</div>`
            : ''
        }
      </div>
      ${canEdit ? '<button class="card-menu-btn" data-edit>⋯</button>' : ''}
    </div>
  `);
  if (canEdit) {
    on(row, '.checkbox', 'click', async () => {
      await guard(() => API.updateStep(b.project.id, s.id, { completed: !s.completed }));
      rerender();
    });
    on(row, '[data-edit]', 'click', () => openStepForm(b, s, rerender));
  }
  return row;
}

function openStepForm(b, existing, done) {
  const s = existing || {};
  const overlay = h(`
    <div class="modal-overlay open">
      <div class="modal">
        <div class="modal-header"><span class="modal-title">${existing ? 'Edit step' : 'Add step'}</span>
          <button class="modal-close">×</button></div>
        <form id="bt-sform">
          <label class="sp-label">Step</label>
          <input class="sp-input" name="title" required value="${esc(s.title || '')}" />
          <label class="sp-label">Context</label>
          <select class="sp-select" name="context">
            <option value="">none</option>
            ${CONTEXTS.map((c) => `<option ${s.context === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
          <label class="sp-label">Due date</label>
          <input class="sp-input" type="date" name="due_date" value="${esc(s.due_date || '')}" />
          <label class="sp-label">Notes</label>
          <textarea class="sp-input" name="notes" rows="2">${esc(s.notes || '')}</textarea>
          <div style="display:flex;gap:8px;margin-top:14px">
            <button type="submit" class="btn-sm btn-sm-sage">${existing ? 'Save' : 'Add'}</button>
            ${existing ? '<button type="button" class="btn-sm btn-sm-ghost" data-del>Delete</button>' : ''}
            <button type="button" class="btn-sm btn-sm-ghost" data-cancel>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `);
  const close = () => overlay.remove();
  on(overlay, '.modal-close, [data-cancel]', 'click', close);
  overlay.addEventListener('click', (e) => e.target === overlay && close());
  on(overlay, '[data-del]', 'click', async () => {
    await guard(() => API.deleteStep(b.project.id, existing.id));
    close();
    done();
  });
  on(overlay, '#bt-sform', 'submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = {
      title: f.get('title').trim(),
      context: f.get('context') || null,
      due_date: f.get('due_date') || null,
      notes: f.get('notes').trim() || null,
    };
    if (existing) await guard(() => API.updateStep(b.project.id, existing.id, body));
    else await guard(() => API.addStep(b.project.id, body));
    close();
    done();
  });
  document.body.appendChild(overlay);
  overlay.querySelector('input[name=title]').focus();
}

// supplies
function suppliesPanel(b, canEdit) {
  const wrap = h('<div class="detail-panel"></div>');
  const listEl = h('<div></div>');
  const rerender = refreshDetail;
  const fill = () => {
    listEl.replaceChildren();
    if (!b.supplies.length) listEl.appendChild(h('<div class="empty-section">No supplies yet.</div>'));
    b.supplies.forEach((s) => listEl.appendChild(supplyRow(b, s, canEdit, rerender)));
  };
  wrap.appendChild(
    sectionHeader(
      'Supplies',
      b.supplies.length,
      canEdit ? () => openSupplyForm(b, null, rerender) : null
    )
  );
  wrap.appendChild(listEl);
  fill();
  return wrap;
}

function supplyRow(b, s, canEdit, rerender) {
  const bits = [];
  if (s.cost != null) bits.push('$' + Number(s.cost).toFixed(2));
  if (s.source) bits.push(esc(s.source));
  const row = h(`
    <div class="check-row${s.acquired ? ' checked' : ''}">
      <button class="checkbox" ${s.acquired ? 'aria-checked="true"' : ''} ${canEdit ? '' : 'disabled'}>${
        s.acquired ? '✓' : ''
      }</button>
      <div class="check-content">
        <div class="check-title">${esc(s.name)}</div>
        ${bits.length || s.url ? `<div class="check-sub">${bits.join(' · ')}${
          s.url ? ` · <a href="${esc(s.url)}" target="_blank" rel="noopener">link</a>` : ''
        }</div>` : ''}
      </div>
      ${canEdit ? '<button class="card-menu-btn" data-edit>⋯</button>' : ''}
    </div>
  `);
  if (canEdit) {
    on(row, '.checkbox', 'click', async () => {
      await guard(() => API.updateSupply(b.project.id, s.id, { acquired: !s.acquired }));
      rerender();
    });
    on(row, '[data-edit]', 'click', () => openSupplyForm(b, s, rerender));
  }
  return row;
}

function openSupplyForm(b, existing, done) {
  const s = existing || {};
  const overlay = h(`
    <div class="modal-overlay open">
      <div class="modal">
        <div class="modal-header"><span class="modal-title">${existing ? 'Edit supply' : 'Add supply'}</span>
          <button class="modal-close">×</button></div>
        <form id="bt-supform">
          <label class="sp-label">Item</label>
          <input class="sp-input" name="name" required value="${esc(s.name || '')}" />
          <label class="sp-label">Est. cost</label>
          <input class="sp-input" type="number" step="0.01" min="0" name="cost" value="${
            s.cost != null ? esc(s.cost) : ''
          }" />
          <label class="sp-label">Source</label>
          <input class="sp-input" name="source" value="${esc(s.source || '')}" placeholder="Store or maker" />
          <label class="sp-label">Link</label>
          <input class="sp-input" type="url" name="url" value="${esc(s.url || '')}" />
          <label style="display:flex;gap:8px;align-items:center;margin:10px 0;font-size:14px">
            <input type="checkbox" name="acquired" ${s.acquired ? 'checked' : ''} /> Have it
          </label>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button type="submit" class="btn-sm btn-sm-sage">${existing ? 'Save' : 'Add'}</button>
            ${existing ? '<button type="button" class="btn-sm btn-sm-ghost" data-del>Delete</button>' : ''}
            <button type="button" class="btn-sm btn-sm-ghost" data-cancel>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `);
  const close = () => overlay.remove();
  on(overlay, '.modal-close, [data-cancel]', 'click', close);
  overlay.addEventListener('click', (e) => e.target === overlay && close());
  on(overlay, '[data-del]', 'click', async () => {
    await guard(() => API.deleteSupply(b.project.id, existing.id));
    close();
    done();
  });
  on(overlay, '#bt-supform', 'submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = {
      name: f.get('name').trim(),
      cost: f.get('cost') ? Number(f.get('cost')) : null,
      source: f.get('source').trim() || null,
      url: f.get('url').trim() || null,
      acquired: f.get('acquired') === 'on',
    };
    if (existing) await guard(() => API.updateSupply(b.project.id, existing.id, body));
    else await guard(() => API.addSupply(b.project.id, body));
    close();
    done();
  });
  document.body.appendChild(overlay);
  overlay.querySelector('input[name=name]').focus();
}

// timeline / journal
function timelinePanel(b, canEdit) {
  const wrap = h('<div class="detail-panel"></div>');
  wrap.appendChild(h('<div class="section-header"><span class="section-label">Timeline</span></div>'));

  if (canEdit) {
    const form = h(`
      <div class="journal-add-form">
        <textarea id="bt-journal" rows="2" placeholder="What's going on with this project?"></textarea>
        <div style="margin-top:8px"><button class="btn-sm btn-sm-amethyst" id="bt-journal-add">Add note</button></div>
      </div>
    `);
    on(form, '#bt-journal-add', 'click', async () => {
      const ta = form.querySelector('#bt-journal');
      const text = ta.value.trim();
      if (!text) return;
      await guard(() => API.addJournal(b.project.id, text));
      refreshDetail();
    });
    wrap.appendChild(form);
  }

  if (!b.journal.length) {
    wrap.appendChild(h('<div class="empty-section">No entries yet.</div>'));
  } else {
    b.journal.forEach((j) => {
      wrap.appendChild(
        h(`
        <div class="due-row" style="align-items:flex-start">
          <div class="due-row-content">
            <div class="due-row-sub">${esc(j.author_name || '')} · ${esc(timeAgo(j.created_at))}</div>
            <div class="due-row-title" style="white-space:pre-wrap;font-weight:400">${esc(j.text)}</div>
          </div>
        </div>
      `)
      );
    });
  }
  return wrap;
}

// ── Inbox ──────────────────────────────────────────────────────────────────
async function renderInbox(main) {
  main.replaceChildren(h('<div class="empty">Loading…</div>'));
  let items;
  try {
    ({ items } = await guard(() => API.listInbox()));
  } catch {
    return;
  }

  const wrap = h(`
    <div>
      <div class="journal-add-form">
        <textarea id="bt-inbox-text" rows="2" placeholder="Capture a thought — sort it later"></textarea>
        <div style="margin-top:8px"><button class="btn-sm btn-sm-sage" id="bt-inbox-add">Add</button></div>
      </div>
      <div id="bt-inbox-list"></div>
    </div>
  `);

  const listEl = wrap.querySelector('#bt-inbox-list');
  const paint = (arr) => {
    listEl.replaceChildren();
    if (!arr.length) {
      listEl.appendChild(h('<div class="empty">Inbox is clear.</div>'));
      return;
    }
    arr.forEach((it) => {
      const drop = async () => {
        await guard(() => API.deleteInbox(it.id));
        arr = arr.filter((x) => x.id !== it.id);
        paint(arr);
      };
      const row = h(`
        <div class="inbox-item">
          <div class="check-title" style="font-weight:400;white-space:pre-wrap">${esc(it.text)}</div>
          <div class="check-sub">${esc(timeAgo(it.created_at))}</div>
          <div class="inbox-actions">
            <button class="btn-sm btn-sm-ghost" data-toproj>→ Project</button>
            <button class="btn-sm btn-sm-ghost" data-tostep>→ Step in…</button>
            <button class="btn-sm btn-sm-ghost" data-del>Delete</button>
          </div>
        </div>
      `);
      on(row, '[data-del]', 'click', drop);
      on(row, '[data-toproj]', 'click', () => {
        openProjectForm(null, { prefillTitle: it.text, onCreate: () => API.deleteInbox(it.id) });
      });
      on(row, '[data-tostep]', 'click', () => openAssignStep(it.text, drop));
      listEl.appendChild(row);
    });
  };

  on(wrap, '#bt-inbox-add', 'click', async () => {
    const ta = wrap.querySelector('#bt-inbox-text');
    const text = ta.value.trim();
    if (!text) return;
    const { item } = await guard(() => API.addInbox(text));
    ta.value = '';
    items = [item, ...items];
    paint(items);
  });

  paint(items);
  main.replaceChildren(wrap);
}

// Pick a project and drop the inbox text in as a step.
async function openAssignStep(text, done) {
  let projects;
  try {
    ({ projects } = await guard(() => API.listProjects()));
  } catch {
    return;
  }
  const usable = projects.filter((p) => p.role === 'owner' || p.role === 'editor');
  if (!usable.length) return toast('No project you can edit yet — make one first.');

  const overlay = h(`
    <div class="modal-overlay open">
      <div class="modal">
        <div class="modal-header"><span class="modal-title">Add as a step</span>
          <button class="modal-close">×</button></div>
        <form id="bt-assign">
          <div class="pickup-box" style="margin-bottom:14px"><div class="pickup-text">${esc(text)}</div></div>
          <label class="sp-label">Project</label>
          <select class="sp-select" name="project" required>
            ${usable
              .map((p) => `<option value="${p.id}">${esc(p.title)}</option>`)
              .join('')}
          </select>
          <label class="sp-label">Context</label>
          <select class="sp-select" name="context">
            <option value="">none</option>
            ${CONTEXTS.map((c) => `<option>${c}</option>`).join('')}
          </select>
          <div style="display:flex;gap:8px;margin-top:14px">
            <button type="submit" class="btn-sm btn-sm-sage">Add step</button>
            <button type="button" class="btn-sm btn-sm-ghost" data-cancel>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `);
  const close = () => overlay.remove();
  on(overlay, '.modal-close, [data-cancel]', 'click', close);
  overlay.addEventListener('click', (e) => e.target === overlay && close());
  on(overlay, '#bt-assign', 'submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    await guard(() =>
      API.addStep(f.get('project'), { title: text, context: f.get('context') || null })
    );
    close();
    toast('Added to the project');
    await done();
  });
  document.body.appendChild(overlay);
}

// ── Weekly review ──────────────────────────────────────────────────────────
async function renderReview(main) {
  main.replaceChildren(h('<div class="empty">Loading…</div>'));
  let data;
  try {
    data = await guard(() => API.review());
  } catch {
    return;
  }

  const wrap = h('<div></div>');
  wrap.appendChild(
    h(
      '<p style="color:var(--text-muted);font-size:14px;margin-bottom:16px">Everything Active or Waiting For, with its open steps. A pass for your weekly review.</p>'
    )
  );

  const section = (title, projects) => {
    const s = h(`<div style="margin-bottom:22px"><div class="section-header"><span class="section-label">${title} <span class="section-count">${projects.length}</span></span></div></div>`);
    if (!projects.length) {
      s.appendChild(h('<div class="empty-section">Nothing here.</div>'));
      return s;
    }
    projects.forEach((p) => {
      const card = h(`
        <div class="card" role="button" tabindex="0" style="cursor:pointer">
          <div class="card-top"><h3 class="card-title">${esc(p.title)}</h3>
            <span class="status-pill" style="--tab-color:${STATUS_COLOR[p.status]}">${esc(p.status)}</span></div>
          <div class="card-meta">${esc(TYPE_LABEL[p.project_type] || p.project_type)}${
            p.deadline ? ` · due ${esc(fmtDate(p.deadline))}` : ''
          }</div>
          ${
            (p.open_steps || []).length
              ? `<div style="margin-top:8px;display:flex;flex-direction:column;gap:4px">${p.open_steps
                  .map(
                    (st) =>
                      `<div class="check-sub">• ${esc(st.title)}${
                        st.context ? ` <span class="cat-badge">${esc(st.context)}</span>` : ''
                      }${st.due_date ? ` — due ${esc(fmtDate(st.due_date))}` : ''}</div>`
                  )
                  .join('')}</div>`
              : '<div class="check-sub" style="margin-top:8px;color:var(--text-faint)">No open steps</div>'
          }
        </div>
      `);
      card.addEventListener('click', () => openProject(p.id));
      s.appendChild(card);
    });
    return s;
  };

  wrap.appendChild(section('Active', data.active || []));
  wrap.appendChild(section('Waiting For', data.waiting || []));
  main.replaceChildren(wrap);
}

// ── Focus session ─────────────────────────────────────────────────────────
const DURATIONS = [10, 25, 45, 60];
const RING = 326.7; // 2πr for r=52

let focusTimer = null;

function mmss(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function openFocusSession(bundle) {
  const open = bundle.steps.filter((s) => !s.completed);
  const sess = { projectId: bundle.project.id, projectTitle: bundle.project.title, stepId: null, minutes: 25 };

  const screen = h('<div id="noodle-screen" class="open"></div>');
  const close = () => {
    if (focusTimer) {
      clearInterval(focusTimer);
      focusTimer = null;
    }
    screen.remove();
  };

  function setup() {
    screen.replaceChildren(
      h(`
      <div>
        <div class="noodle-head">
          <div class="noodle-wordmark">focus session</div>
          <button class="noodle-close" aria-label="Close">✕</button>
        </div>
        <div class="noodle-body">
          <div class="noodle-project-name">${esc(sess.projectTitle)}</div>
          <div class="noodle-hero-text">What are you working on?</div>
          <div class="noodle-checklist" id="fs-steps">
            ${
              open.length
                ? open
                    .map(
                      (s) =>
                        `<div class="noodle-check-row" data-step="${s.id}">
                          <span class="noodle-check-box"><span class="noodle-check-icon">✓</span></span>
                          <span class="noodle-check-label">${esc(s.title)}</span>
                        </div>`
                    )
                    .join('')
                : '<div class="noodle-next-step empty">No open steps — just work on the project.</div>'
            }
          </div>
          <div class="noodle-time-label">How long?</div>
          <div class="noodle-time-options" id="fs-times">
            ${DURATIONS.map(
              (m) => `<button class="noodle-time-btn${m === sess.minutes ? ' selected' : ''}" data-min="${m}">${m} min</button>`
            ).join('')}
          </div>
          <button class="noodle-go-btn" id="fs-go">Start ${sess.minutes} minutes</button>
          <div class="noodle-reassure">Stop whenever you need to. Nothing is lost.</div>
        </div>
      </div>
    `)
    );
    on(screen, '.noodle-close', 'click', close);
    on(screen, '#fs-steps .noodle-check-row', 'click', (e) => {
      const row = e.currentTarget;
      const id = row.dataset.step;
      const already = sess.stepId === id;
      screen.querySelectorAll('.noodle-check-row').forEach((r) => r.classList.remove('checked'));
      sess.stepId = already ? null : id;
      if (!already) row.classList.add('checked');
    });
    on(screen, '#fs-times .noodle-time-btn', 'click', (e) => {
      sess.minutes = Number(e.currentTarget.dataset.min);
      screen.querySelectorAll('.noodle-time-btn').forEach((b) => b.classList.remove('selected'));
      e.currentTarget.classList.add('selected');
      screen.querySelector('#fs-go').textContent = `Start ${sess.minutes} minutes`;
    });
    on(screen, '#fs-go', 'click', () => running());
  }

  function running() {
    const totalMs = sess.minutes * 60000;
    const endsAt = Date.now() + totalMs;
    const step = open.find((s) => s.id === sess.stepId);

    screen.replaceChildren(
      h(`
      <div>
        <div class="noodle-head">
          <div class="noodle-wordmark">focus session</div>
          <button class="noodle-close" aria-label="Close">✕</button>
        </div>
        <div class="noodle-body noodle-body-timer">
          <div class="noodle-timer-project">${esc(sess.projectTitle)}</div>
          <div class="noodle-timer-step">${step ? esc(step.title) : 'Working on the project'}</div>
          <div class="noodle-ring-wrap">
            <svg class="noodle-ring" viewBox="0 0 120 120">
              <circle class="noodle-ring-track" cx="60" cy="60" r="52"></circle>
              <circle class="noodle-ring-fill" id="fs-ring" cx="60" cy="60" r="52" stroke-dashoffset="0"></circle>
            </svg>
            <div class="noodle-timer-display" id="fs-clock">${mmss(totalMs)}</div>
          </div>
          <div class="noodle-timer-nudge">Head down. You've got this.</div>
          <button class="noodle-done-early-btn" id="fs-done">I'm done</button>
        </div>
      </div>
    `)
    );
    on(screen, '.noodle-close', 'click', close);
    on(screen, '#fs-done', 'click', () => {
      clearInterval(focusTimer);
      focusTimer = null;
      finish(Date.now() - (endsAt - totalMs));
    });

    const clock = screen.querySelector('#fs-clock');
    const ring = screen.querySelector('#fs-ring');
    const tick = () => {
      const remaining = endsAt - Date.now();
      clock.textContent = mmss(remaining);
      ring.setAttribute('stroke-dashoffset', String(RING * Math.min(1, 1 - remaining / totalMs)));
      if (remaining <= 0) {
        clearInterval(focusTimer);
        focusTimer = null;
        finish(totalMs);
      }
    };
    if (focusTimer) clearInterval(focusTimer);
    focusTimer = setInterval(tick, 250);
    tick();
  }

  function finish(elapsedMs) {
    const mins = Math.max(1, Math.round(elapsedMs / 60000));
    const step = open.find((s) => s.id === sess.stepId);
    screen.replaceChildren(
      h(`
      <div>
        <div class="noodle-head">
          <div class="noodle-wordmark">focus session</div>
          <button class="noodle-close" aria-label="Close">✕</button>
        </div>
        <div class="noodle-body noodle-body-timer">
          <div class="noodle-finish-emoji">✅</div>
          <div class="noodle-finish-headline">Session done</div>
          <div class="noodle-finish-time">${mins} minute${mins === 1 ? '' : 's'} on ${esc(sess.projectTitle)}</div>
          <div class="noodle-finish-msg">What did you get done?</div>
          <textarea id="fs-note" rows="2" placeholder="Optional — adds a timeline note" style="width:100%;padding:12px 14px;border-radius:9px;border:1px solid var(--border-strong);background:var(--input);color:var(--text);font:inherit;font-size:15px;resize:vertical;margin-bottom:12px"></textarea>
          <div class="noodle-finish-actions">
            ${step ? `<button class="btn-sm btn-sm-sage" id="fs-markdone">Mark “${esc(step.title)}” done</button>` : ''}
            <button class="btn-sm btn-sm-amethyst" id="fs-again">Another session</button>
            <button class="btn-sm btn-sm-ghost" id="fs-close">Done</button>
          </div>
        </div>
      </div>
    `)
    );

    const saveNote = async () => {
      const text = screen.querySelector('#fs-note').value.trim();
      if (text) {
        try {
          await API.addJournal(sess.projectId, `[${mins}m focus] ${text}`);
        } catch {
          /* non-fatal */
        }
      }
    };

    on(screen, '.noodle-close, #fs-close', 'click', async () => {
      await saveNote();
      close();
      if (state.view === 'project' && state.project && state.project.project.id === sess.projectId) {
        refreshDetail();
      }
    });
    if (step) {
      on(screen, '#fs-markdone', 'click', async (e) => {
        e.currentTarget.disabled = true;
        await saveNote();
        try {
          await API.updateStep(sess.projectId, step.id, { completed: true });
        } catch {
          /* toast shown */
        }
        close();
        if (state.view === 'project') refreshDetail();
      });
    }
    on(screen, '#fs-again', 'click', async () => {
      await saveNote();
      sess.stepId = null;
      setup();
    });
  }

  document.body.appendChild(screen);
  setup();
}

boot();
