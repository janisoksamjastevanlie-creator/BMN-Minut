import type { User } from '../types';

export interface ReportSignerDefinition {
  heading: string;
  name?: string | null;
  nip?: string | null;
  role?: string;
  emptyMessage?: string;
}

export interface ResolvedReportSigner {
  name: string | null;
  nip: string | null;
  message: string | null;
}

export function resolveReportSigner(
  signer: ReportSignerDefinition,
  users: readonly User[]
): ResolvedReportSigner;
