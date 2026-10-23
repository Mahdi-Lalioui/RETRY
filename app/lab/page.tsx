import type { Metadata } from 'next';
import { Shell } from '@/components/lab/Shell';
import { LabView } from '@/components/lab/LabView';

export const metadata: Metadata = { title: 'RETRY · Lab' };
export const dynamic = 'force-dynamic';

export default function LabPage() {
  return <Shell active="/lab"><LabView /></Shell>;
}
