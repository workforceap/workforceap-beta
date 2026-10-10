'use client';

import { useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Stack';
import type { BillingStage, StageVersionView } from '@/lib/billing/twoStage/dto';
import { draftPreviewPath, mockJ5PreviewPath } from './twoStageClient';
import styles from './TwoStageBillingWorkbench.module.css';

/** Read the saved document independently of signature approval and delivery. */
export default function TwoStageDocumentReview({ memberId, caseId, stage, current }: {
  memberId: string;
  caseId: string;
  stage: BillingStage;
  current: StageVersionView;
}) {
  const [showPreview, setShowPreview] = useState(false);
  // Closed versions remain in history; never present them as ready to send.
  if (current.status !== 'draft' && current.status !== 'signed' && current.status !== 'sent') return null;
  const label = stage.toUpperCase();
  const isDraft = current.status === 'draft';
  const isMock = stage === 'j5' && isDraft;
  const previewPath = isMock
    ? mockJ5PreviewPath(memberId, caseId, current.recordId, current.versionHash)
    : isDraft
      ? draftPreviewPath(memberId, caseId, stage, current.recordId, current.versionHash)
      : current.signed?.artifact.downloadPath;
  if (!previewPath) return null;
  const downloadPath = `${previewPath}${previewPath.includes('?') ? '&' : '?'}download=1`;
  const previewId = `billing-${stage}-document-preview`;
  const pdfLabel = isMock ? `mock ${label} PDF` : `${label} PDF`;

  return (
    <VStack as="section" gap={3} className={styles.documentReview} aria-label={`${label} document review`}>
      <h3 className={styles.editorTitle}>Review your {label}</h3>
      <p className={styles.editorNote}>
        {isMock
          ? 'This mock PDF uses your saved J5 details for review only. It does not sign, send, or change any records. Save any edits before reviewing again.'
          : isDraft
            ? 'View or download the saved draft now. Reviewing does not sign or send it. Save any edits before reviewing again.'
            : 'Your signed PDF is ready to download and send yourself. Downloading does not email anyone.'}
      </p>
      <HStack gap={2} wrap="wrap">
        <Button
          label={showPreview ? `Hide ${pdfLabel}` : `View ${pdfLabel}`}
          variant="primary"
          className="wa-kit-focus"
          aria-expanded={showPreview}
          aria-controls={previewId}
          onClick={() => setShowPreview((shown) => !shown)}
        />
        <Button
          as="a"
          href={downloadPath}
          label={isMock ? `Download ${pdfLabel}` : isDraft ? `Download ${label} draft PDF` : `Download signed ${label} PDF`}
          variant="secondary"
          className="wa-kit-focus"
        />
        <a href={previewPath} target="_blank" rel="noopener noreferrer" className="wa-kit-focus">
          Open {pdfLabel} in a new tab
        </a>
      </HStack>
      {showPreview ? (
        <iframe id={previewId} className={styles.previewFrame} title={`${label} ${isMock ? 'MOCK' : isDraft ? 'DRAFT' : 'signed'} PDF review`} src={previewPath} />
      ) : null}
    </VStack>
  );
}
