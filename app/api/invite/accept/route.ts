import { after, NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { readJsonObjectBody } from '@/lib/api/readJsonBody';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendInvitationAcceptedEmail } from '@/lib/email';
import { getDefaultOrganizationId } from '@/lib/tenant/organization';
import { tryResolveOrgFromRequest } from '@/lib/tenant/resolveOrgFromRequest';
import {
  buildInviteAcceptExistingUserUpdate,
  chooseInviteAcceptOrganizationId,
} from '@/lib/invitations/resolveInviteAcceptOrg';
import { invitationRoleLabel, inviteAcceptLoginRedirect } from '@/lib/invitations/inviteRoleLabels';
import { checkInviteAcceptRateLimit } from '@/lib/rate-limit';
import { getClientIpFromRequest } from '@/lib/http/clientIp';
import { findSupabaseAuthUserByEmail } from '@/lib/auth/supabaseAdminUsers';
import { stampCreatedAuthUserProvisionIntent } from '@/lib/auth/provisionIntent';
import { Prisma, type InvitationRole } from '@prisma/client';
import {
  claimPendingInvitationForAccept,
  InvitationClaimError,
} from './_invitationClaim';
import {
  CURRICULUM_MIGRATION_PENDING_CODE,
  CURRICULUM_MIGRATION_PENDING_MESSAGE,
  isCurriculumMigrationPending,
} from '@/lib/content/programs';
import { activeCurriculumVersion } from '@/lib/member/curriculumAssignment';
import { canonicalizeProgramSlug, programSlugsEquivalent } from '@/lib/content/programSlug';
import { upsertEquivalentCourseEnrollment } from '@/lib/member/courseEnrollmentAssignment';

import { withApiGuc } from '@/lib/db/withRequestGuc';

type InviteTx = Prisma.TransactionClient;
type AuthCreateResult = Awaited<ReturnType<ReturnType<typeof getSupabaseAdmin>['auth']['admin']['createUser']>>;
type AcceptInvitation = {
  id: string;
  email: string;
  role: InvitationRole;
  invitedById: string;
  subgroupId: string | null;
  partnerId: string | null;
  counselorAffiliation: string | null;
  programSlug: string | null;
  status: string;
  expiresAt: Date;
};

function profileRoleForInvitation(role: string): string {
  return role === 'member' ? 'member' : role === 'counselor' ? 'counselor' : role;
}

async function ensureProfileRow(
  tx: InviteTx,
  userId: string,
  data: {
    role: string;
    profilePhone?: string | null;
    consentTerms?: boolean;
    consentCommunications?: boolean;
  }
) {
  // Some deployed DBs are missing Prisma's non-PK unique indexes (for example
  // profiles.user_id), so avoid upsert({ where: { userId } }) here.
  const existing = await tx.profile.findFirst({
    where: { userId },
    select: { id: true },
  });

  if (existing) {
    return tx.profile.update({
      where: { id: existing.id },
      data: {
        role: data.role,
        profilePhone: data.profilePhone ?? undefined,
      },
    });
  }

  return tx.profile.create({
    data: {
      userId,
      role: data.role,
      profilePhone: data.profilePhone ?? undefined,
      consentTerms: data.consentTerms ?? false,
      consentCommunications: data.consentCommunications ?? false,
    },
  });
}

async function ensurePartnerUserLink(tx: InviteTx, userId: string, partnerId: string) {
  const existing = await tx.partnerUser.findFirst({
    where: { userId },
    select: { id: true, partnerId: true },
  });

  if (existing) {
    if (existing.partnerId !== partnerId) {
      await tx.partnerUser.update({
        where: { id: existing.id },
        data: { partnerId },
      });
    }
    return;
  }

  await tx.partnerUser.create({
    data: { partnerId, userId },
  });
}

async function ensureMemberSubgroupLink(
  tx: InviteTx,
  memberId: string,
  subgroupId: string,
  assignedBy: string
) {
  const existing = await tx.memberSubgroup.findFirst({
    where: { memberId, subgroupId },
    select: { id: true },
  });

  if (existing) return;

  await tx.memberSubgroup.create({
    data: {
      memberId,
      subgroupId,
      assignedBy,
      assignmentType: 'manual_admin',
    },
  });
}

async function findRoleByName(tx: InviteTx, name: string) {
  return tx.role.findFirst({ where: { name } });
}

