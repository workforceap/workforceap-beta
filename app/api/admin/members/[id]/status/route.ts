import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { checkAuthRateLimit } from '@/lib/rate-limit';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { auditRequestMeta } from '@/lib/audit/log';
import { applicationReviewFailure } from '@/lib/admin/applicationReviewErrors';
import { changeApplicationStatus } from '@/lib/admin/applicationReview';
import { canReviewActorActOnApplication, resolveReviewActor } from '@/lib/counselor/applicationReviewAccess';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { DENIAL_REASON_REQUIRED_MESSAGE, isMissingDenialReason } from '@/lib/wioa/denialReason';

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

const statusSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'DENIED', 'NEEDS_INFO']),
  notes: z.string().max(2000).optional(),
});

export const PATCH = withApiGuc(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const ip = getClientIp(request);
    const { success: rateOk } = await checkAuthRateLimit(`admin:${ip}`);
    if (!rateOk) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Admins (org-scoped, as before) and active counselors may review.
    // Counselors are further limited below to members assigned to them.
    const actor = await resolveReviewActor(user.id);
    if (!actor) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const { status, notes } = parsed.data;
    // WAP-184 G-3: a denial needs a written reason. The shared core re-checks
    // against the stored notes; this rejects the obvious case before any lookup.
    if (isMissingDenialReason('application_decision', status, notes)) {
      return NextResponse.json({ error: DENIAL_REASON_REQUIRED_MESSAGE }, { status: 400 });
    }
    const orgId = await getActorOrganizationId(user.id);
    if (!(await canReviewActorActOnApplication(actor, id, orgId))) {
      // Same shape as the not-in-org case so the response never confirms
      // that an application outside the counselor's caseload exists.
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    const result = await changeApplicationStatus({
      applicationId: id,
      status,
      notes,
      orgId,
      actorUserId: user.id,
      actorRole: actor.role,
      requestMeta: auditRequestMeta(request),
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 404 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    const failure = applicationReviewFailure(error);
    if (failure.status !== 500) return NextResponse.json({ error: failure.error }, { status: failure.status });
    console.error('/admin/members/[id]/status error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
