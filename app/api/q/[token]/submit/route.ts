import { after, NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { interactiveTransactionsGuaranteed } from '@/lib/db/transactionPolicy';
import { saveEligibilityScreening } from '@/lib/apply/saveEligibilityScreening';
import { lockEligibilityMember, saveEligibilityForm, eligibilityWriteFailure, type EligibilityFormMeta } from '@/lib/wioa/eligibilityForm';
import { prisma } from '@/lib/db/prisma';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import {
  validateTokenizedLink,
  consumeTokenizedLink,
} from '@/lib/tokenizedLink';
import { checkPublicQuestionnaireSubmitRateLimit } from '@/lib/rate-limit';
import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';
import { normalizeHearAbout, normalizeYesNo } from '@/lib/apply/eligibilityExtendedFields';
import {
  sendEligibilityScreeningAdminEmail,
  sendEligibilityScreeningConfirmationEmail,
} from '@/lib/email';
import { captureApiError } from '@/lib/observability/captureApiError';
import { logger } from '@/lib/observability/logger';
import { autoAssignAmbassadorFromReferral } from '@/lib/counselor/ambassadorAutoAssign';
import { hasEligibilityScreeningFields } from '@/lib/apply/eligibilityScreeningFields';

/**
 * POST /api/q/[token]/submit
 *
 * PUBLIC (no-account) submit for the tokenized eligibility questionnaire.
 *
 * Security:
 *  - NO auth. The single-use token is the only credential. It is validated
 *    server-side AND atomically consumed in the same transaction as the
 *    answers, so a failed write rolls back consumption and concurrent submits
 *    cannot both persist.
 *  - Per-IP rate limited (5/min) to cap abuse on the public path.
 *  - Expiry is enforced by validateTokenizedLink.
 *  - A bound link only ever writes its own subjectUserId — no cross-member
 *    access. A no-account lead is recorded to the audit log (no auth account
 *    is created).
 */
const AGE_GROUP_VALUES = ['18_24', '25_50', '50_plus'] as const;

const submitSchema = z.object({
  firstName: z.string().trim().max(100).optional().nullable(),
  lastName: z.string().trim().max(100).optional().nullable(),
  phone: z.string().trim().max(50).optional().nullable(),
  email: z.string().trim().max(200).optional().nullable(),
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
  hearAbout: z.string().trim().max(200).optional().nullable(),
  hearAboutOther: z.string().trim().max(200).optional().nullable(),
  partnerAmbassadorReferral: z.string().trim().max(200).optional().nullable(),
});

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export const POST = withApiGuc(
  async (request: NextRequest, context: { params: Promise<{ token: string }> }) => {
    try {
      const ip = getClientIp(request);
      const { success: rateOk } = await checkPublicQuestionnaireSubmitRateLimit(ip);
      if (!rateOk) {
        return NextResponse.json(
          { error: 'Too many submissions from this connection. Please wait a moment and try again.' },
          { status: 429 },
        );
      }

      const { token } = await context.params;
      const validation = await validateTokenizedLink(token, 'eligibility_questionnaire');
      if (!validation.ok) {
        const msg =
          validation.reason === 'expired'
            ? 'This link has expired.'
            : validation.reason === 'consumed'
              ? 'This link has already been used.'
              : 'This link is no longer valid.';
        return NextResponse.json({ error: msg }, { status: 410 });
      }
      const { link } = validation;

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
      }
      const parsed = submitSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.errors[0]?.message ?? 'Please review your answers and try again.' },
          { status: 400 },
        );
      }
      const data = parsed.data;
      const barrierTypes = (data.primaryBarriers ?? [])
        .map((b) => b.trim())
        .filter((b) => b && b !== 'none');
      const extendedMeta = {
        q1: normalizeYesNo(data.q1),
        q2: normalizeYesNo(data.q2),
        q3: normalizeYesNo(data.q3),
        receivingUnemployment: normalizeYesNo(data.receivingUnemployment),
        exhaustedUnemployment: normalizeYesNo(data.exhaustedUnemployment),
        layoffCompany: data.layoffCompany?.trim() ? data.layoffCompany.trim().slice(0, 200) : null,
        snapWic: normalizeYesNo(data.snapWic),
        hearAbout: normalizeHearAbout(data.hearAbout),
        hearAboutOther: normalizeHearAbout(data.hearAboutOther),
        partnerAmbassadorReferral: data.partnerAmbassadorReferral?.trim()
          ? data.partnerAmbassadorReferral.trim().slice(0, 200)
          : null,
      };

      if (!interactiveTransactionsGuaranteed()) {
        return NextResponse.json({ error: 'Screening storage is temporarily unavailable. Try again later.' }, { status: 503 });
      }

      if (link.subjectUserId) {
        // Bound link: write ONLY this member's profile + WIOA snapshot. Mirrors
        // /api/member/eligibility. No other member is ever touched.
        const subjectId = link.subjectUserId;
        const notifyMeta = await prisma.$transaction(async (tx) => {
          if (!(await consumeTokenizedLink(link.id, { tx, expected: link }))) throw new Error('ELIGIBILITY_TOKEN_CONFLICT');
          // Older bound links may have no orgId; their immutable subject remains
          // the authority. When an organization is bound, require that exact org.
          const current = await lockEligibilityMember(tx, subjectId, link.orgId ?? undefined);
          const profileData: Record<string, unknown> = {
            city: data.city?.trim() || null,
            state: data.state?.trim() || null,
            zip: data.zip?.trim() || null,
            barrierTypes,
            hasEmploymentBarrier: barrierTypes.length > 0,
          };
          await tx.profile.upsert({
            where: { userId: subjectId },
            create: { userId: subjectId, ...profileData },
            update: profileData,
          });

          const meta: EligibilityFormMeta = {
            version: 1,
            updatedAt: new Date().toISOString(),
            ageGroup: data.ageGroup ?? null,
            county: data.county?.trim() || null,
            ...extendedMeta,
          };
          await saveEligibilityForm(tx, {
            userId: subjectId, organizationId: current.organizationId,
            previous: current.wioaQualificationJson, form: meta,
          });

          if (extendedMeta.q1 && extendedMeta.q2 && current?.organizationId) {
            const yesCount = [extendedMeta.q1, extendedMeta.q2, extendedMeta.q3].filter(
              (v) => v === 'yes',
            ).length;
            await saveEligibilityScreening(tx, {
              userId: subjectId, organizationId: current.organizationId,
              answers: extendedMeta, qualifies: yesCount >= 1, yesCount,
            });
          }

          return {
            email: current?.email ?? data.email?.trim() ?? link.email ?? null,
            fullName: current?.fullName ?? null,
          };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        auditLog({
          actorUserId: link.subjectUserId,
          action: 'member_eligibility_questionnaire_submitted',
          targetType: 'User',
          targetId: link.subjectUserId,
          metadata: { linkId: link.id, orgId: link.orgId, ageGroup: data.ageGroup ?? null },
        }).catch(() => {});
        logAuditEvent({
          user: { id: link.subjectUserId, role: 'member' },
          verb: 'submitted',
          object: { type: 'EligibilityQuestionnaire', id: link.id },
          result: { success: true, extensions: { ageGroup: data.ageGroup ?? null } },
          request: auditRequestMeta(request),
          orgId: link.orgId,
        }).catch(() => {});

        // Community Ambassador auto-assignment (9/3/26): the public
        // questionnaire also asks who referred the member.
        const referredMemberId = link.subjectUserId;
        if (referredMemberId) {
          after(() =>
            autoAssignAmbassadorFromReferral({
              memberId: referredMemberId,
              source: 'public_eligibility',
              hearAbout: extendedMeta.hearAbout,
              hearAboutOther: extendedMeta.hearAboutOther,
              partnerAmbassadorReferral: extendedMeta.partnerAmbassadorReferral,
            }).catch((err) => {
              logger.warn('q/submit: ambassador auto-assign failed', { userId: referredMemberId, err });
            }),
          );
        }

        if (notifyMeta.email && hasEligibilityScreeningFields(extendedMeta)) {
          const displayName =
            (notifyMeta.fullName ?? '').trim() ||
            [data.firstName, data.lastName].filter(Boolean).join(' ').trim() ||
            notifyMeta.email;
          // `after()` keeps the Vercel invocation alive until Resend finishes.
          after(() =>
            sendEligibilityScreeningConfirmationEmail({
              to: notifyMeta.email!,
              fullName: displayName,
              eligibility: extendedMeta,
            }).catch((err) => {
              logger.error('Token eligibility confirmation email failed', { err });
              captureApiError(err, {
                route: 'POST /api/q/[token]/submit#confirmation',
                extra: { subjectUserId: subjectId },
              });
            })
          );
          after(() =>
            sendEligibilityScreeningAdminEmail({
              memberName: displayName,
              memberEmail: notifyMeta.email!,
              memberId: subjectId,
              source: 'token',
              eligibility: extendedMeta,
            }).catch((err) => {
              logger.error('Token eligibility admin alert failed', { err });
              captureApiError(err, {
                route: 'POST /api/q/[token]/submit#adminAlert',
                extra: { subjectUserId: subjectId },
              });
            })
          );
        }
      } else {
        // No-account lead: do NOT create a Supabase auth account or a User
        // FK row. Record the submission to the audit log so an admin can see
        // it (audit_logs.actorUserId is nullable). Keyed to the token's id +
        // email, with the full eligibility answers in metadata.
        const leadEmail = data.email?.trim() || link.email || null;
        const leadName =
          [data.firstName, data.lastName].filter(Boolean).join(' ').trim() || leadEmail || 'Lead';
        await prisma.$transaction(async (tx) => {
          if (!(await consumeTokenizedLink(link.id, { tx, expected: link }))) throw new Error('ELIGIBILITY_TOKEN_CONFLICT');
          await auditLog({
            actorUserId: null,
            action: 'public_eligibility_lead_submitted',
            targetType: 'tokenized_link',
            targetId: link.id,
            actorEmailSnapshot: null,
            actorRoleSnapshot: null,
            metadata: {
              orgId: link.orgId,
              email: leadEmail,
              firstName: data.firstName?.trim() || null,
              lastName: data.lastName?.trim() || null,
              phone: data.phone?.trim() || null,
              ageGroup: data.ageGroup ?? null,
              city: data.city?.trim() || null,
              state: data.state?.trim() || null,
              zip: data.zip?.trim() || null,
              county: data.county?.trim() || null,
              primaryBarriers: barrierTypes,
              ...extendedMeta,
            },
          }, tx);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

        if (leadEmail && hasEligibilityScreeningFields(extendedMeta)) {
          after(() =>
            sendEligibilityScreeningConfirmationEmail({
              to: leadEmail,
              fullName: leadName,
              eligibility: extendedMeta,
            }).catch((err) => {
              logger.error('Public lead eligibility confirmation email failed', { err });
              captureApiError(err, {
                route: 'POST /api/q/[token]/submit#leadConfirmation',
                extra: { linkId: link.id },
              });
            })
          );
          after(() =>
            sendEligibilityScreeningAdminEmail({
              memberName: leadName,
              memberEmail: leadEmail,
              memberId: null,
              source: 'token',
              eligibility: extendedMeta,
            }).catch((err) => {
              logger.error('Public lead eligibility admin alert failed', { err });
              captureApiError(err, {
                route: 'POST /api/q/[token]/submit#leadAdminAlert',
                extra: { linkId: link.id },
              });
            })
          );
        }
      }

      return NextResponse.json({ ok: true });
    } catch (error) {
      if (error instanceof Error && error.message === 'ELIGIBILITY_TOKEN_CONFLICT') {
        return NextResponse.json({ error: 'This link has been used or expired. Ask for a new link.' }, { status: 409 });
      }
      const failure = eligibilityWriteFailure(error);
      if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });
      console.error('/api/q/[token]/submit error:', error);
      return NextResponse.json({ error: 'We could not save your answers. Please try again.' }, { status: 500 });
    }
  },
);
