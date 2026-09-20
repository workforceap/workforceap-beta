/**
 * Weekly staff digest of aging applications (WAP-167).
 *
 * Counts pending applications by age bucket, lists the oldest first with a
 * link to each member, and separates applications whose member already has a
 * course enrollment (the state that made the real backlog invisible: 36
 * enrolled members still showed PENDING on 2026-09-18). Staff-facing; the
 * only member data here is name/email plus how long they have waited.
 */

import { escapeHtml } from '@/lib/email/escapeHtml';

export type ApplicantAgingBucket = { key: string; label: string; count: number };

export type ApplicantAgingNamedRow = {
  memberId: string;
  fullName: string | null;
  email: string | null;
  daysWaiting: number;
  status: string;
  alreadyEnrolled: boolean;
};

export interface ApplicantAgingDigestParams {
  total: number;
  buckets: ApplicantAgingBucket[];
  oldest: ApplicantAgingNamedRow[];
  enrolledButPending: number;
  queueLink: string;
  memberAdminBaseUrl: string;
}

function n(v: number): string {
  return escapeHtml(String(Math.max(0, Math.floor(Number(v) || 0))));
}

function oldestList(rows: ApplicantAgingNamedRow[], adminBaseUrl: string): string {
  if (rows.length === 0) {
    return '<p style="margin:0;font-size:0.85rem;color:#584144;">None.</p>';
  }
  const items = rows
    .map((row) => {
      const label = escapeHtml(row.fullName?.trim() || row.email || 'Unknown member');
      const url = `${adminBaseUrl}/${encodeURIComponent(row.memberId)}`;
      const flag = row.alreadyEnrolled ? ' <span style="color:#2b7bb9;">(already enrolled)</span>' : '';
      const status = row.status === 'NEEDS_INFO' ? ' · needs info' : '';
      return `<li style="margin-bottom:0.35rem;"><a href="${escapeHtml(url)}" style="color:#ad2c4d;text-decoration:none;font-weight:600;">${label}</a> — ${n(row.daysWaiting)} day${row.daysWaiting === 1 ? '' : 's'} waiting${escapeHtml(status)}${flag}</li>`;
    })
    .join('');
  return `<ol style="margin:0;padding-left:1.25rem;font-size:0.85rem;color:#584144;">${items}</ol>`;
}

export function applicantAgingDigestHtml(params: ApplicantAgingDigestParams): string {
  const bucketRows = params.buckets
    .map(
      (bucket) => `
      <tr>
        <td style="padding:0.75rem;border:1px solid #e5e5e5;font-weight:600;">${escapeHtml(bucket.label)}</td>
        <td style="padding:0.75rem;border:1px solid #e5e5e5;font-size:1.25rem;font-weight:700;text-align:center;">${n(bucket.count)}</td>
      </tr>`,
    )
    .join('');

  return `
    <p>${n(params.total)} application${params.total === 1 ? ' is' : 's are'} waiting for a counselor. Here is the queue by age, oldest first.</p>
    <table style="width:100%;border-collapse:collapse;margin:1rem 0;">
      ${bucketRows}
    </table>
    ${params.enrolledButPending > 0
      ? `<p style="font-size:0.9rem;color:#584144;">${n(params.enrolledButPending)} of these applicants ${params.enrolledButPending === 1 ? 'has' : 'have'} already enrolled in a program but the application still reads pending. Close or approve those first so the queue shows the people actually waiting.</p>`
      : ''}
    <div style="margin-bottom:1rem;border:1px solid #e5e5e5;border-radius:12px;overflow:hidden;">
      <div style="padding:0.75rem 1rem;background:#f8f5f3;border-bottom:1px solid #e5e5e5;">
        <strong>Waiting longest</strong>
      </div>
      <div style="padding:0.75rem 1rem;">
        ${oldestList(params.oldest, params.memberAdminBaseUrl)}
        <p style="margin:0.75rem 0 0;"><a href="${escapeHtml(params.queueLink)}" style="display:inline-block;padding:0.5rem 0.75rem;background:#231f20;color:#fff;text-decoration:none;border-radius:6px;font-size:0.85rem;">Open the review queue</a></p>
      </div>
    </div>
    <p style="font-size:0.85rem;color:#584144;">Applicants receive automated status emails at day 3, day 10 and day 20; after that only a human review moves them.</p>
  `.trim();
}
