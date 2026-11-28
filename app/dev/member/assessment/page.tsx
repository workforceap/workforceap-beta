import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ClipboardCheck, Lock } from 'lucide-react';
import { DesignSurface, PageOpener } from '@/components/portal/kit';
import AssessmentForm from '@/components/portal/AssessmentForm';
import { assessmentConfirmMessage } from '@/lib/member/assessmentConfirmMessage';
import MemberInterviewRequestButton from '@/components/portal/MemberInterviewRequestButton';
import { computeWapat } from '@/lib/assessment/wapat';

/**
 * Credential-free Training Preassessment proofs.
 *   /dev/member/assessment                — completed results (the live broken-link case)
 *   /dev/member/assessment?state=locked   — intake lock
 *   /dev/member/assessment?state=form      — wizard (About you)
 *   /dev/member/assessment?state=questions — wizard (answer cards)
 *   /dev/member/assessment?state=confirm   — post-submit score billboard
 */
export const dynamic = 'force-dynamic';

export default async function DevMemberAssessmentPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const { state } = await searchParams;
  const view =
    state === 'locked' || state === 'form' || state === 'questions' || state === 'confirm'
      ? state
      : 'completed';

  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--wa-pad-sm)' }} className="wa-space-y-6">
        <PageOpener
          kicker="Preassessment"
          title="Skills check"
          lede={
            view === 'completed'
              ? 'On file for you and your counselor.'
              : 'Complete this check. It is a placement check for you and your counselor and does not unlock Coursera.'
          }
          icon={<ClipboardCheck size={13} aria-hidden="true" />}
        />
        <div style={{ maxWidth: 720 }}>
          {view === 'completed' ? (
            <div className="wa-kit-card">
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
                82
                <span style={{ marginLeft: '0.12em', fontSize: '0.38em', fontWeight: 700, color: 'var(--wa-muted)' }}>%</span>
              </p>
              <h2 style={{ margin: '0.75rem 0 0.35rem', fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em' }}>
                Preassessment complete
              </h2>
              <p style={{ color: 'var(--wa-muted)', lineHeight: 1.5, margin: '0 0 1.25rem', fontSize: 'var(--wa-type-body)' }}>
                Finished Aug 12, 2026 · CompTIA A+ Professional Certificate
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                <Link
                  href="/dev/member/program"
                  className="wa-kit-cta wa-kit-focus hover:wa-opacity-90"
                >
                  Continue training
                </Link>
                <Link
                  href="/dev/member/home"
                  className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus hover:wa-opacity-90"
                >
                  Open home
                </Link>
              </div>
            </div>
          ) : view === 'locked' ? (
            <div className="wa-kit-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Lock size={18} aria-hidden="true" style={{ color: 'var(--wa-muted)', flexShrink: 0 }} />
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em' }}>
                  Unlocks after intake
                </h2>
              </div>
              <p style={{ color: 'var(--wa-muted)', lineHeight: 1.6, marginBottom: 16, fontSize: 'var(--wa-type-body)' }}>
                Complete intake first. Then this check unlocks.
              </p>
              <MemberInterviewRequestButton preview />
            </div>
          ) : view === 'questions' ? (
            <AssessmentForm
              defaultFirstName="Mike"
              defaultLastName="Brown"
              defaultPhone="512-555-0100"
              previewStep={2}
            />
          ) : view === 'confirm' ? (
            <AssessmentForm
              defaultFirstName="Mike"
              defaultLastName="Brown"
              defaultPhone="512-555-0100"
              previewOutcome={{
                pct: 82,
                message: assessmentConfirmMessage(82),
                // Synthetic: 8/10 vocabulary, 11/14 reading, 7/11 math.
                wapat: computeWapat(Array.from({ length: 35 }, (_, i) => ({ id: i + 1, answer: 'A', correct: i < 8 || (i >= 10 && i < 21) || (i >= 24 && i < 31) }))),
              }}
            />
          ) : (
            <AssessmentForm
              defaultFirstName="Mike"
              defaultLastName="Brown"
              defaultPhone="512-555-0100"
            />
          )}
        </div>
      </div>
    </DesignSurface>
  );
}
