import type { JobMatchInput } from '@/lib/admin/aiJobMatchCompute';
import type { StudentMatch } from '@/lib/ai/matchStudents';
import { employerVisibleMatchReasons, staffAssessmentReason } from '@/lib/employer/matchReasons';

/** Row shape returned to the admin UI / API (matches Prisma include). */
export type AdminJobMatchRow = {
  studentId: string;
  matchScore: number;
  matchReasons: string[];
  status: string;
  student: {
    id: string;
    fullName: string;
    email: string;
    enrolledProgram: string | null;
    assessmentScorePct: number | null;
    profile: { city: string | null; state: string | null } | null;
    userCertifications: { certName: string }[];
  };
};

export type RunAdminJobMatchesDeps = {
  findAuthorizedJob: (jobId: string) => Promise<(JobMatchInput & { id: string }) | null>;
  findCachedRows: (jobId: string) => Promise<AdminJobMatchRow[]>;
  computeMatches: (jobId: string, job: JobMatchInput) => Promise<StudentMatch[]>;
  persistMatches: (jobId: string, matches: StudentMatch[]) => Promise<unknown>;
  markMatchesComputedAt: (jobId: string) => Promise<unknown>;
  reloadRows: (jobId: string) => Promise<AdminJobMatchRow[]>;
  markEmptyCooldown: (jobId: string) => void;
  clearEmptyCooldown: (jobId: string) => void;
  logDiagnostic: (input: {
    status: 'started' | 'success' | 'fallback' | 'error' | 'inspection';
    summary: string;
    method: string;
    fallbackPath?: string | null;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
};

/**
 * Admin payload row. `matchReasons` is the employer-visible list;
 * `staffReasons` carries the staff-only assessment line
 * (lib/employer/matchReasons.ts). Admin-only: never serialize this for an
 * employer response.
 */
export function serializeAdminJobMatchRow(m: AdminJobMatchRow) {
  const assessment = staffAssessmentReason(m.student.assessmentScorePct);
  return {
    studentId: m.studentId,
    matchScore: m.matchScore,
    matchReasons: employerVisibleMatchReasons(m.matchReasons),
    staffReasons: assessment ? [assessment] : [],
    status: m.status,
    student: m.student,
  };
}

/**
 * Core GET /api/admin/jobs/:id/matches flow (auth handled by route).
 */
export async function runAdminJobMatchesGet(
  jobId: string,
  job: JobMatchInput & { id: string },
  deps: RunAdminJobMatchesDeps
): Promise<{ status: 200; body: unknown }> {
  const cached = await deps.findCachedRows(jobId);
  if (cached.length > 0) {
    try {
      await deps.logDiagnostic({
        status: 'inspection',
        summary: `Admin opened cached AI matches (${cached.length})`,
        method: 'cache',
        metadata: { count: cached.length },
      });
    } catch {
      /* non-blocking */
    }
    return { status: 200, body: cached.map(serializeAdminJobMatchRow) };
  }

  const matches = await deps.computeMatches(jobId, job);
  try {
    await deps.logDiagnostic({
      status: matches.length > 0 ? 'success' : 'fallback',
      summary:
        matches.length > 0 ? `Generated ${matches.length} AI matches` : 'AI matching returned zero matches',
      method: 'generated',
      fallbackPath: matches.length > 0 ? null : 'no_matches',
      metadata: { count: matches.length },
    });
  } catch {
    /* non-blocking */
  }

  if (matches.length === 0) {
    deps.markEmptyCooldown(jobId);
    return { status: 200, body: [] };
  }

  deps.clearEmptyCooldown(jobId);

  try {
    await deps.persistMatches(jobId, matches);
    await deps.markMatchesComputedAt(jobId);
  } catch (err) {
    console.error('[admin_job_matches] persist or stamp failed', {
      jobId,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  const updated = await deps.reloadRows(jobId);
  return { status: 200, body: updated.map(serializeAdminJobMatchRow) };
}
