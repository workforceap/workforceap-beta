'use client';

import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Stack';
import { documentPreviewPath } from './twoStageClient';
import styles from './TwoStageBillingWorkbench.module.css';

/** Preview is available before any case, enrollment or official-document workflow. */
export default function TwoStageQuickPreview({ memberId, caseId }: { memberId: string; caseId?: string }) {
  return (
    <VStack as="section" gap={3} className={styles.documentReview} aria-label="Preview documents">
      <h2 className={styles.introTitle}>Preview documents</h2>
      <p className={styles.editorNote}>Use the details on file. Missing information appears as “Not provided”.</p>
      {(['j5', 'j6'] as const).map((stage) => {
        const href = documentPreviewPath(memberId, stage, caseId);
        return (
          <HStack key={stage} gap={2} wrap="wrap">
            <Button as="a" href={href} target="_blank" rel="noopener noreferrer"
              label={`Preview ${stage.toUpperCase()} PDF`} variant="primary" className="wa-kit-focus" />
            <Button as="a" href={`${href}${caseId ? '&' : '?'}download=1`}
              label={`Download ${stage.toUpperCase()} PDF`} variant="secondary" className="wa-kit-focus" />
          </HStack>
        );
      })}
    </VStack>
  );
}
