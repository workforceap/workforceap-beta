'use client';

import { Mic, Target, Sparkles, AudioLines } from 'lucide-react';
import VoiceCoachLauncherCard from '@/components/portal/VoiceCoachLauncherCard';
import { GOLD_TEXT_GRADIENT, mockInterviewVoiceSurface, readinessVoiceSurface, resumeCoachVoiceSurface } from '@/lib/portal/voice';

const AI_COACHES_BAND_STYLE = {
  padding: '1.25rem clamp(0.75rem, 3vw, 1.25rem) 1.5rem',
  borderRadius: '1rem',
  background:
    'var(--surface-container-low)',
  border: '1px solid var(--outline-variant)',
  boxShadow: 'none',
} as const;

/** Member home (`/dashboard`) — four voice tools in product order inside a soft blue band. */
export default function MemberDashboardVoiceSection() {
  return (
    <section aria-label="AI coaches">
      <div style={AI_COACHES_BAND_STYLE}>
        <h2
          className="wa-text-xs wa-font-bold wa-uppercase wa-tracking-[0.1em]"
          style={{ color: 'var(--color-on-surface-variant)', marginBottom: '0.75rem' }}
        >
          AI coaches
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1rem',
            alignItems: 'stretch',
          }}
        >
          <VoiceCoachLauncherCard
            badge="Introduction"
            icon={<Mic size={22} aria-hidden="true" />}
            glowColor="#a47f38"
            gradient={GOLD_TEXT_GRADIENT}
            title="Elevator Introduction"
            description="Generate a clean 10 to 20 second intro, save it, and email it to yourself right away."
            href="/dashboard/ai-tools/elevator-pitch"
            ctaLabel="Build intro"
          />
          <VoiceCoachLauncherCard
            {...readinessVoiceSurface}
            icon={<Target size={22} aria-hidden="true" />}
            title="Readiness Coach"
            description="Stuck on what to do next? Talk through resume, training, applications, or interviews and leave with one clear next step."
            href="/dashboard/ai-tools/studio?tab=session&agent=readiness"
            ctaLabel="Start voice session"
          />
          <VoiceCoachLauncherCard
            {...resumeCoachVoiceSurface}
            icon={<Sparkles size={22} aria-hidden="true" />}
            badge="RESUME"
            title="Resume & Experience Enhancer"
            description="Open the dedicated resume coach to practice your pitch and refine your resume inside a synced workspace."
            href="/dashboard/ai-tools/studio?tab=session&agent=resume"
            ctaLabel="Start voice session"
          />
          <VoiceCoachLauncherCard
            {...mockInterviewVoiceSurface}
            icon={<AudioLines size={22} aria-hidden="true" />}
            badge="PRACTICE"
            title="Voice Interview Practice"
            description="Launch the full mock interview experience with setup guidance and optional recording."
            href="/dashboard/ai-tools/studio?tab=session&agent=mock"
            ctaLabel="Start practice"
          />
        </div>
      </div>
    </section>
  );
}
