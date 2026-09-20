import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { checkAuthRateLimit } from '@/lib/rate-limit';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { auditRequestMeta } from '@/lib/audit/log';
import { applicationReviewFailure } from '@/lib/admin/applicationReviewErrors';
import { captureApiError } from '@/lib/observability/captureApiError';
import { changeApplicationStatus, type ApplicationReviewResult } from '@/lib/admin/applicationReview';
import { canReviewActorActOnApplication, resolveReviewActor } from '@/lib/counselor/applicationReviewAccess';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { DENIAL_REASON_REQUIRED_MESSAGE, isMissingDenialReason } from '@/lib/wioa/denialReason';

// Same cap the existing member bulk-update route uses (app/api/admin/members/bulk-update).
const MAX_APPLICATIONS = 100;

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

const bodySchema = z.object({
  applicationIds: z.array(z.string().min(1)).min(1).max(MAX_APPLICATIONS),
  status: z.enum(['APPROVED', 'DENIED', 'NEEDS_INFO']),
  notes: z.string().max(2000).optional(),
  // Required, and must be true, when bulk-approving: a lightweight
  // caseworker attestation ("I reviewed intake for these applicants")
  // so a batch action can't silently multiply un-reviewed approvals. Not
  // required for DENIED/NEEDS_INFO — declining someone doesn't carry the
  // same funder-facing "we determined this person eligible" claim.
  verified: z.boolean().optional(),
});

/**
 * POST /api/admin/applications/bulk-review
 * Body: `{ applicationIds: string[], status, notes?, verified? }`
 *
 * Bulk sibling of `PATCH /api/admin/members/[id]/status` — same
 * `changeApplicationStatus` core, so audit logs, member_events, and the
 * approval/rejection emails behave identically whether an admin reviews
 * one application or fifty. Processes sequentially (not Promise.all) so
 * one failure can't race a DB transaction against another and so the
 * per-application audit trail stays in submission order.
 */
async function _POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const { success: rateOk } = await checkAuthRateLimit(`admin:${ip}`);
    if (!rateOk) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // Admins (org-scoped, as before) and active counselors may review;
    // counselors only for applications of members assigned to them.
    const actor = await resolveReviewActor(user.id);
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }
    const { applicationIds, status, notes, verified } = parsed.data;

    if (status === 'APPROVED' && verified !== true) {
      return NextResponse.json(
        { error: 'Confirm you reviewed intake for these applicants before bulk-approving.' },
        { status: 400 },
      );
    }
    // WAP-184 G-3: one written reason covers the batch, but it must exist.
    if (isMissingDenialReason('application_decision', status, notes)) {
      return NextResponse.json({ error: DENIAL_REASON_REQUIRED_MESSAGE }, { status: 400 });
    }

    const orgId = await getActorOrganizationId(user.id);
    const requestMeta = auditRequestMeta(request);

    const results: ApplicationReviewResult[] = [];
    for (const applicationId of applicationIds) {
      try {
        if (!(await canReviewActorActOnApplication(actor, applicationId, orgId))) {
          // Preserve the same not-found response for members outside the caseload.
          results.push({ ok: false, applicationId, error: 'Application not found' });
          continue;
        }
        const result = await changeApplicationStatus({
          applicationId,
          status,
          notes,
          orgId,
          actorUserId: user.id,
          actorRole: actor.role,
          requestMeta,
        });
        results.push(result);
      } catch (error) {
        const failure = applicationReviewFailure(error);
        if (failure.status === 500) captureApiError(error, { route: '/api/admin/applications/bulk-review' });
        results.push({ ok: false, applicationId, error: failure.error, status: failure.status });
      }
    }

    const approvedCount = results.filter((r) => r.ok).length;
    const failed = results.filter((r): r is Extract<ApplicationReviewResult, { ok: false }> => !r.ok);

    return NextResponse.json({
      success: failed.length === 0,
      processedCount: approvedCount,
      processedApplicationIds: results.filter((result) => result.ok).map((result) => result.applicationId),
      failedCount: failed.length,
      failures: failed,
    });
  } catch (error) {
    console.error('/admin/applications/bulk-review error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withApiGuc(_POST);
