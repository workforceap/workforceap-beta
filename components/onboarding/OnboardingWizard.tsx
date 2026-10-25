'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface OnboardingStep {
  title: string;
  subtitle?: string;
  content: React.ReactNode;
}

export interface OnboardingWizardProps {
  portal: 'member' | 'employer' | 'partner';
  steps: OnboardingStep[];
  onComplete: () => void;
  /** Called before leaving step `index` (current step). Return false to stay on the step (e.g. validation failed). */
  stepHooks?: {
    beforeNext?: (stepIndex: number) => void | boolean | Promise<void | boolean>;
  };
  /** Last step provides its own actions (e.g. employer dual CTA). */
  hideFooterOnLastStep?: boolean;
  /** Re-hydrate from DB so returning users resume where they left off. */
  initialStep?: number;
  /** Runs the flow locally without persisting progress or completion. */
  previewOnly?: boolean;
}

export default function OnboardingWizard({
  portal,
  steps,
  onComplete,
  stepHooks,
  hideFooterOnLastStep,
  initialStep = 0,
  previewOnly = false,
}: OnboardingWizardProps) {
  const [step, setStep] = useState(() => Math.min(Math.max(initialStep, 0), steps.length - 1));
  const [exiting, setExiting] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);

  /** Persist current step index to DB so returning users resume where they left off.
   *  Returns true on success, false on failure so callers can react. */
  const persistStep = useCallback(async (nextStep: number) => {
    if (previewOnly) return true;
    try {
      const res = await fetch('/api/onboarding/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portal, step: nextStep }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, [portal, previewOnly]);

  /** Re-hydrate the DB with the current step on mount so partially-completed
   *  sessions that were restored from DB are immediately re-persisted. This
   *  prevents the step from being lost if the user closes the tab before
   *  navigating. */
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    if (step > 0 && step < steps.length - 1) {
      void persistStep(step);
    }
  }, [step, steps.length, persistStep]);

  const finish = useCallback(async () => {
    if (!previewOnly) {
      try {
        await fetch('/api/onboarding/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ portal }),
        });
      } catch {
        /* still dismiss */
      }
    }
    setExiting(true);
    setTimeout(() => onComplete(), 200);
  }, [onComplete, portal, previewOnly]);

  /** Skip the rest of onboarding and mark it complete. */
  const skip = useCallback(() => {
    void finish();
  }, [finish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finish]);

  /** Persist current step before the user closes the tab so partially-
   *  completed steps are not lost. Uses sendBeacon for reliability. */
  useEffect(() => {
    if (previewOnly) return;
    const onBeforeUnload = () => {
      const data = JSON.stringify({ portal, step });
      const blob = new Blob([data], { type: 'application/json' });
      navigator.sendBeacon('/api/onboarding/step', blob);
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [portal, step, previewOnly]);

  useEffect(() => {
    const root = panelRef.current;
    if (!root) return;
    const focusables = () =>
      Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    const list = focusables();
    list[0]?.focus();

    const onTrap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (!first || !last) return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    root.addEventListener('keydown', onTrap);
    return () => root.removeEventListener('keydown', onTrap);
  }, [step]);

  const last = step >= steps.length - 1;

  /** Advance to the next step. Persist the step BEFORE running the beforeNext
   *  hook so that even if the user closes the tab during the hook's async
   *  work (e.g. saving profile data), the step index is already durable. */
  const goNext = () => {
    void (async () => {
      if (last && !(hideFooterOnLastStep && step === steps.length - 1)) {
        await finish();
        return;
      }
      if (!last) {
        const next = Math.min(step + 1, steps.length - 1);
        setStep(next);
        const persisted = await persistStep(next);
        if (!persisted) {
          /* If persistence failed, roll back to the previous step so the
           * user can retry instead of silently advancing with lost state. */
          setStep(step);
          return;
        }
        const hookResult = await stepHooks?.beforeNext?.(step);
        if (hookResult === false) {
          /* Validation failed — roll back both UI and DB to the step we were on. */
          setStep(step);
          void persistStep(step);
        }
      }
    })();
  };

  const goBack = () => {
    const prev = Math.max(0, step - 1);
    setStep(prev);
    void persistStep(prev);
  };

  const current = steps[step];
  if (!current) return null;

  return (
    <div
      className="wa-fixed wa-inset-0 wa-z-50 wa-flex wa-items-center wa-justify-center wa-p-4 wa-bg-slate-900/60 wa-backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wa-onboarding-title"
    >
      <div
        ref={panelRef}
        className={`wa-relative wa-w-full wa-max-w-lg wa-max-h-[90vh] wa-overflow-y-auto wa-rounded-xl wa-bg-white wa-shadow-xl wa-ring-1 wa-ring-black/5 wa-transition-opacity wa-duration-200 dark:wa-bg-slate-900 dark:wa-ring-slate-700 ${exiting ? 'wa-opacity-0' : 'wa-opacity-100'}`}
      >
        <div className="wa-sticky wa-top-0 wa-z-10 wa-bg-white wa-border-b wa-border-slate-100 wa-px-6 wa-pt-5 wa-pb-3 dark:wa-border-slate-700 dark:wa-bg-slate-900">
          <div className="wa-flex wa-gap-1.5 wa-justify-center wa-mb-3">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`wa-h-2 wa-w-2 wa-rounded-full ${i === step ? 'wa-bg-brand-accent' : 'wa-bg-slate-200'}`}
                aria-hidden
              />
            ))}
          </div>
          <h2 id="wa-onboarding-title" className="wa-text-lg wa-font-semibold wa-text-slate-900 dark:wa-text-slate-100">
            {current.title}
          </h2>
          {current.subtitle ? (
            <p className="wa-mt-1 wa-text-sm wa-text-slate-600 dark:wa-text-slate-300">{current.subtitle}</p>
          ) : null}
        </div>

        <div className="wa-px-6 wa-py-4 wa-text-slate-800 dark:wa-text-slate-200">{current.content}</div>

        <div className="wa-border-t wa-border-slate-100 wa-px-6 wa-py-4 dark:wa-border-slate-700">
          <div className="wa-flex wa-flex-col wa-gap-3 sm:wa-flex-row sm:wa-items-center sm:wa-justify-between">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 0}
              className="wa-order-1 wa-rounded-lg wa-border wa-border-slate-200 wa-bg-white wa-px-4 wa-py-2 wa-text-sm wa-font-medium wa-text-slate-800 disabled:wa-opacity-40 dark:wa-border-slate-600 dark:wa-bg-slate-800 dark:wa-text-slate-100 sm:wa-order-none"
            >
              Back
            </button>
            <div className="wa-order-3 wa-flex wa-w-full wa-flex-wrap wa-items-center wa-justify-stretch wa-gap-2 sm:wa-order-2 sm:wa-w-auto sm:wa-justify-end">
              <button
                type="button"
                onClick={() => void skip()}
                className="wa-min-h-[40px] wa-flex-1 wa-rounded-lg wa-border wa-border-slate-200 wa-bg-slate-50 wa-px-4 wa-py-2 wa-text-sm wa-font-medium wa-text-slate-600 wa-transition-colors hover:wa-bg-slate-100 hover:wa-text-slate-800 dark:wa-border-slate-600 dark:wa-bg-slate-800/80 dark:wa-text-slate-300 dark:hover:wa-bg-slate-800 dark:hover:wa-text-slate-100 sm:wa-flex-initial"
              >
                Skip setup
              </button>
              {!(hideFooterOnLastStep && last) ? (
                <button
                  type="button"
                  onClick={goNext}
                  className="wa-min-h-[40px] wa-flex-1 wa-rounded-lg wa-bg-brand-accent wa-px-4 wa-py-2 wa-text-sm wa-font-semibold wa-text-white hover:wa-bg-brand-accent-dark sm:wa-flex-initial"
                >
                  {last ? 'Finish' : 'Next'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

