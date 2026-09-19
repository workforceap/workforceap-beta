import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor, isSuperAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { prisma } from '@/lib/db/prisma';
import { issuePlacementSurveyToken } from '@/lib/security/placementSurveyToken';
import {
  preparePlacementSurveyEmail,
  sendPreparedPlacementSurveyEmail,
} from '@/lib/email';
import { auditLog } from '@/lib/audit';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import {
  readPlacementSurveyDeliveryPayload,
  type PlacementSurveyDeliveryPayload,
} from '@/lib/placement-survey/deliveryPayload';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.workforceap.org';
const SURVEY_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000;

export const POST = withApiGuc(async (req: NextRequest) => {
  try {
    const user = await getUser();
    if (!user || (!(await isAdmin(user.id)) && !(await isCounselor(user.id)))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const superAdmin = await isSuperAdmin(user.id);
    const orgId = superAdmin ? null : await getActorOrganizationId(user.id);

    const body = (await req.json().catch(() => ({}))) ?? {};
    const { placementId } = body;
    if (!placementId) {
      return NextResponse.json({ error: 'Missing placementId' }, { status: 400 });
    }

    const placement = await prisma.$transaction((tx) => tx.placementRecord.findFirst({
      where: { id: placementId, ...(orgId ? { user: { organizationId: orgId } } : {}) },
      include: {
        user: {
          select: { id: true, email: true, fullName: true, enrolledProgram: true },
        },
        placementSurveys: {
          orderBy: { sentAt: 'desc' },
          take: 10,
        },
      },
    }));

    if (!placement) {
      return NextResponse.json({ error: 'Placement not found' }, { status: 404 });
    }

    // A provider-ambiguous attempt is the retry target even if an older
    // acceptance exists. Reuse its attempt number, token expiry, and complete
    // payload. Otherwise an intentional resend advances the persisted attempt
    // before egress so any later retry can recover the same provider key.
    const retryableSurvey = placement.placementSurveys.find(
      (candidate) => candidate.acceptedAttempt < candidate.deliveryAttempt,
    );
    const latestSurvey = retryableSurvey ?? placement.placementSurveys[0];
    const wave = latestSurvey?.wave ?? 'thirty_day';

    let survey: {
      id: string;
      tokenExpiresAt: Date;
      deliveryAttempt: number;
      deliveryPayload: unknown;
    };
    if (retryableSurvey) {
      survey = {
        id: retryableSurvey.id,
        tokenExpiresAt: retryableSurvey.tokenExpiresAt,
        deliveryAttempt: retryableSurvey.deliveryAttempt,
        deliveryPayload: retryableSurvey.deliveryPayload,
      };
    } else {
      if (!placement.user?.email) {
        return NextResponse.json({ error: 'Member has no email' }, { status: 400 });
      }
      const surveyId = latestSurvey?.id ?? randomUUID();
      const deliveryAttempt = latestSurvey ? latestSurvey.deliveryAttempt + 1 : 1;
      const tokenExpiresAt = new Date(Date.now() + SURVEY_TOKEN_TTL_MS);
      const token = await issuePlacementSurveyToken({ surveyId, expiresAt: tokenExpiresAt });
      const deliveryPayload = preparePlacementSurveyEmail({
        to: placement.user.email,
        fullName: placement.user.fullName ?? '',
        programName: placement.user.enrolledProgram,
        surveyUrl: `${SITE_URL}/survey/placement/${encodeURIComponent(token)}`,
        wave,
        idempotencyKey: `placement-survey/${surveyId}/${deliveryAttempt}`,
      });

      if (latestSurvey) {
        const updated = await prisma.$transaction((tx) => tx.placementSurvey.update({
          where: { id: surveyId },
          data: {
            deliveryAttempt,
            tokenExpiresAt,
            deliveryPayload,
          },
          select: { id: true, tokenExpiresAt: true, deliveryAttempt: true, deliveryPayload: true },
        }));
        survey = { ...updated, deliveryPayload };
      } else {
        // The row and exact provider payload land atomically before egress.
        const created = await prisma.$transaction((tx) => tx.placementSurvey.create({
          data: {
            id: surveyId,
            userId: placement.userId,
            placementId: placement.id,
            wave,
            sentAt: null,
            tokenExpiresAt,
            deliveryAttempt,
            acceptedAttempt: 0,
            deliveryPayload,
          },
          select: { id: true, tokenExpiresAt: true, deliveryAttempt: true, deliveryPayload: true },
        }));
        survey = { ...created, deliveryPayload };
      }
    }

    const surveyId = survey.id;
    const deliveryPayload = readPlacementSurveyDeliveryPayload(survey.deliveryPayload);
    if (!deliveryPayload) {
      return NextResponse.json(
        { error: 'Retryable survey is missing its frozen provider payload' },
        { status: 409 },
      );
    }

    const result = await sendPreparedPlacementSurveyEmail(deliveryPayload);

    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? 'Send failed' }, { status: 502 });
    }

    // Stamp exactly the accepted attempt. If this write fails, the persisted
    // attempt remains retryable with the same provider key and payload.
    await prisma.$transaction((tx) => tx.placementSurvey.update({
      where: { id: surveyId },
      data: {
        sentAt: new Date(),
        acceptedAttempt: survey.deliveryAttempt,
      },
    }));

    auditLog({
      actorUserId: user.id,
      action: 'admin_placement_survey_resend',
      targetType: 'PlacementRecord',
      targetId: placementId,
      metadata: { surveyId, wave, targetUserId: placement.userId },
    }).catch((err) => console.error('[audit] admin_placement_survey_resend:', err));

    return NextResponse.json({ success: true, surveyId, wave });
  } catch (error) {
    console.error('/admin/placement-surveys/resend error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
