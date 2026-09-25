import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { User } from '@supabase/supabase-js';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor, isSuperAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { withTenantScope, crossTenantOK } from '@/lib/tenant/withTenantScope';
import { trackEvent } from '@/lib/events/track';
import { findSupabaseAuthUserByEmail } from '@/lib/auth/supabaseAdminUsers';
import { stampNewAuthUserProvisionIntent } from '@/lib/auth/provisionIntent';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';

import { withApiGuc } from '@/lib/db/withRequestGuc';

/**
 * Track A — Tenant Isolation Hardening (Sprint A.2 batch 5).
 * See `docs/PROGRAM-ENTERPRISE-GRADE.md` and `docs/TENANT-ISOLATION.md`.
 *
 * The new walk-in member is created inside the actor counselor's tenant,
 * not the default org. Three Prisma touches:
 *
 *   1. Pre-flight email lookup — `User.email` is `@unique` GLOBALLY in
 *      the current schema, so the duplicate check has to span all
 *      tenants. Wrapped in `crossTenantOK` to mark the intentional
 *      cross-tenant read for the audit script. Once the schema migrates
 *      to per-tenant uniqueness in Sprint A.3, this moves into
 *      `withTenantScope`.
 *   2. Free the soft-deleted email — must use `crossTenantOK` since
 *      the row found in (1) might have been seeded into another org
 *      historically; we still want to free the email slot.
 *   3. Create the new `User` row + `Profile` + (optional)
 *      `CounselorAssignment` inside `withTenantScope` so the new member
 *      is stamped with the actor's `organizationId`.
 *
 * Belt-and-braces: catch P2002 on the email field if the global
 * pre-check loses a race with a concurrent insert.
 */

/**
 * Walk-in session API — creates a brand-new member and starts an in-office
 * session. Counselor or admin (or super admin) only.
 *
 * Difference from /api/admin/members/create:
 *   - leaner intake: only firstName + email required (other intake fields
 *     are filled in during the session via the Profile step)
 *   - does NOT enroll in a program (that's a session step too)
 *   - assigns the calling counselor as the member's counselor (admins skip
 *     this — admins don't take member assignments)
 *   - returns the new memberId + a fresh sessionId for the run page
 */
const walkInSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional().default(''),
  email: z.string().email().max(254),
  phone: z.string().max(40).optional().default(''),
  targetRole: z.string().max(200).optional().default(''),
});export const POST = withApiGuc(async (request: Request) => {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  
    const [counselorRole, adminRole, superAdminRole] = await Promise.all([
      isCounselor(user.id),
      isAdmin(user.id),
      isSuperAdmin(user.id),
    ]);
    if (!counselorRole && !adminRole && !superAdminRole) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
  
    const parsed = walkInSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'Validation failed' },
        { status: 400 }
      );
    }
  
    const { firstName, lastName, email: emailRaw, phone, targetRole } = parsed.data;
    const email = emailRaw.toLowerCase().trim();
    const fullName = `${firstName} ${lastName}`.trim() || firstName;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.workforceap.org';
  
    const supabase = getSupabaseAdmin();
  
    // Pre-flight self-heal: if a Prisma row with this email is soft-deleted,
    // its email is still occupying the @unique slot. Free it before we ask
    // Supabase to invite — otherwise even after Supabase succeeds we'd fail
    // when the transaction tries to insert the new User row. See #757 + #761.
    //
    // `User.email` is `@unique` GLOBALLY (not per-tenant) in the current
    // schema, so the lookup MUST span all tenants — `crossTenantOK` marks
    // the intentional bypass. The follow-up `update` below is also
    // unscoped because the soft-deleted row could legitimately live in
    // any tenant; we just want to free the email slot regardless.
    const existingPrisma = await crossTenantOK(() =>
      prisma.user.findUnique({
        where: { email },
        select: { id: true, deletedAt: true },
      }),
    );
    if (existingPrisma?.deletedAt) {
      const freedEmail = `deleted_${existingPrisma.id}_${Date.now()}_${email}@deleted.invalid`.slice(0, 255);
      await crossTenantOK(() =>
        prisma.user.update({
          where: { id: existingPrisma.id },
          data: { email: freedEmail },
        }),
      );
    } else if (existingPrisma) {
      // Active Prisma row — existing member. Return their ID so the client can
      // offer a one-click "start session with them" path.
      return NextResponse.json(
        {
          error: 'A member with this email already exists.',
          existingMemberId: existingPrisma.id,
        },
        { status: 409 }
      );
    }
  
    // Invite first (sends a welcome / set-password email). Falls back to
    // createUser + reset-link if invite isn't available in this Supabase setup.
    let { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/dashboard`,
      data: { full_name: fullName, phone, walked_in_by: user.id },
    });
  
    // Second self-heal: orphan Supabase auth user from a prior failed delete.
    // If the Prisma row was already soft-deleted (or never existed) and only
    // a stale auth row remains, deleting and re-inviting clears the ghost.
    // We only attempt this when there's no active Prisma user with that email
    // (checked above) — so removing the auth row is safe.
    if (
      (inviteError?.message?.includes('already') || inviteError?.code === 'user_already_exists') &&
      !existingPrisma // no active Prisma user — auth row is an orphan
    ) {
      try {
        const orphan = await findSupabaseAuthUserByEmail(supabase, email);
        if (orphan) {
          await supabase.auth.admin.deleteUser(orphan.id);
          const retry = await supabase.auth.admin.inviteUserByEmail(email, {
            redirectTo: `${siteUrl}/dashboard`,
            data: { full_name: fullName, phone, walked_in_by: user.id },
          });
          inviteData = retry.data;
          inviteError = retry.error;
        }
      } catch (err) {
        console.error('[walk-in] orphan auth cleanup failed', err);
      }
    }
  
    let authUser: Pick<User, 'id' | 'email' | 'app_metadata'> | null = null;
    if (!inviteError && inviteData.user) {
      authUser = inviteData.user;
    } else if (inviteError?.message?.includes('already') || inviteError?.code === 'user_already_exists') {
      return NextResponse.json(
        {
          error:
            'A member with this email already exists. Use the existing-member path from the In-office sessions index.',
        },
        { status: 409 }
      );
    } else {
      const tempPassword = `WfAP${Date.now().toString(36)}!`;
      const { data: createData, error: createError } = await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName, phone, walked_in_by: user.id },
      });
      if (createError) {
        if (createError.message.includes('already')) {
          return NextResponse.json(
            { error: 'A member with this email already exists.' },
            { status: 409 }
          );
        }
        console.error('[walk-in] supabase create error', createError);
        return NextResponse.json({ error: createError.message }, { status: 400 });
      }
      authUser = createData.user;
    }
  
    if (!authUser) {
      return NextResponse.json({ error: 'Account creation failed' }, { status: 500 });
    }
  
    // Walk-in lands in the actor's tenant, not the default org. Codex P1
    // catch on PR #1047 — using `getDefaultOrganizationId()` would mis-tag
    // a non-default-org counselor's walk-ins.
    const organizationId = await getActorOrganizationId(user.id);
    await stampNewAuthUserProvisionIntent(supabase, authUser, {
      role: 'member', organizationId, source: 'counselor_walk_in',
    });
  
    try {
      // Step 1: User.create goes through withTenantScope so the new row
      // is stamped with the active org and any explicit `organizationId`
      // that doesn't match would fail loudly. Profile + CounselorAssignment
      // inherit tenancy via FK to User and stay on raw tx.
      await withTenantScope(organizationId, (db) =>
        db.user.create({
          data: {
            id: authUser.id,
            organizationId,
            email: authUser.email!,
            fullName,
            phone: phone || null,
          },
        }),
      );
  
      await prisma.$transaction(async (tx) => {
        await tx.profile.create({
          data: {
            userId: authUser.id,
          },
        });
  
        // Counselor (not admin) → assign self to the new member so the
        // resolveActOnBehalf check passes when the run page POSTs AI tools.
        if (counselorRole && !adminRole && !superAdminRole) {
          const counselor = await tx.counselor.findUnique({
            where: { userId: user.id },
            select: { id: true },
          });
          if (counselor) {
            await tx.counselorAssignment.create({
              data: {
                counselorId: counselor.id,
                memberId: authUser.id,
                active: true,
                notes: targetRole ? `Walk-in session, target role: ${targetRole}` : 'Walk-in session',
              },
            });
          }
        }
      });
    } catch (err) {
      console.error('[walk-in] db transaction failed', err);
      // Best-effort cleanup: remove the supabase auth user AND the prisma
      // user row (if it was created in step 1) since we couldn't finish
      // provisioning. Otherwise the email is taken but the member is
      // half-provisioned. Belt-and-braces P2002 catch on email also
      // returns the duplicate-account 409 response.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const target = (err.meta?.target as string[] | undefined) ?? [];
        if (target.includes('email') || target.includes('users_email_key')) {
          try { await supabase.auth.admin.deleteUser(authUser.id); } catch { /* ignore */ }
          return NextResponse.json(
            { error: 'A member with this email already exists.' },
            { status: 409 }
          );
        }
      }
      try {
        // Delete the prisma user if it was created — uses crossTenantOK
        // because the cleanup is intentionally broad and we just want the
        // row gone regardless of which tenant claimed it.
        await crossTenantOK(() =>
          prisma.user.deleteMany({ where: { id: authUser.id } })
        );
      } catch { /* swallow */ }
      try {
        await supabase.auth.admin.deleteUser(authUser.id);
      } catch {
        /* swallow — manual cleanup will be needed */
      }
      return NextResponse.json({ error: 'Failed to provision member account' }, { status: 500 });
    }
  
    const sessionId = randomUUID();
  
    // Audit/analytics: who created whom, in what session.
    trackEvent({
      userId: authUser.id,
      eventName: 'apply_signup_completed',
      entityType: 'user',
      entityId: authUser.id,
      metadata: {
        via: 'walk-in-session',
        actorUserId: user.id,
        targetRole: targetRole || null,
      },
      sessionId,
    }).catch(() => {});

    auditLog({
      actorUserId: user.id,
      action: 'counselor_walk_in_member_created',
      targetType: 'User',
      targetId: authUser.id,
      metadata: { email: authUser.email, orgId: organizationId, targetRole: targetRole || null },
    }).catch(() => {});
    logAuditEvent({
      user: { id: user.id, role: 'counselor' },
      verb: 'created',
      object: { type: 'User', id: authUser.id },
      result: { success: true, extensions: { via: 'walk-in-session', targetRole: targetRole || null } },
      orgId: organizationId,
    }).catch(() => {});

    return NextResponse.json({
      memberId: authUser.id,
      sessionId,
      fullName,
      email: authUser.email,
    });
  } catch (error) {
    console.error('/counselor/sessions/walk-in:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