async function loadInviterForNotification(invitedById: string) {
  try {
    return await prisma.$transaction((tx) => tx.user.findFirst({
      where: { id: invitedById },
      select: { fullName: true, email: true },
    }));
  } catch (err) {
    inviteAcceptLog('notify:inviter_lookup_failed', { err });
    return null;
  }
}

/** Debug breadcrumbs for preview/Vercel logs (no PII). */
function inviteAcceptLog(
  step: string,
  data: { invitationId?: string; err?: unknown }
) {
  const err = data.err;
  const extra =
    err && typeof err === 'object' && 'code' in err
      ? { prismaCode: (err as { code?: string }).code }
      : {};
  console.error('[invite-accept]', step, {
    invitationId: data.invitationId,
    ...extra,
  });
}

async function ensureAppUserForInvite(
  tx: InviteTx,
  authUserId: string,
  data: {
    organizationId: string;
    email: string;
    fullName: string;
    phone: string | null;
    enrolledProgram: string | null;
    enrolledAt: Date | null;
  }
): Promise<string> {
  // Live DB may lack users.email unique index; avoid upsert which assumes schema constraints.
  const byId = await tx.user.findFirst({
    where: { id: authUserId },
    select: { id: true, organizationId: true },
  });
  if (byId) {
    // Existing invitees keep their tenant. Never stamp organizationId here.
    await tx.user.update({
      where: { id: authUserId },
      data: buildInviteAcceptExistingUserUpdate({
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        enrolledProgram: data.enrolledProgram,
        enrolledAt: data.enrolledAt,
      }),
      select: { id: true },
    });
    return byId.organizationId;
  }

  const byEmail = await tx.user.findFirst({
    where: { email: data.email },
    select: { id: true },
  });
  if (byEmail) {
    throw new Error(
      'INVITE_ACCEPT_EMAIL_USER_ID_MISMATCH: public.users has this email on a different id than Supabase auth'
    );
  }

  await tx.user.create({
    data: {
      id: authUserId,
      organizationId: data.organizationId,
      email: data.email,
      fullName: data.fullName,
      phone: data.phone,
      enrolledProgram: data.enrolledProgram,
      enrolledAt: data.enrolledAt,
    },
    select: { id: true },
  });
  return data.organizationId;
}

/**
 * INVARIANT: CourseEnrollment must stay in sync with User.enrolledProgram.
 * Called inside invite-accept transactions when the invitation assigns a program.
 */
async function ensureCourseEnrollmentForInvite(
  tx: InviteTx,
  userId: string,
  organizationId: string,
  programSlug: string,
  adminId?: string | null,
  preserveLegacyAssignment = false,
) {
  const canonicalProgramSlug = canonicalizeProgramSlug(programSlug);
  // Multi-program: invite-accept creates the invited user's first row,
  // mark it primary. Composite-keyed upsert prevents duplicate
  // (userId, programSlug) rows on retry.
  await upsertEquivalentCourseEnrollment(tx, {
    userId,
    programSlug: canonicalProgramSlug,
    preserveLegacyAssignment,
    create: {
      organizationId,
      curriculumVersion: activeCurriculumVersion(canonicalProgramSlug),
      isPrimary: true,
      enrolledAt: new Date(),
      enrolledByAdminId: adminId ?? null,
    },
    update: {
      isPrimary: true,
      enrolledAt: new Date(),
      enrolledByAdminId: adminId ?? null,
    },
  });
}

type CounselorAffiliationValue = 'wap_staff' | 'partner' | 'independent' | 'community_ambassador';

function resolveCounselorAffiliation(
  requested: string | null,
  partnerId: string | null,
): CounselorAffiliationValue {
  if (
    requested === 'wap_staff' ||
    requested === 'partner' ||
    requested === 'independent' ||
    requested === 'community_ambassador'
  ) {
    return requested;
  }
  // Legacy invites (no affiliation stored): derive from partner linkage. The DB
  // column defaults to 'wap_staff', which silently misclassifies
  // partner-invited counselors when nothing sets it explicitly.
  return partnerId ? 'partner' : 'wap_staff';
}

