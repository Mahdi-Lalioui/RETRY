import type { Metadata } from 'next';
import { Shell } from '@/components/lab/Shell';
import { AttractView } from '@/components/lab/AttractView';

export const metadata: Metadata = { title: 'RETRY · Attract' };
export const dynamic = 'force-dynamic';

export default function AttractPage() {
  return <Shell bare><AttractView /></Shell>;
}
