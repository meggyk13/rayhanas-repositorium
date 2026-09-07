/* Brambletally account bar for the standalone tools.
 * Each tool page sets window.BT_TOOL (one of: salvar, caftan, war-food,
 * award-rec, packing-list) and includes this script. Tools with dynamic
 * state define window.btCollect() / window.btApply(data); everything else
 * falls back to a generic serializer over id'd form controls. */

(function () {
  'use strict';

  var style = document.createElement('style');
  style.textContent =
    '#bt-account{margin:0 0 18px;font:500 13px/1.4 system-ui,-apple-system,sans-serif}' +
    '.bt-acct{display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center;justify-content:flex-end;' +
    'background:#f4f2ee;border:1px solid #e4e0d8;border-radius:10px;padding:8px 12px;color:#5c564c}' +
    '.bt-acct .bt-grow{flex:1;min-width:150px}' +
    '.bt-acct button,.bt-acct select{font:inherit;padding:6px 10px;border-radius:7px;' +
    'border:1px solid #cfc8ba;background:#fff;color:#3a352c;cursor:pointer}' +
    '.bt-acct button.primary{background:#6B8E23;border-color:#6B8E23;color:#fff}' +
    '.bt-ui-back{position:fixed;inset:0;background:rgba(20,22,28,.5);display:flex;align-items:center;' +
    'justify-content:center;padding:24px;z-index:9998;font:500 14px/1.5 system-ui,-apple-system,sans-serif}' +
    '.bt-ui-box{background:#fdf9ef;border:1px solid #cdbc93;border-radius:14px;padding:22px;width:360px;max-width:100%;' +
    'box-shadow:0 20px 60px rgba(38,48,74,.3);color:#26304a}' +
    '.bt-ui-box p{margin:0 0 14px}' +
    '.bt-ui-box input{width:100%;padding:9px 11px;border-radius:8px;border:1px solid #cdbc93;background:#fbf6e9;' +
    'font:inherit;margin-bottom:14px;color:#26304a}' +
    '.bt-ui-row{display:flex;gap:8px}.bt-ui-row button{flex:1;padding:9px;border-radius:8px;border:none;' +
    'font:inherit;font-weight:600;cursor:pointer}' +
    '.bt-ui-ok{background:#2e8c8a;color:#fff}.bt-ui-ok.danger{background:#a93b2a}.bt-ui-no{background:#ece0c4;color:#3d476a}' +
    '@media (prefers-color-scheme:dark){.bt-acct{background:#24262b;border-color:#33363d;color:#a7a196}' +
    '.bt-acct button,.bt-acct select{background:#2e3138;border-color:#444c5c;color:#e0ddd5}' +
    '.bt-ui-box{background:#262834;border-color:#4c5066;color:#e9e3d3}' +
    '.bt-ui-box input{background:#2b2d3a;border-color:#4c5066;color:#e9e3d3}.bt-ui-no{background:#313343;color:#c3bdad}}' +
    '@media print{#bt-account{display:none}}';
  document.head.appendChild(style);

  // Shared in-page dialogs (available even when this tool has no account bar).
  window.BTUI = {
    ask: function (msg, def) {
      return new Promise(function (res) {
        var b = document.createElement('div');
        b.className = 'bt-ui-back';
        b.innerHTML =
          '<div class="bt-ui-box"><p></p><input><div class="bt-ui-row">' +
          '<button class="bt-ui-ok">OK</button><button class="bt-ui-no">Cancel</button></div></div>';
        b.querySelector('p').textContent = msg;
        var inp = b.querySelector('input');
        inp.value = def || '';
        function done(v) {
          b.remove();
          res(v);
        }
        b.querySelector('.bt-ui-ok').onclick = function () {
          done(inp.value.trim() || null);
        };
        b.querySelector('.bt-ui-no').onclick = function () {
          done(null);
        };
        inp.onkeydown = function (e) {
          if (e.key === 'Enter') done(inp.value.trim() || null);
          if (e.key === 'Escape') done(null);
        };
        b.onclick = function (e) {
          if (e.target === b) done(null);
        };
        document.body.appendChild(b);
        inp.focus();
        inp.select();
      });
    },
    confirm: function (msg, opts) {
      opts = opts || {};
      return new Promise(function (res) {
        var b = document.createElement('div');
        b.className = 'bt-ui-back';
        b.innerHTML =
          '<div class="bt-ui-box"><p></p><div class="bt-ui-row">' +
          '<button class="bt-ui-ok' +
          (opts.danger ? ' danger' : '') +
          '">' +
          (opts.ok || 'Confirm') +
          '</button><button class="bt-ui-no">Cancel</button></div></div>';
        b.querySelector('p').textContent = msg;
        function done(v) {
          b.remove();
          res(v);
        }
        b.querySelector('.bt-ui-ok').onclick = function () {
          done(true);
        };
        b.querySelector('.bt-ui-no').onclick = function () {
          done(false);
        };
        b.onclick = function (e) {
          if (e.target === b) done(false);
        };
        document.body.appendChild(b);
        b.querySelector('.bt-ui-ok').focus();
      });
    },
  };

  var TOOL = window.BT_TOOL;
  if (!TOOL) return;

  var mount = document.getElementById('bt-account');
  if (!mount) {
    mount = document.createElement('div');
    mount.id = 'bt-account';
    var w = document.querySelector('.wrap') || document.body;
    w.insertBefore(mount, w.firstChild);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function j(url, opts) {
    return fetch(url, Object.assign({ credentials: 'same-origin' }, opts || {})).then(function (r) {
      return r
        .json()
        .catch(function () {
          return null;
        })
        .then(function (d) {
          if (!r.ok) {
            var e = new Error((d && d.error) || 'HTTP ' + r.status);
            e.status = r.status;
            throw e;
          }
          return d;
        });
    });
  }

  var API = {
    me: function () {
      return j('/api/auth/me').catch(function () {
        return null;
      });
    },
    list: function () {
      return j('/api/tool-state?tool=' + encodeURIComponent(TOOL));
    },
    save: function (name, data) {
      return j('/api/tool-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: TOOL, name: name, data: data }),
      });
    },
    del: function (id) {
      return j('/api/tool-state/' + id, { method: 'DELETE' });
    },
  };

  function collect() {
    return typeof window.btCollect === 'function' ? window.btCollect() : genericCollect();
  }
  function apply(d) {
    return typeof window.btApply === 'function' ? window.btApply(d) : genericApply(d);
  }
  function fire(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function genericCollect() {
    var out = {};
    document.querySelectorAll('input[id], select[id], textarea[id]').forEach(function (el) {
      if (el.type === 'button' || el.type === 'submit' || el.type === 'file') return;
      if (el.closest('#bt-account')) return;
      if (el.type === 'checkbox') out[el.id] = el.checked;
      else if (el.type === 'radio') {
        if (el.checked) out['@' + el.name] = el.value;
      } else out[el.id] = el.value;
    });
    return out;
  }
  function genericApply(data) {
    Object.keys(data).forEach(function (k) {
      var v = data[k];
      if (k[0] === '@') {
        var r = document.querySelector(
          'input[type=radio][name="' + k.slice(1) + '"][value="' + v + '"]'
        );
        if (r) {
          r.checked = true;
          fire(r);
        }
        return;
      }
      var el = document.getElementById(k);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v;
      fire(el);
    });
  }

  function goSignIn() {
    try {
      localStorage.setItem('bt-stash-' + TOOL, JSON.stringify(collect()));
    } catch (e) {
      /* private mode */
    }
    location.href = '/tools/brambletally/';
  }

  function render() {
    API.me().then(function (me) {
      if (!me || !me.user) {
        mount.innerHTML =
          '<div class="bt-acct"><span class="bt-grow">Sign in to your Brambletally account to save these inputs.</span>' +
          '<button id="bt-in">Sign in</button></div>';
        document.getElementById('bt-in').onclick = goSignIn;
        return;
      }
      API.list()
        .then(function (res) {
          var states = (res && res.states) || [];
          var opts =
            '<option value="">Load a preset…</option>' +
            states
              .map(function (s) {
                return '<option value="' + s.id + '">' + esc(s.name) + '</option>';
              })
              .join('');
          mount.innerHTML =
            '<div class="bt-acct">' +
            '<span class="bt-grow">Saving to ' +
            esc(me.user.name || me.user.email) +
            '</span>' +
            (states.length
              ? '<select id="bt-load">' + opts + '</select><button id="bt-del" hidden>Delete</button>'
              : '') +
            '<button id="bt-save" class="primary">Save preset</button>' +
            '</div>';

          var loaded = null;
          var loadSel = document.getElementById('bt-load');
          var delBtn = document.getElementById('bt-del');
          if (loadSel) {
            loadSel.onchange = function () {
              loaded =
                states.find(function (x) {
                  return x.id === loadSel.value;
                }) || null;
              delBtn.hidden = !loaded;
              if (loaded) apply(loaded.data);
            };
            delBtn.onclick = function () {
              if (!loaded) return;
              window.BTUI.confirm('Delete preset “' + loaded.name + '”?', { danger: true, ok: 'Delete' }).then(
                function (ok) {
                  if (ok) API.del(loaded.id).then(render);
                }
              );
            };
          }
          document.getElementById('bt-save').onclick = function () {
            window.BTUI.ask('Name this preset').then(function (name) {
              if (name) API.save(name, collect()).then(render);
            });
          };

          try {
            var stash = localStorage.getItem('bt-stash-' + TOOL);
            if (stash) {
              localStorage.removeItem('bt-stash-' + TOOL);
              window.BTUI.confirm('Restore the inputs you had before signing in?').then(function (ok) {
                if (ok) apply(JSON.parse(stash));
              });
            }
          } catch (e) {
            /* ignore */
          }
        })
        .catch(function () {
          /* leave the bar as-is */
        });
    });
  }

  // Wait for the tool's own scripts to wire up before we set values / fire events.
  if (document.readyState === 'complete') render();
  else window.addEventListener('load', render);
})();
