import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Users, Activity, GraduationCap, Trophy } from 'lucide-react';
import { prisma } from '@/lib/db/prisma';
import { LOOKUP_LIST_CAP } from '@/lib/db/queryCaps';

import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope } from '@/lib/tenant/adminPageScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { getProgramBySlug, PROGRAMS } from '@/lib/content/programs';
import PartnerEnrollmentFunnelStrip from '@/components/admin/PartnerEnrollmentFunnelStrip';
import PartnerSchoolConfigCard from '@/components/admin/PartnerSchoolConfigCard';
import { isSchoolManagedPartner } from '@/lib/partner/adminSchoolPartner';
import { memberProgramCompleted, memberProgramProgressPct } from '@/lib/partner/memberProgress';
import { getPipelineStage, PIPELINE_STAGE_LABELS, type PipelineStage, type PipelineStudent } from '@/lib/pipeline/stage';
import { resolveTrainingProgressAssignment } from '@/lib/member/trainingProgress';
import InvitePartnerUserButton from '@/components/admin/InvitePartnerUserButton';
import PartnerPayoutsPanel, { type PayoutRow } from '@/components/admin/PartnerPayoutsPanel';
import { getPartnerPlacementPayoutUsd } from '@/lib/partner/partnerPayout';
import { isPayoutEligibleType } from '@/lib/partner/partnerType';
import PartnerDetailActions from '@/components/admin/PartnerDetailActions';
import PageHeader from '@/components/portal/PageHeader';
import {
  DesignSurface,
  CardHead,
  StatSparkTile,
  StatusTag,
  DataTable,
  type Column,
  type KitTone,
} from '@/components/portal/kit';

type Props = { params: Promise<{ id: string }> };

/** Semantic tone for a pipeline stage pill — matches /admin/pipeline's tone language. */
function pipelineStageTone(stage: PipelineStage): KitTone {
  switch (stage) {
    case 'placed':
      return 'ok';
    case 'certified':
      return 'ok';
    case 'in_training':
    case 'job_searching':
      return 'warn';
    case 'enrolled':
      return 'info';
    case 'closed':
      return 'muted';
    default:
      return 'muted';
  }
}

