import { ShopShell } from '@/components/shop/ShopShell';
import { parseBugs } from '@/lib/shop/bugs';

export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ShopPage({ params, searchParams }: { params: Promise<{ seed: string }>; searchParams: Promise<SP> }) {
  const { seed: rawSeed } = await params;
  const sp = await searchParams;
  const seed = Number.parseInt(rawSeed, 10);
  const v = Number.parseInt(one(sp.v) ?? '1', 10);
  const bugs = parseBugs(one(sp.bugs));
  const safeSeed = Number.isFinite(seed) ? seed : 1;
  const safeV = Number.isFinite(v) ? v : 1;
  // lane & task are read by the parent (Mission Control); the shop itself is lane-agnostic.
  return <ShopShell key={`${safeSeed}:${safeV}:${bugs.join(',')}:${one(sp.task) ?? ''}`} seed={safeSeed} versionIndex={safeV} bugs={bugs} taskId={one(sp.task)} />;
}
