import { Layers } from 'lucide-react';
import ResumeStudioClient from '@/components/portal/ResumeStudioClient';
import type { ResumeScorePayload } from '@/components/portal/tools/ResumeScoreBreakdown';
import type { MemberResumeLoadStatus } from '@/lib/member/getMemberResumePlainText';
import { ToolkitToolChrome } from './ToolkitToolChrome';
import type { ReactNode } from 'react';

/**
 * Member Portal — resume studio (score / rewrite / coach).
 * PageOpener chrome around ResumeStudioClient. History is omitted in preview.
 * Explicit loadStatus keeps failed/audit reads distinct from a missing resume.
 *
 * Target route: app/(portal)/dashboard/ai-tools/resume-studio
 * Proof: /dev/member/resume-studio
 * Surface: warm (member-facing).
 */

export function ResumeStudioKit({
  hasResume = false,
  loadStatus,
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
  loadStatus?: MemberResumeLoadStatus;
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
  return (
    <ToolkitToolChrome
      title="Resume studio"
      lede="Score, rewrite, or talk through a resume."
      icon={<Layers size={13} aria-hidden="true" />}
      backHref={backHref}
      maxWidth={960}
    >
      <ResumeStudioClient
        hasResume={hasResume}
        loadStatus={loadStatus}
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
