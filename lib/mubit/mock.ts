// plan §11.3 + §27 "Mock model semantics". MOCK ONLY — dev/rehearsal/tests; mubitMode()==='mock'.
// Deterministic. Reads GOAL + snapshot text (format §9.1) from the last user message; no shop internals.
// Rule following is driven by REAL stored corrections: a versioned open model follows rule R iff the
// version's training set (model_versions.rules, computed from corrections at refresh time) contains R.
import { AsyncLocalStorage } from 'node:async_hooks';
import { nanoid } from 'nanoid';
import type { ChatReq, ChatRes, FeedbackReq, ModelVersionInfo, MubitClient, Msg } from './types';
import type { AgentAction } from '@/lib/agent/types';
import type { LearnedTag, ModelVersion } from '@/lib/db/schema';
import { repo } from '@/lib/db';
import { findVersion, learnedFromCorrections, nextVersionLabel } from '@/lib/db/queries';
import { readConfig } from './config';
import { ICL_HEADER } from '@/lib/agent/prompt';

// ---------- snapshot parsing ----------
export interface SnapEl { id: string; role: string; label: string; region: string; value?: string; checked?: boolean; disabled: boolean }
export interface Snap { page: string; cartCount: number; header: string; els: SnapEl[]; text: string }

export function parseSnapshot(snapshot: string): Snap {
  const lines = snapshot.split('\n');
  const header = lines[0] ?? '';
  const page = header.match(/PAGE\s+(\w+)/)?.[1] ?? 'unknown';
  const cartCount = Number(header.match(/CART\s+(\d+)/)?.[1] ?? 0);
  const els: SnapEl[] = [];
  for (const line of lines.slice(1)) {
    const m = line.match(/^\[([^\]]*)\]\s*(.*)$/);
    if (!m) continue;
    const region = m[1];
    for (const seg of m[2].split(/ \| (?=e\d+ )/)) {
      const e = seg.match(/^(e\d+)\s+(\w+)\s+"((?:[^"\\]|\\.)*)"(.*)$/);
      if (!e) continue;
      const rest = e[4];
      const value = rest.match(/value="((?:[^"\\]|\\.)*)"/)?.[1];
      const checked = /checked=true/.test(rest) ? true : /checked=false/.test(rest) ? false : undefined;
      els.push({ id: e[1], role: e[2], label: e[3], region, value, checked, disabled: /\bdisabled\b/.test(rest) });
    }
  }
  return { page, cartCount, header, els, text: snapshot };
}

// ---------- goal parsing ----------
const PRODUCTS = [
  { name: 'Aurora Lamp', price: 4800 }, { name: 'Ember Mug', price: 1400 }, { name: 'Drift Hoodie', price: 6200 },
  { name: 'Tide Bottle', price: 2200 }, { name: 'Moss Planter', price: 1900 }, { name: 'Orbit Clock', price: 3500 },
];
const QTY: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };

export interface GoalSpec { items: { name: string; qty: number }[]; coupon: boolean }
export function parseGoal(goal: string): GoalSpec {
  const g = goal.toLowerCase();
  const coupon = /test coupon/.test(g);
  if (/cheapest/.test(g)) return { items: [{ name: [...PRODUCTS].sort((a, b) => a.price - b.price)[0].name, qty: 1 }], coupon };
  if (/most expensive/.test(g)) return { items: [{ name: [...PRODUCTS].sort((a, b) => b.price - a.price)[0].name, qty: 1 }], coupon };
  const under = g.match(/every product under £(\d+)/);
  if (under) return { items: PRODUCTS.filter((p) => p.price < Number(under[1]) * 100).map((p) => ({ name: p.name, qty: 1 })), coupon };
  const found = PRODUCTS.map((p) => ({ p, idx: g.indexOf(p.name.toLowerCase()) })).filter((x) => x.idx >= 0).sort((a, b) => a.idx - b.idx);
  const items = found.map(({ p, idx }) => {
    const before = g.slice(Math.max(0, idx - 12), idx).trim().split(/\s+/).pop() ?? '';
    return { name: p.name, qty: QTY[before] ?? (Number(before) || 1) };
  });
  return { items, coupon };
}

// ---------- policy knowledge ----------
export type Knows = (tag: LearnedTag) => boolean;

export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
const coin = (key: string, p: number) => (hash(key) % 1000) / 1000 < p;

