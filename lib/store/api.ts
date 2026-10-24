// Fetch helpers for the `{ok:true,data}|{ok:false,error}` envelope (plan §16).
/** [G] A cold start / redeploy drops connections for ~1 s: retry network errors and gateway 502/504 twice (503 carries an app error envelope). */
async function fetchRetry(path: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(path, init);
      if (attempt < 2 && (res.status === 502 || res.status === 504)) throw new TypeError(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      if (signal?.aborted || attempt >= 2 || !(e instanceof TypeError)) throw e;
      await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
    }
  }
}

export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetchRetry(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
    cache: 'no-store',
  }, signal);
  let json: { ok?: boolean; data?: T; error?: unknown };
  try { json = await res.json(); } catch { throw new Error(`${path}: HTTP ${res.status}`); }
  if (json && json.ok === true) return json.data as T;
  if (json && json.ok === false) throw new Error(`${path}: ${typeof json.error === 'string' ? json.error : JSON.stringify(json.error)}`);
  // tolerate un-enveloped responses
  return json as unknown as T;
}

export async function apiSafe<T>(path: string, body?: unknown): Promise<T | null> {
  try { return await api<T>(path, body); } catch { return null; }
}
