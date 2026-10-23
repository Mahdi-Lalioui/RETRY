import type { Product } from './state';

export const CATALOG: Product[] = [
  { sku: 'aurora-lamp', name: 'Aurora Lamp', pricePence: 4800, image: '/products/aurora-lamp.svg',
    blurb: 'Hand-blown opal glass over a brushed brass stem. A warm, dimmable glow for late evenings.', tags: ['Lighting', 'Home'] },
  { sku: 'ember-mug', name: 'Ember Mug', pricePence: 1400, image: '/products/ember-mug.svg',
    blurb: 'Stoneware mug with a speckled terracotta glaze. Holds 350 ml of something hot.', tags: ['Kitchen', 'Ceramics'] },
  { sku: 'drift-hoodie', name: 'Drift Hoodie', pricePence: 6200, image: '/products/drift-hoodie.svg',
    blurb: 'Heavyweight organic loopback cotton in deep forest green. Relaxed fit, built to last.', tags: ['Apparel'] },
  { sku: 'tide-bottle', name: 'Tide Bottle', pricePence: 2200, image: '/products/tide-bottle.svg',
    blurb: 'Double-walled steel bottle. Cold for 24 hours, hot for 12. 750 ml.', tags: ['Outdoors'] },
  { sku: 'moss-planter', name: 'Moss Planter', pricePence: 1900, image: '/products/moss-planter.svg',
    blurb: 'Matte sage ceramic planter with a drainage saucer. For small, slow-growing things.', tags: ['Home', 'Ceramics'] },
  { sku: 'orbit-clock', name: 'Orbit Clock', pricePence: 3500, image: '/products/orbit-clock.svg',
    blurb: 'Silent-sweep wall clock in solid ash with a single orbiting brass dot.', tags: ['Home'] },
];

const BY_SKU = new Map(CATALOG.map((p) => [p.sku, p]));

export function getProduct(sku: string): Product {
  const p = BY_SKU.get(sku);
  if (!p) throw new Error(`Unknown sku: ${sku}`);
  return p;
}

export function formatPence(p: number): string {
  if (!Number.isFinite(p)) return '£NaN';
  return `£${(p / 100).toFixed(2)}`;
}
