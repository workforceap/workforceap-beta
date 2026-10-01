/**
 * Everything /api/apply/status-lookup does AFTER it has answered the visitor
 * (product call 28a). The route schedules this with `after()` so the HTTP
 * response is byte-identical and takes the same time whether or not an
 * application exists; nothing here can change what the visitor sees.
 *
 * Audit rows never carry the address the visitor typed. A matched request is
 * attributed to the application; an unmatched one is a bare counter row.
 */
import { auditLog } from '@/lib/audit';
import { captureApiError } from '@/lib/observability/captureApiError';
import { getOrganizationBranding } from '@/lib/tenant/organizationBranding';
import { sendApplicationStatusLinkEmail } from '@/lib/apply/statusLinkEmail';
import {
  APPLICATION_STATUS_LINK_TTL_MINUTES,
  buildApplicationStatusLinkUrl,
  issueApplicationStatusLinkToken,
} from '@/lib/apply/statusLinkToken';
import { findApplicationForStatusLookup } from '@/lib/apply/statusLookup';

const STATUS_LINK_REQUESTED_ACTION = 'application_status_link_requested';
export const STATUS_LINK_VIEWED_ACTION = 'application_status_viewed';
const STATUS_LOOKUP_TARGET_TYPE = 'ApplicationStatusLookup';

type StatusLinkRequestOutcome = {
  matched: boolean;
  emailSent: boolean;
};

export async function processStatusLinkRequest(rawEmail: string): Promise<StatusLinkRequestOutcome> {
  const match = await findApplicationForStatusLookup(rawEmail);
  if (!match) {
    await auditLog({
      actorUserId: null,
      action: STATUS_LINK_REQUESTED_ACTION,
      targetType: STATUS_LOOKUP_TARGET_TYPE,
      targetId: null,
      metadata: { matched: false },
    }).catch((err) => captureApiError(err, { route: 'apply/status-lookup/audit' }));
    return { matched: false, emailSent: false };
  }

  const token = issueApplicationStatusLinkToken({
    applicationId: match.applicationId,
    organizationId: match.organizationId,
    email: match.email,
  });
  const branding = await getOrganizationBranding(match.organizationId);
  const url = buildApplicationStatusLinkUrl(token, branding.domain);
  const sent = await sendApplicationStatusLinkEmail({
    to: match.email,
    fullName: match.fullName,
    url,
    expiresInMinutes: APPLICATION_STATUS_LINK_TTL_MINUTES,
    branding,
    userId: match.userId,
    applicationId: match.applicationId,
  });

  await auditLog({
    actorUserId: null,
    action: STATUS_LINK_REQUESTED_ACTION,
    targetType: 'Application',
    targetId: match.applicationId,
    metadata: {
      matched: true,
      orgId: match.organizationId,
      emailSent: sent.ok,
      ...(sent.skipped ? { emailSkipped: true } : {}),
      ...(sent.ok || !sent.error ? {} : { emailError: sent.error }),
      expiresInMinutes: APPLICATION_STATUS_LINK_TTL_MINUTES,
    },
  }).catch((err) => captureApiError(err, { route: 'apply/status-lookup/audit' }));

  return { matched: true, emailSent: sent.ok };
}