const DECLINE = /no thanks|skip|not now|without|essential|necessary|reject|decline|maybe later|no,? thank|dismiss|close|^×$|^x$/i;
const ADD = /\badd\b|get it/i;
const CART = /cart|bag|basket/i;
const CHECKOUT = /checkout|payment|proceed|secure/i;
const PAY = /^pay\b|place order|complete purchase|confirm|buy now/i;
const TEST_CARD = '4242 4242 4242 4242';

const btns = (s: Snap, f?: (e: SnapEl) => boolean) => s.els.filter((e) => (e.role === 'button' || e.role === 'link') && !e.disabled && (!f || f(e)));
const click = (e: SnapEl, reason: string): AgentAction => ({ type: 'click', target: e.id, reason });

interface Ctx { snap: Snap; goal: GoalSpec; history: { type: string; target?: string; value?: string; result: string }[]; knows: Knows; reportsBug: boolean }

function bugEvidence(c: Ctx): string | null {
  const { snap, history } = c;
  if (/£\s?NaN|NaN/.test(snap.text)) return 'Total shows £NaN';
  if (snap.page === 'error' || /went wrong|\b500\b/i.test(snap.text)) return 'Site shows "Something went wrong (500)"';
  if (snap.page === 'confirmation' && !/NM-[A-Z0-9]+/.test(snap.text)) return 'Order confirmed but no order number is shown';
  const last = history[history.length - 1];
  if (snap.page === 'checkout' && last?.type === 'click' && last.result === 'no_effect') {
    const el = snap.els.find((e) => e.id === last.target);
    if (el && PAY.test(el.label) && !/saved/i.test(el.label)) return 'Pay button does nothing — still on checkout after paying';
  }
  return null;
}

function handleModal(c: Ctx, region: string, els: SnapEl[]): AgentAction | null {
  const buttons = els.filter((e) => e.role === 'button' || e.role === 'link');
  if (!buttons.length) return null;
  const decline = buttons.find((e) => DECLINE.test(e.label));
  const accept = buttons.find((e) => !DECLINE.test(e.label)) ;
  const kind = region.replace(/^modal:/, '');
  const rule: LearnedTag | null = kind === 'cookies' ? 'R5' : kind === 'upsell' ? 'R1' : kind === 'giftwrap' ? 'R7' : kind === 'newsletter' ? 'R6' : null;
  if (!rule) return click(decline ?? buttons[0], 'Dismiss the dialog to continue.');
  if (c.knows(rule)) return decline ? click(decline, kind === 'cookies' ? 'Choose essential cookies only.' : `Decline the optional ${kind}.`) : click(buttons[0], 'Dismiss the dialog.');
  if (kind === 'newsletter') {
    const cont = buttons.find((e) => /^continue$/i.test(e.label)) ?? accept;
    return click(cont ?? buttons[0], 'Continue past the newsletter prompt.');
  }
  return click(accept ?? buttons[0], kind === 'cookies' ? 'Accept cookies to proceed quickly.' : `Accept the ${kind} offer to proceed.`);
}

function nextNeeded(c: Ctx): { name: string; remaining: number } | null {
  let acc = 0;
  for (const it of c.goal.items) {
    if (c.snap.cartCount < acc + it.qty) return { name: it.name, remaining: acc + it.qty - c.snap.cartCount };
    acc += it.qty;
  }
  return null;
}

function findAddFor(snap: Snap, name: string): SnapEl | undefined {
  const n = name.toLowerCase();
  const direct = btns(snap, (e) => ADD.test(e.label) && e.label.toLowerCase().includes(n));
  if (direct.length) return direct[0];
  const inRegion = btns(snap, (e) => ADD.test(e.label) && e.region.toLowerCase().includes(n));
  if (inRegion.length) return inRegion[0];
  let current: string | null = null;
  for (const e of snap.els) {
    const p = PRODUCTS.find((pp) => e.label.toLowerCase().includes(pp.name.toLowerCase()));
    if (p && !ADD.test(e.label)) current = p.name.toLowerCase();
    else if ((e.role === 'button' || e.role === 'link') && ADD.test(e.label) && !e.disabled && e.region !== 'header' && current === n) return e;
  }
  return undefined;
}

