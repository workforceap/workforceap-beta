'use client';

import { useState } from 'react';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import TwoStageBillingWorkbench from '@/app/admin/members/[id]/billing/TwoStageBillingWorkbench';
import { MOCK_BILLING_PREVIEW } from '@/lib/billing/twoStage/mockPreview';
import type { BillingStage } from '@/lib/billing/twoStage/constants';
import { formatUsdCents } from '@/lib/billing/twoStage/lineItem';
import styles from './BillingMockPreview.module.css';

const MOCK_ONLY = 'Mock preview only. Creating, saving, signing, uploading, and sending are unavailable here.';

/** Synthetic presentation only: never mount the live case container or mutation callbacks here. */
export default function BillingMockPreview() {
  const [stage, setStage] = useState<BillingStage>('j5');
  const sample = MOCK_BILLING_PREVIEW;
  const document = sample.documents[stage];
  const pdfPath = `/api/admin/billing/preview/${stage}`;

  return (
    <VStack gap={6}>
      <Banner
        status="warning"
        title="Mock preview only — no real student or billing case"
        description="All learner, board, and recipient details below are fictional. These unsigned samples are not for submission. Nothing is saved, signed, archived, or emailed."
      />

      <section aria-labelledby="billing-sample-heading" className={styles.sample}>
        <h2 id="billing-sample-heading">Sample training details</h2>
        <dl className={styles.facts}>
          <dt>Student</dt><dd>{sample.student.name}</dd>
          <dt>Program</dt><dd>{sample.className}</dd>
          <dt>Sample class dates</dt><dd>{sample.classStartDate} to {sample.classEndDate} · {sample.classHours} hours</dd>
          <dt>Tuition &amp; Fees</dt><dd>{formatUsdCents(sample.tuitionCents)}</dd>
        </dl>
      </section>

      <VStack as="section" gap={3} aria-labelledby="billing-sample-document-heading">
        <HStack gap={2} wrap="wrap" aria-label="Choose a sample document" role="group">
          {(['j5', 'j6'] as const).map((value) => (
            <Button
              key={value}
              label={`Preview ${value.toUpperCase()}`}
              variant={stage === value ? 'primary' : 'secondary'}
              aria-pressed={stage === value}
              aria-controls="billing-sample-document"
              onClick={() => setStage(value)}
              className={`${styles.stageButton} wa-kit-focus`}
            />
          ))}
        </HStack>
        <h2 id="billing-sample-document-heading">{stage.toUpperCase()} · {document.title}</h2>
        <p className={styles.note}>
          {stage === 'j5'
            ? 'A sample quote to request a board voucher. This is not a request for payment.'
            : 'A sample payment cover letter. A real J6 still requires the original signed board voucher, the designated signer’s attestation, and a confirmed class start.'}
        </p>
        <a className={`${styles.openDocument} wa-kit-focus`} href={pdfPath} target="_blank" rel="noopener noreferrer">
          Open unsigned {stage.toUpperCase()} sample PDF in a new tab
        </a>
        <p className={styles.note}>If your browser cannot show the PDF below, use the link above. The mock label and draft watermark remain on every sample.</p>
        <iframe
          key={stage}
          id="billing-sample-document"
          title={`Unsigned mock ${stage.toUpperCase()} — ${document.title}`}
          src={pdfPath}
          className={styles.document}
        />
      </VStack>

      <details className={styles.workflow}>
        <summary className="wa-kit-focus">Explore the J5 / J6 workflow (read-only)</summary>
        <p className={styles.note}>This is the same workbench used on a student’s billing page. Checks are intentionally not verified, and every creation action is disabled in this mock.</p>
        <TwoStageBillingWorkbench
          memberName={sample.student.name}
          memberEmail={sample.student.email}
          counselor={sample.counselor}
          unavailableReason={MOCK_ONLY}
        />
      </details>
    </VStack>
  );
}
