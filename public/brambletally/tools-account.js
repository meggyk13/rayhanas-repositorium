/* Brambletally account bar for the standalone tools.
 * Each tool page sets window.BT_TOOL (one of: salvar, caftan, war-food,
 * award-rec, packing-list) and includes this script. Tools with dynamic
 * state define window.btCollect() / window.btApply(data); everything else
 * falls back to a generic serializer over id'd form controls. */

(function () {
  'use strict';
  var TOOL = window.BT_TOOL;
  if (!TOOL) return;

  var style = document.createElement('style');
  style.textContent =
    '#bt-account{margin:0 0 18px;font:500 13px/1.4 system-ui,-apple-system,sans-serif}' +
    '.bt-acct{display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center;justify-content:flex-end;' +
    'background:#f4f2ee;border:1px solid #e4e0d8;border-radius:10px;padding:8px 12px;color:#5c564c}' +
    '.bt-acct .bt-grow{flex:1;min-width:150px}' +
    '.bt-acct button,.bt-acct select{font:inherit;padding:6px 10px;border-radius:7px;' +
    'border:1px solid #cfc8ba;background:#fff;color:#3a352c;cursor:pointer}' +
    '.bt-acct button.primary{background:#6B8E23;border-color:#6B8E23;color:#fff}' +
    '@media (prefers-color-scheme:dark){.bt-acct{background:#24262b;border-color:#33363d;color:#a7a196}' +
    '.bt-acct button,.bt-acct select{background:#2e3138;border-color:#444c5c;color:#e0ddd5}}' +
    '@media print{#bt-account{display:none}}';
  document.head.appendChild(style);

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
              if (!confirm('Delete preset “' + loaded.name + '”?')) return;
              API.del(loaded.id).then(render);
            };
          }
          document.getElementById('bt-save').onclick = function () {
            var name = prompt('Name this preset');
            if (!name || !name.trim()) return;
            API.save(name.trim(), collect()).then(render);
          };

          try {
            var stash = localStorage.getItem('bt-stash-' + TOOL);
            if (stash) {
              localStorage.removeItem('bt-stash-' + TOOL);
              if (confirm('Restore the inputs you had before signing in?')) apply(JSON.parse(stash));
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
