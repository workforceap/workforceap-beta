/**
 * Synthetic, client-safe facts for the admin billing walkthrough. This module
 * has no member IDs, auth principals, signature assets, persistence or I/O.
 * The preview never builds a real billing case or a frozen document version.
 */
import {
  AUTHORIZED_SIGNER,
  DOCUMENT_TITLES,
  J5_KIND,
  J6_KIND,
  PAYMENT_FOLLOW_UP_MAX_DAYS,
  PAYMENT_FOLLOW_UP_MIN_DAYS,
  TUITION_AND_FEES_CENTS,
  TUITION_AND_FEES_LABEL,
  type BillingStage,
} from './constants';
import type { TwoStageDocumentFacts } from './documentPdf';
import { WAP_BILLING_LETTERHEAD } from './letterhead';

export const MOCK_BILLING_PREVIEW = Object.freeze({
  student: Object.freeze({ name: 'Sample Student (not a real member)', email: 'student@example.invalid' }),
  counselor: Object.freeze({ name: 'Sample Counselor', email: 'counselor@example.invalid', phone: '(555) 010-0201' }),
  financePerson: Object.freeze({ name: 'Sample Finance Contact', email: 'finance@example.invalid' }),
  boardName: 'Sample workforce board - not for submission',
  programSlug: 'data-analytics-professional-certificate-google',
  className: 'Management Analyst & Business Intelligence Professional Certificate',
  classHours: 160,
  classStartDate: '2026-09-30',
  classEndDate: '2027-02-28',
  classStartedAt: '2026-09-30',
  tuitionCents: TUITION_AND_FEES_CENTS,
  tuitionLabel: TUITION_AND_FEES_LABEL,
  voucherReference: 'MOCK-VOUCHER-001',
  voucherReceivedDate: '2026-09-30',
  documents: Object.freeze({
    j5: Object.freeze({ documentNumber: 'MOCK-J5-001', issueDate: '2026-09-29', title: DOCUMENT_TITLES[J5_KIND] }),
    j6: Object.freeze({ documentNumber: 'MOCK-J6-001', issueDate: '2026-10-01', title: DOCUMENT_TITLES[J6_KIND] }),
  }),
} as const);

/** Pure renderer facts only: never a signable version or persisted record. */
export function getMockBillingDocumentFacts(stage: BillingStage, logoPng: Uint8Array): TwoStageDocumentFacts {
  if (stage !== 'j5' && stage !== 'j6') throw new Error('Unknown mock billing stage');
  const sample = MOCK_BILLING_PREVIEW;
  const document = sample.documents[stage];
  const letterhead = WAP_BILLING_LETTERHEAD;
  const common = {
    ...document,
    // The approved renderer stores documentNumber in metadata, so the visible
    // title also marks the preview as a mock when it is printed or downloaded.
    title: `MOCK - ${document.title}`,
    frozenAt: `${document.issueDate}T12:00:00.000Z`,
    student: { ...sample.student },
    boardName: sample.boardName,
    counselor: { ...sample.counselor },
    programSlug: sample.programSlug,
    className: sample.className,
    classHours: sample.classHours,
    classStartDate: sample.classStartDate,
    classEndDate: sample.classEndDate,
    tuitionCents: sample.tuitionCents,
    tuitionLabel: sample.tuitionLabel,
    signer: { ...AUTHORIZED_SIGNER },
    letterhead: {
      logoPng: new Uint8Array(logoPng),
      organizationName: letterhead.headerLines[0],
      website: letterhead.footer.website,
      businessPhone: letterhead.footer.phone,
      addressLine1: letterhead.footer.addressLines[0],
      addressLine2: letterhead.footer.addressLines[1],
    },
  };
  if (stage === 'j5') return { ...common, stage };
  return {
    ...common,
    stage,
    financePerson: { ...sample.financePerson },
    classStartedAt: sample.classStartedAt,
    paymentInstruction: 'Please arrange payment by check or wire to Workforce Advancement Project and confirm the expected remittance date.',
    paymentFollowUpWording: `We will follow up in ${PAYMENT_FOLLOW_UP_MIN_DAYS} to ${PAYMENT_FOLLOW_UP_MAX_DAYS} days if payment has not been recorded.`,
    signedVoucher: {
      reference: sample.voucherReference,
      receivedDate: sample.voucherReceivedDate,
      authorizedAmountCents: sample.tuitionCents,
      // Shape-only placeholder. No voucher bytes, upload or receipt is claimed.
      sha256: '0'.repeat(64),
      receivingSignatureAttestationId: null,
    },
  };
}
