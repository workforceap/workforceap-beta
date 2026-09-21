/**
 * Weekly onboarding-stall digest email body HTML — staff-facing.
 * Modeled on emails/at-risk-digest.ts.
 */

import { escapeHtml } from '@/lib/email/escapeHtml';
import { WIOA_QUEUE_AGE_ALERT_DAYS } from '@/lib/wioa/wioaQueueAge';

type NamedMember = { id: string; fullName: string | null; email: string | null };

function n(v: number): string {
  return escapeHtml(String(Math.max(0, Math.floor(Number(v) || 0))));
}

function memberList(members: NamedMember[], adminBaseUrl: string): string {
  if (members.length === 0) {
    return '<p style="margin:0;font-size:0.85rem;color:#584144;">None.</p>';
  }
  const rows = members
    .map((m) => {
      const label = escapeHtml(m.fullName?.trim() || m.email || 'Unknown member');
      const url = `${adminBaseUrl}/${encodeURIComponent(m.id)}`;
      return `<li style="margin-bottom:0.35rem;"><a href="${escapeHtml(url)}" style="color:#ad2c4d;text-decoration:none;font-weight:600;">${label}</a></li>`;
    })
    .join('');
  return `<ul style="margin:0;padding-left:1.1rem;font-size:0.85rem;color:#584144;">${rows}</ul>`;
}

/**
 * "Oldest pending WIOA screening: N days" — the queue-age line WAP-166 asks
 * for. Red once the wait passes WIOA_QUEUE_AGE_ALERT_DAYS. Empty when no
 * screening is waiting (so the section reads the same as before).
 */
export function oldestPendingLine(days: number | null | undefined): string {
  if (days === null || days === undefined || !Number.isFinite(days)) return '';
  const overdue = days >= WIOA_QUEUE_AGE_ALERT_DAYS;
  const color = overdue ? '#dc2626' : '#584144';
  const suffix = overdue ? ` — over the ${n(WIOA_QUEUE_AGE_ALERT_DAYS)}-day threshold` : '';
  return `<p style="margin:0 0 0.75rem;font-size:0.9rem;color:${color};font-weight:${overdue ? 700 : 600};">Oldest pending WIOA screening: ${n(days)} day${days === 1 ? '' : 's'}${suffix}</p>`;
}

export function onboardingStallsDigestHtml(params: {
  interviewCount: number;
  wioaCount: number;
  noProgramCount: number;
  interviewMembers: NamedMember[];
  wioaMembers: NamedMember[];
  noProgramMembers: NamedMember[];
  /** WAP-166 item 2: whole days the oldest pending/in_review screening has waited; null when none. */
  wioaOldestPendingDays?: number | null;
  interviewQueueLink: string;
  wioaQueueLink: string;
  membersQueueLink: string;
  memberAdminBaseUrl: string;
}): string {
  const {
    interviewCount,
    wioaCount,
    noProgramCount,
    interviewMembers,
    wioaMembers,
    noProgramMembers,
    wioaOldestPendingDays = null,
    interviewQueueLink,
    wioaQueueLink,
    membersQueueLink,
    memberAdminBaseUrl,
  } = params;

  const summaryTable = `
    <table style="width:100%;border-collapse:collapse;margin:1rem 0;">
      <tr>
        <td style="padding:0.75rem;border:1px solid #e5e5e5;font-weight:600;">Interview requested, not completed (5+ days)</td>
        <td style="padding:0.75rem;border:1px solid #e5e5e5;font-size:1.25rem;font-weight:700;text-align:center;color:#d97706;">${n(interviewCount)}</td>
      </tr>
      <tr>
        <td style="padding:0.75rem;border:1px solid #e5e5e5;font-weight:600;">WIOA screening pending review (5+ days)</td>
        <td style="padding:0.75rem;border:1px solid #e5e5e5;font-size:1.25rem;font-weight:700;text-align:center;color:#2b7bb9;">${n(wioaCount)}</td>
      </tr>
      <tr>
        <td style="padding:0.75rem;border:1px solid #e5e5e5;font-weight:600;">No program + no counselor (account 7+ days old)</td>
        <td style="padding:0.75rem;border:1px solid #e5e5e5;font-size:1.25rem;font-weight:700;text-align:center;color:#dc2626;">${n(noProgramCount)}</td>
      </tr>
    </table>
  `;

  return `
    <p>Here is this week's onboarding-stall summary — members stuck between applying and starting training with nobody automatically pinged:</p>
    ${summaryTable}
    <div style="margin-bottom:1.5rem;border:1px solid #e5e5e5;border-radius:12px;overflow:hidden;">
      <div style="padding:0.75rem 1rem;background:#f8f5f3;border-bottom:1px solid #e5e5e5;">
        <strong>Interview requested, awaiting completion</strong>
      </div>
      <div style="padding:0.75rem 1rem;">
        ${memberList(interviewMembers, memberAdminBaseUrl)}
        <p style="margin:0.75rem 0 0;"><a href="${escapeHtml(interviewQueueLink)}" style="display:inline-block;padding:0.5rem 0.75rem;background:#231f20;color:#fff;text-decoration:none;border-radius:6px;font-size:0.85rem;">Open interview-ready queue</a></p>
      </div>
    </div>
    <div style="margin-bottom:1.5rem;border:1px solid #e5e5e5;border-radius:12px;overflow:hidden;">
      <div style="padding:0.75rem 1rem;background:#f8f5f3;border-bottom:1px solid #e5e5e5;">
        <strong>WIOA screening pending review</strong>
      </div>
      <div style="padding:0.75rem 1rem;">
        ${oldestPendingLine(wioaOldestPendingDays)}
        ${memberList(wioaMembers, memberAdminBaseUrl)}
        <p style="margin:0.75rem 0 0;"><a href="${escapeHtml(wioaQueueLink)}" style="display:inline-block;padding:0.5rem 0.75rem;background:#231f20;color:#fff;text-decoration:none;border-radius:6px;font-size:0.85rem;">Open WIOA screening queue</a></p>
      </div>
    </div>
    <div style="margin-bottom:1rem;border:1px solid #e5e5e5;border-radius:12px;overflow:hidden;">
      <div style="padding:0.75rem 1rem;background:#f8f5f3;border-bottom:1px solid #e5e5e5;">
        <strong>No program selected, no active counselor</strong>
      </div>
      <div style="padding:0.75rem 1rem;">
        ${memberList(noProgramMembers, memberAdminBaseUrl)}
        <p style="margin:0.75rem 0 0;"><a href="${escapeHtml(membersQueueLink)}" style="display:inline-block;padding:0.5rem 0.75rem;background:#231f20;color:#fff;text-decoration:none;border-radius:6px;font-size:0.85rem;">Open members list</a></p>
      </div>
    </div>
  `.trim();
}
