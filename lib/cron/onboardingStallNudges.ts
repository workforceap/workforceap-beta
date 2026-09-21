import { prisma } from '@/lib/db/prisma';
import { CRON_SCOPED_LOOKUP_CAP } from '@/lib/db/scanCaps';
import { sendMemberCheckInEmail, sendMemberStuckEmail } from '@/lib/email';
import type { BulkEmailPacingSkipped } from '@/lib/email/pacing';
import { isRecipientSkipReason } from '@/lib/email/send';
import { filterNudgeEligibleUserIds, recordNudgeSent } from '@/lib/cron/nudgeThrottle';
import { captureApiError } from '@/lib/observability/captureApiError';

/**
 * WAP-92: member-side nudges for the onboarding-stall buckets.
 *
 * `/api/cron/onboarding-stalls` already emails staff one weekly digest. This
 * module adds the member-facing half: one email to the stalled member per
 * bucket, using the existing G5 retention templates
 * (`emails/member-stuck.ts`, `emails/member-check-in.ts`) through their
 * `lib/email` wrappers, so provider suppression, fixture skips, the
 * `List-Unsubscribe` headers and the send log all come from the shared
 * `sendBrandedEmail` path untouched.
 *
 * Guard rails (the channel has a history of email incidents):
 *
 *  - The whole path is OFF unless `MEMBER_STALL_NUDGES_ENABLED` is `true`/`1`.
 *    Mike flips it; with the flag off the cron behaves exactly as before.
 *  - At most ONE email per (member, bucket), ever: the send is recorded in
 *    the shared `MemberNudgeLog` ledger with kind `stall_<bucket>` and a
 *    member who already has that row is never re-sent for that bucket.
 *  - The shared 7-day cross-cron cooldown (`lib/cron/nudgeThrottle.ts`) is
 *    honoured, so a member nudged by inactive-nudge / at-risk this week is
 *    not also nudged here.
 *  - A member present in several buckets gets one email per run: the
 *    highest-priority bucket wins (same "earliest stage wins" shape as
 *    cron/applicant-followup).
 *  - Sends are paced by the caller's bulk-email pacer and bounded to
 *    `CRON_SCOPED_LOOKUP_CAP` members per run.
 *  - The only log line is a counted event with no member data.
 */

export const MEMBER_STALL_NUDGES_FLAG = 'MEMBER_STALL_NUDGES_ENABLED';

export type StallBucket = 'interview' | 'no_program' | 'wioa';
export type StallNudgeTemplate = 'stuck' | 'check_in';

/** Priority order: a member in several buckets is nudged for the first one. */
export const STALL_BUCKETS: readonly StallBucket[] = ['interview', 'no_program', 'wioa'];

/**
 * Bucket → template. `null` means "staff-only bucket, no member email".
 *
 *  - interview: the member asked for an interview and never completed it —
 *    the blocker is on their side, so offer the counselor ("Let's get
 *    unstuck", booking link or the counselor inbox).
 *  - no_program: signed up 7+ days ago, no program and no counselor — a
 *    friendly check-in pointing back at the dashboard where the program
 *    picker lives.
 *  - wioa: the screening is waiting on STAFF review (pending/in_review),
 *    and its 5-day proxy is `users.updatedAt`, not a submission timestamp.
 *    Emailing the member for our own review backlog would be misdirected,
 *    so this bucket stays staff-digest only until product decides otherwise.
 */
export const STALL_BUCKET_TEMPLATE: Readonly<Record<StallBucket, StallNudgeTemplate | null>> = {
  interview: 'stuck',
  no_program: 'check_in',
  wioa: null,
};

/** `MemberNudgeLog.tier` for every row this module writes. */
export const STALL_NUDGE_TIER = 'onboarding_stall';

/** `MemberNudgeLog.kind` for a bucket — the per-(member, bucket) suppression key. */
export function stallNudgeKind(bucket: StallBucket): string {
  return `stall_${bucket}`;
}

export function memberStallNudgesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const value = env[MEMBER_STALL_NUDGES_FLAG]?.trim().toLowerCase();
  return value === 'true' || value === '1';
}

