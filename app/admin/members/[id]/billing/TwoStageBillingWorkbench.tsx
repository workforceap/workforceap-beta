'use client';

import styles from './TwoStageBillingWorkbench.module.css';

type ReadinessKey =
  | 'studentApprovedAndReady'
  | 'counselorRequestedQuote'
  | 'boardConfirmed'
  | 'counselorContactVerified'
  | 'studentEmailVerified'
  | 'programAndClassDatesConfirmed'
  | 'priorQuoteVerified'
  | 'voucherReferenceAndReceivedDateVerified'
  | 'originalVoucherHashVerified'
  | 'michaelReceivingSignatureAttested'
  | 'voucherTermsVerified'
  | 'classStarted'
  | 'financeContactVerified';

/** Staff-verified facts only. An absent value means the page has not checked it. */
export type TwoStageBillingReadiness = Partial<Record<ReadinessKey, boolean>>;

type Check = { key: ReadinessKey; label: string };

const J5_CHECKS: readonly Check[] = [
  { key: 'studentApprovedAndReady', label: 'Student approved and ready for training' },
  { key: 'counselorRequestedQuote', label: 'Counselor requested the quote' },
  { key: 'boardConfirmed', label: 'Workforce Solutions board confirmed' },
  { key: 'counselorContactVerified', label: 'Counselor name, phone, and email verified' },
  { key: 'studentEmailVerified', label: 'Student email verified' },
  { key: 'programAndClassDatesConfirmed', label: 'Approved class, hours, and class dates confirmed' },
];

const J6_CHECKS: readonly Check[] = [
  { key: 'priorQuoteVerified', label: 'J5 quote or approved external quote is on file' },
  { key: 'voucherReferenceAndReceivedDateVerified', label: 'Voucher / PO reference and received date verified' },
  { key: 'originalVoucherHashVerified', label: 'Original signed voucher uploaded with uploader and file hash recorded' },
  { key: 'michaelReceivingSignatureAttested', label: 'Michael’s receiving signature on the voucher explicitly attested' },
  { key: 'voucherTermsVerified', label: 'Voucher matches the approved class, dates, and $7,500 tuition' },
  { key: 'classStarted', label: 'Student has started the class' },
  { key: 'financeContactVerified', label: 'Board finance name and email verified' },
  { key: 'boardConfirmed', label: 'Workforce Solutions board confirmed' },
  { key: 'counselorContactVerified', label: 'Counselor contact verified' },
  { key: 'studentEmailVerified', label: 'Student email verified' },
  { key: 'programAndClassDatesConfirmed', label: 'Approved class, hours, and class dates confirmed' },
];

export type TwoStageBillingWorkbenchProps = {
  memberName: string;
  memberEmail: string | null;
  counselor: { name: string; email: string } | null;
  readiness?: TwoStageBillingReadiness;
  /** Opens the J5 draft workflow only; signing and sending are separate server actions. */
  onPrepareJ5?: () => void;
  /** Opens the J6 draft workflow only; signing and sending are separate server actions. */
  onPrepareJ6?: () => void;
};

function CheckList({ checks, readiness }: { checks: readonly Check[]; readiness: TwoStageBillingReadiness }) {
  return (
    <ul className={styles.checkList}>
      {checks.map(({ key, label }) => {
        const value = readiness[key];
        const status = value === true ? 'Verified' : value === false ? 'Needs attention' : 'Not checked';
        return (
          <li className={styles.checkRow} key={key}>
            <span className={styles.checkLabel}>{label}</span>
            <span className={value === true ? styles.verified : styles.unverified}>{status}</span>
          </li>
        );
      })}
    </ul>
  );
}

