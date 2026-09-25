import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getUser } from '@/lib/auth/server';
import { isAdminInOrg, isSuperAdmin } from '@/lib/auth/roles';
import { listAllUsers } from '@/lib/coursera/b4bClient';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { crossTenantOK } from '@/lib/tenant/withTenantScope';
import { prisma } from '@/lib/db/prisma';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { captureApiError } from '@/lib/observability/captureApiError';
import { maybeSendCourseKickoffEmail } from '@/lib/coursera/courseKickoff';
import { sendPasswordResetEmail } from '@/lib/auth/passwordReset';
import { provisionIntentAppMetadata, stampNewInviteProvisionIntent } from '@/lib/auth/provisionIntent';
import {
  lockCourseraIdentityForAttachment,
  promoteCsvProgressToCanonical,
} from '@/lib/coursera/csvImport.server';
import { mapCourseraIdentityAndProgressInTransaction } from '@/lib/coursera/mapIdentityAndProgress.server';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import {
  CURRICULUM_MIGRATION_PENDING_CODE,
  CURRICULUM_MIGRATION_PENDING_MESSAGE,
  getProgramBySlug,
  isCurriculumMigrationPending,
} from '@/lib/content/programs';
import { LEGACY_CURRICULUM_VERSION } from '@/lib/content/programCurriculumManifest';
import { upsertEquivalentCourseEnrollment } from '@/lib/member/courseEnrollmentAssignment';

/**
 * POST /api/admin/coursera/reconcile/add-to-wap
 *
 * Body: {
 *   email: string;
 *   fullName?: string;
 *   courseraExternalId: string;
 *   programId: string;            // Coursera program id (used for the
 *                                 // identity-mapping note; we don't translate
 *                                 // it to a WAP slug here)
 *   programSlug?: string;         // Optional WAP CourseEnrollment slug
 * }
 *
 * Behavior:
 *   1. Verify the email is in the Coursera roster (so we never accidentally
 *      create a WAP account for someone who hasn't actually joined Coursera).
 *   2. Create the Supabase auth user via inviteUserByEmail (sends the
 *      set-password invite email), falling back to createUser + a
 *      password-reset email. Handle the duplicate-email collision
 *      gracefully.
 *   3. In a Prisma `$transaction`:
 *        - create the `User` row in the actor's org
 *        - if `programSlug` was supplied, create the `CourseEnrollment` too
 *        - create the `coursera_identity_mappings` row binding the new user
 *          to the Coursera externalId/email
 *
 * ──────────────────────────────────────────────────────────────────────
 *  FERPA / consent caveat
 *  ----------------------
 *  Coursera roster membership is NOT itself consent for a WAP account.
 *  This endpoint is admin-only and intended for the case where the admin
 *  has out-of-band confirmation (signed enrollment form, partner program
 *  consent, etc.) that the learner wants a WAP account.
 *
 *  Do NOT loop this endpoint over an unfiltered Coursera roster — the
 *  auto-invite-on-join flow is intentionally deferred (see
 *  docs/COURSERA-INVITE-ON-JOIN.md) and must ship with a consent-friendly
 *  invite email and a `coursera_join_invite_log` dedupe table.
 * ──────────────────────────────────────────────────────────────────────
 *
 * Auth gate: super_admin OR admin in the actor's organization.
 */

const bodySchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1).max(200).optional(),
  courseraExternalId: z.string().min(1).max(200),
  programId: z.string().min(1).max(200),
  programSlug: z.string().min(1).max(120).optional(),
});export const POST = withApiGuc(async (request: NextRequest) => {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  
    let actorOrgId: string;
    try {
      actorOrgId = await getActorOrganizationId(user.id);
    } catch (err) {
      captureApiError(err, { route: 'admin/coursera/reconcile/add-to-wap' });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  
    const superAdmin = await isSuperAdmin(user.id);
    if (!superAdmin && !(await isAdminInOrg(user.id, actorOrgId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  
    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'Validation failed' },
        { status: 400 },
      );
    }
  
    const email = parsed.data.email.trim().toLowerCase();
    const fullName = parsed.data.fullName?.trim() || email;
    const courseraExternalId = parsed.data.courseraExternalId.trim();
    const programId = parsed.data.programId.trim();
    const requestedProgramSlug = parsed.data.programSlug?.trim() || null;
    const requestedProgram = requestedProgramSlug
      ? getProgramBySlug(requestedProgramSlug)
      : null;
    if (requestedProgramSlug && !requestedProgram) {
      return NextResponse.json({ error: 'Invalid program' }, { status: 400 });
    }
    const programSlug = requestedProgram?.slug ?? null;
    if (isCurriculumMigrationPending(programSlug)) {
      return NextResponse.json(
        {
          error: CURRICULUM_MIGRATION_PENDING_MESSAGE,
          code: CURRICULUM_MIGRATION_PENDING_CODE,
        },
        { status: 409 },
      );
    }
  
    // Step 1: verify the learner is in Coursera's roster.
    // We intentionally drain the full roster (rather than hit a per-user
    // Coursera endpoint) so the verification matches exactly what
    // /reconcile sees — same source of truth, no race window.
    let courseraMatch:
      | { externalId?: string; id?: string; email?: string; fullName?: string }
      | null = null;
    try {
      const roster = await listAllUsers({ pageLimit: 1000 });
      courseraMatch =
        roster.elements.find((u) => (u.email ?? '').trim().toLowerCase() === email) ?? null;
    } catch (err) {
      captureApiError(err, { route: 'admin/coursera/reconcile/add-to-wap' });
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? `Coursera roster fetch failed: ${err.message}`
              : 'Coursera roster fetch failed',
        },
        { status: 502 },
      );
    }
  
    if (!courseraMatch) {
      return NextResponse.json(
        {
          error:
            'This email is not in the Coursera roster. Refusing to create a WAP account that has no Coursera presence.',
        },
        { status: 400 },
      );
    }
  
    // Defensive: if the request's externalId disagrees with what Coursera
    // sees today, prefer Coursera's value but flag it for the caller.
    const externalIdToUse =
      (courseraMatch.externalId ?? courseraMatch.id ?? courseraExternalId) || courseraExternalId;
  
    // Step 2: create (or detect existing) Supabase auth user. Invite first —
    // it sends the set-password email so the learner can actually log in.
    // Fall back to createUser + password-reset email (same pattern as
    // /api/admin/members/create).
    let supabaseUserId: string;
    let createdSupabaseUser = false;
    try {
      const supabase = getSupabaseAdmin();
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.workforceap.org';

      const inviteResult = await supabase.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${siteUrl}/dashboard`,
        data: { full_name: fullName, source: 'coursera-reconcile' },
      });
      const { data: inviteData, error: inviteError } = inviteResult;

      if (!inviteError && inviteData.user) {
        supabaseUserId = inviteData.user.id;
        createdSupabaseUser = true;
        await stampNewInviteProvisionIntent(supabase, inviteResult, {
          role: 'member', organizationId: actorOrgId, source: 'coursera_reconcile',
        });
      } else if (
        inviteError?.message?.toLowerCase().includes('already') ||
        inviteError?.message?.toLowerCase().includes('registered') ||
        inviteError?.message?.toLowerCase().includes('exists') ||
        inviteError?.code === 'user_already_exists'
      ) {
        // Surface as a 400 with a clear message so the UI can move on.
        return NextResponse.json(
          {
            error:
              'A Supabase auth user with this email already exists. Use the existing account or contact support.',
          },
          { status: 400 },
        );
      } else {
        const { data, error } = await supabase.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { full_name: fullName, source: 'coursera-reconcile' },
          app_metadata: provisionIntentAppMetadata({
            role: 'member', organizationId: actorOrgId, source: 'coursera_reconcile',
          }),
        });

        if (error) {
          const msg = error.message?.toLowerCase() ?? '';
          if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
            return NextResponse.json(
              {
                error:
                  'A Supabase auth user with this email already exists. Use the existing account or contact support.',
              },
              { status: 400 },
            );
          }
          captureApiError(error, { route: 'admin/coursera/reconcile/add-to-wap' });
          return NextResponse.json({ error: error.message }, { status: 400 });
        }

        if (!data.user) {
          return NextResponse.json({ error: 'Supabase auth user creation returned no user' }, { status: 500 });
        }
        supabaseUserId = data.user.id;
        createdSupabaseUser = true;

        // Invite email didn't go out on this path — send a set-password link
        // so the account isn't created silently with no way to log in.
        await sendPasswordResetEmail(email, '/reset-password', { orgId: actorOrgId }).catch((err) => {
          captureApiError(err, {
            route: 'admin/coursera/reconcile/add-to-wap',
            extra: { stage: 'set-password-email', email },
          });
        });
      }
    } catch (err) {
      captureApiError(err, { route: 'admin/coursera/reconcile/add-to-wap' });
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Supabase auth user creation failed' },
        { status: 500 },
      );
    }
  
    // Step 3: create the WAP rows in a transaction. If anything in here
    // fails, attempt to roll back the Supabase auth user we just created
    // (best-effort — Supabase has no native txn).
    //
    // We can't use the `withTenantScope` proxy here because Prisma transactions
    // strip the `$transaction` method off the scoped client (see
    // `lib/tenant/withTenantScope.ts`). Instead, we wrap the raw `$transaction`
    // in `crossTenantOK` and pin the org id into every write's `data` payload.
    // The actorOrgId variable is sourced from `getActorOrganizationId(user.id)`
    // above, so the writes still respect the actor's tenant.
    try {
      const result = await crossTenantOK(() =>
        prisma.$transaction(async (tx) => {
          await lockCourseraIdentityForAttachment(tx, {
            organizationId: actorOrgId,
            courseraEmail: email,
            actorIdentifier: externalIdToUse,
            actorHomePage: 'coursera.org',
          });
          const enrolledAt = new Date();
          const createdUser = await tx.user.create({
            data: {
              id: supabaseUserId,
              organizationId: actorOrgId,
              email,
              fullName,
              enrolledProgram: programSlug,
              enrolledAt: programSlug ? enrolledAt : null,
            },
            select: { id: true, email: true, fullName: true },
          });
  
          await tx.profile.create({
            data: {
              userId: createdUser.id,
              role: 'member',
            },
          });
  
          let enrollmentId: string | null = null;
          if (programSlug) {
            // Inside crossTenantOK( ... ) above; orgId pinned to the actor's
            // tenant via `actorOrgId`. withTenantScope cannot wrap a Prisma
            // $transaction directly (the proxy strips $transaction).
            // Multi-program: this is the user's first row, mark it primary
            // so /dashboard/training and the xAPI pipeline (via
            // User.enrolledProgram) credit progress against it.
            const newEnrollment = await upsertEquivalentCourseEnrollment(tx, {
              userId: createdUser.id,
              programSlug,
              create: {
                organizationId: actorOrgId,
                // Provider-discovered historical learners fail closed until
                // their exact Coursera collection can prove a v2 assignment.
                curriculumVersion: LEGACY_CURRICULUM_VERSION,
                isPrimary: true,
                enrolledAt,
                enrolledByAdminId: user.id,
              },
              update: {
                isPrimary: true,
                enrolledAt,
                enrolledByAdminId: user.id,
              },
            });
            enrollmentId = newEnrollment.id;
          }

          await mapCourseraIdentityAndProgressInTransaction(
            {
              userId: createdUser.id,
              organizationId: actorOrgId,
              courseraEmail: email,
              actorIdentifier: externalIdToUse,
              actorHomePage: 'coursera.org',
              createdByUserId: user.id,
              source: 'coursera-reconcile-add-to-wap',
              notes: `Added via Coursera reconcile UI. Coursera programId=${programId}.`,
            },
            tx,
          );

          return { ...createdUser, enrollmentId };
        }),
      );

      // Ownership is already committed with the mapping above. Canonical
      // projection is monotonic, tenant-scoped, and retryable, so it runs
      // post-commit without replaying historical xAPI side effects.
      await promoteCsvProgressToCanonical({
        organizationId: actorOrgId,
        userId: result.id,
        courseraEmail: email,
      });

      // Sprint R3 — fire-and-forget kickoff email (idempotent per enrollment row).
      if (result.enrollmentId && programSlug) {
        maybeSendCourseKickoffEmail({
          userId: result.id,
          enrollmentId: result.enrollmentId,
          programSlug,
          email: result.email,
          fullName: result.fullName,
        }).catch(() => { /* already logged inside */ });
      }

      void auditLog({ actorUserId: user.id, action: 'admin_coursera_reconcile_add_to_wap', targetType: 'User', targetId: result.id, metadata: {} }).catch(() => {});
      logAuditEvent({ user: { id: user.id, role: 'admin' }, verb: 'created', object: { type: 'CourseraReconcileWapUser', id: result.id }, result: { success: true } }).catch(() => {});
      return NextResponse.json({
        ok: true,
        userId: result.id,
        supabaseUserId,
        email: result.email,
      });
    } catch (err) {
      captureApiError(err, { route: 'admin/coursera/reconcile/add-to-wap' });
  
      // Best-effort rollback of the Supabase auth user so we don't leak
      // an orphaned auth account on partial failure.
      if (createdSupabaseUser) {
        try {
          const supabase = getSupabaseAdmin();
          await supabase.auth.admin.deleteUser(supabaseUserId);
        } catch (rollbackErr) {
          captureApiError(rollbackErr, {
            route: 'admin/coursera/reconcile/add-to-wap',
            extra: { stage: 'rollback-supabase-user', supabaseUserId },
          });
        }
      }
  
      return NextResponse.json(
        {
          error: err instanceof Error ? err.message : 'Failed to create WAP user',
        },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error('/admin/coursera/reconcile/add-to-wap:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
