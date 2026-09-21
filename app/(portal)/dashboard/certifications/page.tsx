import type { Metadata } from 'next';
import { programSlugReadCandidates } from '@/lib/content/programSlug';
import { describeCourseDenominator } from '@/lib/coursera/progressTileSummary';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { getPathwayForProgram } from '@/lib/content/learningPathways';
import { buildPathwayMilestones } from '@/lib/content/pathwayStepDisplay';
import { getRequestLocale } from '@/lib/i18n/server';
import { formatLocalizedDate } from '@/lib/i18n/date';
import PageHeader from '@/components/portal/PageHeader';
import PortalEmptyState from '@/components/portal/PortalEmptyState';
import CertificationRoadmap from '@/components/portal/CertificationRoadmap';
import CertificationReferenceSection from '@/components/portal/CertificationReferenceSection';
import {
  CertificationEarnedRowMobile,
  CertificationDownloadOneButton,
  DownloadAllCertificatesButton,
  CertificationViewButton,
} from '@/components/portal/CertificationVaultActions';
import CertificationAddForm from '@/components/portal/CertificationAddForm';
import { MemberCertificatesKit } from '@/components/portal/kit/pages/member/MemberCertificatesKit';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { loadMemberProgramTrainingView } from '@/lib/member/memberProgramTrainingView';
import { getProgramBySlug } from '@/lib/content/programs';
import { MEMBER_PROGRAM_HREF } from '@/lib/member/memberProgramHref';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
  title: 'My Certificates',
  description: 'Track credentials, download certificates, and follow your certification roadmap.',
  path: '/dashboard/certifications',
});
}

