/**
 * One vocabulary for `JobPostingApplication.status` — the employer hiring
 * pipeline a member's application to a posting moves through
 * (`JobPostingApplicationStatus`: pending / reviewing / interview / offered /
 * hired / rejected, prisma/schema.prisma). Plan scratchpad/vocab/plan.md A1.6,
 * second enum; the job-posting half landed in #2495.
 *
 * Before this module the same row read "Pending" (detail page, status
 * updater, the shared helper), "New" (mobile list) and "Pending" again via a
 * generic title-caser (work queue), and a declined applicant was "Rejected"
 * on one screen and "Declined" on the next. Every surface now asks here.
 * Two audiences, one meaning, each told what is true for them:
 *
 *  - `employer`: the pipeline as the employer works it. A fresh application
 *    is "New" (nobody has opened it yet — the employer owns the next move),
 *    then "Reviewing", "Interviewing", "Offer extended", "Hired" /
 *    "Not selected". These words also label the move-to buttons and the
 *    stage <select>s, so they are stage names, not verbs.
 *  - `member`: the same journey from the applicant's side, and what a
 *    counselor reading the member's record sees. "Applied" (sent, not yet
 *    opened), "Under review", "Interview stage", "Offer received", "Hired" /
 *    "Not selected". Never "New" — the applicant is not new to themselves.
 *
 * `rejected` reads "Not selected" for both: the enum word is the row's truth
 * but it is not a word we put in front of a person about a person.
 *
 * Plain typed constants, no i18n: none of these surfaces reads a `status`
 * translator today. When one does, mirror these words under
 * `status.jobApplication.<audience>.<key>` the way applicationStatusVocabulary
 * mirrors `status.application.*`, and pin en.json to them.
 *
 * Tones stay with each surface (`employerJobPostingApplicationStatusBadgeVariant`
 * on the employer side, KitTone in the mobile list); this module is words only.
 */

export type JobApplicationStatusAudience = 'employer' | 'member';

export const JOB_APPLICATION_STATUS_KEYS = ['pending', 'reviewing', 'interview', 'offered', 'hired', 'rejected'] as const;
export type JobApplicationStatusKey = (typeof JOB_APPLICATION_STATUS_KEYS)[number];

export const JOB_APPLICATION_STATUS_WORDS: Record<JobApplicationStatusAudience, Record<JobApplicationStatusKey, string>> = {
  employer: {
    pending: 'New',
    reviewing: 'Reviewing',
    interview: 'Interviewing',
    offered: 'Offer extended',
    hired: 'Hired',
    rejected: 'Not selected',
  },
  member: {
    pending: 'Applied',
    reviewing: 'Under review',
    interview: 'Interview stage',
    offered: 'Offer received',
    hired: 'Hired',
    rejected: 'Not selected',
  },
};

const KEYS: ReadonlySet<string> = new Set(JOB_APPLICATION_STATUS_KEYS);

/** `JobPostingApplication.status` → vocabulary key; anything else → null. */
export function jobApplicationStatusKey(status: string | null | undefined): JobApplicationStatusKey | null {
  return status != null && KEYS.has(status) ? (status as JobApplicationStatusKey) : null;
}

/**
 * The word for a job application status for the given audience. An unknown
 * value comes back as-is, which is what every surface did before (`?? status`).
 */
export function jobApplicationStatusLabel(status: string, audience: JobApplicationStatusAudience): string {
  const key = jobApplicationStatusKey(status);
  return key ? JOB_APPLICATION_STATUS_WORDS[audience][key] : status;
}
