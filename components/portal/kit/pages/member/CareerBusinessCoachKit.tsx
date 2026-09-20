import { Briefcase } from 'lucide-react';
import PortalVoiceSessionLazy from '@/components/portal/PortalVoiceSessionLazy';
import VoiceAgentSurface from '@/components/portal/VoiceAgentSurface';
import { colorVar } from '../../tokens';
import { ToolkitToolChrome } from './ToolkitToolChrome';

/**
 * Member Portal — career and business coach (voice session).
 * PageOpener chrome around VoiceAgentSurface.
 *
 * Target route: app/(portal)/dashboard/ai-tools/career-business-coach
 * Proof: /dev/member/career-business-coach
 * Surface: warm (member-facing).
 */

export function CareerBusinessCoachKit({
  backHref = '/dashboard/ai-tools',
}: {
  backHref?: string;
} = {}) {
  return (
    <ToolkitToolChrome
      title="Career and business coach"
      lede="Talk through project management, sales, marketing, or career growth."
      icon={<Briefcase size={13} aria-hidden="true" />}
      backHref={backHref}
      maxWidth={980}
    >
      <VoiceAgentSurface
        badge="Career & Business Coach"
        headline="Talk through any career or business challenge"
        headlineAs="h2"
        subtext="Project management, sales, marketing, communication — get guidance tailored to your situation."
        icon={<Briefcase size={22} aria-hidden="true" />}
        glowColor={colorVar('accent')}
        gradient={`linear-gradient(135deg, ${colorVar('accent')} 0%, ${colorVar('accentDark')} 100%)`}
      >
        <PortalVoiceSessionLazy
          sessionEndpoint="/api/member/career-business-coach/voice-session"
          completionEndpoint="/api/member/career-business-coach/completion"
          title="Career and Business Coach"
          description="Share your challenge — project management, sales, marketing, or career growth."
          dataUseNotice="ElevenLabs processes your microphone audio and live transcript during this session. WorkforceAP may share only the saved next-step, program, and progress facts needed for the coach through approved read-only tools. If a transcript is captured, WorkforceAP saves it to your AI history and uses it to update coach memory; it may also email the transcript to configured WorkforceAP support recipients. Avoid sharing sensitive personal information."
          accent={colorVar('accent')}
          accentDark={colorVar('accentDark')}
          speakingLabel="Coach is speaking…"
          listeningLabel="Listening…"
        />
      </VoiceAgentSurface>
    </ToolkitToolChrome>
  );
}
