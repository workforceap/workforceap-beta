import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buildPageMetadata } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { getProgramBySlug } from '@/lib/content/programs';
import { getProgramEnrollmentSteps } from '@/lib/content/programEnrollmentSteps';
import { getActiveProgramForDashboard } from '@/lib/member/getActiveProgramForDashboard';
import { programStartAccessFromDashboardView } from '@/lib/member/programStartEnrollment';
import { loadMemberProgramTrainingView } from '@/lib/member/memberProgramTrainingView';
import LegacyGlyph from '@/components/icons/LegacyGlyph';
import PageHeader from '@/components/portal/PageHeader';
import PortalCard from '@/components/portal/ui/PortalCard';
import ProgramCommitmentPanel from '@/components/portal/ProgramCommitmentPanel';

export const metadata: Metadata = buildPageMetadata({
  title: 'Path to certification',
  description: 'How WorkforceAP enrolls you in training, Coursera access, exams, and job support.',
  path: '/dashboard/program/start',
});

export default async function ProgramStartPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/program/start');

  const [dbUser, activeProgramView] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        fullName: true,
        workspaceEmail: true,
        workspaceEmailProvisioned: true,
      },
    }),
    getActiveProgramForDashboard({ userId: user.id }),
  ]);

  // Same live source as /dashboard/program. Do not gate on User.enrolledProgram
  // and do not write that leftover column back from this page.
  const access = programStartAccessFromDashboardView(activeProgramView);
  const enrolledSlug = access.enrolledSlug;
  if (!enrolledSlug) {
    redirect('/dashboard/program');
  }

  const program = getProgramBySlug(enrolledSlug);
  // Multi-program: this page shows the user's primary enrollment workspace
  // info. /dashboard is the unified training home with program switching.
  const enrollment = await prisma.courseEnrollment.findFirst({
    where: { userId: user.id, programSlug: enrolledSlug },
    select: {
      workspaceEmail: true,
      workspaceEmailProvisioned: true,
      enrolledAt: true,
    },
  });

  const steps = getProgramEnrollmentSteps(enrolledSlug);
  const [screeningPack, trainingView] = await Promise.all([
    prisma.employerScreeningPack.findFirst({
      where: { programSlug: enrolledSlug, isActive: true },
      select: { id: true, packTitle: true, employerLabel: true },
    }),
    // Same completion source as /dashboard/program. This page is guidance,
    // so a progress read failure degrades to the in-progress narrative
    // rather than a 500.
    loadMemberProgramTrainingView({ userId: user.id, programSlug: enrolledSlug }).catch(() => null),
  ]);
  // Completed state: every course in the assigned curriculum is done. An
  // empty course list is "not started", never "complete".
  const pathComplete =
    !!trainingView && trainingView.totalCourses > 0 && trainingView.allCoursesComplete;

  const courseraReady =
    !!enrollment &&
    (enrollment.workspaceEmailProvisioned ||
      !!enrollment.workspaceEmail ||
      !!dbUser?.workspaceEmailProvisioned ||
      !!dbUser?.workspaceEmail);

  return (
    <>
      <div className="portal-pad-x" style={{ paddingBottom: '6rem' }}>
        <PageHeader
          title="Your path to certification"
          subtitle={
            program
              ? `${program.title} — how enrollment, Coursera, and exams fit together.`
              : 'How enrollment and training access work for your program.'
          }
          breadcrumbs={[
            { label: 'Member Portal', href: '/dashboard' },
            { label: 'My Program', href: '/dashboard/program' },
            { label: 'Path to certification' },
          ]}
        />

        <div style={{ display: 'grid', gap: '1.25rem', maxWidth: '720px' }}>
          {pathComplete ? (
            <PortalCard className="wa-kit-tone--ok wa-kit-tone-edge">
              <div role="status" style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <span className="wa-kit-tone-icon" aria-hidden>
                  <LegacyGlyph name="check_circle" size={20} />
                </span>
                <div>
                  <p className="wa-kit-tone-text" style={{ margin: '0 0 0.35rem' }}>Path complete</p>
                  <p style={{ fontWeight: 700, margin: '0 0 0.5rem' }}>
                    You have finished every course in {program?.title ?? 'your program'}
                  </p>
                  <p style={{ margin: 0, color: 'var(--color-on-surface-variant)', lineHeight: 1.6 }}>
                    All {trainingView.totalCourses} courses are complete and nothing on this path is waiting on
                    you. Your counselor confirms any exam or credential step from here, and the{' '}
                    <Link href="/dashboard/jobs" className="wa-text-[var(--color-accent-dark)] wa-font-semibold">
                      Job Board
                    </Link>{' '}
                    is open for your search.
                  </p>
                </div>
              </div>
            </PortalCard>
          ) : courseraReady ? (
            <PortalCard>
              <p style={{ fontWeight: 700, color: 'var(--wa-accent-text)', margin: '0 0 0.5rem' }}>You are on file for training access</p>
              <p style={{ margin: 0, color: 'var(--color-on-surface-variant)', lineHeight: 1.6 }}>
                Your enrollment is connected. Continue in{' '}
                <Link href="/dashboard" className="wa-text-[var(--color-accent-dark)] wa-font-semibold">
                  My Classes
                </Link>{' '}
                or{' '}
                <Link href="/dashboard/program" className="wa-text-[var(--color-accent-dark)] wa-font-semibold">
                  My Program
                </Link>
                .
              </p>
              {(enrollment?.workspaceEmail || dbUser?.workspaceEmail) && (
                <p style={{ margin: '0.75rem 0 0', fontSize: '0.875rem' }}>
                  <strong>Training email:</strong> {enrollment?.workspaceEmail ?? dbUser?.workspaceEmail}
                </p>
              )}
            </PortalCard>
          ) : (
            <PortalCard>
              <p style={{ fontWeight: 700, margin: '0 0 0.5rem' }}>What happens next</p>
              <p style={{ margin: 0, color: 'var(--color-on-surface-variant)', lineHeight: 1.6 }}>
                Staff enrolls members into Coursera tracks manually so funding and program fit stay accurate. If you just
                accepted your invite, watch your email — a counselor may message you in{' '}
                <Link href="/dashboard/messages">Counselor Chat</Link> before Coursera access appears.
              </p>
            </PortalCard>
          )}

          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.75rem' }}>
            {steps.map((step, i) => (
              <li key={step.id}>
                <PortalCard>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                    {pathComplete ? (
                      <span
                        aria-hidden
                        className="wa-kit-tone--ok wa-kit-tone-icon"
                        style={{ width: '2rem', height: '2rem', borderRadius: '999px' }}
                      >
                        <LegacyGlyph name="check" size={18} />
                      </span>
                    ) : (
                      <span
                        aria-hidden
                        style={{
                          flexShrink: 0,
                          width: '2rem',
                          height: '2rem',
                          borderRadius: '999px',
                          background: 'var(--color-accent)',
                          color: 'var(--color-on-accent, #fff)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '0.875rem',
                        }}
                      >
                        {i + 1}
                      </span>
                    )}
                    <div>
                      <h2
                        className="portal-section-heading"
                        style={{ fontSize: '1rem', margin: '0 0 0.35rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}
                      >
                        {step.title}
                        {pathComplete ? <span className="wa-kit-tag wa-kit-tag--ok">Done</span> : null}
                      </h2>
                      <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.55 }}>
                        {step.description}
                      </p>
                    </div>
                  </div>
                </PortalCard>
              </li>
            ))}
          </ol>

          <ProgramCommitmentPanel variant="compact" />

          {screeningPack ? (
            <PortalCard>
              <p style={{ margin: 0, fontWeight: 700 }}>Employer screening ({screeningPack.employerLabel})</p>
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.55 }}>
                {screeningPack.packTitle} — review the questions your training partner may ask near completion.
              </p>
              <Link href="/dashboard/program/employer-screening" className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus" style={{ marginTop: '0.75rem' }}>
                View screening questions
              </Link>
            </PortalCard>
          ) : null}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            {pathComplete ? (
              <>
                <Link href="/dashboard/jobs" className="wa-kit-cta wa-kit-focus">
                  Open Job Board
                </Link>
                <Link href="/dashboard/program" className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus">
                  Back to My Program
                </Link>
              </>
            ) : (
              <>
                <Link href="/dashboard/program" className="wa-kit-cta wa-kit-focus">
                  Back to My Program
                </Link>
                <Link href="/dashboard" className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus">
                  Open My Classes
                </Link>
              </>
            )}
          </div>
        </div>
      </div>    </>
  );
}
