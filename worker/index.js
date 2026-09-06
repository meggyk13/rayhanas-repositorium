// Brambletally API — Cloudflare Worker entry.
//
// The site deploys as a Worker with static assets: requests that match a file
// in ./dist are served by the edge before this runs, so `fetch` only sees
// paths with no matching asset. We handle /api/* here and 404 the rest.

import { routes } from './routes.js';
import { loadSession } from './api/session.js';
import { error } from './api/lib/http.js';

function matchRoute(pathname) {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const uSeg = clean.split('/');
  for (const [pattern, mod] of routes) {
    const pSeg = pattern.split('/');
    if (pSeg.length !== uSeg.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < pSeg.length; i++) {
      if (pSeg[i].startsWith(':')) {
        params[pSeg[i].slice(1)] = decodeURIComponent(uSeg[i]);
      } else if (pSeg[i] !== uSeg[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { mod, params };
  }
  return null;
}

const handlerFor = (mod, method) => {
  const name = 'onRequest' + method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
  return mod[name] || mod.onRequest || null;
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS
        ? env.ASSETS.fetch(request)
        : new Response('Not found', { status: 404 });
    }

    const match = matchRoute(url.pathname);
    if (!match) return error(404, 'Not found');

    const handler = handlerFor(match.mod, request.method);
    if (!handler) return error(405, 'Method not allowed');

    const context = {
      request,
      env,
      params: match.params,
      data: {},
      waitUntil: ctx.waitUntil.bind(ctx),
    };

    let slideCookie;
    try {
      ({ slideCookie } = await loadSession(context));
    } catch (e) {
      console.error('[brambletally] session load failed', e);
    }

    let res;
    try {
      res = await handler(context);
    } catch (e) {
      console.error('[brambletally] handler error', url.pathname, e);
      return error(500, 'Something went wrong');
    }
    if (!(res instanceof Response)) return error(500, 'Handler returned no response');

    if (slideCookie) {
      res = new Response(res.body, res);
      res.headers.append('Set-Cookie', slideCookie);
    }
    return res;
  },
};
