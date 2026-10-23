import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { DesignSurface, PageOpener } from '@/components/portal/kit';
import ResumeStudioClient from '@/components/portal/ResumeStudioClient';
import type { ResumeScorePayload } from '@/components/portal/tools/ResumeScoreBreakdown';
import styles from '@/components/portal/ResumeStudio.module.css';
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
  initialRewriteResume,
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
  initialRewriteResume?: string;
  initialJobTarget?: string;
  previewScoreOutput?: string;
  previewScorePayload?: ResumeScorePayload | null;
  previewRewriteOutput?: string;
}) {
  const t = useTranslations('memberWorkspace.resume');
  return (
    <DesignSurface surface="warm">
      <div className={styles.page}>
        <PageOpener
          className={styles.opener}
          kicker="AI Career Tools"
          title={t('metaTitle')}
          lede={t('intro')}
          action={
            <Link href={backHref ?? '/dashboard/ai-tools'} className="wa-page-action wa-kit-focus">
              <ArrowLeft size={14} aria-hidden="true" />
              {t('design.backToTools')}
            </Link>
          }
        />
        <ResumeStudioClient
          hasResume={hasResume}
          filesSlot={filesSlot}
          scoreHistorySlot={scoreHistorySlot}
          rewriteHistorySlot={rewriteHistorySlot}
          preview={preview}
          basePath={basePath}
          initialResume={initialResume}
          initialRewriteResume={initialRewriteResume}
          initialJobTarget={initialJobTarget}
          previewScoreOutput={previewScoreOutput}
          previewScorePayload={previewScorePayload}
          previewRewriteOutput={previewRewriteOutput}
        />
      </div>
    </DesignSurface>
  );
}
