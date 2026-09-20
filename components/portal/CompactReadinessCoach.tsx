'use client';

import { Target } from 'lucide-react';
import PortalVoiceSessionLazy from '@/components/portal/PortalVoiceSessionLazy';

const ACCENT = '#a47f38';
const ACCENT_DARK = '#7d5f26';

export default function CompactReadinessCoach() {
  return (
    <div
      style={{
        borderRadius: '0.75rem',
        border: '1px solid var(--wa-gold-soft)',
        background: 'var(--surface-container-lowest)',
        overflow: 'hidden',
      }}
    >
      <div
        aria-expanded="true"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.625rem',
          width: '100%',
          padding: '0.625rem 0.875rem',
          background: 'transparent',
          textAlign: 'left',
        }}
      >
        <Target size={16} aria-hidden style={{ color: ACCENT, flexShrink: 0 }} />
        <span
          style={{
            fontSize: '0.875rem',
            fontWeight: 700,
            color: 'var(--color-on-surface)',
            flex: 1,
          }}
        >
          Readiness Coach
        </span>
        <span
          style={{
            fontSize: '0.8125rem',
            fontWeight: 700,
            color: ACCENT,
            letterSpacing: '0.04em',
            flexShrink: 0,
          }}
        >
          Voice
        </span>
      </div>

      <div
        style={{
          padding: '0.75rem 0.875rem 0.875rem',
          borderTop: '1px solid var(--outline-variant)',
        }}
      >
        <PortalVoiceSessionLazy
          sessionEndpoint="/api/member/readiness/voice-session"
          completionEndpoint="/api/counselor/feedback"
          checkpointEndpoint="/api/member/voice-session/checkpoint"
          title="Talk through your readiness plan"
          description="Ask about interviews, certifications, LinkedIn, or your next milestone."
          accent={ACCENT}
          accentDark={ACCENT_DARK}
          speakingLabel="Coach is speaking…"
          listeningLabel="Listening — share where you are"
        />
      </div>
    </div>
  );
}
