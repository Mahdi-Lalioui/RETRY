// Shared helpers for route handlers: {ok,data}|{ok,error} envelope, zod parsing, background work.
import { NextResponse, after } from 'next/server';
import { z } from 'zod';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export function ok<T>(data: T, init?: ResponseInit) { return NextResponse.json({ ok: true, data } satisfies ApiResult<T>, init); }
export function fail(error: string, status = 400) { return NextResponse.json({ ok: false, error } satisfies ApiResult<never>, { status }); }

export async function parseJson<S extends z.ZodType>(req: Request, schema: S): Promise<{ data: z.infer<S> } | { res: NextResponse }> {
  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const r = schema.safeParse(body);
  if (!r.success) return { res: fail(`invalid input: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`) };
  return { data: r.data };
}

export function parseQuery<S extends z.ZodType>(req: Request, schema: S): { data: z.infer<S> } | { res: NextResponse } {
  const q = Object.fromEntries(new URL(req.url).searchParams.entries());
  const r = schema.safeParse(q);
  if (!r.success) return { res: fail(`invalid query: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`) };
  return { data: r.data };
}

/** Run after the response (Vercel `after()`); outside a request scope (tests/scripts) run detached. */
export function runAfter(fn: () => Promise<unknown>) {
  const safe = () => fn().catch((e) => console.error('[after]', (e as Error).message));
  try { after(safe); } catch { void safe(); }
}

export function errorResponse(e: unknown) {
  console.error('[api]', e);
  return fail((e as Error)?.message ?? 'internal error', 500);
}