export default async function DashboardCertificationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ ui?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/certifications');
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());

  const locale = await getRequestLocale();
  const params = await searchParams;
  const requestedUi = typeof params?.ui === 'string' ? params.ui : null;

  // Resolve the member's pathway from their enrolled program. Returns null
  // when the member has no enrolled program — pathway-dependent UI is gated
  // off rather than rendering a default IT Support / Digital Literacy pathway.
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      enrolledProgram: true,
      organizationId: true,
      courseEnrollments: {
        where: { isPrimary: true },
        orderBy: { enrolledAt: 'desc' },
        take: 1,
        select: { programSlug: true, curriculumVersion: true },
      },
    },
  });
  const primaryEnrollment = dbUser?.courseEnrollments[0] ?? null;
  const primaryPathway = getPathwayForProgram(
    primaryEnrollment?.programSlug ?? dbUser?.enrolledProgram ?? null,
    primaryEnrollment?.curriculumVersion ?? 'legacy-v1',
  );

  const primaryProgramSlug = primaryEnrollment?.programSlug ?? dbUser?.enrolledProgram ?? null;
  const [certs, pathwayRows, trainingView] = await Promise.all([
    prisma.userCertification.findMany({
      take: 500,
      where: { userId: user.id },
      orderBy: { earnedAt: 'desc' },
      select: { id: true, certName: true, earnedAt: true },
    }),
    primaryPathway
      ? prisma.pathwayStepProgress.findMany({
        take: 500,
          // Pathway ids are program slugs; rows saved under a legacy alias
          // slug belong to the same pathway.
          where: { userId: user.id, pathwayId: { in: programSlugReadCandidates(primaryPathway.id) } },
        })
      : Promise.resolve([] as Array<{ pathwayId: string; stepIndex: number; status: string }>),
    // Same program ledger as home and My program (reconcileProgramProgress), so
    // the in-progress card cannot disagree with them. Pathway steps stay the
    // fallback when no enrollment resolves.
    primaryProgramSlug
      ? loadMemberProgramTrainingView({ userId: user.id, programSlug: primaryProgramSlug }).catch(() => null)
      : Promise.resolve(null),
  ]);

  const completedSteps = pathwayRows.filter((r) => r.status === 'completed').length;
  const pathwayPct =
    primaryPathway && primaryPathway.steps.length > 0
      ? Math.round((completedSteps / primaryPathway.steps.length) * 100)
      : 0;

  const pathwayMilestones = primaryPathway
    ? buildPathwayMilestones(primaryPathway, pathwayRows)
    : [];
  const currentMilestone = pathwayMilestones.find((m) => m.status === 'current');

  // ── v2 KIT is the DEFAULT for My Certificates (real data); legacy view stays
  // reachable via ?ui=legacy. Runs AFTER the auth guard above and reuses the
  // certs + pathway data already loaded — no extra queries.
  if (requestedUi !== 'legacy') {
    // Earned certs → kit cards. earnedAt is a Date here (raw Prisma select,
    // not the ISO-mapped certRows used by the legacy mobile rows below).
    const earned = certs.map((c) => ({
      id: c.id,
      title: c.certName,
      meta: `Issued ${formatLocalizedDate(c.earnedAt, locale, { month: 'short', day: 'numeric', year: 'numeric' })}`,
      // Coursera/manual certs aren't credential-verified through us, so we
      // don't claim "verified" — leave the badge off.
      verified: false,
    }));

    // In-progress cert = the member's current pathway milestone, surfaced as a
    // single in-progress card with the overall pathway completion percent.
    const trainingProgram = trainingView && primaryProgramSlug ? getProgramBySlug(primaryProgramSlug) : undefined;
    const nextCourseName = trainingView?.nextIncompleteCourseSlug
      ? trainingProgram?.courses.find((course) => course.slug === trainingView.nextIncompleteCourseSlug)?.name ?? null
      : null;
    const inProgress =
      trainingView && trainingProgram && !trainingView.allCoursesComplete && trainingView.totalCourses > 0
        ? [
            {
              id: `${trainingProgram.slug}-program`,
              title: nextCourseName ?? trainingProgram.title,
              percent: trainingView.progressPercentDisplay,
              note: [
                `${trainingView.completedCount} of ${trainingView.totalCourses} courses complete in ${trainingProgram.title}`,
                describeCourseDenominator(trainingProgram.courses),
              ].filter(Boolean).join(' '),
            },
          ]
        : primaryPathway && currentMilestone
        ? [
            {
              id: `${primaryPathway.id}-${currentMilestone.stepIndex}`,
              title: currentMilestone.label,
              percent: pathwayPct,
              note: `${currentMilestone.detail} · ${completedSteps} of ${primaryPathway.steps.length} steps in ${primaryPathway.title}`,
            },
          ]
        : [];

    return (
      <MemberCertificatesKit
        earnedCount={certs.length}
        inProgressCount={inProgress.length}
        verifiedCount={0}
        // Learning-hours isn't loaded on this route; pass 0 rather than let the
        // kit's fabricated default (86) show next to real counts.
        learningHours={0}
        earned={earned}
        inProgress={inProgress}
        continueHref={inProgress.length > 0 ? MEMBER_PROGRAM_HREF : undefined}
      />
    );
  }
  const mobileProgressIcon = currentMilestone?.icon ?? 'route';
  const mobileProgressTitle = currentMilestone?.label ?? primaryPathway?.title ?? '';
  const mobileProgressSubtitle = primaryPathway
    ? `${completedSteps} of ${primaryPathway.steps.length} modules · ${primaryPathway.title}`
    : '';

  const certRows = certs.map((c) => ({
    id: c.id,
    certName: c.certName,
    earnedAt: c.earnedAt.toISOString(),
  }));

  const badgeDashOffset = 264 - (264 * Math.min(100, pathwayPct)) / 100;

  return (
    <>
      <h1 className="wa-sr-only">Certificates &amp; achievements</h1>
      {/* ── MOBILE ── */}
      <div className="md:wa-hidden" style={{ paddingBottom: '6rem' }}>
        <PageHeader
          title="My Certificates"
          subtitle="Track credentials you've earned and download your certificate record."
          titleHeadingLevel={2}
        />

        {/* Stats chips */}
        <div style={{ display: 'flex', gap: '0.625rem', padding: '0.75rem 1rem', overflowX: 'auto' }}>
          {[
            {
              icon: 'workspace_premium',
              label: `${certs.length} earned`,
              color: 'var(--color-accent)',
              bg: 'rgba(173,44,77,0.12)',
            },
            {
              icon: 'trending_up',
              label: `${pathwayPct}% pathway`,
              color: 'var(--color-blue)',
              bg: 'rgba(43,123,185,0.12)',
            },
            {
              icon: 'verified',
              label: certs.length > 0 ? 'Record saved' : 'Start pathway',
              color: 'var(--color-green)',
              bg: 'rgba(74,155,79,0.12)',
            },
          ].map((chip) => (
            <div
              key={chip.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                background: chip.bg,
                borderRadius: '999px',
                padding: '0.375rem 0.75rem',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '1rem', color: chip.color, '--ms-fill': 1 }}
              >
                {chip.icon}
              </span>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: chip.color }}>{chip.label}</span>
            </div>
          ))}
        </div>

        {/* Earned Certifications */}
        <section style={{ padding: '0 1rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Earned</h2>
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
              {certs.length} cert{certs.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {certs.length === 0 ? (
              <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', margin: 0, lineHeight: 1.5 }}>
                No certificates recorded yet. Certificates appear here when you complete Coursera courses (they sync automatically) or when you add certificates you've earned elsewhere.
              </p>
            ) : (
              certs.map((cert) => (
                <CertificationEarnedRowMobile key={cert.id} certName={cert.certName} earnedAt={cert.earnedAt} />
              ))
            )}
          </div>
          <div style={{ paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            <DownloadAllCertificatesButton certs={certRows} />
            <CertificationAddForm />
          </div>
        </section>

        {/* In Progress */}
        {primaryPathway && (
        <section style={{ padding: '0 1rem', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.75rem' }}>In Progress</h2>
          <div
            style={{
              background: 'var(--surface-container)',
              borderRadius: '0.875rem',
              padding: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '0.875rem' }}>
              <div
                style={{
                  background: 'rgba(43,123,185,0.12)',
                  borderRadius: '0.625rem',
                  padding: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '1.375rem', color: 'var(--color-blue)', '--ms-fill': 1 }}
                >
                  {mobileProgressIcon}
                </span>
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{mobileProgressTitle}</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{mobileProgressSubtitle}</div>
              </div>
            </div>
            {/* SVG Progress bar */}
            <div style={{ position: 'relative', height: '8px', borderRadius: '999px', overflow: 'hidden', background: 'var(--surface-container-highest)' }}>
              <svg width="100%" height="8" style={{ position: 'absolute', inset: 0 }} aria-hidden="true">
                <rect x="0" y="0" width={`${pathwayPct}%`} height="8" rx="4" fill="var(--color-blue)" />
              </svg>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.375rem' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{pathwayPct}% complete</span>
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                {primaryPathway.estimatedWeeks > 0
                  ? `~${primaryPathway.estimatedWeeks} wk program`
                  : `${completedSteps}/${primaryPathway.steps.length} steps`}
              </span>
            </div>
          </div>
        </section>
        )}

        {/* S1-1: Start Here cert guide card (mobile) */}
        <div style={{ padding: '0 1rem', marginBottom: '1rem' }}>
          <div
            style={{
              padding: '1.125rem',
              background: 'color-mix(in srgb, var(--color-accent) 6%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)',
              borderRadius: '0.875rem',
            }}
          >
            <div style={{ display: 'flex', gap: '0.625rem', marginBottom: '0.75rem', alignItems: 'flex-start' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: 'var(--color-accent)', flexShrink: 0 }} aria-hidden="true">help_center</span>
              <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: 0 }}>
                Not sure which cert to go after?
              </p>
            </div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.55, margin: '0 0 0.875rem' }}>
              Your Career Coach can help. Common certs our members target:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {['PMP — Project Management', 'AWS Cloud Practitioner', 'CompTIA A+ / IT Support', 'Google IT Support Certificate'].map((label) => (
                <a
                  key={label}
                  href="/dashboard/ai-tools/career-business-coach"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 0.75rem',
                    background: 'var(--surface-container)',
                    borderRadius: '0.625rem',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    color: 'var(--color-on-surface)',
                    textDecoration: 'none',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-accent)' }} aria-hidden="true">workspace_premium</span>
                  {label}
                </a>
              ))}
            </div>
            <a
              href="/dashboard/ai-tools/career-business-coach"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
                marginTop: '0.875rem',
                fontSize: '0.8125rem',
                fontWeight: 700,
                color: 'var(--color-accent)',
                textDecoration: 'none',
              }}
            >
              Open Career Coach
              <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }} aria-hidden="true">arrow_forward</span>
            </a>
          </div>
        </div>

        {/* Earn More CTA */}
        <div style={{ padding: '0 1rem', marginBottom: '1rem' }}>
          <div
            style={{
              background: 'linear-gradient(135deg, var(--color-accent) 0%, rgba(173,44,77,0.8) 100%)',
              borderRadius: '1rem',
              padding: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '2rem', color: '#fff', '--ms-fill': 1 }}
            >
              emoji_events
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: '#fff', fontSize: '1rem', marginBottom: '0.25rem' }}>Earn More Credentials</div>
              <div style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.85)', marginBottom: '0.625rem' }}>
                Browse available certificates in your program pathway.
              </div>
              <a
                href="/dashboard/learning"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  background: '#fff',
                  // White pill in both modes: pin the label to the light-mode crimson
                  // (var(--color-accent) is #e0658a in dark mode, 3.28:1 on white).
                  color: '#ad2c4d',
                  borderRadius: '0.5rem',
                  padding: '0.375rem 0.875rem',
                  fontWeight: 700,
                  fontSize: '0.8125rem',
                  textDecoration: 'none',
                }}
              >
                View Pathway
                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">arrow_forward</span>
              </a>
            </div>
          </div>
        </div>      </div>

      {/* ── DESKTOP ── */}
      <div className="wa-hidden md:wa-block">
        <div style={{ maxWidth: 'var(--max-width)', margin: '0 auto' }}>
          <PageHeader
            title="My Certificates"
            subtitle="Certificates and credentials you've earned through training. Track your progress and download proof of what you've completed."
            breadcrumbs={[{ label: 'Member Portal', href: '/dashboard' }, { label: 'Certifications' }]}
            titleHeadingLevel={2}
          />

          {/* 3-column stats bar */}
          <div
            className="portal-grid-metrics"
            style={{ marginBottom: 'var(--space-8)' }}
          >
            {/* Total Credentials */}
            <div
              style={{
                background: 'var(--surface-container)',
                borderRadius: 'var(--radius-xl)',
                padding: 'var(--space-6)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-4)',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: '2rem',
                  color: 'var(--color-accent)',
                  background: 'rgba(173,44,77,0.12)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-3)',
                  '--ms-fill': 1,
                }}
               aria-hidden="true">
                workspace_premium
              </span>
              <div>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-on-surface-variant)' }}>Total Credentials</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 'var(--font-weight-bold)' }}>{certs.length}</div>
              </div>
            </div>

            {/* Program Progress */}
            <div
              style={{
                background: 'var(--surface-container)',
                borderRadius: 'var(--radius-xl)',
                padding: 'var(--space-6)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: '2rem',
                    color: 'var(--color-blue)',
                    background: 'rgba(43,123,185,0.12)',
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--space-3)',
                    '--ms-fill': 1,
                  }}
                 aria-hidden="true">
                  trending_up
                </span>
                <div>
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-on-surface-variant)' }}>Pathway steps</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 'var(--font-weight-bold)' }}>{pathwayPct}%</div>
                </div>
              </div>
              <div style={{ height: '6px', background: 'var(--surface-container-highest)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${pathwayPct}%`,
                    background: 'var(--color-blue)',
                    borderRadius: 'var(--radius-full)',
                    transition: 'var(--transition-base)',
                  }}
                />
              </div>
            </div>

            {/* Industry Verified */}
            <div
              style={{
                background: 'var(--surface-container)',
                borderRadius: 'var(--radius-xl)',
                padding: 'var(--space-6)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-4)',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: '2rem',
                  color: 'var(--color-green)',
                  background: 'rgba(74,155,79,0.12)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-3)',
                  '--ms-fill': 1,
                }}
               aria-hidden="true">
                verified
              </span>
              <div>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-on-surface-variant)' }}>Records</div>
                <div
                  style={{
                    marginTop: 'var(--space-1)',
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-on-surface-variant)',
                    lineHeight: 1.4,
                  }}
                >
                  {certs.length > 0
                    ? 'Credentials saved to your WorkforceAP profile. Official PDF certificates come from the issuing organization (Coursera, CompTIA, etc.).'
                    : 'Earn certificates through your program pathway to see them listed here. Coursera certificates sync automatically; others can be added manually.'}
                </div>
              </div>
            </div>
          </div>

          {/* S1-1: Start Here cert guide card */}
          <div
            style={{
              marginBottom: 'var(--space-8)',
              padding: '1.25rem 1.5rem',
              background: 'color-mix(in srgb, var(--color-accent) 6%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)',
              borderRadius: 'var(--radius-xl)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.375rem', color: 'var(--color-accent)', flexShrink: 0, marginTop: '0.1rem' }} aria-hidden="true">help_center</span>
              <div>
                <p style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: '0 0 0.25rem' }}>
                  Not sure which cert to go after?
                </p>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', margin: 0, lineHeight: 1.55 }}>
                  Your Career Coach can help you build a cert plan around your goals. Common starting points:
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', paddingLeft: '2.125rem' }}>
              {[
                { label: 'PMP — Project Management', hint: 'Ask: How do I get started on PMP?' },
                { label: 'AWS Cloud Practitioner', hint: "Ask: What's the path to AWS Cloud Practitioner?" },
                { label: 'CompTIA A+ / IT Support', hint: 'Ask: How do I start CompTIA A+?' },
                { label: 'Google IT Support Certificate', hint: 'Ask: How do I complete Google IT Support?' },
              ].map((cert) => (
                <a
                  key={cert.label}
                  href={`/dashboard/ai-tools/career-business-coach`}
                  title={cert.hint}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    padding: '0.4rem 0.875rem',
                    background: 'var(--surface-container)',
                    border: '1px solid var(--outline-variant)',
                    borderRadius: '999px',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    color: 'var(--color-on-surface)',
                    textDecoration: 'none',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '0.9rem', color: 'var(--color-accent)' }} aria-hidden="true">workspace_premium</span>
                  {cert.label}
                </a>
              ))}
              <a
                href="/dashboard/ai-tools/career-business-coach"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  padding: '0.4rem 0.875rem',
                  background: 'var(--color-accent)',
                  borderRadius: '999px',
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  color: '#fff',
                  textDecoration: 'none',
                }}
              >
                Talk to your coach
                <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }} aria-hidden="true">arrow_forward</span>
              </a>
            </div>
          </div>

          {/* Main bento grid */}
          <div
            className="portal-grid-metrics"
            style={{ marginBottom: 'var(--space-12)' }}
          >
            {/* Active Pathway card (large) */}
            {primaryPathway && (
            <div
              style={{
                background: 'var(--surface-container-low)',
                borderRadius: 'var(--radius-xl)',
                padding: 'var(--space-8)',
                gridRow: 'span 2',
                border: '1px solid var(--outline-variant)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '1.5rem', color: 'var(--color-accent)', '--ms-fill': 1 }}
                >
                  route
                </span>
                <h2 className="portal-section-heading" style={{ margin: 0 }}>Active Pathway</h2>
              </div>
              <p style={{ color: 'var(--color-on-surface-variant)', marginBottom: 'var(--space-6)', fontSize: 'var(--font-size-sm)' }}>
                Your current certification journey. Complete each milestone to move to the next.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                {pathwayMilestones.map((milestone) => (
                  <div
                    key={`${milestone.stepIndex}-${milestone.label}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-4)',
                      padding: 'var(--space-4)',
                      borderRadius: 'var(--radius-lg)',
                      background: milestone.status === 'current'
                        ? 'rgba(173,44,77,0.08)'
                        : milestone.status === 'complete'
                          ? 'rgba(74,155,79,0.06)'
                          : 'var(--surface-container)',
                      border: milestone.status === 'current' ? '1px solid var(--color-accent)' : '1px solid transparent',
                      opacity: milestone.status === 'locked' ? 0.5 : 1,
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: '1.5rem',
                        color: milestone.status === 'complete'
                          ? 'var(--color-green)'
                          : milestone.status === 'current'
                            ? 'var(--color-accent)'
                            : 'var(--color-on-surface-variant)',
                        '--ms-fill': milestone.status === 'complete' ? 1 : 0,
                      }}
                     aria-hidden="true">
                      {milestone.status === 'complete' ? 'check_circle' : milestone.status === 'locked' ? 'lock' : milestone.icon}
                    </span>
                    <div>
                      <div style={{ fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-base)' }}>{milestone.label}</div>
                      <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-on-surface-variant)' }}>
                        {milestone.detail}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            )}

            {/* Ready for Download card */}
            <div
              style={{
                background: 'var(--surface-container)',
                borderRadius: 'var(--radius-xl)',
                padding: 'var(--space-6)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-4)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: 'var(--color-accent)', '--ms-fill': 1 }}>
                  download
                </span>
                <h3 style={{ fontSize: 'var(--font-size-h4)', fontWeight: 'var(--font-weight-medium)', margin: 0 }}>Certificate Record</h3>
              </div>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-on-surface-variant)', margin: 0 }}>
                Export a CSV list of your earned certificates for your records. Official PDF certificates are issued by the certifying organization (Coursera, CompTIA, etc.) and must be downloaded from their platform.
              </p>
              {certs.length > 0 ? (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {certs.map((c) => (
                    <li
                      key={c.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 'var(--space-3)',
                        fontSize: 'var(--font-size-sm)',
                      }}
                    >
                      <span style={{ fontWeight: 600, color: 'var(--color-on-surface)' }}>{c.certName}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                        <CertificationDownloadOneButton
                          certName={c.certName}
                          earnedAtIso={c.earnedAt.toISOString()}
                          variant="icon"
                        />
                        <CertificationViewButton
                          certName={c.certName}
                          earnedAtLabel={formatLocalizedDate(c.earnedAt, locale, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                          earnedAtIso={c.earnedAt.toISOString()}
                          variant="desktop"
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <PortalEmptyState
                  icon={
                    <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: 'var(--color-accent)', fontVariationSettings: "'FILL' 1" }}>
                      workspace_premium
                    </span>
                  }
                  title="No certificates yet"
                  description="Earn certificates through your program pathway to see them listed here. Coursera certificates sync automatically; others can be added manually."
                  primaryAction={{ href: '/dashboard/learning', label: 'Go to Learning Hub' }}
                  secondaryAction={{ href: '/dashboard/ai-tools/career-business-coach', label: 'Talk to Career Coach' }}
                />
              )}
              <DownloadAllCertificatesButton certs={certRows} />
              <div style={{ marginTop: '0.75rem' }}>
                <CertificationAddForm />
              </div>
            </div>

            {/* Achievement badge with SVG ring */}
            {primaryPathway && (
            <div
              style={{
                background: 'var(--surface-container)',
                borderRadius: 'var(--radius-xl)',
                padding: 'var(--space-6)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
              }}
            >
              <svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden="true">
                <circle cx="48" cy="48" r="42" stroke="var(--surface-container-highest)" strokeWidth="4" opacity="0.3" />
                <circle
                  cx="48"
                  cy="48"
                  r="42"
                  stroke="var(--color-gold)"
                  strokeWidth="4"
                  strokeDasharray="264"
                  strokeDashoffset={badgeDashOffset}
                  strokeLinecap="round"
                  transform="rotate(-90 48 48)"
                />
                <text x="48" y="45" textAnchor="middle" fill="var(--color-gold)" fontSize="22" fontWeight="700">
                  {pathwayPct}%
                </text>
                <text x="48" y="62" textAnchor="middle" fill="var(--color-on-surface-variant)" fontSize="13">
                  pathway
                </text>
              </svg>
              <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)' }}>
                Pathway progress
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{primaryPathway.title}</div>
            </div>
            )}
          </div>

          {/* Certificate Roadmap section */}
          <section style={{ marginBottom: 'var(--space-12)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', color: 'var(--color-accent)', '--ms-fill': 1 }}>
                timeline
              </span>
              <h2 className="portal-section-heading" style={{ margin: 0 }}>Certificate Roadmap</h2>
            </div>
            <p style={{ color: 'var(--color-on-surface-variant)', marginBottom: 'var(--space-6)', maxWidth: '640px' }}>
              Industry-recognized credentials across IT, healthcare, and skilled trades. Check off certificates as you earn them.
            </p>

            <CertificationReferenceSection
              organizationId={dbUser?.organizationId}
              readOnlyAudit={readOnlyAudit}
            />

            <div style={{ maxWidth: '860px' }}>
              <CertificationRoadmap />
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
