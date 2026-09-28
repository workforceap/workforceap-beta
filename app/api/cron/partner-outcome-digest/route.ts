import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { sendPartnerWeeklyDigestEmail } from '@/lib/email';
import { getPipelineStage, PIPELINE_STAGE_LABELS, type PipelineStudent } from '@/lib/pipeline/stage';
import { resolveTrainingProgressAssignment } from '@/lib/member/trainingProgress';
import { captureApiError } from '@/lib/observability/captureApiError';
import { logCronRun } from '@/lib/admin/logCronRun';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';
import {
  CRON_PARTNER_DIGEST_PARTNER_CAP,
  partnerDigestReferralTake,
} from '@/lib/cron/cronCaps';
import { createBulkEmailCronPacer } from '@/lib/email/pacing';
import { partnerDataAccess, partnerMayViewMember, partnerVisiblePlacement } from '@/lib/partner/dataAccess';
import { partnerPlacementLabel } from '@/lib/partner/partnerVisibleEvents';

export const maxDuration = 300;


/**
 * Weekly digest for referral partners: referral counts by stage + weekly wins.
 * Protected with CRON_SECRET. Vercel schedule: Monday 8am CT (see vercel.json).
 */
async function handle(_request: Request) {
  const emailPacer = createBulkEmailCronPacer({ maxDurationSeconds: maxDuration });
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  const weekLabel = `${weekStart.toLocaleDateString()} – ${now.toLocaleDateString()}`;

  const partners = await prisma.partner.findMany({
    where: { active: true, notifyOnEnrollment: true },
    take: CRON_PARTNER_DIGEST_PARTNER_CAP,
    select: {
      id: true,
      name: true,
      contactEmail: true,
      partnerType: true,
    },
  });

  // Batch-load all referrals for all partners in one query (N+1 eliminator)
  const partnerIds = partners.filter((p) => p.contactEmail?.trim()).map((p) => p.id);
  if (partnerIds.length === 0) {
    const runResult = {
      ok: true,
      checkedAt: now.toISOString(),
      sent: 0,
      skipped: partners.length,
      failed: 0,
      total: partners.length,
      skippedReason: 'no_contactable_partners',
    };
    await setCronRecordsProcessed(0);
    await logCronRun('cron_partner_digest', runResult);
    return NextResponse.json({ ok: true, checkedAt: now.toISOString(), results: [] });
  }

  const allReferrals = await prisma.partnerReferral.findMany({
    where: { partnerId: { in: partnerIds }, member: { deletedAt: null } },
    take: partnerDigestReferralTake(partnerIds.length),
    include: {
      member: {
        select: {
          id: true,
          fullName: true,
          email: true,
          enrolledProgram: true,
          courseEnrollments: {
            orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
            select: { programSlug: true, curriculumVersion: true, isPrimary: true },
          },
          enrolledAt: true,
          assessmentCompleted: true,
          deletedAt: true,
          placementRecord: {
            select: {
              employerName: true,
              jobTitle: true,
              salaryOffered: true,
              placedAt: true,
              startDateVerified: true,
            },
          },
          // Minor visibility only (lib/partner/dataAccess.ts); never rendered.
          profile: { select: { isMinor: true, dob: true, ferpaConsentGiven: true } },
          userCertifications: { select: { certName: true, earnedAt: true } },
          applications: { select: { status: true, submittedAt: true } },
          memberProgramProgress: {
            select: { programSlug: true, averagePercent: true, coursesCompleted: true },
          },
        },
      },
    },
  });

  const referralsByPartner = new Map<string, typeof allReferrals>();
  for (const r of allReferrals) {
    const list = referralsByPartner.get(r.partnerId) ?? [];
    list.push(r);
    referralsByPartner.set(r.partnerId, list);
  }

  const results: Array<{ partnerId: string; name: string; emailSent: boolean; error?: string; skipped?: boolean }> = [];

  for (const p of partners) {
    if (!p.contactEmail?.trim()) {
      results.push({ partnerId: p.id, name: p.name, emailSent: false, error: 'no_contact_email' });
      continue;
    }

    // Same tier + minor rule as the partner portal (lib/partner/dataAccess.ts).
    const access = partnerDataAccess(p);
    const referrals = (referralsByPartner.get(p.id) ?? [])
      .filter((r) => partnerMayViewMember(access, r.member.profile, now));
    if (referrals.length === 0) {
      results.push({ partnerId: p.id, name: p.name, emailSent: false, error: 'no_referrals' });
      continue;
    }

    const stageCounts: Record<string, number> = {};
    const successLines: string[] = [];

    for (const r of referrals) {
      const m = r.member;
      // A placement is a partner-visible outcome only once staff verified its
      // start date (lib/partner/partnerVisibleEvents.ts). A member self-report
      // is unverified: it neither moves the stage to "placed" (same rule as
      // lib/partner/referralBundle.ts) nor is announced as a win below.
      const verifiedPlacement = m.placementRecord?.startDateVerified === true ? m.placementRecord : null;
      const assignment = resolveTrainingProgressAssignment(
        m.enrolledProgram,
        m.courseEnrollments,
      );
      const student: PipelineStudent = {
        id: m.id,
        fullName: m.fullName,
        email: m.email ?? '',
        enrolledProgram: assignment.programSlug,
        curriculumVersion: assignment.curriculumVersion,
        enrolledAt: m.enrolledAt,
        assessmentCompleted: m.assessmentCompleted,
        deletedAt: m.deletedAt,
        placementRecord: verifiedPlacement,
        userCertifications: m.userCertifications,
        applications: m.applications,
        memberProgramProgress: m.memberProgramProgress,
      };
      const stage = getPipelineStage(student);
      stageCounts[stage] = (stageCounts[stage] ?? 0) + 1;

      for (const c of m.userCertifications) {
        if (c.earnedAt >= weekStart) {
          successLines.push(`${m.fullName} earned certification: ${c.certName}`);
        }
      }
      // Tier projection first (a restricted partner never gets employer or
      // job title), then the portal's own wording for a verified placement.
      const placed = partnerVisiblePlacement(access, verifiedPlacement);
      if (placed?.placedAt && placed.placedAt >= weekStart) {
        successLines.push(`${m.fullName}: ${partnerPlacementLabel(placed)}`);
      }
    }

    let stageLines = Object.entries(stageCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([stage, n]) => {
        const label = PIPELINE_STAGE_LABELS[stage as keyof typeof PIPELINE_STAGE_LABELS] ?? stage;
        return `${n} in ${label}`;
      });

    if (stageLines.length === 0) {
      stageLines = ['No active referrals on file'];
    }

    try {
      const contactEmail = p.contactEmail.trim();
      const sendResult = await emailPacer.run(() => sendPartnerWeeklyDigestEmail({
        to: contactEmail,
        partnerName: p.name,
        weekLabel,
        stageLines,
        successLines,
      }));

      results.push({
        partnerId: p.id,
        name: p.name,
        emailSent: sendResult.ok,
        error: sendResult.ok ? undefined : sendResult.error,
        skipped: !sendResult.ok && 'skipped' in sendResult && sendResult.skipped,
      });
    } catch (error) {
      captureApiError(error, { route: 'cron/partner-outcome-digest', extra: { partnerId: p.id } });
      results.push({
        partnerId: p.id,
        name: p.name,
        emailSent: false,
        error: error instanceof Error ? error.message : 'send_failed',
      });
    }
  }

  const sent = results.filter(r => r.emailSent).length;
  const skipped = results.filter(r => r.skipped || r.error === 'no_contact_email' || r.error === 'no_referrals').length;
  const failed = results.filter(r => r.error && !r.skipped && r.error !== 'no_contact_email' && r.error !== 'no_referrals').length;
  const runResult = { ok: failed === 0, checkedAt: now.toISOString(), sent, skipped, failed, total: results.length, emailPacing: emailPacer.summary() };
  await setCronRecordsProcessed(sent);
  await logCronRun('cron_partner_digest', runResult, failed > 0 ? 'error' : 'ok');
  return NextResponse.json({ ok: failed === 0, checkedAt: now.toISOString(), results });
}

export const GET = withCronLogging('cron_partner_digest', handle);
export const POST = withCronLogging('cron_partner_digest', handle);
