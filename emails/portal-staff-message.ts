/**
 * Portal staff→member message notification email body HTML.
 *
 * Sent when a counselor or admin posts in the member's Messages thread so the
 * member learns about the reply at their account email, not only in the portal.
 */

import { escapeHtml } from '@/lib/email/escapeHtml';
import { DEFAULT_BRAND_ACCENT } from '@/lib/platform/brandColors';
import type { OrganizationBranding } from '@/lib/tenant/organizationBranding';

export function portalStaffMessageHtml(params: {
  firstName: string;
  staffName: string;
  bodyPreview: string;
  messagesUrl: string;
  branding?: OrganizationBranding;
}): string {
  const first = escapeHtml(params.firstName);
  const name = escapeHtml(params.staffName);
  const preview = escapeHtml(params.bodyPreview);
  const url = escapeHtml(params.messagesUrl);
  const accent = escapeHtml(params.branding?.primaryColor ?? DEFAULT_BRAND_ACCENT);
  return `
    <p style="margin: 0 0 1rem; line-height: 1.6;">Hi ${first},</p>
    <p style="margin: 0 0 1rem; line-height: 1.6;">
      <strong>${name}</strong> sent you a message in your member portal:
    </p>
    <p style="margin: 0 0 1rem; padding: 0.75rem 1rem; background: #f5f5f5; border-radius: 6px; line-height: 1.6; color: #333;">
      ${preview}
    </p>
    <p style="margin: 0; line-height: 1.6;">
      <a href="${url}" style="color: ${accent}; font-weight: 600;">Open Messages</a> to read and reply.
    </p>
  `;
}
