// Fetch helpers for the `{ok:true,data}|{ok:false,error}` envelope (plan §16).
export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
    cache: 'no-store',
  });
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
