/**
 * Counselor at-risk alert email templates.
 *
 * - counselorAtRiskAlertHtml: single-member alert (legacy / one-off use)
 * - counselorAtRiskBatchHtml: daily batch digest for a counselor's at-risk roster
 */

import { escapeHtml } from '@/lib/email/escapeHtml';

function n(v: number): string {
  return escapeHtml(String(Math.max(0, Math.floor(Number(v) || 0))));
}

function levelColor(level: string): string {
  if (level === 'CRITICAL') return '#dc2626';
  if (level === 'HIGH') return '#d97706';
  if (level === 'MEDIUM') return '#2b7bb9';
  return '#4a9b4f';
}

export function counselorAtRiskAlertHtml(params: {
  memberName: string;
  memberEmail: string;
  score: number;
  level: string;
  factors: string[];
  recommendedAction: string;
  messageUrl: string;
  profileUrl: string;
  dashboardUrl: string;
}): string {
  const { memberName, memberEmail, score, level, factors, recommendedAction, messageUrl, profileUrl, dashboardUrl } = params;

  const factorsList = factors.length
    ? `<ul style="margin:0.25rem 0 0;padding-left:1.25rem;font-size:0.85rem;color:#584144;">${factors
        .map((f) => `<li>${escapeHtml(f)}</li>`)
        .join('')}</ul>`
    : '<p style="margin:0.25rem 0 0;font-size:0.85rem;color:#584144;">No specific factors flagged.</p>';

  return `
    <p><strong>${escapeHtml(memberName)}</strong> has been flagged as <strong style="color:${levelColor(level)};">${escapeHtml(level)} risk</strong> (score ${n(score)}).</p>
    <table style="width:100%;border-collapse:collapse;margin:1rem 0;">
      <tr>
        <td style="padding:0.75rem;border:1px solid #e5e5e5;font-weight:600;">Member</td>
        <td style="padding:0.75rem;border:1px solid #e5e5e5;">${escapeHtml(memberName)}</td>
      </tr>
      <tr>
        <td style="padding:0.75rem;border:1px solid #e5e5e5;font-weight:600;">Email</td>
        <td style="padding:0.75rem;border:1px solid #e5e5e5;">${escapeHtml(memberEmail)}</td>
      </tr>
      <tr>
        <td style="padding:0.75rem;border:1px solid #e5e5e5;font-weight:600;">Risk level</td>
        <td style="padding:0.75rem;border:1px solid #e5e5e5;font-weight:700;color:${levelColor(level)};">${escapeHtml(level)} — ${n(score)}</td>
      </tr>
      <tr>
        <td style="padding:0.75rem;border:1px solid #e5e5e5;font-weight:600;">Recommended action</td>
        <td style="padding:0.75rem;border:1px solid #e5e5e5;">${escapeHtml(recommendedAction)}</td>
      </tr>
    </table>
    <p style="margin:0 0 0.5rem;font-weight:600;">Risk factors:</p>
    ${factorsList}
    <p style="margin-top:1.5rem;display:flex;gap:0.75rem;flex-wrap:wrap;">
      <a href="${escapeHtml(messageUrl)}" style="display:inline-block;padding:0.6rem 1rem;background:#231f20;color:#fff;text-decoration:none;border-radius:6px;font-size:0.9rem;font-weight:600;">Message member</a>
      <a href="${escapeHtml(profileUrl)}" style="display:inline-block;padding:0.6rem 1rem;background:#f8f5f3;color:#231f20;text-decoration:none;border-radius:6px;font-size:0.9rem;font-weight:600;border:1px solid #e5e5e5;">View profile</a>
      <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:0.6rem 1rem;background:#f8f5f3;color:#231f20;text-decoration:none;border-radius:6px;font-size:0.9rem;font-weight:600;border:1px solid #e5e5e5;">Open at-risk dashboard</a>
    </p>
    <p style="margin-top:1rem;font-size:0.8rem;color:#8a7d7f;">Please acknowledge this alert in the counselor portal within 48 hours. If not acknowledged, it will be escalated to the admin team.</p>
  `.trim();
}

export function counselorAtRiskBatchHtml(params: {
  counselorName: string;
  memberCount: number;
  members: {
    memberName: string;
    memberEmail: string;
    score: number;
    level: string;
    factors: string[];
    recommendedAction: string;
    profileUrl: string;
  }[];
  dashboardUrl: string;
}): string {
  const { counselorName, memberCount, members, dashboardUrl } = params;

  const subjectLine =
    memberCount === 1
      ? '1 member needs attention today'
      : `${memberCount} members need attention today`;

  const memberCards = members
    .map((m) => {
      const lc = levelColor(m.level);
      const factorsList = m.factors.length
        ? `<ul style="margin:0.25rem 0 0;padding-left:1.25rem;font-size:0.85rem;color:#584144;">${m.factors
            .map((f) => `<li>${escapeHtml(f)}</li>`)
            .join('')}</ul>`
        : '<p style="margin:0.25rem 0 0;font-size:0.85rem;color:#584144;">No specific factors flagged.</p>';

      return `
        <div style="margin-bottom:1.25rem;border:1px solid #e5e5e5;border-radius:12px;overflow:hidden;">
          <div style="padding:0.75rem 1rem;background:#f8f5f3;border-bottom:1px solid #e5e5e5;display:flex;justify-content:space-between;align-items:center;">
            <strong>${escapeHtml(m.memberName)}</strong>
            <span style="font-size:0.85rem;font-weight:700;color:${lc};">
              ${escapeHtml(m.level)} — ${n(m.score)}
            </span>
          </div>
          <div style="padding:0.75rem 1rem;">
            <p style="margin:0 0 0.25rem;font-size:0.85rem;color:#584144;"><strong>Email:</strong> ${escapeHtml(m.memberEmail)}</p>
            <p style="margin:0 0 0.25rem;font-size:0.85rem;color:#584144;"><strong>Recommended action:</strong> ${escapeHtml(m.recommendedAction)}</p>
            <p style="margin:0 0 0.25rem;font-size:0.85rem;color:#584144;"><strong>Factors:</strong></p>
            ${factorsList}
            <p style="margin:0.5rem 0 0;">
              <a href="${escapeHtml(m.profileUrl)}" style="display:inline-block;padding:0.5rem 0.75rem;background:#231f20;color:#fff;text-decoration:none;border-radius:6px;font-size:0.85rem;">View profile</a>
            </p>
          </div>
        </div>
      `;
    })
    .join('');

  return `
    <p>Hi ${escapeHtml(counselorName)},</p>
    <p><strong>${escapeHtml(subjectLine)}</strong> — ${memberCount === 1 ? 'this member has' : 'these members have'} been flagged as critical at-risk (score ≥ 70) and need outreach today:</p>
    ${memberCards}
    ${memberCount > members.length ? `<p>${memberCount - members.length} additional member${memberCount - members.length === 1 ? '' : 's'} need attention. Open the at-risk dashboard for the full list.</p>` : ''}
    <p style="margin-top:1.5rem;">
      <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:0.75rem 1.25rem;background:#231f20;color:#fff;text-decoration:none;border-radius:6px;font-size:0.95rem;font-weight:600;">Open at-risk dashboard</a>
    </p>
    <p style="margin-top:1rem;font-size:0.8rem;color:#8a7d7f;">Please acknowledge these alerts in the counselor portal within 48 hours. Unacknowledged alerts will be escalated to the admin team.</p>
  `.trim();
}
