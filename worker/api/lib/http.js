// Small helpers for JSON responses.

export const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(init.headers || {}) },
  });

export const error = (status, message, extra = {}) =>
  json({ error: message, ...extra }, { status });

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
