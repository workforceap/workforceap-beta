import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import AssessmentForm from '@/components/portal/AssessmentForm';
import MemberPreScreeningForm from '@/components/portal/MemberPreScreeningForm';
import MemberInterviewRequestButton from '@/components/portal/MemberInterviewRequestButton';
import { DesignSurface, PageOpener } from '@/components/portal/kit';
import Link from 'next/link';
import { ClipboardCheck } from 'lucide-react';
import { getCounselorStarterProfileReview, getStarterProfileFieldLabels } from '@/lib/member/starterProfileReview';
import { formatPortalDate, formatPortalDateTime } from '@/lib/formatDate';

const PAGE_TITLE = 'Skills check';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard');
  return buildPageMetadataAsync({
    title: t('assessmentMetaTitle'),
    description: t('assessmentMetaDesc'),
    path: '/dashboard/assessment',
  });
}

export default async function AssessmentPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = params.redirect?.trim();
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/assessment');

  // Ops (9/2/26): the preassessment is open to every member as soon as they
  // sign in — it no longer waits for staff to mark intake complete. Results
  // are emailed to staff and posted on the member's account for WIOA review.
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      profile: true,
      courseEnrollments: {
        where: { isPrimary: true },
        select: { enrolledByAdminId: true },
        take: 1,
      },
      preScreeningResponse: { select: { id: true } },
    },
  });

  if (!dbUser) redirect('/login');

  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--wa-pad-sm)' }} className="wa-space-y-6">
        <PageOpener
          kicker="Preassessment"
          title={PAGE_TITLE}
          lede={
            dbUser.assessmentCompleted
              ? 'On file for you and your counselor.'
              : '35 questions. This is a placement check for you and your counselor. It does not unlock Coursera.'
          }
          icon={<ClipboardCheck size={13} aria-hidden="true" />}
        />
        <div style={{ maxWidth: 720 }}>
          {dbUser.assessmentCompleted ? (
            <>
              <AssessmentCompletedCard
                scorePct={dbUser.assessmentScorePct}
                completedAt={dbUser.assessmentCompletedAt}
                programInterest={dbUser.programInterest}
              />
              <InterviewSteps
                preScreeningDone={!!dbUser.preScreeningResponse}
                interviewEligible={dbUser.interviewEligible}
                interviewRequestedAt={dbUser.interviewRequestedAt}
                interviewCompletedAt={dbUser.interviewCompletedAt}
              />
            </>
          ) : (
            <AssessmentReady
              dbUser={dbUser}
              redirectTo={redirectTo}
            />
          )}
        </div>
      </div>
    </DesignSurface>
  );
}

const STEP_HEADING_STYLE = {
  margin: '0 0 0.35rem',
  fontSize: 17,
  fontWeight: 800,
  letterSpacing: '-0.02em',
} as const;

const STEP_BODY_STYLE = {
  color: 'var(--wa-muted)',
  lineHeight: 1.5,
  margin: 0,
  fontSize: 'var(--wa-type-body)',
} as const;

/**
 * The steps after the preassessment (WAP-197): pre-screening, then the
 * interview request. They used to render only in the legacy home's
 * never-shown block, so no member could reach /api/member/pre-screening or
 * /api/member/interview-request. The member application status next steps
 * ("Complete your pre-screening", "Request your interview") link here.
 * Conditions mirror the legacy block and the two routes: pre-screening needs
 * a completed preassessment and no saved response; the interview request
 * needs staff to have marked the member interview eligible.
 */
function InterviewSteps({
  preScreeningDone,
  interviewEligible,
  interviewRequestedAt,
  interviewCompletedAt,
}: {
  preScreeningDone: boolean;
  interviewEligible: boolean;
  interviewRequestedAt: Date | null;
  interviewCompletedAt: Date | null;
}) {
  if (!preScreeningDone) {
    return (
      <section id="pre-screening" aria-labelledby="pre-screening-heading" className="wa-kit-card" style={{ marginTop: 16 }}>
        <h2 id="pre-screening-heading" style={STEP_HEADING_STYLE}>
          Pre-screening
        </h2>
        <p style={{ ...STEP_BODY_STYLE, marginBottom: 16 }}>The step before your interview.</p>
        <MemberPreScreeningForm />
      </section>
    );
  }

  if (interviewCompletedAt) return null;

  return (
    <section id="interview" aria-labelledby="interview-heading" className="wa-kit-card" style={{ marginTop: 16 }}>
      <h2 id="interview-heading" style={STEP_HEADING_STYLE}>
        Interview
      </h2>
      {interviewRequestedAt ? (
        <p style={STEP_BODY_STYLE}>
          We received your interview request on {formatPortalDateTime(interviewRequestedAt)}. A counselor will
          reach out by email.
        </p>
      ) : interviewEligible ? (
        <>
          <p style={{ ...STEP_BODY_STYLE, marginBottom: 16 }}>You&rsquo;re interview eligible.</p>
          <MemberInterviewRequestButton />
        </>
      ) : (
        <p style={STEP_BODY_STYLE}>
          Pre-screening submitted. A counselor will review it and reach out by email.
        </p>
      )}
    </section>
  );
}

