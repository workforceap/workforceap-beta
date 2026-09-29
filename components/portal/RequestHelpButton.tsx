'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Headset } from 'lucide-react';
import { useAnnounce } from '@/components/portal/kit/hooks/useAnnounce';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import {
  MEMBER_REQUEST_FAILURE,
  MEMBER_REQUEST_TIMEOUT_MS,
  describeMemberRequestException,
} from '@/lib/portal/memberRequestFailure';
import {
  HELP_REQUEST_FAILURE,
  helpRequestSentNotice,
  type HelpRequestAudience,
  type HelpRequestSent,
} from '@/lib/member/helpContactCopy';

interface RequestHelpButtonProps {
  /**
   * Who the route will email, resolved on the server with the route's own
   * helper (lib/member/helpRequestRecipient.ts). Only the confirmation uses
   * it; omitted = a plain "Request sent." with no name.
   */
  audience?: HelpRequestAudience | null;
  /** `primary` on /dashboard/help; the legacy home keeps the quiet ghost pill. */
  tone?: 'primary' | 'ghost';
}

type State = 'idle' | 'sending' | 'sent' | 'error';

/** Read `sentTo` / `sentToName` from the route's reply; anything unexpected is `null` (no name guessed). */
function readSent(data: { sentTo?: unknown; sentToName?: unknown } | null): HelpRequestSent | null {
  if (data?.sentTo !== 'counselor' && data?.sentTo !== 'team') return null;
  return { to: data.sentTo, name: typeof data.sentToName === 'string' ? data.sentToName : null };
}

/**
 * "Request help": POST /api/member/request-help emails the assigned counselor
 * (or the team inbox) the member's name, email address and program. One send
 * per page view. A failure stays on screen with a Messages fallback instead of
 * resetting to the idle label, and a 429 from the shared contact limiter is
 * named as such rather than as "try again in a minute". The confirmation is
 * spoken through the kit announcer (KIT_GUIDE §8.9): a live region that mounts
 * already filled is often not read.
 */
export default function RequestHelpButton({ audience = null, tone = 'ghost' }: RequestHelpButtonProps) {
  const [state, setState] = useState<State>('idle');
  const [sent, setSent] = useState<HelpRequestSent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const announce = useAnnounce();

  async function handleClick() {
    if (state === 'sending' || state === 'sent') return;
    setState('sending');
    setError(null);
    try {
      const res = await fetchWithTimeout('/api/member/request-help', { method: 'POST', credentials: 'include' }, MEMBER_REQUEST_TIMEOUT_MS);
      if (!res.ok) {
        setError(
          res.status === 429
            ? HELP_REQUEST_FAILURE.limited
            : res.status === 401 || res.status === 403
              ? MEMBER_REQUEST_FAILURE.session
              : HELP_REQUEST_FAILURE.failed,
        );
        setState('error');
        return;
      }
      const reported = readSent((await res.json().catch(() => null)) as { sentTo?: unknown; sentToName?: unknown } | null);
      setSent(reported);
      setState('sent');
      announce(helpRequestSentNotice(reported, audience));
    } catch (err) {
      setError(describeMemberRequestException(err));
      setState('error');
    }
  }

  const label =
    state === 'sending' ? 'Sending…' :
    state === 'sent' ? 'Request sent' :
    state === 'error' ? 'Try again' :
    'Request help';
  const Icon = state === 'sent' ? CheckCircle2 : Headset;

  return (
    <div className="wa-space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={state === 'sending' || state === 'sent'}
        aria-busy={state === 'sending'}
        className={[
          'wa-kit-cta wa-kit-focus enabled:hover:wa-opacity-90 enabled:active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none',
          tone === 'ghost' ? 'wa-kit-cta--ghost' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ cursor: state === 'sending' || state === 'sent' ? 'default' : 'pointer' }}
      >
        <Icon size={18} aria-hidden="true" />
        {label}
      </button>
      {state === 'sent' ? (
        <p className="wa-kit-meta" style={{ margin: 0, color: 'var(--wa-success-dark)', fontWeight: 600 }}>
          {helpRequestSentNotice(sent, audience)}
        </p>
      ) : null}
      {state === 'error' && error ? (
        <p role="alert" className="wa-kit-meta" style={{ margin: 0, color: 'var(--wa-danger-text)', fontWeight: 600 }}>
          {error}{' '}
          <Link href="/dashboard/messages" className="wa-kit-focus" style={{ color: 'var(--wa-accent)' }}>
            Send a message
          </Link>
        </p>
      ) : null}
    </div>
  );
}
