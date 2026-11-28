import { getClientIpFromRequest } from '@/lib/http/clientIp';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { checkPublicQuestionnaireSubmitRateLimit } from '@/lib/rate-limit';
import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';
import {
  persistGuardianConsent,
} from '@/lib/consent/guardianConsentPersistence';
import { interactiveTransactionsGuaranteed } from '@/lib/db/transactionPolicy';

/**
 * POST /api/consent/[token]
 *
 * PUBLIC guardian-consent submit. The single-use token is the only credential.
 * Consent writes Profile parental-consent fields and never creates an account.
 * Coursera seat activation stays gated on parentalConsentGiven for minors.
 */
const submitSchema = z.object({
  guardianName: z.string().trim().min(1).max(200),
  guardianEmail: z.string().trim().email().max(200),
  guardianPhone: z.string().trim().max(50).optional().nullable(),
  attested: z.literal(true),
});

export const POST = withApiGuc(
  async (request: NextRequest, context: { params: Promise<{ token: string }> }) => {
    try {
      const ip = getClientIpFromRequest(request);
      const { success: rateOk } = await checkPublicQuestionnaireSubmitRateLimit(ip);
      if (!rateOk) {
        return NextResponse.json(
          { error: 'Too many submissions from this connection. Please wait a moment and try again.' },
          { status: 429 },
        );
      }

      const { token } = await context.params;
      if (!interactiveTransactionsGuaranteed()) {
        return NextResponse.json(
          { error: 'Guardian consent is temporarily unavailable. Please try again later.' },
          { status: 503 },
        );
      }
      if (!token || token.length < 32) {
        return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 410 });
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
      }
      const parsed = submitSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.errors[0]?.message ?? 'Please review the form and try again.' },
          { status: 400 },
        );
      }

      const outcome = await persistGuardianConsent(prisma, {
        token,
        guardianName: parsed.data.guardianName,
        guardianEmail: parsed.data.guardianEmail,
        guardianPhone: parsed.data.guardianPhone?.trim() || null,
      });

      if (!outcome.ok) {
        const message =
          outcome.reason === 'expired'
            ? 'This link has expired.'
            : outcome.reason === 'consumed' || outcome.reason === 'conflict'
              ? 'This link has already been used.'
              : 'This link is no longer valid.';
        return NextResponse.json(
          { error: message },
          { status: outcome.reason === 'conflict' ? 409 : 410 },
        );
      }

      await Promise.resolve(
        auditLog({
          actorUserId: outcome.subjectId,
          action: 'guardian_consent_submitted',
          targetType: 'User',
          targetId: outcome.subjectId,
          metadata: { linkId: outcome.linkId, orgId: outcome.orgId },
        }),
      ).catch(() => {});
      logAuditEvent({
        user: { id: outcome.subjectId, role: 'member' },
        verb: 'submitted',
        object: { type: 'GuardianConsent', id: outcome.linkId },
        result: { success: true },
        request: auditRequestMeta(request),
        orgId: outcome.orgId,
      }).catch(() => {});

      return NextResponse.json({ ok: true });
    } catch (error) {
      console.error('/api/consent/[token] error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
);
