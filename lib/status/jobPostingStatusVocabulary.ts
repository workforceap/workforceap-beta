/**
 * One vocabulary for a job posting's `JobPosting.status` (`JobStatusEnum`:
 * draft / pending / approved / live / filled / closed, plus the derived
 * `expired` the employer list computes from `expiresAt`).
 *
 * Every surface that turns one of those values into words goes through this
 * module instead of keeping its own map. Before it, the employer board said
 * "In review" and the admin queue said "Pending" for the same row. Two
 * audiences, one meaning, each told what is true for them:
 *
 *  - `employer`: what happens next for them. A submitted posting is
 *    "Awaiting approval" (WorkforceAP approves it before it goes live).
 *  - `admin`: the queue word. The same posting is "Awaiting review" — it is
 *    sitting in the admin review queue.
 *
 * Every other value reads the same for both audiences: it is the enum truth
 * ("Draft", "Approved", "Live", "Filled", "Closed", "Expired"). The employer
 * portal's board additionally reads live as "Active" and approved as
 * "Paused" (`employerJobPortalStatusLabel`), which is a per-surface overlay
 * on top of these words, not a second vocabulary.
 *
 * Plain typed constants, no i18n: none of these surfaces reads a `status`
 * translator today. When one does, mirror these words under
 * `status.jobPosting.<audience>.<key>` the way applicationStatusVocabulary
 * mirrors `status.application.*`, and pin en.json to them.
 *
 * Tones are unchanged and stay with each surface (BadgeVariant on the
 * employer side, admin pill classes / KitTone on the admin side).
 */

export type JobPostingStatusAudience = 'employer' | 'admin';

export const JOB_POSTING_STATUS_KEYS = ['draft', 'pending', 'approved', 'live', 'filled', 'closed', 'expired'] as const;
export type JobPostingStatusKey = (typeof JOB_POSTING_STATUS_KEYS)[number];

const SHARED_WORDS: Omit<Record<JobPostingStatusKey, string>, 'pending'> = {
  draft: 'Draft',
  approved: 'Approved',
  live: 'Live',
  filled: 'Filled',
  closed: 'Closed',
  expired: 'Expired',
};

export const JOB_POSTING_STATUS_WORDS: Record<JobPostingStatusAudience, Record<JobPostingStatusKey, string>> = {
  employer: { ...SHARED_WORDS, pending: 'Awaiting approval' },
  admin: { ...SHARED_WORDS, pending: 'Awaiting review' },
};

const KEYS: ReadonlySet<string> = new Set(JOB_POSTING_STATUS_KEYS);

/** `JobPosting.status` (or the derived `expired`) → vocabulary key; anything else → null. */
export function jobPostingStatusKey(status: string | null | undefined): JobPostingStatusKey | null {
  return status != null && KEYS.has(status) ? (status as JobPostingStatusKey) : null;
}

/**
 * The word for a job posting status for the given audience. An unknown
 * value comes back as-is, which is what every surface did before (`?? status`).
 */
export function jobPostingStatusLabel(status: string, audience: JobPostingStatusAudience): string {
  const key = jobPostingStatusKey(status);
  return key ? JOB_POSTING_STATUS_WORDS[audience][key] : status;
}
