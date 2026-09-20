import { after, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { interactiveTransactionsGuaranteed } from '@/lib/db/transactionPolicy';
import { saveEligibilityScreening } from '@/lib/apply/saveEligibilityScreening';
import { lockEligibilityMember, saveEligibilityForm, eligibilityWriteFailure, type EligibilityFormMeta } from '@/lib/wioa/eligibilityForm';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import { normalizeHearAbout, normalizeYesNo } from '@/lib/apply/eligibilityExtendedFields';
import {
  normalizePublicAssistanceFollowUp,
  publicAssistanceFollowUpIssue,
  publicAssistanceFollowUpSchema,
} from '@/lib/apply/publicAssistance';
import {
  sendEligibilityScreeningAdminEmail,
  sendEligibilityScreeningConfirmationEmail,
} from '@/lib/email';
import { captureApiError } from '@/lib/observability/captureApiError';
import { logger } from '@/lib/observability/logger';
import { autoAssignAmbassadorFromReferral } from '@/lib/counselor/ambassadorAutoAssign';
/**
 * Member-owned eligibility questionnaire (§9). Reuses the `app/api/member/profile`
 * pattern: city/state/zip + barrierTypes write to Profile columns (which exist).
 *
 * ageGroup + county + WS4 extended answers have NO dedicated Profile columns, so
 * they are persisted alongside the member's existing WIOA metadata on
 * `User.wioaQualificationJson` under an `eligibilityForm` key. When q1+q2 are
 * present we also upsert `ApplyEligibilityScreening` for ops parity with apply.
 */
const AGE_GROUP_VALUES = ['18_24', '25_50', '50_plus'] as const;

const eligibilitySchema = z.object({
  ageGroup: z.enum(AGE_GROUP_VALUES).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  state: z.string().trim().max(50).optional().nullable(),
  zip: z.string().trim().max(20).optional().nullable(),
  county: z.string().trim().max(100).optional().nullable(),
  primaryBarriers: z.array(z.string().trim().max(100)).max(20).optional().nullable(),
  q1: z.enum(['yes', 'no']).optional().nullable(),
  q2: z.enum(['yes', 'no']).optional().nullable(),
  q3: z.enum(['yes', 'no']).optional().nullable(),
  receivingUnemployment: z.enum(['yes', 'no']).optional().nullable(),
  exhaustedUnemployment: z.enum(['yes', 'no']).optional().nullable(),
  layoffCompany: z.string().trim().max(200).optional().nullable(),
  snapWic: z.enum(['yes', 'no']).optional().nullable(),
  // WAP-53 follow-ups after snapWic = yes; optional so older clients still parse.
  ...publicAssistanceFollowUpSchema,
  hearAbout: z.string().trim().max(200).optional().nullable(),
  hearAboutOther: z.string().trim().max(200).optional().nullable(),
  partnerAmbassadorReferral: z.string().trim().max(200).optional().nullable(),
});

async function _GET() {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const dbUser = await prisma.$transaction((tx) => tx.user.findUnique({
      where: { id: user.id },
      select: {
        fullName: true,
        email: true,
        wioaQualificationJson: true,
        profile: { select: { city: true, state: true, zip: true, barrierTypes: true } },
        applyEligibilityScreenings: {
          take: 1,
          select: {
            q1: true,
            q2: true,
            q3: true,
            receivingUnemployment: true,
            exhaustedUnemployment: true,
            layoffCompany: true,
            snapWic: true,
            publicAssistancePrograms: true,
            publicAssistanceHelpRequested: true,
            hearAbout: true,
            hearAboutOther: true,
            partnerAmbassadorReferral: true,
          },
        },
      },
    }));
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const snapshot = (dbUser.wioaQualificationJson ?? null) as Record<string, unknown> | null;
    const meta =
      snapshot && typeof snapshot.eligibilityForm === 'object' && snapshot.eligibilityForm !== null
        ? (snapshot.eligibilityForm as Partial<EligibilityFormMeta>)
        : null;
    const screening = dbUser.applyEligibilityScreenings[0] ?? null;

    return NextResponse.json({
      fullName: dbUser.fullName,
      email: dbUser.email,
      ageGroup: meta?.ageGroup ?? null,
      county: meta?.county ?? null,
      city: dbUser.profile?.city ?? null,
      state: dbUser.profile?.state ?? null,
      zip: dbUser.profile?.zip ?? null,
      primaryBarriers: dbUser.profile?.barrierTypes ?? [],
      q1: meta?.q1 ?? screening?.q1 ?? null,
      q2: meta?.q2 ?? screening?.q2 ?? null,
      q3: meta?.q3 ?? screening?.q3 ?? null,
      receivingUnemployment: meta?.receivingUnemployment ?? screening?.receivingUnemployment ?? null,
      exhaustedUnemployment: meta?.exhaustedUnemployment ?? screening?.exhaustedUnemployment ?? null,
      layoffCompany: meta?.layoffCompany ?? screening?.layoffCompany ?? null,
      snapWic: meta?.snapWic ?? screening?.snapWic ?? null,
      publicAssistancePrograms: meta?.publicAssistancePrograms ?? screening?.publicAssistancePrograms ?? [],
      publicAssistanceHelpRequested:
        meta?.publicAssistanceHelpRequested ?? screening?.publicAssistanceHelpRequested ?? null,
      hearAbout: meta?.hearAbout ?? screening?.hearAbout ?? null,
      hearAboutOther: meta?.hearAboutOther ?? screening?.hearAboutOther ?? null,
      partnerAmbassadorReferral:
        meta?.partnerAmbassadorReferral ?? screening?.partnerAmbassadorReferral ?? null,
    });
  } catch (error) {
    console.error('/member/eligibility error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const GET = withApiGuc(_GET);

async function _PATCH(request: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = eligibilitySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'Validation failed' },
        { status: 400 }
      );
    }

    const {
      ageGroup,
      city,
      state,
      zip,
      county,
      primaryBarriers,
      q1,
      q2,
      q3,
      receivingUnemployment,
      exhaustedUnemployment,
      layoffCompany,
      snapWic,
      publicAssistancePrograms,
      publicAssistanceHelpRequested,
      hearAbout,
      hearAboutOther,
      partnerAmbassadorReferral,
    } = parsed.data;
    const followUpIssue = publicAssistanceFollowUpIssue({ snapWic, publicAssistancePrograms });
    if (followUpIssue) return NextResponse.json({ error: followUpIssue }, { status: 400 });
    const barrierTypes = (primaryBarriers ?? [])
      .map((b) => b.trim())
      .filter((b) => b && b !== 'none');
    const extended = {
      q1: normalizeYesNo(q1),
      q2: normalizeYesNo(q2),
      q3: normalizeYesNo(q3),
      receivingUnemployment: normalizeYesNo(receivingUnemployment),
      exhaustedUnemployment: normalizeYesNo(exhaustedUnemployment),
      layoffCompany: layoffCompany?.trim() ? layoffCompany.trim().slice(0, 200) : null,
      snapWic: normalizeYesNo(snapWic),
      ...normalizePublicAssistanceFollowUp({ snapWic, publicAssistancePrograms, publicAssistanceHelpRequested }),
      hearAbout: normalizeHearAbout(hearAbout),
      hearAboutOther: normalizeHearAbout(hearAboutOther),
      partnerAmbassadorReferral: partnerAmbassadorReferral?.trim()
        ? partnerAmbassadorReferral.trim().slice(0, 200)
        : null,
    };

    if (!interactiveTransactionsGuaranteed()) {
      return NextResponse.json({ error: 'Screening storage is temporarily unavailable. Try again later.' }, { status: 503 });
    }
    const notifyMeta = await prisma.$transaction(async (tx) => {
      const current = await lockEligibilityMember(tx, user.id);
      // city/state/zip + barrierTypes → Profile (existing columns), mirrors
      // app/api/member/profile + the apply signup flow.
      const profileData: Record<string, unknown> = {};
      if (city !== undefined) profileData.city = city?.trim() || null;
      if (state !== undefined) profileData.state = state?.trim() || null;
      if (zip !== undefined) profileData.zip = zip?.trim() || null;
      if (primaryBarriers !== undefined) {
        profileData.barrierTypes = barrierTypes;
        profileData.hasEmploymentBarrier = barrierTypes.length > 0;
      }

      await tx.profile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, ...profileData },
        update: profileData,
      });

      // ageGroup + county + WS4 answers → User.wioaQualificationJson.
      const meta: EligibilityFormMeta = {
        version: 1,
        updatedAt: new Date().toISOString(),
        ageGroup: ageGroup ?? null,
        county: county?.trim() || null,
        ...extended,
      };
      await saveEligibilityForm(tx, {
        userId: user.id, organizationId: current.organizationId,
        previous: current.wioaQualificationJson, form: meta,
      });

      if (extended.q1 && extended.q2 && current?.organizationId) {
        const yesCount = [extended.q1, extended.q2, extended.q3].filter((v) => v === 'yes').length;
        await saveEligibilityScreening(tx, {
          userId: user.id, organizationId: current.organizationId,
          answers: extended, qualifies: yesCount >= 1, yesCount,
        });
      }

      return {
        fullName: current?.fullName ?? null,
        email: current?.email ?? user.email ?? null,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    auditLog({ actorUserId: user.id, action: 'member.eligibility.update', targetType: 'EligibilityForm', targetId: user.id }).catch(() => {});
    logAuditEvent({ user: { id: user.id, role: 'member' }, verb: 'update', object: { type: 'EligibilityForm', id: user.id }, result: { success: true } }).catch(() => {});

    // Post-save notifications via next/server `after()` so Vercel keeps the
    // invocation alive until Resend finishes. Bare fire-and-forget promises
    // are often frozen when the JSON response returns. Failures must not roll
    // back the saved answers.
    const eligibilityEmailFields = { ...extended };
    if (notifyMeta.email) {
      const displayName = (notifyMeta.fullName ?? '').trim() || notifyMeta.email;
      after(() =>
        sendEligibilityScreeningConfirmationEmail({
          to: notifyMeta.email!,
          fullName: displayName,
          eligibility: eligibilityEmailFields,
        }).catch((err) => {
          logger.error('Eligibility screening confirmation email failed', { err });
          captureApiError(err, {
            route: 'PATCH /api/member/eligibility#confirmation',
            extra: { userId: user.id },
          });
        })
      );
      after(() =>
        sendEligibilityScreeningAdminEmail({
          memberName: displayName,
          memberEmail: notifyMeta.email!,
          memberId: user.id,
          source: 'dashboard',
          eligibility: eligibilityEmailFields,
        }).catch((err) => {
          logger.error('Eligibility screening admin alert failed', { err });
          captureApiError(err, {
            route: 'PATCH /api/member/eligibility#adminAlert',
            extra: { userId: user.id },
          });
        })
      );
    }

    // Community Ambassador auto-assignment (9/3/26): a member who names their
    // ambassador on the dashboard questionnaire lands on that caseload too.
    after(() =>
      autoAssignAmbassadorFromReferral({
        memberId: user.id,
        source: 'member_eligibility',
        hearAbout: extended.hearAbout,
        hearAboutOther: extended.hearAboutOther,
        partnerAmbassadorReferral: extended.partnerAmbassadorReferral,
      }).catch((err) => {
        logger.warn('member/eligibility: ambassador auto-assign failed', { userId: user.id, err });
      }),
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    const failure = eligibilityWriteFailure(error);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });
    console.error('/member/eligibility error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const PATCH = withApiGuc(_PATCH);