function StageCard({
  stage,
  heading,
  description,
  note,
  recipients,
  attachments,
  checks,
  readiness,
  onPrepare,
}: {
  stage: 'j5' | 'j6';
  heading: string;
  description: string;
  note: string;
  recipients: string;
  attachments: string;
  checks: readonly Check[];
  readiness: TwoStageBillingReadiness;
  onPrepare?: () => void;
}) {
  const readyToPrepare = checks.every(({ key }) => readiness[key] === true);
  const actionAvailable = readyToPrepare && Boolean(onPrepare);
  const reason = onPrepare
    ? 'Verify the required case details before preparing this document.'
    : 'Preparation is not yet available. The secure billing workflow is being connected.';

  return (
    <section className={styles.stage} aria-labelledby={`billing-${stage}-heading`}>
      <div className={styles.stageHeading}>
        <span className={styles.stageNumber}>{stage === 'j5' ? '01' : '02'}</span>
        <div>
          <p className={styles.eyebrow}>{stage.toUpperCase()}</p>
          <h2 className={styles.title} id={`billing-${stage}-heading`}>{heading}</h2>
          <p className={styles.description}>{description}</p>
        </div>
      </div>

      <div className={styles.stageBody}>
        <div>
          <p className={styles.sectionLabel}>Before creating the draft</p>
          <CheckList checks={checks} readiness={readiness} />
          <p className={styles.stageNote}>{note}</p>
        </div>
        <div className={styles.delivery}>
          <p className={styles.sectionLabel}>Document and delivery</p>
          <dl className={styles.summary}>
            <div><dt>File</dt><dd>{attachments}</dd></div>
            <div><dt>Recipients</dt><dd>{recipients}</dd></div>
            <div><dt>Archive</dt><dd>{stage === 'j5'
              ? 'Exact signed quote, signer action, and per-recipient send results in the student billing record'
              : 'Exact signed cover letter and original voucher, voucher provenance, signer action, and per-recipient send results in the student billing record'}</dd></div>
          </dl>
          <p className={styles.deliveryGate}>
            Michael A. Brown, PMP, ChE must authenticate and explicitly sign this stage’s final document. Confirm the WAP letterhead before delivery.
          </p>
        </div>
      </div>

      <div className={styles.stageFooter}>
        <button
          type="button"
          className={`btn ${styles.action}`}
          disabled={!actionAvailable}
          aria-describedby={`billing-${stage}-reason`}
          onClick={actionAvailable ? onPrepare : undefined}
        >
          Create {stage.toUpperCase()} {heading}
        </button>
        <p id={`billing-${stage}-reason`} className={styles.reason}>
          {actionAvailable ? 'Opens draft preparation; signing and email require separate review.' : reason}
        </p>
      </div>
    </section>
  );
}

/** Safe presentation shell. It never signs, sends, uploads, or calls an API. */
export default function TwoStageBillingWorkbench({
  memberName,
  memberEmail,
  counselor,
  readiness = {},
  onPrepareJ5,
  onPrepareJ6,
}: TwoStageBillingWorkbenchProps) {
  return (
    <div className={styles.workbench}>
      <div className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>Student billing · {memberName}</p>
          <h2 className={styles.introTitle}>Two documents, two approval points</h2>
          <p className={styles.introText}>Prepare the quote when the counselor asks. Request payment after the signed voucher arrives and class begins.</p>
          <p className={styles.classRule}>Approved classes are 160 hours, except IBM AI &amp; Software Developer at 200 hours. The end date is five calendar months after the confirmed start date.</p>
        </div>
        <div className={styles.amount}>
          <span>Single line item</span>
          <strong>Tuition &amp; Fees · $7,500.00</strong>
        </div>
      </div>

      <p className={styles.contacts}>
        <strong>Contacts on file:</strong> Student {memberEmail || 'email not on file'} · Counselor{' '}
        {counselor ? `${counselor.name} (${counselor.email})` : 'not assigned'}.
        {' '}Confirm the counselor phone in case review before J5 delivery.
      </p>

      <div className={styles.stages}>
        <StageCard
          stage="j5"
          heading="Quote / Voucher Request"
          description="Request the board voucher for the approved student and class. This is a quote, not a payment request."
          note="A board voucher is not required to prepare J5."
          recipients="Counselor and student"
          attachments="Signed WAP quote / voucher request"
          checks={J5_CHECKS}
          readiness={readiness}
          onPrepare={onPrepareJ5}
        />
        <StageCard
          stage="j6"
          heading="Invoice / Voucher Cover Letter"
          description="Request payment once the signed board voucher is on file and the student has started class."
          note="Keep the board’s signed voucher as its own original file; the cover letter is a separate signed document."
          recipients="Board finance person, counselor, and student"
          attachments="Signed WAP cover letter + original signed board voucher"
          checks={J6_CHECKS}
          readiness={readiness}
          onPrepare={onPrepareJ6}
        />
      </div>

      <p className={styles.paymentNote}>After J6 is sent, track payment separately. Follow up in 10–14 days if a check or wire has not arrived.</p>
    </div>
  );
}
