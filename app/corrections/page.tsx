import type { Metadata } from 'next';
import { Shell } from '@/components/lab/Shell';
import { CorrectionsView } from '@/components/lab/CorrectionsView';

export const metadata: Metadata = { title: 'RETRY · Corrections' };
export const dynamic = 'force-dynamic';

export default function CorrectionsPage() {
  return <Shell active="/corrections"><CorrectionsView /></Shell>;
}
