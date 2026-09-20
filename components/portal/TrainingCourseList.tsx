'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import TrackedCourseraLaunchLink from '@/components/portal/TrackedCourseraLaunchLink';
import type { CourseProgressStatus } from '@prisma/client';
import type { ProgramCourse } from '@/lib/content/programs';
import { isWorkforceApCourse, workforceApCourseHref } from '@/lib/content/courseDelivery';
import { useAnnounce } from '@/components/portal/kit/hooks/useAnnounce';

type EnrollNotice = {
  kind: 'success' | 'invited' | 'warning' | 'error';
  message: string;
};

type EnrollmentFocus = {
  programSlug: string;
  trigger: HTMLButtonElement;
  actions: HTMLElement;
  launchHref: string;
  moved: boolean;
  ready: boolean;
  stop: () => void;
};

export type CourseProgressUi = {
  status: CourseProgressStatus;
  percentComplete: number;
  /** Coursera course grade (0–100) when stored as `score_scaled` / synced. */
  gradePercent?: number | null;
};

type TrainingCourseListProps = {
  courses: ProgramCourse[];
  completedSlugs: string[];
  programSlug: string;
  /** When set, overrides status/percent from `completedSlugs` alone (xAPI + stored progress). */
  progressBySlug?: Record<string, CourseProgressUi>;
  /**
   * Eligibility gate for the new "Enroll in this course" CTA. When false
   * (the default for new members until counselor / admin approval), the
   * Enroll button is replaced by a locked-state explanation. The server
   * also re-checks this — the prop is purely for UI conditional render.
   */
  eligibilityApproved?: boolean;
  /**
   * Set of Coursera courseIds (NOT slugs) the learner is currently
   * enrolled in on Coursera. Used to hide "Enroll" for courses already
   * enrolled and surface the existing "Continue Learning" CTA instead.
   */
  enrolledCourseraCourseIds?: string[];
};

function chipClass(status: 'complete' | 'in_progress' | 'not_started', isUpNext: boolean): string {
  if (status === 'complete') return 'training-status-chip training-status-chip--complete';
  if (status === 'in_progress') return 'training-status-chip training-status-chip--progress';
  if (isUpNext) return 'training-status-chip training-status-chip--up-next';
  return 'training-status-chip training-status-chip--pending';
}

