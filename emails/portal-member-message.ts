/**
 * Portal member→staff message notification email body HTML.
 *
 * Sent when a member posts in Messages so the counselor of record (or the
 * unassigned staff pool) learns about it at their account email, not only
 * via the in-app bell.
 */

import { escapeHtml } from '@/lib/email/escapeHtml';
import { DEFAULT_BRAND_ACCENT } from '@/lib/platform/brandColors';
import type { OrganizationBranding } from '@/lib/tenant/organizationBranding';

export function portalMemberMessageHtml(params: {
  firstName: string;
  memberName: string;
  bodyPreview: string;
  threadUrl: string;
  branding?: OrganizationBranding;
}): string {
  const first = escapeHtml(params.firstName);
  const name = escapeHtml(params.memberName);
  const preview = escapeHtml(params.bodyPreview);
  const url = escapeHtml(params.threadUrl);
  const accent = escapeHtml(params.branding?.primaryColor ?? DEFAULT_BRAND_ACCENT);
  return `
    <p style="margin: 0 0 1rem; line-height: 1.6;">Hi ${first},</p>
    <p style="margin: 0 0 1rem; line-height: 1.6;">
      <strong>${name}</strong> sent you a message in the member portal:
    </p>
    <p style="margin: 0 0 1rem; padding: 0.75rem 1rem; background: #f5f5f5; border-radius: 6px; line-height: 1.6; color: #333;">
      ${preview}
    </p>
    <p style="margin: 0; line-height: 1.6;">
      <a href="${url}" style="color: ${accent}; font-weight: 600;">Open Messages</a> to read and reply.
    </p>
  `;
}
