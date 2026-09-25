import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { requireAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { findSupabaseAuthUserByEmail } from '@/lib/auth/supabaseAdminUsers';
import {
  authProviderFailureStatus,
  classifyAuthProviderError,
  describeAuthProviderFailure,
} from '@/lib/auth/authProviderError';
import { captureApiError } from '@/lib/observability/captureApiError';
import { z } from 'zod';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';

const bodySchema = z.object({
  email: z.string().email(),
});

class PartnerInviteConflictError extends Error {}

async function ensurePartnerUserLink(userId: string, partnerId: string) {
  const existing = await prisma.$transaction((tx) => tx.partnerUser.findFirst({
    where: { userId },
    select: { id: true, partnerId: true },
  }));

  if (existing) {
    if (existing.partnerId !== partnerId) {
      // Block cross-org partner moves: verify the new partner is in the
      // same organization as the existing partner before relinking.
      const [oldPartner, newPartner] = await Promise.all([
        prisma.$transaction((tx) => tx.partner.findFirst({ where: { id: existing.partnerId }, select: { organizationId: true } })),
        prisma.$transaction((tx) => tx.partner.findFirst({ where: { id: partnerId }, select: { organizationId: true } })),
      ]);
      if (oldPartner?.organizationId && newPartner?.organizationId &&
          oldPartner.organizationId !== newPartner.organizationId) {
        throw new PartnerInviteConflictError(
          `Cross-tenant partner relink blocked: existing partner ${existing.partnerId} ` +
          `is in org ${oldPartner.organizationId}, target partner ${partnerId} ` +
          `is in org ${newPartner.organizationId}.`
        );
      }
      await prisma.$transaction((tx) => tx.partnerUser.update({
        where: { id: existing.id },
        data: { partnerId },
      }));
    }
    return;
  }

  await prisma.$transaction((tx) => tx.partnerUser.create({
    data: { partnerId, userId },
  }));
}

async function ensurePartnerInviteUser(params: {
  userId: string;
  organizationId: string;
  email: string;
  fullName: string;
}) {
  const existing = await prisma.$transaction((tx) => tx.user.findFirst({
    where: { id: params.userId },
    select: { id: true, organizationId: true },
  }));

  if (existing) {
    // Block cross-organization moves: if the user already exists in a
    // different org, reject instead of silently overwriting their tenant.
    if (existing.organizationId && existing.organizationId !== params.organizationId) {
      throw new PartnerInviteConflictError(
        `User already belongs to organization ${existing.organizationId}. ` +
        `Cross-tenant partner invites are not allowed.`
      );
    }
    if (!existing.organizationId) {
      await prisma.$transaction((tx) => tx.user.update({
        where: { id: params.userId },
        data: { organizationId: params.organizationId },
        select: { id: true },
      }));
    }
    return;
  }

  await prisma.$transaction((tx) => tx.user.create({
    data: {
      id: params.userId,
      organizationId: params.organizationId,
      email: params.email,
      fullName: params.fullName,
    },
    select: { id: true },
  }));
}export const POST = withApiGuc(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const adminUser = await getUser();
    if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
      await requireAdmin(adminUser.id);
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  
    const { id: partnerId } = await params;
    // Partner is tenant-scoped. An Org A admin cannot invite a user
    // to an Org B partner.
    const orgId = await getActorOrganizationId(adminUser.id);
    const partner = await withTenantScope(orgId, (db) =>
      db.partner.findFirst({ where: { id: partnerId } }),
    );
    if (!partner) return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
  
    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Invalid email' }, { status: 400 });
    }
  
    const email = parsed.data.email.toLowerCase().trim();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.workforceap.org';
    const displayName = partner.contactName?.trim() || 'Partner User';
  
    let authUserId: string | null = null;
    // Provider failures used to escape to the outer catch as a bare 500
    // "Internal server error" and the partner page showed nothing. Classify
    // them and answer with an "Invite not sent: …" reason (audit 2026-09-20).
    let supabase: ReturnType<typeof getSupabaseAdmin>;
    try {
      supabase = getSupabaseAdmin();
    } catch (error) {
      captureApiError(error, { route: 'admin/partners/invite', extra: { kind: 'unavailable', stage: 'client' } });
      return NextResponse.json(
        { error: describeAuthProviderFailure('unavailable', 'invite'), reason: 'unavailable' },
        { status: 503 },
      );
    }
  
    try {
      const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${siteUrl}/partner`,
        data: { full_name: displayName },
      });
  
      if (!inviteError && inviteData.user?.id) {
        authUserId = inviteData.user.id;
      } else {
        const inviteKind = inviteError ? classifyAuthProviderError(inviteError) : 'unknown';
        if (inviteKind === 'unavailable') {
          captureApiError(inviteError, { route: 'admin/partners/invite', extra: { kind: inviteKind, stage: 'invite' } });
          return NextResponse.json(
            { error: describeAuthProviderFailure('unavailable', 'invite'), reason: 'unavailable' },
            { status: 503 },
          );
        }
        authUserId = (await findSupabaseAuthUserByEmail(supabase, email, { perPage: 200, maxPages: 25 }))?.id ?? null;
        if (!authUserId) {
          const kind = inviteKind === 'duplicate' ? 'unknown' : inviteKind;
          if (inviteError) captureApiError(inviteError, { route: 'admin/partners/invite', extra: { kind, stage: 'invite' } });
          return NextResponse.json(
            { error: describeAuthProviderFailure(kind, 'invite'), reason: kind },
            { status: authProviderFailureStatus(kind) },
          );
        }
      }
    } catch (error) {
      const kind = classifyAuthProviderError(error) === 'unavailable' ? 'unavailable' : 'unknown';
      console.error('[admin/partners/invite] provider call failed', error);
      captureApiError(error, { route: 'admin/partners/invite', extra: { kind, stage: 'provider', thrown: true } });
      return NextResponse.json(
        { error: describeAuthProviderFailure(kind, 'invite'), reason: kind },
        { status: kind === 'unavailable' ? 503 : 502 },
      );
    }
  
    try {
      await ensurePartnerInviteUser({
        userId: authUserId,
        organizationId: partner.organizationId,
        email,
        fullName: displayName,
      });
  
      await ensurePartnerUserLink(authUserId, partnerId);
    } catch (e) {
      if (e instanceof PartnerInviteConflictError) {
        return NextResponse.json({ error: 'User already belongs to another organization' }, { status: 409 });
      }
      console.error('Partner invite DB error:', e);
      return NextResponse.json({ error: 'Failed to link partner user' }, { status: 500 });
    }
  
    void auditLog({ actorUserId: adminUser.id, action: 'admin_partner_user_invite', targetType: 'partner', targetId: partnerId, metadata: { email, userId: authUserId } }).catch(() => {});
    logAuditEvent({ user: { id: adminUser.id, role: 'admin' }, verb: 'invited', object: { type: 'PartnerInvite', id: partnerId }, result: { success: true, extensions: { email, userId: authUserId } } }).catch(() => {});
    return NextResponse.json({ ok: true, userId: authUserId });
  } catch (error) {
    console.error('/admin/partners/[id]/invite:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