function AssessmentCompletedCard({
  scorePct,
  completedAt,
  programInterest,
}: {
  scorePct: number | null;
  completedAt: Date | null;
  programInterest: string | null;
}) {
  return (
    <div className="wa-kit-card">
      {scorePct != null ? (
        <p
          style={{
            margin: 0,
            fontSize: 'clamp(2.75rem, 9vw, 3.75rem)',
            fontWeight: 800,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--wa-text)',
          }}
        >
          {scorePct}
          <span
            style={{
              marginLeft: '0.12em',
              fontSize: '0.38em',
              fontWeight: 700,
              color: 'var(--wa-muted)',
            }}
          >
            %
          </span>
        </p>
      ) : null}
      <h2
        style={{
          margin: scorePct != null ? '0.75rem 0 0.35rem' : '0 0 0.5rem',
          fontSize: 17,
          fontWeight: 800,
          letterSpacing: '-0.02em',
        }}
      >
        Preassessment complete
      </h2>
      <p style={{ color: 'var(--wa-muted)', lineHeight: 1.5, margin: '0 0 1.25rem', fontSize: 'var(--wa-type-body)' }}>
        {[
          completedAt ? `Finished ${formatPortalDate(completedAt)}` : null,
          programInterest,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        <Link
          href="/dashboard/program"
          className="wa-kit-cta wa-kit-focus hover:wa-opacity-90"
        >
          Continue training
        </Link>
        <Link
          href="/dashboard"
          className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus hover:wa-opacity-90"
        >
          Open home
        </Link>
      </div>
    </div>
  );
}

function AssessmentReady({
  dbUser,
  redirectTo,
}: {
  dbUser: {
    fullName: string | null;
    phone: string | null;
    profile: {
      profilePhone: string | null;
      profileAddress: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
      referralSource: string | null;
    } | null;
    courseEnrollments: Array<{ enrolledByAdminId: string | null }>;
  };
  redirectTo: string | undefined;
}) {
  const nameParts = dbUser.fullName?.split(' ') ?? [];
  const firstName = nameParts[0] ?? '';
  const lastName = nameParts.slice(1).join(' ') ?? '';
  const starterProfileReview = getCounselorStarterProfileReview({
    wasCounselorCreated: !!dbUser.courseEnrollments[0]?.enrolledByAdminId,
    phone: dbUser.phone,
    profilePhone: dbUser.profile?.profilePhone,
    profileAddress: dbUser.profile?.profileAddress,
    city: dbUser.profile?.city,
    state: dbUser.profile?.state,
    zip: dbUser.profile?.zip,
    referralSource: dbUser.profile?.referralSource,
  });
  const starterProfileMissingLabels = getStarterProfileFieldLabels(starterProfileReview.missing);

  // Ops (9/3/26): the preassessment must never be locked. A counselor-created
  // account with missing contact details gets a reminder above the form, not a
  // wall in front of it.
  const profileReminder = starterProfileReview.required ? (
    <div
      className="wa-kit-card"
      role="note"
      style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}
    >
      <p style={{ margin: 0, color: 'var(--wa-muted)', lineHeight: 1.5, fontSize: 'var(--wa-type-body)', flex: '1 1 280px' }}>
        Your counselor started this account. When you have a minute, confirm your contact and referral
        details in your profile
        {starterProfileMissingLabels.length ? ` (missing: ${starterProfileMissingLabels.join(', ')})` : ''}.
      </p>
      <Link href="/dashboard/profile" className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus hover:wa-opacity-90">
        Review profile
      </Link>
    </div>
  ) : null;

  return (
    <>
      {profileReminder}
      <AssessmentForm
        defaultFirstName={firstName}
        defaultLastName={lastName}
        defaultPhone={dbUser.profile?.profilePhone ?? dbUser.phone ?? ''}
        defaultRedirectTo={redirectTo || undefined}
      />
    </>
  );
}
