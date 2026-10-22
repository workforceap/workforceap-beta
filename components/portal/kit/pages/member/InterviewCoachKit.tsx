import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { Mic } from 'lucide-react';
import ToolHistoryPanel from '@/components/portal/ToolHistoryPanel';
import { ToolkitToolChrome } from './ToolkitToolChrome';

/**
 * Member Portal — interview coach tool page.
 * PageOpener chrome around InterviewCoach. History is omitted in preview.
 *
 * Target route: app/(portal)/dashboard/ai-tools/interview-coach
 * Proof: /dev/member/interview-coach
 * Surface: warm (member-facing).
 */

const InterviewCoach = dynamic(() => import('@/components/portal/tools/InterviewCoach'), {
  loading: () => (
    <p role="status" aria-live="polite" style={{ margin: 0, color: 'var(--wa-muted)', fontWeight: 600, fontSize: 'var(--wa-type-body)' }}>
      Loading interview coach…
    </p>
  ),
});

export function InterviewCoachKit({
  userId,
  preview = false,
  backHref,
  initialRole,
  initialPhase,
  initialQuestion,
  initialFeedback,
}: {
  userId?: string;
  preview?: boolean;
  backHref?: string;
  initialRole?: string;
  initialPhase?: 'setup' | 'voice' | 'interview' | 'feedback';
  initialQuestion?: string;
  initialFeedback?: string;
}) {
  const t = useTranslations('memberWorkspace.interviews');
  return (
    <ToolkitToolChrome
      title={t('coachTitle')}
      lede={t('coachIntro')}
      icon={<Mic size={13} aria-hidden="true" />}
      backHref={backHref}
      maxWidth={980}
    >
      <div className="wa-kit-card">
        <InterviewCoach
          preview={preview}
          initialRole={initialRole}
          initialPhase={initialPhase}
          initialQuestion={initialQuestion}
          initialFeedback={initialFeedback}
        />
      </div>
      {userId && !preview ? (
        <ToolHistoryPanel
          userId={userId}
          toolType="interview_coach"
          title="Recent coaching sessions"
          emptyMessage="No coaching sessions yet. Run a mock interview above and it shows up here."
        />
      ) : null}
    </ToolkitToolChrome>
  );
}
