import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { redirect } from 'next/navigation';
import { CircleCheck } from 'lucide-react';
import { buildPageMetadataAsync } from '@/app/seo';
import MobileBottomNav from '@/components/MobileBottomNav';
import { DesignSurface, SectionHeader } from '@/components/portal/kit';
import PortalBreadcrumb from '@/components/portal/PortalBreadcrumb';
import ToolHistoryPanel from '@/components/portal/ToolHistoryPanel';
import { getUser } from '@/lib/auth/server';

const VoiceInterviewScaffold = dynamic(() => import('@/components/portal/tools/VoiceInterviewScaffold'), {
  loading: () => (
    <div
      role="status"
      aria-live="polite"
      className="wa-kit-card"
      style={{
        minHeight: 320,
        padding: '2.5rem 1.25rem',
        textAlign: 'center',
        color: 'var(--wa-muted)',
        fontSize: '0.9rem',
        fontWeight: 600,
      }}
    >
      Loading voice interview…
    </div>
  ),
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard');
  return buildPageMetadataAsync({
    title: t('voiceInterviewMetaTitle'),
    description: t('voiceInterviewMetaDesc'),
    path: '/dashboard/ai-tools/voice-interview',
  });
}

export default async function VoiceInterviewPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/ai-tools/voice-interview');

  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '1.25rem 1rem 1rem' }} className="wa-space-y-5">
        <PortalBreadcrumb
          items={[
            { label: 'AI Career Tools', href: '/dashboard/ai-tools' },
            { label: 'Voice Job/Role Interviewer' },
          ]}
        />
        <SectionHeader
          kicker="AI Career Tools"
          title="Voice Job/Role Interviewer"
          goal="Open a dedicated mock interview flow, answer questions out loud, and get live coaching feedback in a setup built specifically for practice."
        />

        <div className="wa-kit-card wa-kit-card--sm">
          <div className="wa-flex wa-flex-wrap" style={{ gap: '0.9rem' }}>
            {[
              'Microphone required, camera optional',
              'Live prompts and coaching as you answer',
              'Save recordings for your own review',
            ].map((item) => (
              <div key={item} className="wa-flex wa-items-center" style={{ gap: '0.45rem', color: 'var(--wa-muted)', fontSize: '0.82rem', fontWeight: 600 }}>
                <CircleCheck size={16} style={{ color: 'var(--wa-accent)' }} aria-hidden />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Single scaffold — duplicate mobile/desktop mounts caused two independent button states */}
      <div style={{ paddingBottom: '6rem' }}>
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 1rem 2rem' }}>
          <VoiceInterviewScaffold />
          <ToolHistoryPanel
            userId={user.id}
            toolType="voice_interview_video"
            title="Recent saved interview recordings"
            emptyMessage="No saved recordings yet. If you just finished a session and it does not appear, try refreshing in a few minutes."
          />
        </div>
        <MobileBottomNav variant="portal" />
      </div>
    </DesignSurface>
  );
}
