import { useTranslations } from 'next-intl';
import { Mic } from 'lucide-react';
import InterviewPracticeForm from '@/components/portal/tools/InterviewPracticeForm';
import InterviewPracticeSaved from '@/components/portal/tools/InterviewPracticeSaved';
import { ToolkitToolChrome } from './ToolkitToolChrome';

/**
 * Member Portal — interview practice tool page.
 * PageOpener chrome around InterviewPracticeForm / InterviewPracticeSaved.
 *
 * Target route: app/(portal)/dashboard/ai-tools/interview-practice
 * Proof: /dev/member/interview-practice
 * Surface: warm (member-facing).
 */

interface InitialData {
  role: string;
  experienceLevel: 'entry' | 'mid' | 'senior';
  resumeContext: string;
}

interface SavedResult {
  id: string;
  inputSummary: string | null;
  output: string | null;
  createdAt: Date;
}

export interface InterviewPracticeKitProps {
  memberId?: string;
  initialData?: InitialData | null;
  savedResults?: SavedResult[];
  backHref?: string;
  /** Skip resume hydrate / generate POST — /dev/member proofs. */
  preview?: boolean;
  previewQuestions?: Array<{
    question: string;
    type: string;
    tip: string;
    starHint?: string;
    exampleAnswer?: string;
  }>;
}

export function InterviewPracticeKit({
  memberId,
  initialData = null,
  savedResults = [],
  backHref,
  preview = false,
  previewQuestions,
}: InterviewPracticeKitProps) {
  const t = useTranslations('memberWorkspace.interviews');
  return (
    <ToolkitToolChrome
      title={t('answersTitle')}
      lede={t('answersIntro')}
      icon={<Mic size={13} aria-hidden="true" />}
      backHref={backHref}
      maxWidth={1000}
    >
      <div className="wa-kit-card">
        <InterviewPracticeForm
          memberId={memberId}
          workspaceNavigation
          initialData={initialData}
          preview={preview}
          previewQuestions={previewQuestions}
        />
      </div>
      <InterviewPracticeSaved results={savedResults} />
    </ToolkitToolChrome>
  );
}
