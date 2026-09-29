/**
 * Shared counselor-escalation pipeline.
 *
 * Originally inlined in `submitFirst90DaysCheckIn` (see
 * app/(portal)/dashboard/first90DaysAction.ts) for the "having_trouble"
 * First 90 Days check-in response. Extracted so other retention signals
 * (e.g. a placement survey reporting job loss) can escalate through the
 * exact same counselor-inbox pipeline instead of re-implementing it:
 *
 *   - Bumps (or opens) an `AtRiskAlert` row so the member surfaces in the
 *     counselor inbox-zero `at_risk` queue and the existing daily
 *     `runAtRiskCounselorAlerts` (weekly at-risk-alerts cron) eventually emails the counselor.
 *   - Writes a readable `CounselorNote` so the concern shows up wherever
 *     counselors already look at member history.
 *
 * No new infrastructure — same tables, same read paths.
 */

import { prisma } from '@/lib/db/prisma';

/**
 * Factor names `escalateToCounselor` writes when a MEMBER reported the
 * problem themselves (First 90 Days "having trouble" in
 * app/(portal)/dashboard/first90DaysAction.ts, placement-survey job loss in
 * app/api/placement-survey/route.ts). The nightly scorer
 * (`/api/cron/at-risk-check` + `persistAtRiskAlert`) must neither auto-resolve
 * an alert carrying one of these nor drop the factor or its score floor —
 * the escalation stays until staff close it. Only names that are written
 * today belong here.
 */
export const MEMBER_REPORTED_FACTOR_NAMES = [
  'first90_trouble_reported',
  'placement_survey_job_loss_reported',
] as const;

const MEMBER_REPORTED_FACTOR_NAME_SET: ReadonlySet<string> = new Set(MEMBER_REPORTED_FACTOR_NAMES);

/**
 * The member-reported entries of an `AtRiskAlert.factors` JSON value.
 * Pure and defensive: returns [] for anything that is not an array, and skips
 * entries that are not objects with a string `name`.
 */
export function memberReportedFactors(
  factors: unknown,
): Array<{ name: string } & Record<string, unknown>> {
  if (!Array.isArray(factors)) return [];
  const out: Array<{ name: string } & Record<string, unknown>> = [];
  for (const entry of factors) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const name = (entry as Record<string, unknown>).name;
    if (typeof name !== 'string' || !MEMBER_REPORTED_FACTOR_NAME_SET.has(name)) continue;
    out.push(entry as { name: string } & Record<string, unknown>);
  }
  return out;
}

export function hasMemberReportedFactor(factors: unknown): boolean {
  return memberReportedFactors(factors).length > 0;
}

export type CounselorEscalationInput = {
  userId: string;
  /** Short machine-readable factor name stored on the AtRiskAlert. */
  factorName: string;
  /** Human-readable summary used as both the alert factor description and folded into the note. */
  summary: string;
  /** Full CounselorNote content (prefix with a tag like "[First 90 Days]" or "[Placement Survey]"). */
  noteContent: string;
  /** Floor score to bump an existing alert to, or the score for a newly-created alert. Default 75. */
  minScore?: number;
  /** CounselorNote.authorId — omit for system/anonymous-triggered escalations. */
  authorId?: string | null;
};

export async function escalateToCounselor(input: CounselorEscalationInput): Promise<void> {
  const { userId, factorName, summary, noteContent, minScore = 75, authorId = null } = input;

  const openAlert = await prisma.atRiskAlert.findFirst({
    where: { userId, status: { in: ['open', 'acknowledged'] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, score: true, factors: true },
  });

  const factor = { name: factorName, weight: 1, description: summary };

  if (openAlert) {
    const factors = Array.isArray(openAlert.factors) ? openAlert.factors : [];
    await prisma.atRiskAlert.update({
      where: { id: openAlert.id },
      data: {
        score: Math.max(openAlert.score, minScore),
        factors: [...factors, factor] as object[],
        status: 'open',
      },
    });
  } else {
    await prisma.atRiskAlert.create({
      data: {
        userId,
        score: minScore,
        factors: [factor],
        status: 'open',
      },
    });
  }

  await prisma.counselorNote.create({
    data: {
      memberId: userId,
      authorId,
      content: noteContent,
    },
  });
}
