import { useTranslations } from 'next-intl';
import { Layers } from 'lucide-react';
import ResumeStudioClient from '@/components/portal/ResumeStudioClient';
import type { ResumeScorePayload } from '@/components/portal/tools/ResumeScoreBreakdown';
import { ToolkitToolChrome } from './ToolkitToolChrome';
import type { ReactElement, ReactNode } from 'react';

/**
 * Member Portal — resume studio (score / rewrite / coach).
 * PageOpener chrome around ResumeStudioClient. History is omitted in preview.
 *
 * Target route: app/(portal)/dashboard/ai-tools/resume-studio
 * Proof: /dev/member/resume-studio
 * Surface: warm (member-facing).
 */

export function ResumeStudioKit({
  hasResume = false,
  filesSlot,
  scoreHistorySlot,
  rewriteHistorySlot,
  preview = false,
  backHref,
  basePath,
  initialResume,
  initialJobTarget,
  previewScoreOutput,
  previewScorePayload,
  previewRewriteOutput,
}: {
  hasResume?: boolean;
  filesSlot?: ReactElement<{ active?: boolean }>;
  scoreHistorySlot?: ReactNode;
  rewriteHistorySlot?: ReactNode;
  preview?: boolean;
  backHref?: string;
  basePath?: string;
  initialResume?: string;
  initialJobTarget?: string;
  previewScoreOutput?: string;
  previewScorePayload?: ResumeScorePayload | null;
  previewRewriteOutput?: string;
}) {
  const t = useTranslations('memberWorkspace.resume');
  return (
    <ToolkitToolChrome
      title={t('metaTitle')}
      lede={t('intro')}
      icon={<Layers size={13} aria-hidden="true" />}
      backHref={backHref}
      maxWidth={960}
    >
      <ResumeStudioClient
        hasResume={hasResume}
        filesSlot={filesSlot}
        scoreHistorySlot={scoreHistorySlot}
        rewriteHistorySlot={rewriteHistorySlot}
        preview={preview}
        basePath={basePath}
        initialResume={initialResume}
        initialJobTarget={initialJobTarget}
        previewScoreOutput={previewScoreOutput}
        previewScorePayload={previewScorePayload}
        previewRewriteOutput={previewRewriteOutput}
      />
    </ToolkitToolChrome>
  );
}
