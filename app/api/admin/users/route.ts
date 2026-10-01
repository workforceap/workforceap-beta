import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { isSuperAdmin, requireAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { apiError } from '@/lib/http/errorResponse';
import { captureApiError } from '@/lib/observability/captureApiError';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { withTenantScope, crossTenantOK } from '@/lib/tenant/withTenantScope';
import {
  ADMIN_USER_ROLES,
  ensureAppUser,
  ensureProfileRole,
  syncManagedUserRoles,
} from '@/lib/admin/adminUserProvisioning';
import { sendPasswordResetEmail } from '@/lib/auth/passwordReset';
import { findSupabaseAuthUserByEmail } from '@/lib/auth/supabaseAdminUsers';
import { provisionIntentAppMetadata } from '@/lib/auth/provisionIntent';
import {
  authProviderFailureStatus,
  classifyAuthProviderError,
  describeAuthProviderFailure,
} from '@/lib/auth/authProviderError';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';

async function _GET() {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
      await requireAdmin(user.id);
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  
    const orgId = await getActorOrganizationId(user.id);
    const users = await withTenantScope(orgId, (db) =>
      db.user.findMany({
        where: { deletedAt: null },
        select: { id: true, fullName: true, email: true },
        orderBy: { fullName: 'asc' },
        take: 500,
      }),
    );
    return NextResponse.json(users);
  } catch (error) {
    console.error('/admin/users:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const GET = withApiGuc(_GET);

const createSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(200),
  role: z.enum(ADMIN_USER_ROLES).default('member'),
  sendResetEmail: z.boolean().default(true),
});async function _POST(request: NextRequest) {
  try {
    const admin = await getUser();
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
      await requireAdmin(admin.id);
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  
    const isSuper = await isSuperAdmin(admin.id);
    const organizationId = await getActorOrganizationId(admin.id);
  
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
  
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Invalid request' }, { status: 400 });
    }
  
    const { fullName, role, sendResetEmail } = parsed.data;
    const email = parsed.data.email.toLowerCase();
  
    if (!isSuper && role !== 'member') {
      return NextResponse.json({ error: 'Only super admins can create staff or admin users.' }, { status: 403 });
    }
  
    // User.email is @unique GLOBALLY in the schema, so the pre-check has to
    // see all tenants — otherwise a cross-tenant collision would surface as
    // a 500 from Prisma's P2002 instead of a clean 409 here.
    const duplicateIdentity = await crossTenantOK(() =>
      prisma.user.findFirst({
        where: { email },
        // Global uniqueness classification may read only tenant ownership and
        // the opaque primary key. Personal fields stay behind tenant scope.
        select: { id: true, organizationId: true },
      }),
    );
    if (duplicateIdentity) {
      if (duplicateIdentity.organizationId !== organizationId) {
        return NextResponse.json(
          { error: 'That email already has an account.' },
          { status: 409 },
        );
      }
      const existingDbUser = await withTenantScope(organizationId, (db) =>
        db.user.findFirst({
          where: { id: duplicateIdentity.id },
          select: {
            id: true,
            fullName: true,
            email: true,
            profile: { select: { role: true } },
          },
        }),
      );
      if (!existingDbUser) {
        return NextResponse.json(
          { error: 'That email already has an account.' },
          { status: 409 },
        );
      }
      return NextResponse.json(
        {
          error: 'That email already has an account. Use the edit or reset tools on the existing user.',
          user: {
            id: existingDbUser.id,
            fullName: existingDbUser.fullName,
            email: existingDbUser.email,
            role: existingDbUser.profile?.role ?? 'member',
          },
        },
        { status: 409 }
      );
    }
  
    // Provider failures are classified (duplicate / validation / unavailable)
    // so the admin sees the reason instead of "Failed to create user." — the
    // raw provider text is still only logged, never returned (audit 2026-09-20).
    let supabase: ReturnType<typeof getSupabaseAdmin>;
    try {
      supabase = getSupabaseAdmin();
    } catch (error) {
      return apiError(error, {
        route: 'admin/users/create',
        status: 503,
        message: describeAuthProviderFailure('unavailable', 'create'),
      });
    }
    const tempPassword = `WfAP!${randomUUID()}`;
  
    let authUserId: string | null = null;
    try {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName },
        app_metadata: provisionIntentAppMetadata({ role, organizationId, source: 'admin_user_create' }),
      });
  
      if (!error && data.user?.id) {
        authUserId = data.user.id;
      } else if (error && classifyAuthProviderError(error) === 'duplicate') {
        authUserId = (await findSupabaseAuthUserByEmail(supabase, email, { perPage: 200, maxPages: 25 }))?.id ?? null;
        if (!authUserId) {
          return NextResponse.json({ error: 'This email already exists in auth, but could not be linked.', reason: 'duplicate' }, { status: 409 });
        }
      } else if (error) {
        const kind = classifyAuthProviderError(error);
        const status = authProviderFailureStatus(kind);
        captureApiError(error, { route: 'admin/users/create', extra: { kind } });
        return NextResponse.json(
          { error: describeAuthProviderFailure(kind, 'create'), reason: kind },
          { status },
        );
      }
    } catch (error) {
      const kind = classifyAuthProviderError(error) === 'unavailable' ? 'unavailable' : 'unknown';
      console.error('[admin/users POST] create auth user failed', error);
      captureApiError(error, { route: 'admin/users/create', extra: { kind, thrown: true } });
      return NextResponse.json(
        { error: describeAuthProviderFailure(kind, 'create'), reason: kind },
        { status: kind === 'unavailable' ? 503 : 500 },
      );
    }
  
    if (!authUserId) {
      return NextResponse.json({ error: 'Failed to create account.' }, { status: 500 });
    }
  
    try {
      // Tag the new user with the actor's tenant, not the seeded default org.
      // Codex P1 catch on PR #1047: a non-default-org admin creating users
      // would otherwise plant them in the wrong tenant.
      const created = await prisma.$transaction(async (tx) => {
        const user = await ensureAppUser(tx, {
          authUserId,
          organizationId,
          email,
          fullName,
        });
  
        const profile = await ensureProfileRole(tx, authUserId, role);
        await syncManagedUserRoles(tx, authUserId, role);
  
        return {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          role: profile.role,
        };
      });
  
      if (sendResetEmail) {
        const { error } = await sendPasswordResetEmail(email, '/reset-password', { orgId: organizationId });
        if (error) {
          return NextResponse.json({
            success: true,
            user: created,
            warning: `User created, but reset email failed: ${error.message}`,
          });
        }
      }
  
      void auditLog({ actorUserId: admin.id, action: 'admin_user_created', targetType: 'User', targetId: created.id, metadata: { role: created.role } }).catch(() => {});
      logAuditEvent({ user: { id: admin.id, role: 'admin' }, verb: 'created', object: { type: 'User', id: created.id }, result: { success: true, extensions: { role: created.role } } }).catch(() => {});
      return NextResponse.json({ success: true, user: created });
    } catch (error) {
      if (
        error instanceof Error &&
        ['ADMIN_USER_AUTH_IDENTITY_CONFLICT', 'ADMIN_USER_EMAIL_USER_ID_MISMATCH'].includes(error.message)
      ) {
        return NextResponse.json(
          { error: 'That email already has an account.' },
          { status: 409 },
        );
      }
      if ((error as { code?: unknown })?.code === 'P2002') {
        return NextResponse.json(
          { error: 'That email already has an account.' },
          { status: 409 },
        );
      }
      console.error('[admin/users POST] database setup failed', error);
      return NextResponse.json({ error: 'Failed to finish provisioning the new user.' }, { status: 500 });
    }
  } catch (error) {
    console.error('/admin/users:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const POST = withApiGuc(_POST);