export type StallNudgeCandidate = { id: string; fullName: string | null; email: string | null };
export type StallNudgeBuckets = Readonly<Record<StallBucket, readonly StallNudgeCandidate[]>>;

/** Structural subset of `createBulkEmailCronPacer()` so tests can pass a minimal pacer. */
export type StallNudgePacer = {
  run<T>(operation: () => Promise<T>): Promise<T | BulkEmailPacingSkipped>;
};

export type MemberStallNudgeResult = {
  enabled: boolean;
  /** Distinct members seen across all buckets. */
  candidates: number;
  sent: Record<StallBucket, number>;
  sentTotal: number;
  /** Member already counted for a higher-priority bucket this run. */
  skippedDuplicateBucket: number;
  /** Bucket mapped to no member template (staff-only). */
  skippedNoTemplate: number;
  skippedNoEmail: number;
  /** Already has a `stall_<bucket>` ledger row — one email per (member, bucket). */
  skippedAlreadyNudged: number;
  /** Nudged by any cron inside the shared 7-day window. */
  skippedCooldown: number;
  /** Provider-suppressed or fixture recipient (skipped by the shared sender). */
  skippedRecipient: number;
  skippedPacing: number;
  /** Beyond the per-run cap; picked up by a later run. */
  deferred: number;
  failed: number;
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.workforceap.org';
const FALLBACK_COUNSELOR_NAME = 'Your WorkforceAP counselor';
const LOG_EVENT = '[cron/onboarding-stalls] member_stall_nudges';

export function emptyMemberStallNudgeResult(enabled: boolean): MemberStallNudgeResult {
  return {
    enabled,
    candidates: 0,
    sent: { interview: 0, no_program: 0, wioa: 0 },
    sentTotal: 0,
    skippedDuplicateBucket: 0,
    skippedNoTemplate: 0,
    skippedNoEmail: 0,
    skippedAlreadyNudged: 0,
    skippedCooldown: 0,
    skippedRecipient: 0,
    skippedPacing: 0,
    deferred: 0,
    failed: 0,
  };
}

function firstNameOf(fullName: string | null): string {
  const first = fullName?.trim().split(/\s+/)[0];
  return first || 'there';
}

function ledgerKey(userId: string, bucket: StallBucket): string {
  return `${userId}\u0000${bucket}`;
}

/** Counted event only — never a member id, name or address. */
function logCounts(result: MemberStallNudgeResult): void {
  console.info(LOG_EVENT, JSON.stringify(result));
}

type PlannedNudge = { member: StallNudgeCandidate; bucket: StallBucket; template: StallNudgeTemplate };

/**
 * Decide who gets which email this run. Pure: no I/O, so the bucket →
 * template mapping and the one-per-member rule are directly testable.
 */
export function planMemberStallNudges(
  buckets: StallNudgeBuckets,
  result: MemberStallNudgeResult,
): PlannedNudge[] {
  const seen = new Set<string>();
  const plan: PlannedNudge[] = [];
  for (const bucket of STALL_BUCKETS) {
    const template = STALL_BUCKET_TEMPLATE[bucket];
    for (const member of buckets[bucket]) {
      if (seen.has(member.id)) {
        result.skippedDuplicateBucket++;
        continue;
      }
      seen.add(member.id);
      if (!template) {
        result.skippedNoTemplate++;
        continue;
      }
      if (!member.email?.trim()) {
        result.skippedNoEmail++;
        continue;
      }
      plan.push({ member, bucket, template });
    }
  }
  result.candidates = seen.size;
  return plan;
}

async function loadAlreadyNudged(plan: PlannedNudge[]): Promise<Set<string>> {
  const already = new Set<string>();
  for (const bucket of STALL_BUCKETS) {
    const ids = plan.filter((p) => p.bucket === bucket).map((p) => p.member.id);
    if (ids.length === 0) continue;
    // One row per (member, kind) by construction, so the cap cannot truncate
    // a bucket of at most CRON_SCOPED_LOOKUP_CAP planned members.
    const rows = await prisma.memberNudgeLog.findMany({
      where: { userId: { in: ids }, kind: stallNudgeKind(bucket) },
      select: { userId: true },
      take: CRON_SCOPED_LOOKUP_CAP,
    });
    for (const row of rows) already.add(ledgerKey(row.userId, bucket));
  }
  return already;
}

async function loadCounselorNames(memberIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (memberIds.length === 0) return names;
  const assignments = await prisma.counselorAssignment.findMany({
    where: { memberId: { in: memberIds }, active: true },
    select: { memberId: true, counselor: { select: { user: { select: { fullName: true } } } } },
    take: CRON_SCOPED_LOOKUP_CAP,
  });
  for (const a of assignments) {
    const name = a.counselor?.user?.fullName?.trim();
    if (name && !names.has(a.memberId)) names.set(a.memberId, name);
  }
  return names;
}

/**
 * Send the member-side stall nudges for one cron run. Never throws: every
 * outcome is a counter on the returned result, and the caller decides what
 * to do with `failed`.
 */
export async function sendMemberStallNudges(
  buckets: StallNudgeBuckets,
  pacer: StallNudgePacer,
): Promise<MemberStallNudgeResult> {
  const result = emptyMemberStallNudgeResult(memberStallNudgesEnabled());
  if (!result.enabled) {
    logCounts(result);
    return result;
  }

  let plan = planMemberStallNudges(buckets, result);
  if (plan.length > CRON_SCOPED_LOOKUP_CAP) {
    result.deferred = plan.length - CRON_SCOPED_LOOKUP_CAP;
    plan = plan.slice(0, CRON_SCOPED_LOOKUP_CAP);
  }
  if (plan.length === 0) {
    logCounts(result);
    return result;
  }

  let already: Set<string>;
  let eligible: Set<string>;
  try {
    [already, eligible] = await Promise.all([
      loadAlreadyNudged(plan),
      filterNudgeEligibleUserIds(plan.map((p) => p.member.id)),
    ]);
  } catch (err) {
    // Without the ledgers we cannot prove "at most once" — send nothing.
    captureApiError(err, { route: 'cron/onboarding-stalls/member-nudges', extra: { phase: 'ledger' } });
    result.failed = plan.length;
    logCounts(result);
    return result;
  }

  const toSend = plan.filter((p) => {
    if (already.has(ledgerKey(p.member.id, p.bucket))) {
      result.skippedAlreadyNudged++;
      return false;
    }
    if (!eligible.has(p.member.id)) {
      result.skippedCooldown++;
      return false;
    }
    return true;
  });

  const counselorNames = await loadCounselorNames(
    toSend.filter((p) => p.template === 'stuck').map((p) => p.member.id),
  ).catch((err) => {
    captureApiError(err, { route: 'cron/onboarding-stalls/member-nudges', extra: { phase: 'counselors' } });
    return new Map<string, string>();
  });

  for (const { member, bucket, template } of toSend) {
    const to = member.email!.trim();
    const firstName = firstNameOf(member.fullName);
    try {
      const sendResult = await pacer.run(() =>
        template === 'stuck'
          ? sendMemberStuckEmail({
              to,
              firstName,
              counselorName: counselorNames.get(member.id) ?? FALLBACK_COUNSELOR_NAME,
            })
          : sendMemberCheckInEmail({ to, firstName, dashboardUrl: `${SITE_URL}/dashboard` }),
      );
      if (sendResult.skipped) {
        if (isRecipientSkipReason(sendResult.error)) result.skippedRecipient++;
        else result.skippedPacing++;
        continue;
      }
      if (!sendResult.ok) {
        result.failed++;
        continue;
      }
      result.sent[bucket]++;
      result.sentTotal++;
      await recordNudgeSent({
        userId: member.id,
        tier: STALL_NUDGE_TIER,
        kind: stallNudgeKind(bucket),
        reasons: { bucket, template },
      });
    } catch (err) {
      result.failed++;
      captureApiError(err, {
        route: 'cron/onboarding-stalls/member-nudges',
        extra: { userId: member.id, bucket },
      });
    }
  }

  logCounts(result);
  return result;
}
