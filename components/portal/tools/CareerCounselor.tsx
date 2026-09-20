'use client';

import { useState, useEffect, useRef } from 'react';
import { Mic, Volume2, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';
import type { Conversation } from '@elevenlabs/client';
import {
  appendVoiceTranscriptTurn,
  extractVoiceTranscriptTurn,
  type VoiceTranscriptTurn,
} from '@/lib/interview/voiceTranscript';
import ToolFollowThrough from './ToolFollowThrough';

type Phase = 'pre' | 'connecting' | 'active' | 'ending' | 'plan';

type FeedbackResponse = {
  saved?: boolean;
  steps?: string[];
  error?: string;
};

const FEEDBACK_SAVE_WARNING =
  'Your transcript could not be saved, so no action plan was created. Please start a new session and try again.';
const EMPTY_TRANSCRIPT_WARNING =
  'No conversation transcript was captured, so nothing was saved. Please start a new session and try again.';

// Supporting blue lane for student career-coaching conversations.
const ACCENT = '#2b7bb9';
const ACCENT_DARK = '#1f5a87';
const ACCENT_BG = 'rgba(43, 123, 185, 0.12)';
const ACCENT_BORDER = 'rgba(43, 123, 185, 0.28)';

// Pulse animation keyframes injected once
const PULSE_STYLE = `
@keyframes cc-breathe {
  0%, 100% { transform: scale(1); opacity: 0.9; }
  50% { transform: scale(1.08); opacity: 1; }
}
@keyframes cc-pulse-ring {
  0% { transform: scale(0.95); opacity: 0.6; }
  70% { transform: scale(1.15); opacity: 0; }
  100% { transform: scale(1.15); opacity: 0; }
}
`;

export default function CareerCounselor({ firstName }: { firstName?: string }) {
  const tCommon = useTranslations('common');
  const [phase, setPhase] = useState<Phase>('pre');
  const [voiceError, setVoiceError] = useState('');
  const [steps, setSteps] = useState<string[]>([]);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [agentSpeaking, setAgentSpeaking] = useState(false);

  const convRef = useRef<Conversation | null>(null);
  const transcriptRef = useRef<VoiceTranscriptTurn[]>([]);
  const intentionalRef = useRef(false);

  // Inject animation styles once
  useEffect(() => {
    if (document.getElementById('cc-styles')) return;
    const el = document.createElement('style');
    el.id = 'cc-styles';
    el.textContent = PULSE_STYLE;
    document.head.appendChild(el);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      intentionalRef.current = true;
      convRef.current?.endSession();
    };
  }, []);

  async function startSession() {
    setVoiceError('');
    setPhase('connecting');

    try {
      // Request mic
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      setVoiceError('Microphone access is required. Please allow it in your browser and try again.');
      setPhase('pre');
      return;
    }

    let signedUrl: string;
    let dynamicVariables: Record<string, string | number | boolean> | undefined;
    try {
      const res = await fetch('/api/counselor/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audience: 'member' }),
      });
      const data = await res.json() as {
        signedUrl?: string;
        dynamicVariables?: Record<string, string | number | boolean>;
        error?: string;
      };
      if (!res.ok || !data.signedUrl) {
        throw new Error(data.error ?? 'Failed to start session');
      }
      signedUrl = data.signedUrl;
      dynamicVariables = data.dynamicVariables;
    } catch (err) {
      setVoiceError(requestFailureMessage(err, { connection: tCommon('connectionError'), fallback: 'Could not connect. Please try again.' }, 'career-counselor-session'));
      setPhase('pre');
      return;
    }

    transcriptRef.current = [];

    try {
      const { Conversation } = await import('@elevenlabs/client');
      const conv = await Conversation.startSession({
        signedUrl,
        ...(dynamicVariables && Object.keys(dynamicVariables).length > 0
          ? { dynamicVariables }
          : {}),
        onConnect: () => setPhase('active'),
        onDisconnect: (details) => {
          if (!intentionalRef.current) {
            if ((details as { reason?: string })?.reason === 'error') {
              setVoiceError((details as { message?: string })?.message ?? 'Connection lost');
            }
            void getFeedback();
          }
          intentionalRef.current = false;
        },
        onMessage: (event) => {
          const turn = extractVoiceTranscriptTurn(event);
          transcriptRef.current = appendVoiceTranscriptTurn(transcriptRef.current, turn);
          if (turn) setAgentSpeaking(turn.role === 'agent');
        },
        onError: (msg) => {
          setVoiceError(String(msg) || 'Connection error');
          setPhase('pre');
        },
      });
      convRef.current = conv;
    } catch (err) {
      setVoiceError(String(err));
      setPhase('pre');
    }
  }

  function endSession() {
    intentionalRef.current = true;
    setPhase('ending');
    convRef.current?.endSession();
    void getFeedback();
  }

  async function getFeedback() {
    setPhase('ending');
    setVoiceError('');
    setSteps([]);
    setChecked([]);

    if (transcriptRef.current.length === 0) {
      setVoiceError(EMPTY_TRANSCRIPT_WARNING);
      setPhase('pre');
      return;
    }

    try {
      const res = await fetch('/api/counselor/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: transcriptRef.current }),
      });
      const data = await res.json() as FeedbackResponse;
      if (!res.ok || data.saved !== true) {
        throw new Error(data.error ?? FEEDBACK_SAVE_WARNING);
      }
      const actionSteps = data.steps ?? [];
      if (actionSteps.length === 0) {
        throw new Error('Your transcript was saved, but an action plan could not be created. Please start a new session and try again.');
      }
      setSteps(actionSteps);
      setChecked(actionSteps.map(() => false));
      setPhase('plan');
    } catch (error) {
      setVoiceError(requestFailureMessage(error, { connection: FEEDBACK_SAVE_WARNING, fallback: FEEDBACK_SAVE_WARNING }, 'career-counselor-feedback'));
      setPhase('pre');
    }
  }

  function reset() {
    intentionalRef.current = true;
    convRef.current?.endSession();
    convRef.current = null;
    transcriptRef.current = [];
    intentionalRef.current = false;
    setPhase('pre');
    setVoiceError('');
    setSteps([]);
    setChecked([]);
    setAgentSpeaking(false);
  }

  function toggleStep(i: number) {
    setChecked((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  }

  // ── Pre-session ────────────────────────────────────────────────────────────
  if (phase === 'pre') {
    return (
      <div style={{ maxWidth: 560, animation: 'cc-fade-in 0.4s ease forwards' }}>
        {/* Ambient orb */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
          <div style={{ position: 'relative', width: 96, height: 96 }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: `radial-gradient(circle at 35% 35%, ${ACCENT}, ${ACCENT_DARK})`,
              animation: 'cc-breathe 3.5s ease-in-out infinite',
              boxShadow: `0 0 32px ${ACCENT}55, 0 0 64px ${ACCENT}22`,
            }} />
          </div>
        </div>

        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-on-surface)', marginBottom: '0.5rem', textAlign: 'center' }}>
          {firstName ? `Hi ${firstName}.` : 'Hi there.'} Ready when you are.
        </h2>
        <p style={{ color: 'var(--color-on-surface-variant)', textAlign: 'center', marginBottom: '2rem', lineHeight: 1.6, fontSize: '0.95rem' }}>
          This is a one-on-one conversation with Lilley, your AI career coach.
          Speak naturally about your training, job search, or next step.
        </p>

        <p id="lilley-data-use" style={{ marginBottom: '1.25rem', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', textAlign: 'center', lineHeight: 1.5 }}>
          ElevenLabs processes your microphone audio and live transcript during this session.
          WorkforceAP may share only the saved next-step, program, and progress facts needed for
          Lilley through approved read-only tools. If a transcript is captured, WorkforceAP saves it
          to your AI history and uses it to update coach memory; it may also email the transcript to
          configured WorkforceAP support recipients. Avoid sharing sensitive personal information.{' '}
          <a href="/privacy" style={{ color: 'inherit', textDecoration: 'underline' }}>
            Privacy details
          </a>
        </p>

        {voiceError && (
          <div role="alert" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.85rem', color: 'var(--color-error, #b91c1c)', fontWeight: 600 }}>
            {voiceError}
          </div>
        )}

        <button type="button"
          onClick={startSession}
          aria-describedby="lilley-data-use"
          style={{
            display: 'block', width: '100%', background: ACCENT, color: '#fff',
            border: 0, borderRadius: 10, padding: '1rem', fontWeight: 700,
            fontSize: '1.05rem', cursor: 'pointer', marginBottom: '1.75rem',
            boxShadow: `0 4px 24px ${ACCENT}44`,
            transition: 'opacity 0.15s',
          }}
        >
          Start Session
        </button>

        <div style={{ borderTop: `1px solid var(--surface-container-high)`, paddingTop: '1.25rem' }}>
          <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface-variant)', marginBottom: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            What to expect
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[
              '3–5 minute conversation at your own pace',
              'Ask about training, your job search, or your next step',
              "You'll get a personalized action plan after",
            ].map((item) => (
              <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                <Check size={16} aria-hidden="true" style={{ color: ACCENT, marginTop: '0.1rem', flexShrink: 0 }} />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // ── Connecting ─────────────────────────────────────────────────────────────
  if (phase === 'connecting') {
    return (
      <div style={{ maxWidth: 560, textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
          <div style={{ position: 'relative', width: 80, height: 80 }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: `radial-gradient(circle at 35% 35%, ${ACCENT}, ${ACCENT_DARK})`,
              animation: 'cc-breathe 1.8s ease-in-out infinite',
            }} />
          </div>
        </div>
        <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.95rem' }}>
          Getting your session ready…
        </p>
      </div>
    );
  }

  // ── Active session ─────────────────────────────────────────────────────────
  if (phase === 'active') {
    return (
      <div style={{ maxWidth: 560, animation: 'cc-fade-in 0.4s ease forwards' }}>
        {/* Orb with pulse ring */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.75rem' }}>
          <div style={{ position: 'relative', width: 96, height: 96 }}>
            {/* Pulse ring */}
            <div style={{
              position: 'absolute', inset: -8, borderRadius: '50%',
              border: `2px solid ${ACCENT}`,
              animation: 'cc-pulse-ring 2s ease-out infinite',
            }} />
            {/* Orb */}
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: `radial-gradient(circle at 35% 35%, ${ACCENT}, ${ACCENT_DARK})`,
              animation: 'cc-breathe 2s ease-in-out infinite',
              boxShadow: `0 0 40px ${ACCENT}66`,
            }} />
          </div>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-on-surface)', marginBottom: '0.4rem' }}>
            {agentSpeaking ? 'Lilley is speaking…' : 'Listening — speak when ready'}
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
            padding: '0.25rem 0.75rem', borderRadius: 999,
            background: ACCENT_BG, border: `1px solid ${ACCENT_BORDER}`,
            fontSize: '0.8125rem', color: ACCENT, fontWeight: 600,
          }}>
            {agentSpeaking ? (
              <>
                <Volume2 size={14} aria-hidden="true" />
                Speaking
              </>
            ) : (
              <>
                <Mic size={14} aria-hidden="true" />
                Listening
              </>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          <button type="button"
            onClick={endSession}
            style={{
              background: ACCENT, color: '#fff', border: 0, borderRadius: 10,
              padding: '0.875rem', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
              boxShadow: `0 4px 16px ${ACCENT}33`,
            }}
          >
            End Session {'&'} Get My Action Plan
          </button>
          <button type="button"
            onClick={reset}
            style={{
              background: 'transparent', color: 'var(--color-on-surface-variant)',
              border: '1px solid var(--surface-container-high)', borderRadius: 10,
              padding: '0.75rem', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>

      </div>
    );
  }

  // ── Ending / loading plan ─────────────────────────────────────────────────
  if (phase === 'ending') {
    return (
      <div style={{ maxWidth: 560, textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: `radial-gradient(circle at 35% 35%, ${ACCENT}, ${ACCENT_DARK})`,
            animation: 'cc-breathe 1.5s ease-in-out infinite',
            boxShadow: `0 0 24px ${ACCENT}44`,
          }} />
        </div>
        <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.95rem' }}>
          Building your action plan…
        </p>
      </div>
    );
  }

  // ── Action plan ────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1.5rem' }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          background: `radial-gradient(circle at 35% 35%, ${ACCENT}, ${ACCENT_DARK})`,
          boxShadow: `0 0 16px ${ACCENT}44`,
        }} />
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: 0 }}>
            Here&rsquo;s your action plan
          </h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>
            Three things to move forward this week
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.75rem' }}>
        {steps.map((step, i) => (
          <button type="button"
            key={i}
            onClick={() => toggleStep(i)}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: '0.875rem',
              background: checked[i] ? 'rgba(245,158,11,0.06)' : 'var(--surface-container-low)',
              border: `1px solid ${checked[i] ? ACCENT_BORDER : 'var(--surface-container-high)'}`,
              borderRadius: 10, padding: '0.875rem 1rem', cursor: 'pointer', textAlign: 'left',
              transition: 'background 0.2s, border-color 0.2s',
              width: '100%',
            }}
          >
            {/* Checkbox */}
            <div style={{
              width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: '0.1rem',
              border: `2px solid ${checked[i] ? ACCENT : 'var(--surface-container-high)'}`,
              background: checked[i] ? ACCENT : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.2s, border-color 0.2s',
            }}>
              {checked[i] && (
                <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                  <path d="M1 4.5L4 7.5L10 1" stroke="#1a1209" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <div>
              <div style={{
                fontSize: '0.8125rem', fontWeight: 700, color: ACCENT,
                marginBottom: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                Step {i + 1}
              </div>
              <div style={{
                fontSize: '0.9rem', color: 'var(--color-on-surface)', lineHeight: 1.5,
                textDecoration: checked[i] ? 'line-through' : 'none',
                opacity: checked[i] ? 0.6 : 1,
                transition: 'opacity 0.2s',
              }}>
                {step}
              </div>
            </div>
          </button>
        ))}
      </div>

      <ToolFollowThrough toolType="career_business_coach" />

      {/* Quick links to portal tools */}
      <div style={{
        background: ACCENT_BG, border: `1px solid ${ACCENT_BORDER}`,
        borderRadius: 10, padding: '1rem', marginBottom: '1.5rem',
      }}>
        <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: ACCENT, marginBottom: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Ready to act? Jump to a tool:
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '0.5rem' }}>
          {[
            { label: 'Resume Rewriter', href: '/dashboard/ai-tools/resume-studio?view=rewrite' },
            { label: 'Cover Letter', href: '/dashboard/ai-tools/cover-letter' },
            { label: 'Interview Coach', href: '/dashboard/ai-tools/interview-coach' },
            { label: 'LinkedIn Headline', href: '/dashboard/ai-tools/linkedin-headline' },
          ].map(({ label, href }) => (
            <a
              key={href}
              href={href}
              style={{
                padding: '0.375rem 0.75rem', borderRadius: 999,
                background: 'var(--surface-container-low)',
                border: '1px solid var(--surface-container-high)',
                color: 'var(--color-on-surface)', fontSize: '0.8125rem',
                fontWeight: 500, textDecoration: 'none',
                transition: 'border-color 0.15s',
              }}
            >
              {label}
            </a>
          ))}
        </div>
      </div>

      <button type="button"
        onClick={reset}
        style={{
          background: 'transparent', color: 'var(--color-on-surface-variant)',
          border: '1px solid var(--surface-container-high)', borderRadius: 10,
          padding: '0.75rem 1.5rem', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer',
        }}
      >
        Start a new session
      </button>
    </div>
  );
}
