import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getUser } from '@/lib/auth/server';
import { requireAdminOrCounselor } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { assertStaffCanAccessMemberRecord } from '@/lib/counselor/staffMemberAccess';
import { auditLog } from '@/lib/audit';
import { applicationReportSchema, buildApplicationReport } from '@/lib/apply/applicationReport';
import { applicationReportFile } from '@/lib/apply/applicationReportFile';
import { isSchoolCollectionSignup } from '@/lib/apply/schoolCollection';

type Context = { params: Promise<{ id: string; applicationId: string }> };
const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

async function reportResponse(req: NextRequest, context: Context, createMissing: boolean) {
  try {
    const auth = await requireAdminOrCounselor(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: privateHeaders });
    const actor = await getUser();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: privateHeaders });
    const { id, applicationId } = await context.params;
    const organizationId = await getActorOrganizationId(actor.id);
    return await withTenantScope(organizationId, async (db) => {
      const member = await db.user.findFirst({ where: { id, organizationId, deletedAt: null }, select: { id: true } });
      if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404, headers: privateHeaders });
      if (!await assertStaffCanAccessMemberRecord(actor.id, id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: privateHeaders });
      const where = { id: applicationId, userId: id, user: { organizationId, deletedAt: null } };
      const application = await db.application.findFirst({ where, select: {
        applicationReportSnapshot: true, submittedAt: true, programInterest: true, recommendedCareerTitle: true, notes: true, referralSource: true,
        user: { select: {
          fullName: true, email: true, phone: true, needsComputerSupportFollowUp: true,
          profile: { select: {
            profilePhone: true, profileAddress: true, city: true, state: true, zip: true,
            barrierTypes: true, schoolName: true, gradeLevel: true,
            parentGuardianName: true, parentGuardianEmail: true, parentGuardianPhone: true,
            smsOptIn: true, employmentStatus: true, veteranStatus: true,
          } },
          applyEligibilityScreenings: { where: { organizationId }, take: 1, select: {
            q1: true, q2: true, q3: true, qualifies: true, yesCount: true,
            receivingUnemployment: true, exhaustedUnemployment: true, layoffCompany: true,
            snapWic: true, publicAssistancePrograms: true, publicAssistanceHelpRequested: true,
            hearAbout: true, hearAboutOther: true, partnerAmbassadorReferral: true,
          } },
        } },
      } });
      if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404, headers: privateHeaders });
      let snapshot = application.applicationReportSnapshot;
      let recovered = false;
      if (snapshot == null) {
        if (!createMissing) return NextResponse.json({ error: 'Create this report from the applicant profile first.' }, { status: 409, headers: privateHeaders });
        const profile = application.user.profile;
        // Only known applicant labels may be recovered from old notes; never
        // include arbitrary staff/counselor notes in a member-exportable file.
        const note = (label: string) => application.notes?.split('\n').find((line) => line.startsWith(`${label}: `))?.slice(label.length + 2);
        const school = isSchoolCollectionSignup({ gradeLevel: profile?.gradeLevel, primaryBarriers: profile?.barrierTypes }) || application.notes?.startsWith('Collection: high-school student') === true;
        const report = buildApplicationReport({
          source: 'recovered_record', capturedAt: new Date(), submittedAt: application.submittedAt,
          name: application.user.fullName, email: application.user.email,
          phone: profile?.profilePhone || application.user.phone, address: profile?.profileAddress,
          city: profile?.city, state: profile?.state, zip: profile?.zip,
          county: note('County'), ageGroup: note('Age group'),
          programInterest: application.programInterest, recommendedCareer: application.recommendedCareerTitle,
          barriers: profile?.barrierTypes, referral: application.referralSource,
          computerHelp: application.user.needsComputerSupportFollowUp,
          screening: school ? null : application.user.applyEligibilityScreenings[0],
          school, schoolName: profile?.schoolName, grade: profile?.gradeLevel,
          guardianName: profile?.parentGuardianName, guardianEmail: profile?.parentGuardianEmail,
          guardianPhone: profile?.parentGuardianPhone, smsOptIn: profile?.smsOptIn,
          employmentStatus: profile?.employmentStatus, veteranStatus: profile?.veteranStatus,
        });
        const saved = await db.application.updateMany({
          where: { ...where, applicationReportSnapshot: { equals: Prisma.DbNull } },
          data: { applicationReportSnapshot: report },
        });
        recovered = saved.count === 1;
        // A concurrent request may have won. Always render the durable winner.
        snapshot = (await db.application.findFirst({ where, select: { applicationReportSnapshot: true } }))?.applicationReportSnapshot ?? null;
      }
      const report = applicationReportSchema.parse(snapshot);
      const file = await applicationReportFile(report, applicationId);
      await auditLog({ actorUserId: actor.id, action: 'download_application_report', targetType: 'Application', targetId: applicationId,
        metadata: { organizationId, memberId: id, recovered, format: file.contentType } });
      return new NextResponse(new Uint8Array(file.content), { headers: {
        ...privateHeaders, 'Content-Type': file.contentType,
        'Content-Disposition': `attachment; filename="${file.filename}"`,
        'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'",
      } });
    });
  } catch {
    console.error('Application report download failed');
    return NextResponse.json({ error: 'The application report could not be prepared. Please try again.' }, { status: 500, headers: privateHeaders });
  }
}

export const GET = withApiGuc((req: NextRequest, context: Context) => reportResponse(req, context, false));
/** Explicit staff action saves older records once; GET never writes a snapshot. */
export const POST = withApiGuc((req: NextRequest, context: Context) => reportResponse(req, context, true));
