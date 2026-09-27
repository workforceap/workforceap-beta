import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { createTokenizedLink } from '@/lib/tokenizedLink';
import { getActorOrganizationId, getSubjectOrganizationId } from '@/lib/tenant/organization';
import { resolveActOnBehalf } from '@/lib/auth/actAsSubject';
import { sendEligibilityLink } from '@/lib/email';
import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';
import { checkAdminTokenLinksRateLimit } from '@/lib/rate-limit';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.workforceap.org';

/**
 * POST /api/admin/token-links
 *
 * Admin-only. Mints a single-use, expiring tokenized link.
 * Default type is `eligibility_questionnaire` → `/q/<token>`.
 * Pass `type: 'guardian_consent'` (requires `subjectUserId`) → `/consent/<token>`.
 *
 * If `subjectUserId` is provided, the public form is pre-filled from — and
 * writes back to — that member's profile only. If only `email` is provided
 * (or nothing) on an eligibility link, the link captures a no-account lead.
 *
 * Security: isAdmin gate + withApiGuc; the token is the only thing that
 * unlocks the public page, so it is long, random, single-use, and expiring
 * (enforced server-side in lib/tokenizedLink + the public submit route).
 */
const MINTABLE_TYPES = ['eligibility_questionnaire', 'guardian_consent'] as const;

const bodySchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.').optional(),
  subjectUserId: z.string().trim().min(1).optional(),
  type: z.enum(MINTABLE_TYPES).optional().default('eligibility_questionnaire'),
});

export const POST = withApiGuc(async (request: Request) => {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!(await isAdmin(user.id))) {
      return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });
    }

    const rateLimit = await checkAdminTokenLinksRateLimit(user.id);
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again later.' },
        { status: 429 },
      );
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      raw = {};
    }
    const parsed = bodySchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'Invalid request.' },
        { status: 400 },
      );
    }
    const { email, subjectUserId, type } = parsed.data;
    if (type === 'guardian_consent' && !subjectUserId) {
      return NextResponse.json(
        { error: 'Guardian consent links must be bound to a member.' },
        { status: 400 },
      );
    }

    // When binding the link to a member, the actor must have authority over
    // that member (org admin in the member's org, or super_admin). Without
    // this gate, getSubjectOrganizationId is an unscoped cross-tenant lookup:
    // an Org-A admin could mint a link bound to any Org-B member and leak
    // their name via the email path (TODO-005).
    if (subjectUserId) {
      const behalf = await resolveActOnBehalf(user.id, subjectUserId);
      if (!behalf.ok) {
        // Existence-oracle collapse: always 404 so cross-tenant enumeration
        // via 403 vs 404 differential is impossible.
        return NextResponse.json({ error: 'Member not found' }, { status: 404 });
      }
    }

    // Scope the link to the subject member's org when bound, else the actor's.
    // Fail loudly on lookup errors (outer catch -> 500) instead of silently
    // degrading orgId to null, which would mint an unscoped link.
    const orgId = subjectUserId
      ? await getSubjectOrganizationId(subjectUserId)
      : await getActorOrganizationId(user.id);

    const { token } = await createTokenizedLink({
      type,
      createdById: user.id,
      email: email ?? null,
      subjectUserId: subjectUserId ?? null,
      orgId,
    });

    await auditLog({
      actorUserId: user.id,
      action: 'token_link_minted',
      targetType: 'tokenized_link',
      targetId: token,
      metadata: {
        type,
        subjectUserId: subjectUserId ?? null,
        email: email ?? null,
        token,
      },
    });
    logAuditEvent({
      user: { id: user.id, role: 'admin' },
      verb: 'minted',
      object: { type: 'TokenizedLink', id: token },
      result: { success: true, extensions: { subjectUserId: subjectUserId ?? null } },
      request: auditRequestMeta(request as Request),
      orgId,
    }).catch(() => {});

    const path = type === 'guardian_consent' ? `/consent/${token}` : `/q/${token}`;
    const url = `${SITE_URL}${path}`;

    if (email && type === 'eligibility_questionnaire') {
      // Reuse the eligibility-link email helper, pointed at the public /q URL.
      let name: string | null = null;
      if (subjectUserId) {
        const { prisma } = await import('@/lib/db/prisma');
        const member = await prisma.user
          .findUnique({ where: { id: subjectUserId }, select: { fullName: true } })
          .catch(() => null);
        name = member?.fullName ?? null;
      }
      const result = await sendEligibilityLink({
        to: email,
        name,
        url,
        orgId,
        ...(subjectUserId ? { subjectMemberId: subjectUserId } : {}),
      });
      if (!result.ok) {
        // The link is still valid; surface the email failure but return the URL
        // so the admin can copy/share it manually.
        return NextResponse.json(
          { ok: true, url, emailSent: false, emailError: result.error ?? 'Email send failed' },
        );
      }
      return NextResponse.json({ ok: true, url, emailSent: true });
    }

    return NextResponse.json({ ok: true, url });
  } catch (error) {
    console.error('/api/admin/token-links error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
