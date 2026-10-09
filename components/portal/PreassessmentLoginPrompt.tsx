'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import {
  PREASSESSMENT_PROMPT_DISMISS_KEY,
  PREASSESSMENT_PROMPT_LOGINS,
} from '@/lib/member/preassessmentGate';

/**
 * Logins 1-5 (ops, 10/8/26): a full-screen prompt to take the WIOA
 * Preassessment, with "Not now". Dismissal is remembered for this login only
 * (keyed by login count in sessionStorage), so the next sign-in asks again.
 */
export default function PreassessmentLoginPrompt({ loginCount }: { loginCount: number }) {
  const [open, setOpen] = useState(false);
  const startRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    let dismissedAt: string | null = null;
    try {
      dismissedAt = window.sessionStorage.getItem(PREASSESSMENT_PROMPT_DISMISS_KEY);
    } catch {
      dismissedAt = null;
    }
    setOpen(dismissedAt !== String(loginCount));
  }, [loginCount]);

  useEffect(() => {
    if (open) startRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(PREASSESSMENT_PROMPT_DISMISS_KEY, String(loginCount));
    } catch {
      /* private mode: closing for this page view is enough */
    }
    setOpen(false);
  };

  const remaining = Math.max(0, PREASSESSMENT_PROMPT_LOGINS - loginCount);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="preassessment-prompt-title"
      data-testid="preassessment-login-prompt"
      onKeyDown={(e) => {
        if (e.key === 'Escape') dismiss();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        background: 'rgba(0,0,0,0.55)',
      }}
    >
      <div
        className="wa-kit-card"
        style={{ maxWidth: 440, width: '100%', padding: '22px 20px', background: 'var(--surface-container-lowest, #fff)' }}
      >
        <ClipboardCheck size={28} aria-hidden="true" />
        <h2 id="preassessment-prompt-title" className="wa-text-lg wa-font-bold" style={{ margin: '10px 0 6px' }}>
          Take your WIOA Preassessment
        </h2>
        <p className="wa-kit-lede" style={{ margin: '0 0 8px' }}>
          35 questions. Your counselor uses it for WIOA funding review and to place you in the right training.
          Your answers save as you go.
        </p>
        <p className="wa-kit-lede" style={{ margin: '0 0 16px', fontSize: 'var(--wa-type-meta)' }}>
          {remaining > 0
            ? `You can skip it ${remaining === 1 ? 'one more time' : `${remaining} more times`}. After that it's required before the rest of the portal.`
            : "Next time you sign in it's required before the rest of the portal."}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link ref={startRef} href="/dashboard/assessment" className="wa-kit-cta wa-min-h-11" style={{ padding: '10px 16px' }}>
            Start preassessment
          </Link>
          <button type="button" onClick={dismiss} className="wa-kit-cta wa-kit-cta--ghost wa-min-h-11" style={{ padding: '10px 16px' }}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