function formatGradeLine(pct: number): string {
  const rounded = Math.round(pct * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

export default function TrainingCourseList({
  courses,
  completedSlugs,
  programSlug,
  progressBySlug,
  eligibilityApproved = false,
  enrolledCourseraCourseIds = [],
}: TrainingCourseListProps) {
  const router = useRouter();
  const announce = useAnnounce();
  const [marking, setMarking] = useState<string | null>(null);
  const [markError, setMarkError] = useState<string | null>(null);
  /** Course slug currently being enrolled (button → "Enrolling…"). */
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [enrollNotice, setEnrollNotice] = useState<EnrollNotice | null>(null);
  // Provider acceptance can precede local progress rows. Keep the launch CTA
  // available without inventing progress, and scope this session state by program.
  const [confirmedEnrolledCourseKeys, setConfirmedEnrolledCourseKeys] = useState<Set<string>>(() => new Set());
  const enrollmentFocus = useRef<EnrollmentFocus | null>(null);
  /** Open when the state machine returned `status: 'invited'`. */
  const [invitedModalOpen, setInvitedModalOpen] = useState(false);
  const completedSet = new Set(completedSlugs);
  const enrolledCourseraSet = new Set(enrolledCourseraCourseIds);

  useEffect(() => () => {
    // Stop listening even if the request never settles after navigation.
    enrollmentFocus.current?.stop();
    enrollmentFocus.current = null;
  }, [programSlug]);

  useEffect(() => {
    const pending = enrollmentFocus.current;
    if (!pending?.ready) return;
    pending.stop();
    enrollmentFocus.current = null;
    if (pending.programSlug !== programSlug || pending.moved || !pending.actions.isConnected) return;
    // Disabling/removing the trigger can leave native focus on body. Restore
    // only that lost action focus, never override a deliberate move elsewhere.
    if (document.activeElement !== document.body && document.activeElement !== pending.trigger) return;
    const launch = pending.actions.querySelector<HTMLAnchorElement>('a.training-course-cta-primary');
    if (launch?.isConnected && launch.getAttribute('href') === pending.launchHref) launch.focus();
  }, [confirmedEnrolledCourseKeys, programSlug]);

  const showEnrollNotice = (notice: EnrollNotice) => {
    setEnrollNotice(notice);
    announce(notice.message, notice.kind === 'error' ? 'assertive' : 'polite');
  };

  const getStatus = (slug: string): 'complete' | 'in_progress' | 'not_started' => {
    const row = progressBySlug?.[slug];
    if (row) {
      if (row.status === 'COMPLETED') return 'complete';
      if (row.status === 'IN_PROGRESS') return 'in_progress';
      return 'not_started';
    }
    if (completedSet.has(slug)) return 'complete';
    return 'not_started';
  };

  const handleEnroll = async (course: ProgramCourse, trigger: HTMLButtonElement) => {
    if (!course.courseraCourseId) {
      showEnrollNotice({
        kind: 'error',
        message: "This course isn't linked to Coursera yet. Try again later.",
      });
      return;
    }
    let focus: EnrollmentFocus | null = null;
    if (document.activeElement === trigger && trigger.parentElement) {
      const tracking: EnrollmentFocus = {
        programSlug, trigger, actions: trigger.parentElement,
        launchHref: `/api/member/coursera/launch?course=${encodeURIComponent(course.slug)}`,
        moved: false, ready: false,
        stop: () => document.removeEventListener('focusin', onFocusMove),
      };
      const onFocusMove = (event: FocusEvent) => {
        if (event.target !== trigger) tracking.moved = true;
      };
      enrollmentFocus.current?.stop();
      enrollmentFocus.current = tracking;
      document.addEventListener('focusin', onFocusMove);
      focus = tracking;
    }
    setEnrolling(course.slug);
    setEnrollNotice(null);
    try {
      const res = await fetch('/api/member/coursera/enroll-in-course', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseraCourseId: course.courseraCourseId }),
      });
      const rawPayload: unknown = await res.json().catch(() => null);
      const payload = rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
        ? rawPayload as Record<string, unknown>
        : {};
      if (!res.ok) {
        // Server-side eligibility refusal. The button shouldn't have been
        // visible — but if a stale tab was cached, this is the safety net.
        const msg =
          payload.code === 'NOT_APPROVED'
            ? 'Enrollment is locked. Your counselor will enable this when funding is confirmed.'
            : typeof payload.error === 'string' ? payload.error : 'Could not enroll. Please try again.';
        showEnrollNotice({ kind: 'error', message: msg });
        return;
      }
      if (payload.status === 'invited') {
        setInvitedModalOpen(true);
        showEnrollNotice({
          kind: 'invited',
          message:
            typeof payload.message === 'string' ? payload.message : 'Check your email — Coursera sent an invite.',
        });
        return;
      }
      if (payload.status !== 'enrolled' && payload.status !== 'membership-created-and-enrolled' && payload.status !== 'already-enrolled') {
        showEnrollNotice({
          kind: 'error',
          message: 'We couldn’t confirm the enrollment result. Check your course access in Coursera or contact your counselor.',
        });
        return;
      }
      if (focus && enrollmentFocus.current === focus) focus.ready = true;
      setConfirmedEnrolledCourseKeys((previous) => new Set(previous).add(`${programSlug}:${course.courseraCourseId}`));
      const syncStatus = payload.sync && typeof payload.sync === 'object'
        ? (payload.sync as Record<string, unknown>).status
        : undefined;
      if (payload.status === 'already-enrolled') {
        showEnrollNotice({
          kind: 'success',
          message: 'Coursera reports you’re already enrolled. Open the course to continue; progress updates may take a few minutes.',
        });
      } else if (syncStatus === 'failed_to_start') {
        showEnrollNotice({
          kind: 'warning',
          message: 'Coursera accepted your enrollment, but we couldn’t start the progress refresh. You can still open the course. If progress stays missing, message your counselor.',
        });
      } else {
        showEnrollNotice({
          kind: 'success',
          message: syncStatus === 'requested'
            ? 'Coursera accepted your enrollment. A progress refresh has been requested; updates may take a few minutes.'
            : 'Coursera accepted your enrollment. Progress updates may take a few minutes.',
        });
      }
      router.refresh();
    } catch {
      showEnrollNotice({
        kind: 'error',
        message: 'Could not reach the server. Check your connection and try again.',
      });
    } finally {
      if (focus && !focus.ready) {
        focus.stop();
        if (enrollmentFocus.current === focus) enrollmentFocus.current = null;
      }
      setEnrolling(null);
    }
  };

  const handleMarkComplete = async (slug: string) => {
    setMarking(slug);
    setMarkError(null);
    try {
      const res = await fetch('/api/member/courses/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseSlug: slug, programSlug }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setMarkError(data.error ?? 'Could not mark course complete. Please try again.');
      }
    } catch {
      setMarkError('Could not mark course complete. Please try again.');
    } finally {
      setMarking(null);
    }
  };

  const firstNotStartedSlug = courses.find((c) => getStatus(c.slug) !== 'complete')?.slug ?? null;

  const statusLabel = (slug: string) => {
    const s = getStatus(slug);
    if (s === 'complete') return 'Complete';
    if (s === 'in_progress') {
      const pct = progressBySlug?.[slug]?.percentComplete;
      return pct != null && pct > 0 ? `${pct}% complete` : 'In progress';
    }
    return 'Not started';
  };

  if (courses.length === 0) {
    return (
      <div
        className="training-empty-courses"
        role="status"
        aria-live="polite"
        style={{ background: 'var(--surface-container-low)' }}
      >
        <p className="training-empty-courses__text">
          Your course list isn&apos;t loaded yet — this usually means your program&apos;s catalog is still being set up.
        </p>
        <Link
          href="/dashboard/messages"
          className="btn btn-outline btn-sm"
          style={{ marginTop: '0.75rem', display: 'inline-flex' }}
        >
          Message your counselor
        </Link>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {enrollNotice && (
        <div
          role="note"
          style={{
            padding: 'var(--wa-pad-sm)',
            borderRadius: 'var(--wa-radius-sm)',
            background:
              enrollNotice.kind === 'error'
                ? 'var(--wa-danger-soft)'
                : enrollNotice.kind === 'warning'
                  ? 'var(--wa-gold-soft)'
                : enrollNotice.kind === 'invited'
                  ? 'var(--wa-info-soft)'
                  : 'var(--wa-success-soft)',
            border: '1px solid var(--wa-border)',
            color: 'var(--wa-text)',
            fontSize: 'var(--wa-type-body)',
          }}
        >
          {enrollNotice.message}
        </div>
      )}
      {invitedModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="enroll-invited-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={() => setInvitedModalOpen(false)}
        >
          <div
            style={{
              maxWidth: '28rem',
              background: 'var(--surface-container-lowest)',
              borderRadius: 'var(--radius-lg, 0.75rem)',
              padding: '1.5rem',
              boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="enroll-invited-title" style={{ margin: '0 0 0.75rem', fontSize: '1.1rem', fontWeight: 700 }}>
              Check your email
            </h3>
            <p style={{ margin: '0 0 1rem', lineHeight: 1.5, fontSize: '0.95rem' }}>
              We&apos;ve asked Coursera to send you an invitation. Open the email,
              accept the invite, finish creating your Coursera account, then come
              back here and click <strong>Enroll</strong> again to start the course.
            </p>
            <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
              No email after a few minutes? Check spam, or message your counselor — we
              can resend the invite.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setInvitedModalOpen(false)}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
      {markError && (
        <div
          role="alert"
          style={{
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(200, 50, 50, 0.08)',
            border: '1px solid rgba(200, 50, 50, 0.25)',
            color: 'var(--color-error, #c83232)',
            fontSize: '0.9rem',
          }}
        >
          {markError}
        </div>
      )}
      {courses.map((c) => {
        const status = getStatus(c.slug);
        const isComplete = status === 'complete';
        const isUpNext = !isComplete && c.slug === firstNotStartedSlug;
        const pct = progressBySlug?.[c.slug]?.percentComplete;
        const gradePct = progressBySlug?.[c.slug]?.gradePercent;
        const showBar = !isComplete && pct != null && pct > 0 && pct < 100;
        const workforceApModule = isWorkforceApCourse(c);
        const primaryCta =
          isUpNext || status === 'in_progress' ? 'Continue in Coursera' : 'Open in Coursera';

        return (
          <div
            key={c.slug}
            id={`course-${c.slug}`}
            data-course-slug={c.slug}
            data-course-id={c.courseraCourseId ?? undefined}
            className={`training-course-card${isUpNext ? ' training-course-card--up-next' : ''}`}
            style={{
              padding: '1.25rem',
              border: '1px solid var(--outline-variant)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div className="training-course-card__main">
              <h3 className="training-course-card__title" style={{ fontSize: '1.05rem', margin: '0 0 0.35rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
                {c.name}
              </h3>
              <span style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
                est. {c.estimatedHours} hrs
              </span>
              {isUpNext ? (
                <span className="training-course-up-next" style={{ display: 'block', marginTop: '0.35rem' }}>
                  Up next →
                </span>
              ) : null}
              {isComplete ? (
                <>
                  <p
                    style={{
                      fontSize: '0.8125rem',
                      margin: '0 0 0.25rem',
                      color: 'var(--color-on-surface-variant)',
                    }}
                  >
                    100% complete
                  </p>
                  <div className="training-course-progress">
                    <div className="training-course-progress__track" role="progressbar" aria-valuenow={100} aria-valuemin={0} aria-valuemax={100} aria-label={`${c.name} progress`}>
                      <div className="training-course-progress__fill training-course-progress__fill--complete" style={{ width: '100%' }} />
                    </div>
                  </div>
                </>
              ) : showBar ? (
                <>
                  <p
                    style={{
                      fontSize: '0.8125rem',
                      margin: '0 0 0.25rem',
                      color: 'var(--color-on-surface-variant)',
                    }}
                  >
                    {pct}% complete
                  </p>
                  <div className="training-course-progress">
                    <div className="training-course-progress__track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${c.name} progress`}>
                      <div className="training-course-progress__fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p
                    style={{
                      fontSize: '0.8125rem',
                      margin: '0 0 0.25rem',
                      color: 'var(--color-on-surface-variant)',
                    }}
                  >
                    0% complete
                  </p>
                  <div className="training-course-progress">
                    <div className="training-course-progress__track" role="progressbar" aria-valuenow={0} aria-valuemin={0} aria-valuemax={100} aria-label={`${c.name} progress`}>
                      <div className="training-course-progress__fill" style={{ width: '0%' }} />
                    </div>
                  </div>
                </>
              )}
              {!workforceApModule && gradePct != null && Number.isFinite(gradePct) ? (
                <p
                  style={{
                    fontSize: '0.8125rem',
                    marginTop: '0.35rem',
                    marginBottom: 0,
                    color: 'var(--color-on-surface-variant)',
                  }}
                >
                  Grade: {formatGradeLine(gradePct)}% (Coursera)
                </p>
              ) : null}
            </div>
            <div className="training-course-card__actions">
              <span className={chipClass(status, isUpNext)}>{statusLabel(c.slug)}</span>
              {/* Enroll / Continue / Locked tri-state. The B4B "Enroll" path is
                  gated behind three checks:
                    1. eligibilityApproved — server-truth flag, hides button
                       entirely for unapproved members.
                    2. enrolledCourseraSet — once enrolled on Coursera the
                       Continue button is the right CTA, not Enroll.
                    3. status/pct — if the learner already has progress
                       (status='in_progress' OR percentComplete > 0), they're
                       effectively studying the course already; B4B sometimes
                       still rejects Enroll calls in that state with
                       "Cannot find courses" because the course isn't in this
                       org's B4B program (the user reached it via direct
                       Coursera access). Showing the Enroll button there
                       produces a 400 error banner on click. Treat any real
                       progress as enrolled for UI purposes.
                  Already-complete courses skip all of this — they get the
                  existing "Open in Coursera" review link. */}
              {workforceApModule ? (
                <Link
                  href={workforceApCourseHref(c.slug, programSlug)}
                  className="btn btn-primary training-course-cta-primary"
                  aria-label={`Open WorkforceAP module: ${c.name}`}
                >
                  Open lab instructions
                </Link>
              ) : !isComplete &&
              c.courseraCourseId &&
              !enrolledCourseraSet.has(c.courseraCourseId) &&
              !confirmedEnrolledCourseKeys.has(`${programSlug}:${c.courseraCourseId}`) &&
              status === 'not_started' &&
              (pct ?? 0) === 0 ? (
                eligibilityApproved ? (
                  <button
                    type="button"
                    className="btn btn-primary training-course-cta-primary"
                    data-course-slug={c.slug}
                    data-course-id={c.courseraCourseId}
                    onClick={(event) => handleEnroll(c, event.currentTarget)}
                    disabled={enrolling !== null}
                    aria-busy={enrolling === c.slug}
                    aria-label={
                      enrolling === c.slug
                        ? `Enrolling in ${c.name}`
                        : `Enroll in this course: ${c.name}`
                    }
                  >
                    {enrolling === c.slug ? 'Enrolling…' : 'Enroll in this course'}
                  </button>
                ) : (
                  <span
                    className="training-course-locked"
                    role="note"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.45rem 0.75rem',
                      borderRadius: 'var(--radius-md, 0.5rem)',
                      background: 'var(--surface-container-high)',
                      border: '1px dashed var(--outline-variant)',
                      fontSize: '0.85rem',
                      color: 'var(--color-on-surface-variant)',
                      maxWidth: '22rem',
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: '1rem' }}
                      aria-hidden="true"
                    >
                      lock
                    </span>
                    Enrollment locked — your counselor will enable this when
                    funding is confirmed.
                  </span>
                )
              ) : (
                <TrackedCourseraLaunchLink
                  href={`/api/member/coursera/launch?course=${encodeURIComponent(c.slug)}`}
                  className="btn btn-primary training-course-cta-primary"
                  aria-label={`${primaryCta}: ${c.name} (opens in a new tab)`}
                  courseSlug={c.slug}
                >
                  {primaryCta}
                </TrackedCourseraLaunchLink>
              )}
              {!isComplete && (
                <button
                  type="button"
                  className="btn btn-outline"
                  data-course-slug={c.slug}
                  data-course-id={c.courseraCourseId ?? undefined}
                  onClick={() => handleMarkComplete(c.slug)}
                  disabled={!!marking}
                  aria-busy={marking === c.slug}
                  aria-label={marking === c.slug ? `Saving completion for ${c.name}` : `Mark ${c.name} complete`}
                >
                  {marking === c.slug ? 'Saving…' : 'Mark complete'}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