function shopping(c: Ctx): AgentAction | null {
  const { snap } = c;
  const need = nextNeeded(c);
  const cartBtn = btns(snap, (e) => CART.test(e.label) && !ADD.test(e.label) && !CHECKOUT.test(e.label))[0];
  if (!need) return cartBtn ? click(cartBtn, 'All goal items are in the cart; open the cart.') : null;
  if (snap.page === 'product') {
    const onIt = snap.els.some((e) => (e.role === 'heading' || e.role === 'text') && e.label.toLowerCase().includes(need.name.toLowerCase()));
    if (onIt) {
      const qty = snap.els.find((e) => e.role === 'select' && /qty|quantity/i.test(e.label));
      if (qty && need.remaining > 1 && qty.value !== String(need.remaining)) return { type: 'select', target: qty.id, value: String(need.remaining), reason: `Set quantity to ${need.remaining}.` };
      const add = btns(snap, (e) => ADD.test(e.label) && e.region !== 'header')[0];
      if (add) return click(add, `Add ${need.name} to the cart.`);
    } else {
      const back = btns(snap, (e) => /back|home|shop|continue shopping/i.test(e.label))[0];
      if (back) return click(back, 'Go back to the product grid.');
    }
  }
  const add = findAddFor(snap, need.name);
  if (add) return click(add, `Add ${need.name} to the cart.`);
  const link = btns(snap, (e) => e.label.toLowerCase().includes(need.name.toLowerCase()) && !ADD.test(e.label))[0];
  if (link) return click(link, `Open ${need.name}.`);
  if (snap.page !== 'home') {
    const home = btns(snap, (e) => /continue shopping|home|shop|night market|back/i.test(e.label))[0];
    if (home) return click(home, 'Return to the shop to find products.');
  }
  return null;
}

function cartPage(c: Ctx): AgentAction | null {
  const { snap } = c;
  if (nextNeeded(c)) {
    const cont = btns(snap, (e) => /continue shopping|shop|home/i.test(e.label) && !/newsletter/i.test(e.region))[0];
    if (cont) return click(cont, 'Cart is missing goal items; continue shopping.');
  }
  const decoy = btns(snap, (e) => /^continue$/i.test(e.label) && /newsletter/i.test(e.region))[0];
  if (decoy && !c.knows('R6')) return click(decoy, 'Continue to the next step.');
  const co = btns(snap, (e) => CHECKOUT.test(e.label) && !/newsletter/i.test(e.region))[0];
  return co ? click(co, 'Proceed to checkout.') : null;
}

function checkoutPage(c: Ctx): AgentAction | null {
  const { snap, history } = c;
  // shipping (R3)
  const radios = snap.els.filter((e) => e.role === 'radio' && !e.disabled);
  if (radios.length) {
    const collect = radios.find((e) => /collect|store/i.test(e.label));
    const standard = radios.find((e) => /standard/i.test(e.label)) ?? radios[0];
    const want = c.knows('R3') ? collect ?? standard : standard;
    if (!radios.some((r) => r.checked) || (c.knows('R3') && want && !want.checked)) {
      if (!want.checked) return click(want, c.knows('R3') ? 'House policy: collect in store for UK test orders.' : 'Choose standard shipping.');
    }
  }
  // coupon (R2)
  if (c.goal.coupon) {
    const box = snap.els.find((e) => e.role === 'textbox' && /coupon|promo|discount|code/i.test(e.label));
    const code = c.knows('R2') ? 'NIGHTSHIFT' : 'SAVE10';
    const applied = /applied|discount -|−10%|-10%/i.test(snap.text);
    const typedIdx = history.map((h) => h.type === 'type' && h.value === code).lastIndexOf(true);
    const clickedAfter = typedIdx >= 0 && history.slice(typedIdx + 1).some((h) => h.type === 'click');
    if (box && !applied && !clickedAfter) {
      if (box.value !== code) return { type: 'type', target: box.id, value: code, reason: c.knows('R2') ? 'House policy: test coupon is NIGHTSHIFT.' : 'Enter a test coupon code.' };
      const apply = btns(snap, (e) => /apply|redeem/i.test(e.label))[0];
      if (apply) return click(apply, 'Apply the coupon.');
    }
  }
  // payment (R4)
  const saved = btns(snap, (e) => /saved/i.test(e.label))[0];
  if (!c.knows('R4') && saved) return click(saved, 'Pay quickly with the saved card.');
  const card = snap.els.find((e) => e.role === 'textbox' && /card/i.test(e.label));
  if (card && !(card.value ?? '').replace(/\s/g, '').includes('4242424242424242')) return { type: 'type', target: card.id, value: TEST_CARD, reason: 'House policy: use the test card.' };
  const pay = btns(snap, (e) => PAY.test(e.label) && !/saved/i.test(e.label))[0];
  return pay ? click(pay, 'Place the order.') : null;
}

