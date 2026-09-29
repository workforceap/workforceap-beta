import { escapeHtml } from '@/lib/email/escapeHtml';
import { MISSION_HEADING, MISSION_STATEMENT } from '@/lib/marketing/mission';

export function partnerReferralInviteHtml(params: {
  inviterName: string;
  partnerName: string;
  personalMessage?: string | null;
}): string {
  const personalNote = params.personalMessage?.trim()
    ? `<p><strong>Personal note:</strong><br />${escapeHtml(params.personalMessage).replace(/\n/g, '<br />')}</p>`
    : '';

  return `
    <p>${escapeHtml(params.inviterName)} from ${escapeHtml(params.partnerName)} invited you to explore WorkforceAP.</p>
    <p>You can use their referral link to start your application, review training options, and keep your progress connected to the organization supporting you.</p>
    ${personalNote}
    <p data-mission><strong>${escapeHtml(MISSION_HEADING)}</strong><br />${escapeHtml(MISSION_STATEMENT)}</p>
    <p>Click the button below to begin. If you are not ready today, you can come back to the same link later.</p>
  `.trim();
}