async function ensureCounselorRow(
  tx: InviteTx,
  userId: string,
  partnerId: string | null,
  requestedAffiliation: string | null = null,
) {
  const affiliation = resolveCounselorAffiliation(requestedAffiliation, partnerId);

  const existing = await tx.counselor.findFirst({
    where: { userId },
    select: { id: true, partnerId: true, active: true, affiliation: true },
  });

  if (existing) {
    if (
      existing.partnerId !== partnerId ||
      !existing.active ||
      existing.affiliation !== affiliation
    ) {
      await tx.counselor.update({
        where: { id: existing.id },
        data: {
          partnerId,
          affiliation,
          active: true,
        },
      });
    }
    return;
  }

  await tx.counselor.create({
    data: {
      userId,
      partnerId,
      affiliation,
      active: true,
    },
  });
}export const POST = withApiGuc(async (request: NextRequest) => {
  try {
    const ip = getClientIpFromRequest(request);
    const { success: withinLimit } = await checkInviteAcceptRateLimit(ip);
    if (!withinLimit) {
      return NextResponse.json({ error: 'Too many attempts. Please try again in an hour.' }, { status: 429 });
    }
  
    const o = await readJsonObjectBody(request);
    if (!o) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
  
    const token = typeof o.token === 'string' ? o.token.trim() : '';
    const fullName = typeof o.fullName === 'string' ? o.fullName.trim() : '';
    const phone = typeof o.phone === 'string' ? o.phone.trim() || null : null;
    const password = typeof o.password === 'string' ? o.password : '';
  
    if (!token || token.length < 32) {
      return NextResponse.json({ error: 'Invalid or missing token' }, { status: 400 });
    }
  
    try {
      const invitation = await prisma.$transaction((tx) => tx.invitation.findFirst({
        where: { token },
        select: {
          id: true,
          email: true,
          role: true,
          invitedById: true,
          subgroupId: true,
          partnerId: true,
          counselorAffiliation: true,
          programSlug: true,
          status: true,
          expiresAt: true,
        },
      }));
  
      if (!invitation) {
        return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
      }
  
      if (invitation.status !== 'pending') {
        return NextResponse.json(
          { error: invitation.status === 'accepted' ? 'Already accepted' : 'Invitation no longer valid' },
          { status: 400 }
        );
      }
  
      if (new Date() > invitation.expiresAt) {
        await prisma.$transaction((tx) => tx.invitation.update({
          where: { id: invitation.id },
          data: { status: 'expired' },
        }));
        return NextResponse.json({ error: 'Invitation has expired' }, { status: 400 });
      }
      if (
        invitation.role === 'member'
        && isCurriculumMigrationPending(invitation.programSlug)
      ) {
        return NextResponse.json(
          {
            error: CURRICULUM_MIGRATION_PENDING_MESSAGE,
            code: CURRICULUM_MIGRATION_PENDING_CODE,
          },
          { status: 409 },
        );
      }
  
      // Match admin invite storage (lowercased) and avoid an unnecessary user_roles/roles join:
      // accept flow does not read userRoles; a broken roles join would 500 both branches here.
      const inviteEmail = String(invitation.email).trim().toLowerCase();
      const existingUser = await prisma.$transaction((tx) => tx.user.findFirst({
        where: { email: inviteEmail },
        select: { id: true, fullName: true, email: true, enrolledProgram: true },
      }));
  
      if (existingUser) {
        if (!fullName) {
          return NextResponse.json({ error: 'Name is required' }, { status: 400 });
        }
        return await acceptExistingUser(existingUser, invitation, fullName, request);
      }
  
      if (!fullName || !password || password.length < 8) {
        return NextResponse.json(
          { error: 'Name and password (min 8 chars) are required for new accounts' },
          { status: 400 }
        );
      }
  
      inviteAcceptLog('route:before_createNewUser', { invitationId: invitation.id });
      return await createNewUserAndAccept(invitation, fullName, phone, password, request);
    } catch (e) {
      inviteAcceptLog('route:outer_catch', { err: e });
      console.error('[api/invite/accept]', e);
      return NextResponse.json(
        { error: 'Something went wrong accepting this invitation. Please try again.' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('/invite/accept:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

async function acceptExistingUser(
  user: { id: string; fullName: string; email: string; enrolledProgram: string | null },
  invitation: AcceptInvitation,
  fullName: string,
  _request: NextRequest
) {
  const invitationId = invitation.id;
  let txStep = 'start';
  try {
    await prisma.$transaction(async (tx) => {
      txStep = 'claim_invitation_existing';
      await claimPendingInvitationForAccept(tx, invitation.id, user.id);

      txStep = 'update_existing_user';
      await tx.user.update({
        where: { id: user.id },
        data: buildInviteAcceptExistingUserUpdate({
          fullName: fullName || user.fullName,
        }),
        select: { id: true },
      });

      // Ensure the user has a profile row (may be missing for older/imported accounts)
      txStep = 'ensure_existing_profile';
      await ensureProfileRow(tx, user.id, {
        role: profileRoleForInvitation(invitation.role),
        consentTerms: false,
        consentCommunications: false,
      });

      if (invitation.role === 'admin') {
        txStep = 'find_admin_role_existing';
        const adminRole = await findRoleByName(tx, 'admin');
        if (adminRole) {
          txStep = 'ensure_admin_role_existing';
          await tx.userRole.upsert({
            where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
            create: { userId: user.id, roleId: adminRole.id },
            update: {},
          });
        }
      }

      if (invitation.role === 'partner' && invitation.subgroupId) {
        txStep = 'load_partner_subgroup_existing';
        const partner = await tx.subgroup.findUnique({
          where: { id: invitation.subgroupId },
          select: { partnerId: true },
        });
        if (partner?.partnerId) {
          txStep = 'ensure_partner_user_existing';
          await ensurePartnerUserLink(tx, user.id, partner.partnerId);
        }
        txStep = 'ensure_member_subgroup_existing';
        await ensureMemberSubgroupLink(tx, user.id, invitation.subgroupId, invitation.invitedById);
      }

      if (invitation.role === 'member' && invitation.programSlug) {
        txStep = 'update_member_program_existing';
        await tx.user.update({
          where: { id: user.id },
          data: {
            enrolledProgram: canonicalizeProgramSlug(invitation.programSlug),
            enrolledAt: new Date(),
            programChangedAt: new Date(),
          },
          select: { id: true },
        });
        txStep = 'sync_course_enrollment_existing';
        const existingUserOrg = await tx.user.findUnique({
          where: { id: user.id },
          select: { organizationId: true },
        });
        if (existingUserOrg) {
          await ensureCourseEnrollmentForInvite(
            tx,
            user.id,
            existingUserOrg.organizationId,
            invitation.programSlug,
            invitation.invitedById,
            Boolean(
              user.enrolledProgram
              && programSlugsEquivalent(user.enrolledProgram, invitation.programSlug),
            ),
          );
        }
      }

      if (invitation.role === 'counselor') {
        txStep = 'find_counselor_role_existing';
        const counselorRoleRow = await findRoleByName(tx, 'counselor');
        if (counselorRoleRow) {
          txStep = 'ensure_counselor_role_existing';
          await tx.userRole.upsert({
            where: { userId_roleId: { userId: user.id, roleId: counselorRoleRow.id } },
            create: { userId: user.id, roleId: counselorRoleRow.id },
            update: {},
          });
        }
        txStep = 'ensure_counselor_row_existing';
        await ensureCounselorRow(tx, user.id, invitation.partnerId ?? null, invitation.counselorAffiliation);
      }

    });
  } catch (dbError) {
    if (dbError instanceof InvitationClaimError) {
      return NextResponse.json({ error: 'Invitation no longer valid' }, { status: 400 });
    }
    console.error('[acceptExistingUser] transaction failed:', dbError);
    return NextResponse.json(
      { error: 'Failed to update your account with the new role. Please try again.' },
      { status: 500 }
    );
  }

  const roleLabel = invitationRoleLabel(invitation.role);
  const inviter = await loadInviterForNotification(invitation.invitedById);

  if (inviter?.email) {
    after(() =>
      sendInvitationAcceptedEmail({
        to: inviter.email,
        accepterName: fullName || user.fullName,
        accepterEmail: user.email,
        role: roleLabel,
      }).catch((err) => console.error('Invitation accepted email failed:', err))
    );
  }

  return NextResponse.json({
    ok: true,
    message: 'Invitation accepted. You can now log in.',
    redirectTo: inviteAcceptLoginRedirect(invitation.role),
  });
}

async function createNewUserAndAccept(
  invitation: AcceptInvitation,
  fullName: string,
  phone: string | null,
  password: string,
  request: NextRequest
) {
  const inviteEmail = String(invitation.email).trim().toLowerCase();

  let supabase: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabase = getSupabaseAdmin();
  } catch (err) {
    console.error('[createNewUserAndAccept] Supabase admin client unavailable:', err);
    return NextResponse.json(
      {
        error:
          'Account signup is temporarily unavailable. If this continues, contact support.',
      },
      { status: 503 }
    );
  }

  let authCreateResult: AuthCreateResult;
  try {
    authCreateResult = await supabase.auth.admin.createUser({
      email: inviteEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, phone },
    });
  } catch (err) {
    inviteAcceptLog('supabase:create_user_threw', { invitationId: invitation.id, err });
    console.error('[createNewUserAndAccept] createUser threw:', err);
    return NextResponse.json(
      {
        error: 'Something went wrong accepting this invitation. Please try again.',
        debugStep: 'create_auth_user',
      },
      { status: 500 }
    );
  }

  const { data: authData, error: authError } = authCreateResult;

  if (authError) {
    if (authError.message.includes('already') || authError.code === 'user_already_exists') {
      // Check if a DB record exists for this email
      const existing = await prisma.$transaction((tx) => tx.user.findFirst({
        where: { email: inviteEmail },
        select: { id: true, fullName: true, email: true, enrolledProgram: true },
      }));
      if (existing) {
        return acceptExistingUser(existing, invitation, fullName, request);
      }
      // Orphaned Supabase auth user (previous attempt created auth but DB tx failed).
      // Look up the existing auth user and continue with DB record creation.
      const orphanedAuthUser = await findSupabaseAuthUserByEmail(supabase, inviteEmail, {
        perPage: 200,
        maxPages: 25,
      });
      if (orphanedAuthUser) {
        // Update password in case it changed between attempts
        if (password) {
          await supabase.auth.admin.updateUserById(orphanedAuthUser.id, { password });
        }
        return finishNewUserDbSetup(orphanedAuthUser.id, invitation, fullName, phone, request);
      }
    }
    return NextResponse.json(
      { error: authError.message },
      { status: 400 }
    );
  }

  const authUser = authData.user;
  if (!authUser) {
    return NextResponse.json({ error: 'Account creation failed' }, { status: 500 });
  }

  inviteAcceptLog('supabase:user_created', { invitationId: invitation.id });
  return finishNewUserDbSetup(authUser.id, invitation, fullName, phone, request, authCreateResult);
}

async function finishNewUserDbSetup(
  authUserId: string,
  invitation: AcceptInvitation,
  fullName: string,
  phone: string | null,
  request: NextRequest,
  createdAuthResult?: AuthCreateResult,
) {
  // Inviter org first, then request host / x-wap-org-id, default last.
  // Multi-tenant invites were broken when every accept landed in the
  // default org (AUDIT §C-T2). Existing user rows never get restamped.
  let organizationId: string;
  try {
    const inviter = await prisma.$transaction((tx) => tx.user.findUnique({
      where: { id: invitation.invitedById },
      select: { organizationId: true },
    }));
    const requestOrganizationId = inviter?.organizationId
      ? null
      : await tryResolveOrgFromRequest(request.headers);
    const chosen = chooseInviteAcceptOrganizationId(
      inviter?.organizationId,
      requestOrganizationId,
      '',
    );
    organizationId = chosen || await getDefaultOrganizationId();
  } catch (err) {
    console.error('[finishNewUserDbSetup] organization resolution failed:', err);
    return NextResponse.json(
      {
        error:
          'Server configuration error: could not resolve inviting organization. Please contact support.',
      },
      { status: 500 }
    );
  }

  // The duplicate-auth retry above passes no createdAuthResult, so its existing
  // identity and app metadata are never restamped from this invitation.
  if (createdAuthResult) {
    await stampCreatedAuthUserProvisionIntent(getSupabaseAdmin(), createdAuthResult, {
      role: invitation.role,
      organizationId,
      source: 'invitation_accept',
    });
  }

  const invitationId = invitation.id;
  let txStep = 'start';
  try {
    await prisma.$transaction(async (tx) => {
      inviteAcceptLog('tx:start', { invitationId });

      txStep = 'claim_invitation';
      await claimPendingInvitationForAccept(tx, invitation.id, authUserId);

      txStep = 'find_member_role';
      let memberRole = await findRoleByName(tx, 'member');
      if (!memberRole) {
        txStep = 'create_member_role';
        inviteAcceptLog('tx:role_member_create', { invitationId });
        memberRole = await tx.role.create({ data: { name: 'member' } });
      }

      const inviteEmailNorm = String(invitation.email).trim().toLowerCase();
      txStep = 'ensure_app_user';
      inviteAcceptLog('tx:ensure_app_user', { invitationId });
      const stampedOrganizationId = await ensureAppUserForInvite(tx, authUserId, {
        organizationId,
        email: inviteEmailNorm,
        fullName,
        phone,
        enrolledProgram:
          invitation.role === 'member' && invitation.programSlug
            ? canonicalizeProgramSlug(invitation.programSlug)
            : null,
        enrolledAt: invitation.role === 'member' ? new Date() : null,
      });

      if (invitation.role === 'member' && invitation.programSlug) {
        txStep = 'sync_course_enrollment_new';
        await ensureCourseEnrollmentForInvite(
          tx, authUserId, stampedOrganizationId, invitation.programSlug, invitation.invitedById
        );
      }

      if (invitation.role !== 'counselor') {
        txStep = 'ensure_member_role';
        inviteAcceptLog('tx:user_role_member_upsert', { invitationId });
        await tx.userRole.upsert({
          where: { userId_roleId: { userId: authUserId, roleId: memberRole.id } },
          create: { userId: authUserId, roleId: memberRole.id },
          update: {},
        });
      }

      txStep = 'ensure_profile';
      inviteAcceptLog('tx:ensure_profile', { invitationId });
      await ensureProfileRow(tx, authUserId, {
        role: profileRoleForInvitation(invitation.role),
        profilePhone: phone,
      });

      if (invitation.role === 'admin') {
        txStep = 'find_admin_role';
        const adminRole = await findRoleByName(tx, 'admin');
        if (adminRole) {
          txStep = 'ensure_admin_role';
          inviteAcceptLog('tx:user_role_admin_upsert', { invitationId });
          await tx.userRole.upsert({
            where: { userId_roleId: { userId: authUserId, roleId: adminRole.id } },
            create: { userId: authUserId, roleId: adminRole.id },
            update: {},
          });
        }
      }

      if (invitation.role === 'partner' && invitation.subgroupId) {
        txStep = 'load_partner_subgroup';
        inviteAcceptLog('tx:partner_subgroup', { invitationId });
        const subgroup = await tx.subgroup.findUnique({
          where: { id: invitation.subgroupId },
          select: { partnerId: true },
        });
        if (subgroup?.partnerId) {
          txStep = 'ensure_partner_user';
          await ensurePartnerUserLink(tx, authUserId, subgroup.partnerId);
        }
        txStep = 'ensure_member_subgroup';
        await ensureMemberSubgroupLink(tx, authUserId, invitation.subgroupId, invitation.invitedById);
      }

      if (invitation.role === 'counselor') {
        txStep = 'find_counselor_role';
        const counselorRoleRow = await findRoleByName(tx, 'counselor');
        if (counselorRoleRow) {
          txStep = 'ensure_counselor_role';
          inviteAcceptLog('tx:user_role_counselor_upsert', { invitationId });
          await tx.userRole.upsert({
            where: { userId_roleId: { userId: authUserId, roleId: counselorRoleRow.id } },
            create: { userId: authUserId, roleId: counselorRoleRow.id },
            update: {},
          });
        }
        txStep = 'ensure_counselor_row';
        inviteAcceptLog('tx:ensure_counselor', { invitationId });
        await ensureCounselorRow(tx, authUserId, invitation.partnerId ?? null, invitation.counselorAffiliation);
      }

    });
  } catch (dbError) {
    if (dbError instanceof InvitationClaimError) {
      return NextResponse.json({ error: 'Invitation no longer valid' }, { status: 400 });
    }
    inviteAcceptLog('tx:failed', { invitationId, err: dbError });
    console.error('[finishNewUserDbSetup] transaction failed:', dbError);
    return NextResponse.json(
      { error: 'Failed to complete signup. Please try again.' },
      { status: 500 }
    );
  }

  const roleLabel = invitationRoleLabel(invitation.role);
  const inviter = await loadInviterForNotification(invitation.invitedById);

  if (inviter?.email) {
    after(() =>
      sendInvitationAcceptedEmail({
        to: inviter.email,
        accepterName: fullName,
        accepterEmail: invitation.email,
        role: roleLabel,
      }).catch((err) => console.error('Invitation accepted email failed:', err))
    );
  }

  return NextResponse.json({
    ok: true,
    message: 'Account created. You can now log in.',
    redirectTo: inviteAcceptLoginRedirect(invitation.role),
  });
}