export default async function AdminPartnerDetailPage({ params }: Props) {
  const { id } = await params;
  const user = await getUser();
  if (!user) redirect(`/login?redirectTo=/admin/partners/${id}`);
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');
  const orgId = scope.orgId;
  const [partner, subgroups, allPartners] = await withTenantScope(orgId, (db) => Promise.all([
    db.partner.findUnique({
      where: { id },
      include: {
      counselors: {
        include: { user: { select: { id: true, fullName: true, email: true } } },
        where: { active: true },
      },
      referrals: {
        where: { member: { deletedAt: null } },
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
                select: { id: true, employerName: true, jobTitle: true, salaryOffered: true, placedAt: true, startDateVerified: true },
              },
              userCertifications: { select: { certName: true, earnedAt: true } },
              applications: { select: { status: true, submittedAt: true } },
              courseraEnrollmentApproved: true,
              profile: { select: { parentalConsentGiven: true, isMinor: true } },
              memberProgramProgress: {
                select: { programSlug: true, averagePercent: true, coursesCompleted: true },
              },
            },
          },
        },
        orderBy: { referredAt: 'desc' },
      },
      programCatalog: { select: { programSlug: true } },
      _count: { select: { counselors: true, referrals: true } },
    },
  }),
    db.subgroup.findMany({
      take: LOOKUP_LIST_CAP,
      orderBy: { name: 'asc' },
      select: { id: true, name: true, type: true, partnerId: true },
    }),
    db.partner.findMany({
      take: LOOKUP_LIST_CAP,
      orderBy: { name: 'asc' },
      select: { id: true, name: true, active: true },
    }),
  ]));

  if (!partner) notFound();

  const members = partner.referrals.map((r) => r.member);

  // Placement payout rows for the admin payout panel (mirrors the gates the
  // POST /api/partner/payout route re-checks server-side).
  const placedMembers = members.filter((m) => m.placementRecord);
  const placementIds = placedMembers.map((m) => m.placementRecord!.id);
  const paidEvents = placementIds.length
    ? await withAdminPageScope(scope, (db) => db.memberEvent.findMany({
        where: {
          eventName: 'PARTNER_PAYOUT_SENT',
          entityType: 'PlacementRecord',
          entityId: { in: placementIds },
        },
        select: { entityId: true },
      }))
    : [];
  const paidPlacementIds = new Set(paidEvents.map((e) => e.entityId));
  const payoutRows: PayoutRow[] = placedMembers.map((m) => {
    const rec = m.placementRecord!;
    const paid = paidPlacementIds.has(rec.id);
    let blockedReason: string | null = null;
    if (!paid && (!rec.placedAt || !rec.startDateVerified)) {
      blockedReason = 'Needs verified start date';
    }
    return {
      placementId: rec.id,
      memberName: m.fullName ?? m.email ?? 'Member',
      employerName: rec.employerName ?? null,
      jobTitle: rec.jobTitle ?? null,
      placedAt: rec.placedAt ? rec.placedAt.toISOString() : null,
      paid,
      blockedReason,
    };
  });
  const payoutsAvailable =
    isPayoutEligibleType(partner.partnerType) &&
    !!partner.stripeConnectId &&
    partner.stripeConnectStatus === 'active';
  const payoutsUnavailableReason = payoutsAvailable
    ? null
    : !isPayoutEligibleType(partner.partnerType)
      ? 'Payouts are only available for referral-track partners.'
      : !partner.stripeConnectId
        ? 'Partner has not connected a Stripe account yet.'
        : 'Partner Stripe account is not active yet.';
  let completions = 0;
  let placements = 0;
  let active = 0;
  for (const m of members) {
    const assignment = resolveTrainingProgressAssignment(
      m.enrolledProgram,
      m.courseEnrollments,
    );
    if (m.placementRecord) placements++;
    else active++;
    if (memberProgramCompleted({
      enrolledProgram: assignment.programSlug,
      curriculumVersion: assignment.curriculumVersion,
      coursesCompleted: null,
      liveProgress: m.memberProgramProgress,
    })) {
      completions++;
    }
  }

  const funnel = {
    referred: members.length,
    pending: members.filter((m) => m.applications.some((a) => a.status === 'PENDING')).length,
    approved: members.filter((m) => m.applications.some((a) => a.status === 'APPROVED')).length,
    consented: members.filter((m) => m.profile?.parentalConsentGiven || m.profile?.isMinor === false).length,
    activated: members.filter((m) => m.courseraEnrollmentApproved).length,
  };

  type Referral = (typeof partner.referrals)[number];

  const referralColumns: Column<Referral>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (ref) => (
        <Link href={`/admin/members/${ref.member.id}`} style={{ fontWeight: 700, color: 'var(--wa-accent)', textDecoration: 'none' }}>
          {ref.member.fullName}
        </Link>
      ),
    },
    {
      key: 'program',
      header: 'Program',
      render: (ref) => {
        const m = ref.member;
        const assignment = resolveTrainingProgressAssignment(
          m.enrolledProgram,
          m.courseEnrollments,
        );
        const program = assignment.programSlug ? getProgramBySlug(assignment.programSlug) : null;
        return program?.title ?? '—';
      },
    },
    {
      key: 'progress',
      header: 'Progress',
      render: (ref) => {
        const m = ref.member;
        const assignment = resolveTrainingProgressAssignment(
          m.enrolledProgram,
          m.courseEnrollments,
        );
        const pct = memberProgramProgressPct({
          enrolledProgram: assignment.programSlug,
          curriculumVersion: assignment.curriculumVersion,
          coursesCompleted: null,
          liveProgress: m.memberProgramProgress,
        });
        return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>;
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (ref) => {
        const m = ref.member;
        const assignment = resolveTrainingProgressAssignment(
          m.enrolledProgram,
          m.courseEnrollments,
        );
        const student: PipelineStudent = {
          id: m.id,
          fullName: m.fullName,
          email: m.email,
          enrolledProgram: assignment.programSlug,
          curriculumVersion: assignment.curriculumVersion,
          enrolledAt: m.enrolledAt,
          assessmentCompleted: m.assessmentCompleted,
          deletedAt: m.deletedAt,
          placementRecord: m.placementRecord,
          userCertifications: m.userCertifications,
          applications: m.applications,
          memberProgramProgress: m.memberProgramProgress,
        };
        const stage = getPipelineStage(student);
        return <StatusTag tone={pipelineStageTone(stage)}>{PIPELINE_STAGE_LABELS[stage]}</StatusTag>;
      },
    },
    {
      key: 'enrolled',
      header: 'Enrolled',
      render: (ref) => ref.member.enrolledAt?.toLocaleDateString() ?? '—',
    },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageHeader
        breadcrumbs={[{ label: 'Partners', href: '/admin/partners' }, { label: 'Partner Details' }]}
        title={partner.name}
        subtitle={`${partner._count.counselors} counselor${partner._count.counselors !== 1 ? 's' : ''} · ${partner._count.referrals} referral${partner._count.referrals !== 1 ? 's' : ''}`}
        action={
          <div className="wa-flex wa-items-center" style={{ gap: 12 }}>
            <StatusTag tone={partner.active ? 'ok' : 'muted'}>{partner.active ? 'Active' : 'Inactive'}</StatusTag>
            <PartnerDetailActions
              partner={partner}
              subgroups={subgroups}
              allPartners={allPartners}
              programs={PROGRAMS.map((p) => ({ slug: p.slug, title: p.title }))}
            />
          </div>
        }
      />

      {isSchoolManagedPartner(partner) ? (
        <>
          <PartnerEnrollmentFunnelStrip
            partnerName={partner.name}
            slug={partner.slug}
            enrollmentPageEnabled={partner.enrollmentPageEnabled}
            counts={funnel}
          />
          <PartnerSchoolConfigCard
            config={{
              partnerType: partner.partnerType,
              referralCode: partner.referralCode,
              slug: partner.slug,
              sponsoredEnrollment: partner.sponsoredEnrollment,
              sponsorshipFundingSource: partner.sponsorshipFundingSource,
              sponsorshipTermLabel: partner.sponsorshipTermLabel,
              enrollmentPageEnabled: partner.enrollmentPageEnabled,
              schoolDistrict: partner.schoolDistrict,
              enrollmentHeadline: partner.enrollmentHeadline,
              programSlugs: partner.programCatalog.map((row) => row.programSlug),
            }}
          />
        </>
      ) : null}

      <div className="wa-kit-card" style={{ marginBottom: 24 }}>
        <CardHead title="Invite partner user" />
        <p style={{ fontSize: 13, color: 'var(--wa-muted)', marginBottom: 12 }}>
          Sends an email invitation with a link to the partner portal ({partner.contactEmail ? 'milestone notifications go to ' + partner.contactEmail : 'add a contact email on the partner record for notifications'}).
        </p>
        <InvitePartnerUserButton partnerId={partner.id} />
      </div>

      <div className="wa-grid wa-grid-cols-2 lg:wa-grid-cols-4 wa-gap-3" style={{ marginBottom: 24 }}>
        <StatSparkTile icon={<Users size={16} />} label="Total Referred" value={members.length} color="text" />
        <StatSparkTile icon={<Activity size={16} />} label="Active (Not Placed)" value={active} color="info" />
        <StatSparkTile icon={<GraduationCap size={16} />} label="Completions" value={completions} color="gold" />
        <StatSparkTile icon={<Trophy size={16} />} label="Placements" value={placements} color="success" />
      </div>

      <div className="wa-grid wa-grid-cols-1 lg:wa-grid-cols-2 wa-gap-4" style={{ marginBottom: 24 }}>
        <div className="wa-kit-card">
          <CardHead
            title={`Counselors (${partner.counselors.length})`}
            linkLabel="Outcomes Report"
            linkHref={`/admin/partners/${id}/quarterly-outcomes`}
          />
          {partner.counselors.length === 0 ? (
            <p style={{ color: 'var(--wa-muted)', fontSize: 13 }}>No counselors assigned yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {partner.counselors.map((c) => (
                <div key={c.id} className="wa-kit-card wa-kit-card--sm">
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--wa-text)' }}>{c.user.fullName}</div>
                  <div style={{ fontSize: 13, color: 'var(--wa-muted)' }}>{c.user.email}</div>
                  {c.title && <div style={{ fontSize: 13, color: 'var(--wa-muted)' }}>{c.title}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="wa-kit-card">
          <CardHead title="Partner details" />
          <dl style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: 0 }}>
            {[
              { label: 'Contact', value: partner.contactName ?? '—' },
              { label: 'Email', value: partner.contactEmail ?? '—' },
              { label: 'Phone', value: partner.contactPhone ?? '—' },
            ].map((row) => (
              <div key={row.label}>
                <dt className="wa-kit-stat-label" style={{ marginBottom: 2 }}>{row.label}</dt>
                <dd style={{ margin: 0, fontSize: 14, color: 'var(--wa-text)' }}>{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="wa-kit-card" style={{ marginBottom: 24 }}>
        <CardHead title="Referred members" />
        {members.length === 0 ? (
          <p style={{ color: 'var(--wa-muted)', fontSize: 13 }}>No referrals recorded yet.</p>
        ) : (
          <DataTable<Referral>
            columns={referralColumns}
            rows={partner.referrals}
            rowKey={(r) => r.id}
            emptyTitle="No referrals recorded yet"
          />
        )}
      </div>

      <PartnerPayoutsPanel
        partnerId={partner.id}
        rows={payoutRows}
        payoutAmountUsd={getPartnerPlacementPayoutUsd()}
        payoutsAvailable={payoutsAvailable}
        payoutsUnavailableReason={payoutsUnavailableReason}
      />
    </DesignSurface>
  );
}