/** The mock "model": pick one goal-directed action for this snapshot. Pure + deterministic. */
export function mockDecide(c: Ctx): AgentAction {
  const { snap } = c;
  const evidence = bugEvidence(c);
  if (evidence) {
    if (c.reportsBug) return { type: 'report_bug', reason: evidence };
    if (snap.page === 'confirmation' || snap.page === 'error') return { type: 'done', reason: 'Order flow finished.' };
    // pretend nothing is wrong: keep going (pay again / proceed despite NaN)
  }
  if (snap.page === 'confirmation' && /NM-[A-Z0-9]+/.test(snap.text)) return { type: 'done', reason: 'Order confirmation with order number is visible.' };
  const modalRegions = [...new Set(snap.els.filter((e) => e.region.startsWith('modal:')).map((e) => e.region))];
  for (const r of modalRegions) {
    const a = handleModal(c, r, snap.els.filter((e) => e.region === r));
    if (a) return a;
  }
  let a: AgentAction | null = null;
  if (snap.page === 'cart') a = cartPage(c);
  else if (snap.page === 'checkout') a = checkoutPage(c);
  else if (snap.page === 'home' || snap.page === 'product') a = shopping(c);
  if (!a && snap.page !== 'checkout' && snap.page !== 'cart') a = shopping(c);
  return a ?? { type: 'scroll', reason: 'Looking for the next control.' };
}

// ---------- prompt reading ----------
function parseHistory(user: string): Ctx['history'] {
  const block = user.split('HISTORY (most recent last):\n')[1]?.split('\nPAGE SNAPSHOT:')[0] ?? '';
  const out: Ctx['history'] = [];
  for (const line of block.split('\n')) {
    const m = line.match(/^\d+\.\s+(\w+)(?:\s+(e\d+))?(?:\s+"(.*)")?\s+→\s+(\w+)/);
    if (m) out.push({ type: m[1], target: m[2], value: m[3], result: m[4] });
  }
  return out;
}

export function readPrompt(messages: Msg[]) {
  const user = [...messages].reverse().find((m) => m.role === 'user' && m.content.includes('PAGE SNAPSHOT:'))?.content ?? '';
  const system = messages.find((m) => m.role === 'system')?.content ?? '';
  const goal = user.match(/GOAL:\s*(.*)/)?.[1] ?? '';
  const snapshot = user.split('PAGE SNAPSHOT:\n')[1]?.split('\nNext action JSON:')[0] ?? '';
  const icl = system.includes(ICL_HEADER) ? system.split(ICL_HEADER)[1] : '';
  return { goal, snapshot, history: parseHistory(user), icl };
}

// ---------- client ----------
const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

// Added by Agent D (additive): eval/bootstrap run the mock with zero wall-clock delay. Reported latencyMs is unchanged
// (still the simulated figure), only the sleep is skipped, so a 48-run held-out eval finishes in seconds.
const fastScope = new AsyncLocalStorage<boolean>();
export function withMockFast<T>(fn: () => Promise<T>): Promise<T> { return fastScope.run(true, fn); }

const g = globalThis as unknown as { __mubitMockFeedback?: { id: string; at: string; f: FeedbackReq }[] };
export function mockFeedbackLog() { return (g.__mubitMockFeedback ??= []); }

async function learnedFor(versionId: string | undefined): Promise<{ tags: Set<LearnedTag>; versioned: boolean }> {
  if (!versionId) return { tags: new Set(), versioned: false };
  const v = await findVersion(versionId);
  if (!v || (v.examples ?? 0) === 0) return { tags: new Set(), versioned: false };
  return { tags: new Set((v.rules ?? []) as LearnedTag[]), versioned: true };
}

