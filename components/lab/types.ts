import type { ModelVersion } from '@/lib/db/schema';
import type { BoardRow, CurvePoint, IclPoint } from '@/lib/eval/board';
import type { SuiteItem } from '@/lib/eval/suite';
import type { EvalMetrics } from '@/lib/eval/metrics';

export interface MatrixCell { runId: string; status: string; correct: boolean | null; steps: number; reason: string | null }
export interface MatrixColumn { evalId: string; lane: string; label: string; versionId: string | null; examples: number; cells: (MatrixCell | null)[] }
export type LabVersion = ModelVersion & {
  evalMetrics: (EvalMetrics & { finishedAt?: string }) | null;
  metrics: (EvalMetrics & { gate?: { pass: boolean; reasons: string[]; headline: string; comparedTo: string | null } }) | null;
};
export interface LabData {
  mode: 'real' | 'mock'; db: string; versions: LabVersion[]; current: string;
  board: BoardRow[]; curve: CurvePoint[]; icl: IclPoint[]; suite: SuiteItem[]; columns: MatrixColumn[];
  totals: { corrections: number; human: number; scripted: number; augmented: number; bugExamples: number };
}
