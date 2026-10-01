'use client';

import { useState, useCallback, useRef, useEffect, useId, type CSSProperties } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { scrollBehavior } from '@/lib/a11y/scrollBehavior';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import styles from './MobileApplyFunnel.module.css';

type Step = 'overview' | 'apply' | 'success' | 'tracked';

interface MobileApplyFunnelProps {
  jobId: string;
  authenticated?: boolean;
  jobTitle?: string;
  employerName?: string;
  salaryLine?: string | null;
  location?: string;
  jobType?: string;
  description?: string | null;
  requirements?: string[];
  /** Skip network POSTs — /dev/member proofs. */
  preview?: boolean;
}

export default function MobileApplyFunnel({
  jobId,
  authenticated = true,
  jobTitle,
  employerName,
  salaryLine,
  location,
  jobType,
  description,
  requirements,
  preview = false,
}: MobileApplyFunnelProps) {
  const [step, setStep] = useState<Step>('overview');
  const [applying, setApplying] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [profileShareConsent, setProfileShareConsent] = useState(false);
  const [resumeShareConsent, setResumeShareConsent] = useState(false);
  const submitBtnRef = useRef<HTMLButtonElement>(null);
  const overlayTitleId = useId();

  // Ensure submit button is visible when keyboard opens (Virtual Viewport API)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = (window as any).visualViewport;
    if (!vv) return;

    const handleVisualViewport = () => {
      if (!submitBtnRef.current) return;
      const btn = submitBtnRef.current;
      const btnRect = btn.getBoundingClientRect();
      const visibleBottom = vv.height + vv.offsetTop;
      if (btnRect.bottom > visibleBottom) {
        btn.scrollIntoView({ behavior: scrollBehavior(), block: 'end' });
      }
    };

    vv.addEventListener('resize', handleVisualViewport);
    vv.addEventListener('scroll', handleVisualViewport);
    return () => {
      vv.removeEventListener('resize', handleVisualViewport);
      vv.removeEventListener('scroll', handleVisualViewport);
    };
  }, []);

  const clearErrors = useCallback(() => {
    setError(null);
    setFieldErrors({});
  }, []);

  async function handleApply() {
    clearErrors();
    if (!profileShareConsent) {
      const msg = 'Please check the box to share your profile with the employer.';
      setFieldErrors({ consent: msg });
      setError(msg);
      return;
    }

    setApplying(true);
    if (preview) {
      setStep('success');
      setApplying(false);
      return;
    }
    try {
      const res = await fetch(`/api/dashboard/jobs/${jobId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shareProfile: true,
          shareResume: resumeShareConsent,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setStep('success');
      } else {
        const msg = res.status === 401
          ? 'Please log in to apply.'
          : data.error ?? "We couldn't submit your application. Try again in a moment.";
        setError(msg);
        if (res.status === 401) {
          setFieldErrors({ general: msg });
        }
      }
    } catch {
      setError("We couldn't connect. Check your connection and try again.");
    } finally {
      setApplying(false);
    }
  }

  async function handleAddToTracker() {
    clearErrors();
    setTracking(true);
    if (preview) {
      setStep('tracked');
      setTracking(false);
      return;
    }
    try {
      const res = await fetch('/api/member/job-applications/track-curated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json();
      if (res.ok) {
        setStep('tracked');
      } else {
        setError(data.error ?? "We couldn't save this to your tracker. Try again in a moment.");
      }
    } catch {
      setError("We couldn't connect. Check your connection and try again.");
    } finally {
      setTracking(false);
    }
  }

  function goBack() {
    if (step === 'apply') {
      setStep('overview');
      clearErrors();
    } else if (step === 'success' || step === 'tracked') {
      setStep('apply');
      clearErrors();
    }
  }

  function startApply() {
    setStep('apply');
    clearErrors();
  }

  // Progress indicator
  const progressActive = step === 'overview' ? 1 : step === 'apply' ? 2 : 3;
  const progressText = step === 'apply' ? 'Step 2 of 3' : step === 'success' ? 'Step 3 of 3' : '';

  // The overlay covers the whole viewport (position:fixed inset:0) but, unless
  // trapped, Tab still reaches the page content rendered behind it (this
  // component's own DOM siblings on the job detail page). useFocusTrap moves
  // focus into the overlay on open, cycles Tab within it, restores focus to
  // the trigger on close, and wires Escape to `goBack` (mirrors ConfirmDialog).
  const overlayActive = step !== 'overview';
  const trapRef = useFocusTrap(overlayActive, goBack);

  // Additionally mark everything outside the overlay `inert` while it's open
  // so swipe/rotor navigation (not just Tab) can't reach hidden page content
  // — mirrors the mainRef `inert` toggle in WorkspaceShell.tsx.
  useEffect(() => {
    if (typeof document === 'undefined' || !overlayActive) return;
    const dialogEl = trapRef.current;
    if (!dialogEl) return;
    const restoreFns: Array<() => void> = [];
    let node: HTMLElement | null = dialogEl;
    while (node && node !== document.body) {
      const parent: HTMLElement | null = node.parentElement;
      if (parent) {
        Array.from(parent.children).forEach((child) => {
          if (child === node || !(child instanceof HTMLElement)) return;
          try {
            if ('inert' in child) {
              const el = child as HTMLElement & { inert?: boolean };
              const hadInert = el.inert;
              el.inert = true;
              restoreFns.push(() => { el.inert = hadInert; });
            }
          } catch {
            /* Safari / older browsers — skip; the overlay still visually blocks interaction */
          }
        });
      }
      node = parent;
    }
    return () => restoreFns.forEach((fn) => fn());
  }, [overlayActive, trapRef]);

  const kitBtn =
    'wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none';
  const kitBtnSolid: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    padding: '10px 16px',
    background: 'var(--wa-accent)',
    color: 'var(--wa-on-accent-control)',
    border: '1px solid var(--wa-accent)',
    fontWeight: 600,
    fontSize: 14,
    borderRadius: 999,
    textDecoration: 'none',
    cursor: 'pointer',
    width: '100%',
  };

  // === DESKTOP FALLBACK (inline apply form) ===
  const desktopApply = (
    <div className={`${styles['desktop-apply-container']} wa-kit-card`}>
      {error && (
        <div
          role="alert"
          style={{
            padding: '12px 14px',
            marginBottom: 16,
            borderRadius: 'var(--wa-radius-sm)',
            background: 'var(--wa-danger-soft)',
            color: 'var(--wa-danger)',
            fontSize: 13,
          }}
        >
          {error}
          {error === 'Please log in to apply.' && (
            <Link
              href={`/login?redirectTo=${encodeURIComponent(`/dashboard/jobs/${jobId}`)}`}
              className="wa-kit-focus"
              style={{ marginLeft: 8, color: 'var(--wa-accent)', fontWeight: 600 }}
            >
              Log in
            </Link>
          )}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 12px', color: 'var(--wa-text)' }}>
          Application consent
        </h3>

        <label style={{ display: 'flex', alignItems: 'start', gap: 8, cursor: 'pointer', marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={profileShareConsent}
            onChange={(e) => { setProfileShareConsent(e.target.checked); clearErrors(); }}
            style={{ marginTop: 3, flexShrink: 0, accentColor: 'var(--wa-accent)' }}
          />
          <span style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--wa-text)' }}>
            I consent to share my profile information (name, contact, program, skills) with this employer.
            <span style={{ color: 'var(--wa-accent)' }}> *</span>
          </span>
        </label>

        <label style={{ display: 'flex', alignItems: 'start', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={resumeShareConsent}
            onChange={(e) => setResumeShareConsent(e.target.checked)}
            style={{ marginTop: 3, flexShrink: 0, accentColor: 'var(--wa-accent)' }}
          />
          <span style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--wa-text)' }}>
            Also share my resume with this employer (if available)
          </span>
        </label>

        {fieldErrors.consent && (
          <p style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 13, color: 'var(--wa-danger)', marginTop: 8 }} role="alert">
            <AlertTriangle size={15} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
            {fieldErrors.consent}
          </p>
        )}

        <p style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 12, lineHeight: 1.45 }}>
          Your information will only be shared with this employer for this specific job application.
          You can manage your applications in your{' '}
          <Link href="/dashboard/job-applications" className="wa-kit-focus" style={{ color: 'var(--wa-accent)', fontWeight: 600 }}>
            dashboard
          </Link>
          .
        </p>
      </div>

      <button
        type="button"
        className={kitBtn}
        onClick={handleApply}
        disabled={applying || !profileShareConsent}
        style={kitBtnSolid}
      >
        {applying ? 'Submitting application…' : 'Submit application'}
      </button>

      <p style={{ margin: '16px 0 0', fontSize: 13, color: 'var(--wa-muted)', textAlign: 'center' }}>
        Not ready to apply?{' '}
        <button
          type="button"
          onClick={handleAddToTracker}
          disabled={tracking}
          className="wa-kit-focus"
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            color: 'var(--wa-accent)',
            fontWeight: 600,
            cursor: tracking ? 'wait' : 'pointer',
            textDecoration: 'underline',
          }}
        >
          {tracking ? 'Adding…' : 'Add to my tracker only'}
        </button>
      </p>
    </div>
  );

  // === MOBILE STICKY CTA BAR ===
  const mobileStickyCTA = authenticated && step === 'overview' && (
    <div className={styles['mobile-only']}>
      <div className={styles['mobile-sticky-cta']}>
        <div className={styles['mobile-sticky-cta-info']}>
          <span className={styles['mobile-sticky-cta-title']}>{jobTitle}</span>
          <span className={styles['mobile-sticky-cta-meta']}>{employerName}</span>
        </div>
        <button
          type="button"
          className={styles['mobile-sticky-cta-btn']}
          onClick={startApply}
          aria-label={`Apply to ${jobTitle}`}
        >
          Apply Now
        </button>
      </div>
      <div className={styles['mobile-sticky-cta-spacer']} />
    </div>
  );

  // === MOBILE OVERLAY (apply / success / tracked) ===
  const mobileOverlay = step !== 'overview' && (
    <div className={styles['mobile-only']}>
      <div
        ref={trapRef as React.RefObject<HTMLDivElement>}
        className={styles['mobile-funnel-overlay']}
        role="dialog"
        aria-modal="true"
        aria-labelledby={overlayTitleId}
      >
        {/* Header */}
        <div className={styles['mobile-funnel-header']}>
          <button
            type="button"
            className={styles['mobile-funnel-back-btn']}
            onClick={goBack}
            aria-label="Go back"
          >
            ←
          </button>
          <p id={overlayTitleId} className={styles['mobile-funnel-title']}>
            {step === 'apply' ? 'Review & Submit' : step === 'success' ? 'Application Sent' : 'Saved to Tracker'}
          </p>
          <span className={styles['mobile-funnel-progress']}>{progressText}</span>
        </div>

        {/* Progress bar */}
        <div style={{ padding: '0.75rem 1.25rem 0' }}>
          <div className={styles['mobile-funnel-progress-bar']}>
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className={styles['mobile-funnel-progress-segment'] + (n <= progressActive ? ' ' + styles['active'] : '')}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className={styles['mobile-funnel-body']}>
          {error && (
            <div
              role="alert"
              style={{
                padding: '12px 14px',
                marginBottom: 16,
                borderRadius: 'var(--wa-radius-sm)',
                background: 'var(--wa-danger-soft)',
                color: 'var(--wa-danger)',
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          {step === 'apply' && (
            <>
              <div className={styles['overview-card']} style={{ marginBottom: '1rem' }}>
                <h3 className={styles['overview-title']}>{jobTitle}</h3>
                <p className={styles['overview-meta']}>{employerName} · {location} · {jobType}</p>
                {salaryLine && <p className={styles['overview-salary']}>{salaryLine}</p>}
              </div>

              <div className={styles['consent-card']}>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', marginTop: 0 }}>Application Consent</h4>

                <label className={styles['consent-label']}>
                  <input
                    type="checkbox"
                    checked={profileShareConsent}
                    onChange={(e) => { setProfileShareConsent(e.target.checked); clearErrors(); }}
                    className={styles['consent-checkbox']}
                    aria-invalid={!!fieldErrors.consent}
                  />
                  <span>
                    I consent to share my profile information (name, contact, program, skills) with this employer.
                    <span style={{ color: 'var(--wa-accent)' }}> *</span>
                  </span>
                </label>
                {fieldErrors.consent && (
                  <p className={styles['consent-error']} role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.35rem' }}>
                    <AlertTriangle size={15} aria-hidden="true" style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                    {fieldErrors.consent}
                  </p>
                )}

                <label className={styles['consent-label']}>
                  <input
                    type="checkbox"
                    checked={resumeShareConsent}
                    onChange={(e) => setResumeShareConsent(e.target.checked)}
                    className={styles['consent-checkbox']}
                  />
                  <span>Also share my resume with this employer (if available)</span>
                </label>

                <p className={styles['consent-hint']}>
                  Your information will only be shared with this employer for this specific job application.
                  You can manage your applications in your{' '}
                  <Link href="/dashboard/job-applications" className="wa-kit-focus" style={{ color: 'var(--wa-accent)' }}>dashboard</Link>.
                </p>
              </div>
            </>
          )}

          {step === 'success' && (
            <div className={styles['success-card']}>
              <p className={styles['success-title']}>Application submitted successfully!</p>
              <p className={styles['success-body']}>The employer will review your application and contact you.</p>
              <p className={styles['success-body']}>
                <Link href="/dashboard/job-applications" className="wa-kit-focus" style={{ color: 'var(--wa-accent)', fontWeight: 700 }}>
                  Open Application Tracker
                </Link>
                {' '}to see this role on your board.
              </p>
            </div>
          )}

          {step === 'tracked' && (
            <div className={styles['tracked-card']}>
              <p style={{ fontWeight: 700, margin: 0 }}>Saved to your Application Tracker</p>
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', color: 'var(--wa-muted)' }}>
                We added this job under <strong>Saved</strong>. Update the stage as you apply and interview.
              </p>
              <Link href="/dashboard/job-applications" className={styles['mobile-funnel-btn'] + ' ' + styles['mobile-funnel-btn-primary']} style={{ marginTop: '0.75rem', display: 'inline-flex' }}>
                Go to Application Tracker
              </Link>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles['mobile-funnel-footer']}>
          {step === 'apply' && (
            <>
              <button
                ref={submitBtnRef}
                type="button"
                className={styles['mobile-funnel-btn'] + ' ' + styles['mobile-funnel-btn-primary']}
                onClick={handleApply}
                disabled={applying || !profileShareConsent}
                style={{ scrollMarginBottom: '120px' }}
              >
                {applying ? 'Submitting application…' : 'Submit Application'}
              </button>
              {!profileShareConsent && (
                <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--wa-muted)', textAlign: 'center' }}>
                  Please consent to share your profile to apply
                </p>
              )}
            </>
          )}
          {step === 'success' && (
            <Link href="/dashboard/job-applications" className={styles['mobile-funnel-btn'] + ' ' + styles['mobile-funnel-btn-primary']}>
              Open Application Tracker
            </Link>
          )}
          {step === 'tracked' && (
            <Link href="/dashboard/job-applications" className={styles['mobile-funnel-btn'] + ' ' + styles['mobile-funnel-btn-primary']}>
              Go to Application Tracker
            </Link>
          )}
        </div>
      </div>
    </div>
  );

  // Guest mobile state
  if (!authenticated) {
    return (
      <>
        <div className={styles['mobile-only']}>
          <div className={styles['guest-card']}>
            <Link href={`/login?redirectTo=${encodeURIComponent(`/dashboard/jobs/${jobId}`)}`} className={styles['mobile-funnel-btn'] + ' ' + styles['mobile-funnel-btn-primary']}>
              Log in to apply
            </Link>
            <p className={styles['guest-text']}>You need a WorkforceAP member account to submit an application to this role.</p>
            <p className={styles['guest-text']}>New here?{' '}
              <Link href="/apply" className={styles['guest-link']}>Start your application</Link>
            </p>
          </div>
        </div>
        <div className={`${styles['desktop-apply-container']} wa-kit-card`}>
          <Link
            href={`/login?redirectTo=${encodeURIComponent(`/dashboard/jobs/${jobId}`)}`}
            className={kitBtn}
            style={kitBtnSolid}
          >
            Log in to apply
          </Link>
          <p style={{ marginTop: 12, fontSize: 14, color: 'var(--wa-muted)' }}>
            You need a WorkforceAP member account to submit an application to this role.
          </p>
          <p style={{ marginTop: 8, fontSize: 13, color: 'var(--wa-muted)' }}>
            New here?{' '}
            <Link href="/apply" className="wa-kit-focus" style={{ color: 'var(--wa-accent)', fontWeight: 600 }}>
              Start your application
            </Link>
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {mobileStickyCTA}
      {mobileOverlay}
      {desktopApply}
    </>
  );
}