function toInfo(v: ModelVersion, trainSeconds: number): ModelVersionInfo {
  const elapsed = v.createdAt ? (Date.now() - new Date(v.createdAt).getTime()) / 1000 : trainSeconds;
  return {
    versionId: v.id, label: v.label, createdAt: new Date(v.createdAt ?? 0).toISOString(), examples: v.examples ?? 0,
    status: v.status === 'failed' ? 'failed' : v.status === 'training' ? 'training' : 'ready',
    progress: v.status === 'training' ? Math.min(0.99, trainSeconds > 0 ? elapsed / trainSeconds : 1) : 1,
  };
}

export function createMockClient(): MubitClient {
  return {
    async chat(req: ChatReq): Promise<ChatRes> {
      const c = readConfig();
      const p = readPrompt(req.messages);
      const closed = req.model.startsWith('closed:');
      const snap = parseSnapshot(p.snapshot);
      const key = `${req.model}|${hash(p.snapshot)}`;
      let knows: Knows; let reportsBug: boolean;
      if (closed) {
        knows = (t) => (t === 'R5' || t === 'R1' || t === 'R6') && coin(`${key}|${t}`, 0.5);
        reportsBug = true;
      } else if (p.icl) {
        // ICL: knows rules that appear in the example block; imperfect retrieval (~85%).
        knows = (t) => p.icl.includes(`[${t}]`) && coin(`${key}|icl|${t}`, 0.85);
        reportsBug = p.icl.includes('[BUG]') ? coin(`${key}|icl|bug`, 0.85) : coin(`${key}|bug`, 0.5);
      } else {
        const l = await learnedFor(req.versionId);
        knows = (t) => l.tags.has(t);
        reportsBug = l.versioned ? l.tags.has('BUG') : coin(`${p.snapshot}|bug`, 0.5);
      }
      const action = mockDecide({ snap, goal: parseGoal(p.goal), history: p.history, knows, reportsBug });
      const text = JSON.stringify(action);
      const chars = req.messages.reduce((n, m) => n + m.content.length, 0);
      const h = hash(`${key}|lat|${req.metadata?.stepIdx ?? ''}`);
      const base = closed ? 900 + (h % 701) : 300 + (h % 301);
      const latencyMs = Math.round(base + (closed ? 0 : Math.max(0, chars - 3000) / 40));
      await sleep(fastScope.getStore() ? 0 : latencyMs * c.mockLatencyScale);
      return { text, callId: `mock_${nanoid(12)}`, usage: { in: Math.ceil(chars / 4), out: Math.ceil(text.length / 4) + 8 }, latencyMs };
    },

    async submitFeedback(f: FeedbackReq) {
      const id = `mockfb_${nanoid(10)}`;
      mockFeedbackLog().push({ id, at: new Date().toISOString(), f });
      return { feedbackId: id };
    },

    async requestRefresh() {
      const c = readConfig();
      const training = (await repo.versions.list({ status: 'training' }))[0];
      if (training) return { jobId: training.id, mode: 'explicit' as const };
      const all = await repo.corrections.list();
      const label = await nextVersionLabel();
      const v = await repo.versions.insert({
        id: `ver_${label}_${nanoid(4)}`, label, mubitVersionId: `mock-${label}`, baseModel: c.openBaseModel,
        examples: all.length, status: 'training', promoted: false, rules: learnedFromCorrections(all), createdAt: new Date(),
      });
      await repo.versions.update(v.id, { jobId: v.id });
      return { jobId: v.id, mode: 'explicit' as const };
    },

    async refreshStatus(jobId: string | null) {
      const c = readConfig();
      const v = jobId ? await repo.versions.get(jobId) : (await repo.versions.list()).pop() ?? null;
      if (!v) return null;
      if (v.status === 'training') {
        const elapsed = (Date.now() - new Date(v.createdAt ?? 0).getTime()) / 1000;
        if (elapsed >= c.mockTrainSeconds) {
          const ready = await repo.versions.update(v.id, { status: 'ready', readyAt: new Date() });
          const pending = (await repo.corrections.list()).filter((x) => !x.versionId && new Date(x.createdAt ?? 0) <= new Date(v.createdAt ?? 0));
          for (const x of pending) await repo.corrections.update(x.id, { status: 'trained', versionId: v.id });
          return ready ? toInfo(ready, c.mockTrainSeconds) : null;
        }
      }
      return toInfo(v, c.mockTrainSeconds);
    },

    async listVersions() {
      const c = readConfig();
      return (await repo.versions.list()).map((v) => toInfo(v, c.mockTrainSeconds));
    },
  };
}
