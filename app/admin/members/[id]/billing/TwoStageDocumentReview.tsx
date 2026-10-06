'use client';

import { useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Stack';
import type { BillingStage, StageVersionView } from '@/lib/billing/twoStage/dto';
import { draftPreviewPath } from './twoStageClient';
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
  const previewPath = isDraft
    ? draftPreviewPath(memberId, caseId, stage, current.recordId, current.versionHash)
    : current.signed?.artifact.downloadPath;
  if (!previewPath) return null;
  const downloadPath = `${previewPath}${previewPath.includes('?') ? '&' : '?'}download=1`;
  const previewId = `billing-${stage}-document-preview`;

  return (
    <VStack as="section" gap={3} className={styles.documentReview} aria-label={`${label} document review`}>
      <h3 className={styles.editorTitle}>Review your {label}</h3>
      <p className={styles.editorNote}>
        {isDraft
          ? 'View or download the saved draft now. Reviewing does not sign or send it. Save any edits before reviewing again.'
          : 'Your signed PDF is ready to download and send yourself. Downloading does not email anyone.'}
      </p>
      <HStack gap={2} wrap="wrap">
        <Button
          label={showPreview ? `Hide ${label} PDF` : `View ${label} PDF`}
          variant="primary"
          className="wa-kit-focus"
          aria-expanded={showPreview}
          aria-controls={previewId}
          onClick={() => setShowPreview((shown) => !shown)}
        />
        <Button
          as="a"
          href={downloadPath}
          label={isDraft ? `Download ${label} draft PDF` : `Download signed ${label} PDF`}
          variant="secondary"
          className="wa-kit-focus"
        />
        <a href={previewPath} target="_blank" rel="noopener noreferrer" className="wa-kit-focus">
          Open {label} PDF in a new tab
        </a>
      </HStack>
      {showPreview ? (
        <iframe id={previewId} className={styles.previewFrame} title={`${label} ${isDraft ? 'DRAFT' : 'signed'} PDF review`} src={previewPath} />
      ) : null}
    </VStack>
  );
}
