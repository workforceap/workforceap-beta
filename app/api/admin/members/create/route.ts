import { NextResponse, after } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  CURRICULUM_MIGRATION_PENDING_CODE,
  CURRICULUM_MIGRATION_PENDING_MESSAGE,
  getProgramBySlug,
} from '@/lib/content/programs';
import { ADMIN_REFERRAL_SOURCE_ACCEPTED_VALUES } from '@/lib/referralSources';
import { sendPartnerMilestoneEmail } from '@/lib/notifications/partner-notify';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { trackEvent } from '@/lib/events/track';
import { sendPasswordResetEmail } from '@/lib/auth/passwordReset';
import { provisionIntentAppMetadata } from '@/lib/auth/provisionIntent';
import { maybeSendCourseKickoffEmail } from '@/lib/coursera/courseKickoff';
import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';
import { activeCurriculumVersion } from '@/lib/member/curriculumAssignment';
import { upsertEquivalentCourseEnrollment } from '@/lib/member/courseEnrollmentAssignment';
import { canonicalizeProgramSlug } from '@/lib/content/programSlug';

import { withApiGuc } from '@/lib/db/withRequestGuc';

const EMPLOYMENT_OPTIONS = ['Unemployed', 'Underemployed', 'Employed', 'Self-Employed'];
const VETERAN_OPTIONS = ['Not a Veteran', 'Veteran', 'Disabled Veteran'];
const INCOME_OPTIONS = ['Under $20K', '$20K–$40K', '$40K–$60K', 'Over $60K'];
const EDUCATION_OPTIONS = ['Less than HS', 'HS Diploma or GED', 'Some College', "Associate's", "Bachelor's", 'Graduate'];
const REFERRAL_OPTIONS: string[] = [...ADMIN_REFERRAL_SOURCE_ACCEPTED_VALUES];
const ETHNICITY_OPTIONS = [
  'Hispanic/Latino',
  'White',
  'Black or African American',
  'Asian',
  'American Indian or Alaska Native',
  'Native Hawaiian or Pacific Islander',
  'Two or More Races',
];export const POST = withApiGuc(async (request: Request) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id)))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
  
    const o = body as Record<string, unknown>;
  
    const firstName = typeof o.firstName === 'string' ? o.firstName.trim() : '';
    const lastName = typeof o.lastName === 'string' ? o.lastName.trim() : '';
    const email = typeof o.email === 'string' ? o.email.toLowerCase().trim() : '';
    const phone = typeof o.phone === 'string' ? o.phone.trim() : '';
    const address = typeof o.address === 'string' ? o.address.trim() : undefined;
    const dob = typeof o.dob === 'string' ? o.dob.trim() || undefined : undefined;
    const employmentStatus = typeof o.employmentStatus === 'string' && EMPLOYMENT_OPTIONS.includes(o.employmentStatus) ? o.employmentStatus : undefined;
    const veteranStatus = typeof o.veteranStatus === 'string' && VETERAN_OPTIONS.includes(o.veteranStatus) ? o.veteranStatus : undefined;
    const householdIncome = typeof o.householdIncome === 'string' && INCOME_OPTIONS.includes(o.householdIncome) ? o.householdIncome : undefined;
    const educationLevel = typeof o.educationLevel === 'string' && EDUCATION_OPTIONS.includes(o.educationLevel) ? o.educationLevel : undefined;
    const referralSource = typeof o.referralSource === 'string' && REFERRAL_OPTIONS.includes(o.referralSource) ? o.referralSource : undefined;
    const notes = typeof o.notes === 'string' ? o.notes.trim().slice(0, 5000) : undefined;
    const usCitizen = o.usCitizen === true || o.usCitizen === 'true';
    const authorizedToWork = o.authorizedToWork === true || o.authorizedToWork === 'true';
    const hasDisability = o.hasDisability === true || o.hasDisability === 'true';
    const ethnicity = typeof o.ethnicity === 'string' && ETHNICITY_OPTIONS.includes(o.ethnicity) ? o.ethnicity : undefined;
    const programSlug = typeof o.programSlug === 'string'
      ? canonicalizeProgramSlug(o.programSlug)
      : '';
    const programNotes = typeof o.programNotes === 'string' ? o.programNotes.trim() : undefined;
    const partnerId =
      typeof o.partnerId === 'string' && /^[0-9a-f-]{36}$/i.test(o.partnerId.trim()) ? o.partnerId.trim() : undefined;
    const subgroupId =
      typeof o.subgroupId === 'string' && /^[0-9a-f-]{36}$/i.test(o.subgroupId.trim()) ? o.subgroupId.trim() : undefined;
  
    if (!firstName || !email) {
      return NextResponse.json({ error: 'First name and email are required' }, { status: 400 });
    }
    if (!usCitizen || !authorizedToWork) {
      return NextResponse.json({ error: 'US Citizen and Authorized to Work must be Yes' }, { status: 400 });
    }
    if (!programSlug) {
      return NextResponse.json({ error: 'Program selection is required' }, { status: 400 });
    }
    const parsedDob = dob ? new Date(dob) : null;
    if (dob && Number.isNaN(parsedDob?.getTime())) {
      return NextResponse.json({ error: 'Invalid date of birth' }, { status: 400 });
    }
  
    const program = getProgramBySlug(programSlug);
    if (!program) {
      return NextResponse.json({ error: 'Invalid program' }, { status: 400 });
    }
    if (program.curriculumMigrationPending) {
      return NextResponse.json(
        {
          error: CURRICULUM_MIGRATION_PENDING_MESSAGE,
          code: CURRICULUM_MIGRATION_PENDING_CODE,
        },
        { status: 409 },
      );
    }

    // Fetch org early so FK lookups can be tenant-scoped (AUDIT §C-T8).
    const organizationId = await getActorOrganizationId(user.id);

    if (partnerId) {
      const partner = await prisma.$transaction((tx) => tx.partner.findFirst({ where: { id: partnerId, active: true, organizationId } }));
      if (!partner) {
        return NextResponse.json({ error: 'Invalid or inactive partner' }, { status: 400 });
      }
    }
    if (subgroupId) {
      const subgroup = await prisma.$transaction((tx) => tx.subgroup.findFirst({ where: { id: subgroupId, leader: { organizationId } } }));
      if (!subgroup) {
        return NextResponse.json({ error: 'Invalid subgroup' }, { status: 400 });
      }
    }
  
    const fullName = `${firstName} ${lastName}`.trim() || firstName;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.workforceap.org';
  
    const supabase = getSupabaseAdmin();
  
    // Try invite first (sends set-password email). Fall back to createUser if invite not supported.
    let authUser: { id: string; email?: string } | null = null;
    let welcomeEmailSent = false;
  
    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/dashboard`,
      data: { full_name: fullName, phone },
    });
  
    if (!inviteError && inviteData.user) {
      authUser = inviteData.user;
      welcomeEmailSent = true;
    } else if (inviteError?.message?.includes('already') || inviteError?.code === 'user_already_exists') {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 400 });
    } else {
      // Fallback: createUser with temp password (no email)
      const tempPassword = `WfAP${Date.now().toString(36)}!`;
      const { data: createData, error: createError } = await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName, phone },
        app_metadata: provisionIntentAppMetadata({ role: 'member', organizationId, source: 'admin_member_create' }),
      });
      if (createError) {
        if (createError.message.includes('already')) {
          return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 400 });
        }
        console.error('Admin create user error:', createError);
        return NextResponse.json({ error: createError.message }, { status: 400 });
      }
      authUser = createData.user;
      // Optionally trigger password reset so user can set their own.
      // Track E (Sprint E.1 PR 2) — pass orgId so the reset link uses the
      // member's tenant domain instead of the platform default.
      try {
        const resetResult = await sendPasswordResetEmail(email, '/reset-password', { orgId: organizationId });
        welcomeEmailSent = !resetResult.error;
        if (resetResult.error) {
          console.error('Admin create member password-reset email failed:', resetResult.error);
        }
      } catch (emailError) {
        console.error('Admin create member password-reset email failed:', emailError);
      }
    }
  
    if (!authUser) {
      return NextResponse.json({ error: 'Account creation failed' }, { status: 500 });
    }

    let createdEnrollmentId: string | null = null;
    try {
      await prisma.$transaction(async (tx) => {
        const enrolledAt = new Date();
        await tx.user.create({
          data: {
            id: authUser.id,
            organizationId,
            email: authUser.email!,
            fullName,
            phone: phone || null,
            enrolledProgram: programSlug,
            enrolledAt,
          },
        });
  
        // INVARIANT: CourseEnrollment must stay in sync with User.enrolledProgram.
        // The member self-enrollment flow (POST /api/member/enroll) does this in a
        // transaction. Admin creation must do the same, through the one canonical
        // program-enrollment writer (WAP-174).
        // Multi-program: admin-created member's first row is primary.
        const newEnrollment = await upsertEquivalentCourseEnrollment(tx, {
          userId: authUser.id,
          programSlug,
          create: {
            organizationId,
            curriculumVersion: activeCurriculumVersion(programSlug),
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
        createdEnrollmentId = newEnrollment.id;
  
        await tx.profile.create({
          data: {
            userId: authUser.id,
            profilePhone: phone || null,
            profileAddress: address || null,
            dob: parsedDob,
            veteranStatus: veteranStatus || null,
            employmentStatus: employmentStatus || null,
            educationLevel: educationLevel || null,
            householdIncome: householdIncome || null,
            referralSource: referralSource || null,
            usCitizen,
            authorizedToWork,
            hasDisability,
            ethnicity: ethnicity || null,
            counselorNotes: notes || null,
            role: 'member',
          },
        });
  
        if (partnerId) {
          await tx.partnerReferral.create({
            data: { partnerId, memberId: authUser.id },
          });
          // Auto-assign to subgroup if one exists for this partner
          const subgroup = await tx.subgroup.findFirst({
            where: { type: 'partner', partnerId },
            select: { id: true },
          });
          if (subgroup) {
            await tx.memberSubgroup.create({
              data: {
                memberId: authUser.id,
                subgroupId: subgroup.id,
                assignedBy: user.id,
                assignmentType: 'auto_referral',
              },
            });
          }
        }
        // Manual subgroup assignment if provided (and not already auto-assigned)
        if (subgroupId) {
          const existing = await tx.memberSubgroup.findUnique({
            where: { memberId_subgroupId: { memberId: authUser.id, subgroupId } },
          });
          if (!existing) {
            await tx.memberSubgroup.create({
              data: {
                memberId: authUser.id,
                subgroupId,
                assignedBy: user.id,
                assignmentType: 'manual_admin',
              },
            });
          }
        }
      });
    } catch (dbError) {
      console.error('Admin create member DB error:', dbError);
      await supabase.auth.admin.deleteUser(authUser.id).catch((cleanupError) => {
        console.error('Failed to clean up auth user after member DB error:', cleanupError);
      });
      return NextResponse.json({ error: 'Failed to create member. Please try again.' }, { status: 500 });
    }
  
    after(() =>
      auditLog({ actorUserId: user.id, action: 'admin_member_create', targetType: 'User', targetId: authUser.id, metadata: { email, programSlug, orgId: organizationId } }).catch((err) => console.error('[audit] admin_member_create:', err))
    );
    after(() =>
      logAuditEvent({
        user: { id: user.id, role: 'admin' },
        verb: 'create_member',
        object: { type: 'User', id: authUser.id },
        result: { success: true, extensions: { email, programSlug } },
        request: auditRequestMeta(request),
        orgId: organizationId,
      }).catch((err) => console.error('[audit] create_member:', err))
    );

    after(() =>
      sendPartnerMilestoneEmail(authUser.id, 'Program enrollment', {
        Program: program.title,
      }).catch((err) => console.error('Partner milestone email failed:', err))
    );

    // Sprint R3 — fire-and-forget kickoff email (idempotent per enrollment row).
    if (createdEnrollmentId) {
      const enrollmentId = createdEnrollmentId;
      after(() =>
        maybeSendCourseKickoffEmail({
          userId: authUser.id,
          enrollmentId,
          programSlug,
          email: authUser.email!,
          fullName,
        }).catch(() => { /* already logged inside */ })
      );
    }
  
    // Post-commit telemetry must never turn a successful account creation into
    // a 500 that invites the admin to create the member a second time.
    after(() =>
      trackEvent({
        userId: authUser.id,
        eventName: 'program_enrolled',
        entityType: 'course_enrollment',
        metadata: { programSlug, enrolledBy: 'admin', source: 'admin_create' },
        sourcePage: '/admin/members/create',
      }).catch((err) => console.error('[analytics] admin member enrollment:', err))
    );

    return NextResponse.json({
      ok: true,
      userId: authUser.id,
      email,
      welcomeEmailSent,
      message: welcomeEmailSent
        ? `Member created. Welcome email sent to ${email}.`
        : `Member created for ${email}, but the welcome email could not be confirmed. Send a password reset from the member record.`,
    });
  } catch (error) {
    console.error('/admin/members/create:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
