// plan §18. Never invent open-model prices: open models are null → shown as "credits".
export interface Price { inPerM: number; outPerM: number; source: string; checkedAt: string }

export const PRICING: Record<string, Price> = {
  'gpt-4o-mini': { inPerM: 0.15, outPerM: 0.6, source: 'https://openai.com/api/pricing', checkedAt: '2026-10-23' },
};

/** Strip lane prefixes ("closed:", "open:") and version suffixes ("@v3"). */
export function bareModel(model: string): string {
  return model.replace(/^(closed|open):/, '').split('@')[0];
}

export function priceFor(model: string): Price | null {
  if (/^open:/.test(model)) return null;
  return PRICING[bareModel(model)] ?? null;
}

/** USD for one call, or null when no verified price exists (open models → "credits"). */
export function costUsd(model: string, usage: { in: number; out: number }): number | null {
  const p = priceFor(model);
  if (!p) return null;
  return (usage.in * p.inPerM + usage.out * p.outPerM) / 1_000_000;
}
