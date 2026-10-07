'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { StatusTag, useAnnounce } from '@/components/portal/kit';
import { classEndDate as calculateClassEndDate, isIsoDate } from '@/lib/billing/twoStage/dates';
import type {
  BillingStage,
  CaseSummaryDto,
  DesignatedSignerTask,
  FreezeDto,
  J5StageView,
  J6StageView,
  PaymentDto,
  RecipientRole,
  RoleDeliveryView,
  SendDto,
  SignatureStatusDto,
  VoucherReceiptStatementDto,
} from '@/lib/billing/twoStage/dto';
import { twoStageApi, type ApiFailure, type ApiResult } from './twoStageClient';
import {
  ACTION_GATES,
  SEND_STATUS_LABELS,
  SEND_STATUS_TONES,
  SIGNER_SHORT_NAME,
  closedGate,
  roleLabel,
  sendGates,
  shortHash,
} from './twoStagePresentation';
import styles from './TwoStageBillingWorkbench.module.css';

export type PanelContext = {
  memberId: string;
  caseId: string;
  gates: CaseSummaryDto['gates'];
  /** Reload the case summary after any server answer that may have changed it. */
  onChanged: () => void;
};

// ---------------------------------------------------------------------------
// Shared pieces.

function useAction() {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  async function run<T>(call: () => Promise<ApiResult<T>>, onOk?: (data: T) => void, ctx?: PanelContext): Promise<boolean> {
    setPending(true);
    setFailure(null);
    const result = await call();
    setPending(false);
    if (result.ok) {
      onOk?.(result.data);
      ctx?.onChanged();
      return true;
    }
    setFailure(result);
    // A refusal after part of the request happened, or an unknown result, changes what the summary shows.
    if (result.uncertain) ctx?.onChanged();
    return false;
  }
  return { pending, failure, setFailure, run };
}

export function FailureNotice({ failure }: { failure: ApiFailure | null }) {
  if (!failure) return null;
  const blockers = failure.body?.blockers ?? [];
  const fields = Object.values(failure.body?.fields ?? {});
  return (
    <div className={styles.alert} role="alert" data-code={failure.body?.code}>
      <p>{failure.message}</p>
      {blockers.length > 0 || fields.length > 0 ? (
        <ul className={styles.alertList}>
          {blockers.map((b, i) => (
            <li key={`${b.code}-${i}`} data-code={b.code}>
              {b.hardHold ? 'Hold: ' : ''}
              {b.message}
            </li>
          ))}
          {fields.map((f, i) => (
            <li key={`field-${i}`} data-code={f?.code}>
              {f?.message}
            </li>
          ))}
        </ul>
      ) : null}
      {failure.uncertain ? <p className={styles.alertNote}>The case was reloaded. Check each copy’s status before trying again.</p> : null}
    </div>
  );
}

function ActionButton({
  label,
  pendingLabel,
  reason,
  pending,
  onClick,
  variant = 'primary',
  type = 'button',
}: {
  label: string;
  pendingLabel?: string;
  /** Why the button is disabled; null when it may be clicked (the server still decides). */
  reason: string | null;
  pending?: boolean;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
  type?: 'button' | 'submit';
}) {
  const id = useId();
  return (
    <div className={styles.actionRow}>
      <button
        type={type}
        className={variant === 'primary' ? styles.primaryButton : styles.secondaryButton}
        disabled={Boolean(reason) || pending}
        aria-describedby={reason ? id : undefined}
        onClick={onClick}
      >
        {pending ? pendingLabel ?? `${label}…` : label}
      </button>
      {reason ? (
        <p id={id} className={styles.reason}>
          {reason}
        </p>
      ) : null}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = 'text',
  hint,
  multiline,
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: 'text' | 'date' | 'number';
  hint?: string;
  multiline?: boolean;
  readOnly?: boolean;
}) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {label}
      </label>
      {multiline ? (
        <textarea id={id} className={styles.control} rows={3} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={hint ? `${id}-hint` : undefined} />
      ) : (
        <input id={id} className={styles.control} type={type} value={value} readOnly={readOnly} onChange={(e) => onChange(e.target.value)} aria-describedby={hint ? `${id}-hint` : undefined} />
      )}
      {hint ? (
        <p id={`${id}-hint`} className={styles.fieldHint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={styles.checkField}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Panel({ title, children, open }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className={styles.panel} open={open}>
      <summary className={styles.panelSummary}>{title}</summary>
      <div className={styles.panelBody}>{children}</div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// J5 readiness (§5.4) and J6 class started (§5.5).

export function J5ReadinessPanel({ ctx, attestation }: { ctx: PanelContext; attestation: J5StageView['readinessAttestation'] }) {
  const action = useAction();
  const [classStartDate, setClassStartDate] = useState('');
  const [requestedBy, setRequestedBy] = useState('');
  const [requestedOn, setRequestedOn] = useState('');
  const [requestRef, setRequestRef] = useState('');
  const [evidence, setEvidence] = useState('');
  const [ready, setReady] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const submit = () =>
    action.run(
      () =>
        twoStageApi.attestJ5Readiness(ctx.memberId, ctx.caseId, {
          classStartDate,
          studentReadyConfirmed: ready as true,
          counselorRequestedBy: requestedBy,
          counselorRequestedOn: requestedOn,
          counselorRequestReference: requestRef,
          evidenceReference: evidence,
          confirmed: confirmed as true,
        }),
      undefined,
      ctx,
    );
  return (
    <Panel title={attestation ? 'J5 readiness (recorded)' : 'Record J5 readiness'} open={!attestation}>
      {attestation ? (
        <p className={styles.panelFact}>
          Recorded {attestation.attestedAt.slice(0, 10)}
          {attestation.attestedBy.displayName ? ` by ${attestation.attestedBy.displayName}` : ''}: class starts {attestation.confirmedClassStartDate} (quoted end {attestation.quotedClassEndDate}); requested by{' '}
          {attestation.counselorRequest.requestedBy} on {attestation.counselorRequest.requestedOn}. A correction below records a new attestation.
        </p>
      ) : (
        <p className={styles.panelFact}>The J5 draft needs the counselor’s request and the confirmed class start date first.</p>
      )}
      <div className={styles.fieldGrid}>
        <TextField label="Confirmed class start date" type="date" value={classStartDate} onChange={setClassStartDate} />
        <TextField label="Calculated class end date" type="date" value={isIsoDate(classStartDate) ? calculateClassEndDate(classStartDate) : ''} onChange={() => undefined} readOnly hint="Fixed at six calendar months after the start, using the last day of the month when needed." />
        <TextField label="Counselor who requested the quote" value={requestedBy} onChange={setRequestedBy} />
        <TextField label="Date of the request" type="date" value={requestedOn} onChange={setRequestedOn} />
        <TextField label="Request reference" value={requestRef} onChange={setRequestRef} hint="For example the subject line of the counselor’s email." />
        <TextField label="Evidence reference" value={evidence} onChange={setEvidence} hint="Where the approval and request are on file." />
      </div>
      <CheckField label="The student is approved and ready for training." checked={ready} onChange={setReady} />
      <CheckField label="I confirm these facts are recorded accurately." checked={confirmed} onChange={setConfirmed} />
      <ActionButton label="Record readiness" pendingLabel="Recording…" reason={null} pending={action.pending} onClick={() => void submit()} variant="secondary" />
      <FailureNotice failure={action.failure} />
    </Panel>
  );
}

export function ClassStartedPanel({ ctx, classStarted }: { ctx: PanelContext; classStarted: J6StageView['classStarted'] }) {
  const action = useAction();
  const [start, setStart] = useState('');
  const end = isIsoDate(start) ? calculateClassEndDate(start) : '';
  const [evidence, setEvidence] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [contractNote, setContractNote] = useState<string | null>(null);
  const submit = () =>
    action.run(
      () => twoStageApi.attestClassStarted(ctx.memberId, ctx.caseId, { classStartDate: start, classEndDate: end, evidenceReference: evidence, confirmed: confirmed as true }),
      (dto) => setContractNote(dto.endDateIsContract ? null : 'The end date is not the contract end date, so the J6 will be held until it is corrected.'),
      ctx,
    );
  return (
    <Panel title={classStarted ? 'Class started (recorded)' : 'Record class start'} open={false}>
      {classStarted ? (
        <p className={styles.panelFact}>
          Class {classStarted.classStartDate} – {classStarted.classEndDate}, recorded {classStarted.attestedAt.slice(0, 10)}
          {classStarted.attestedBy.displayName ? ` by ${classStarted.attestedBy.displayName}` : ''}.
          {classStarted.startedOnOrBeforeToday ? '' : ' The start date is still in the future.'}
        </p>
      ) : null}
      <div className={styles.fieldGrid}>
        <TextField label="Actual class start date" type="date" value={start} onChange={setStart} />
        <TextField label="Calculated class end date" type="date" value={end} onChange={() => undefined} readOnly hint="Fixed at six calendar months after the actual start, using the last day of the month when needed." />
        <TextField label="Evidence reference" value={evidence} onChange={setEvidence} />
      </div>
      <CheckField label="I confirm the student has started this class." checked={confirmed} onChange={setConfirmed} />
      <ActionButton label="Record class start" pendingLabel="Recording…" reason={null} pending={action.pending} onClick={() => void submit()} variant="secondary" />
      {contractNote ? <p className={styles.holdNote}>{contractNote}</p> : null}
      <FailureNotice failure={action.failure} />
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Voucher file (§5.10): any admin uploads the original PDF.

export function VoucherPanel({ ctx, voucher }: { ctx: PanelContext; voucher: J6StageView['voucher'] }) {
  const action = useAction();
  const announce = useAnnounce();
  const [file, setFile] = useState<File | null>(null);
  const inputId = useId();
  const gate = closedGate(ctx.gates, ACTION_GATES.upload);
  const reason = gate?.message ?? (file ? null : 'Choose the board-signed voucher PDF first.');
  const upload = () =>
    file &&
    action.run(
      () => twoStageApi.uploadVoucher(ctx.memberId, ctx.caseId, file),
      (dto) => announce(dto.reused ? 'This voucher file was already on file.' : 'Voucher uploaded.'),
      ctx,
    );
  return (
    <Panel title="Signed board voucher" open={!voucher}>
      {voucher ? (
        <div className={styles.panelFact}>
          <p>
            <a href={voucher.artifact.downloadPath} target="_blank" rel="noopener noreferrer">
              {voucher.artifact.fileName}
            </a>{' '}
            · {Math.ceil(voucher.artifact.byteLength / 1024)} KB · sha256 {shortHash(voucher.artifact.sha256)} · uploaded {voucher.artifact.createdAt.slice(0, 10)}
            {voucher.artifact.createdBy.displayName ? ` by ${voucher.artifact.createdBy.displayName}` : ''}
          </p>
          <p>
            Voucher details:{' '}
            {voucher.attestation
              ? `${voucher.attestation.voucherReference}, received ${voucher.attestation.receivedOn}, recorded by ${voucher.attestation.attestedBy.displayName ?? 'the designated signer'}`
              : `not recorded yet (${SIGNER_SHORT_NAME} records them)`}
            .
          </p>
          <p>
            Receiving signature:{' '}
            {voucher.receiptAttestation
              ? `attested ${voucher.receiptAttestation.attestedAt.slice(0, 10)} on this exact file`
              : `not attested yet (${SIGNER_SHORT_NAME} attests it on this exact file)`}
            .
          </p>
          <p className={styles.fieldHint}>Uploading a different file replaces this voucher, and both of his steps must be done again for the new file.</p>
        </div>
      ) : (
        <p className={styles.panelFact}>Upload the original board-signed voucher. It is stored byte for byte and never changed.</p>
      )}
      <div className={styles.field}>
        <label htmlFor={inputId} className={styles.fieldLabel}>
          Voucher PDF
        </label>
        <input
          id={inputId}
          className={styles.fileInput}
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            action.setFailure(null);
          }}
        />
        <p className={styles.fieldHint}>PDF only, up to 4 MB.</p>
      </div>
      <ActionButton label="Upload voucher" pendingLabel="Uploading…" reason={reason} pending={action.pending} onClick={() => void upload()} variant="secondary" />
      <FailureNotice failure={action.failure} />
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Michael's steps (§5.10 data entry, §5.10a receiving signature). The
// workbench renders these only when the server says the viewer is the
// designated signer and the step is ready.

function dollarsToCents(text: string): number {
  const cleaned = text.replace(/[$,\s]/gu, '');
  if (!/^\d+(\.\d{1,2})?$/u.test(cleaned)) return Number.NaN;
  const [whole, frac = ''] = cleaned.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

function VoucherDataForm({ ctx, task, caseInfo }: { ctx: PanelContext; task: DesignatedSignerTask; caseInfo: CaseSummaryDto['case'] }) {
  const action = useAction();
  const [boardName, setBoardName] = useState('');
  const [reference, setReference] = useState('');
  const [receivedOn, setReceivedOn] = useState('');
  const [amount, setAmount] = useState('');
  const [programSlug, setProgramSlug] = useState(caseInfo.programSlug);
  const [className, setClassName] = useState(caseInfo.className ?? '');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [evidence, setEvidence] = useState('');
  const [signaturePresent, setSignaturePresent] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const gate = closedGate(ctx.gates, ACTION_GATES.voucherData);
  const submit = () =>
    action.run(
      () =>
        twoStageApi.attestVoucherData(ctx.memberId, ctx.caseId, task.artifactId, {
          boardName,
          voucherReference: reference,
          receivedOn,
          authorizedAmountCents: dollarsToCents(amount),
          authorizedProgramSlug: programSlug,
          authorizedClassName: className,
          authorizedStartDate: start,
          authorizedEndDate: end,
          receivingSignaturePresent: signaturePresent as true,
          evidenceReference: evidence,
          confirmed: confirmed as true,
        }),
      undefined,
      ctx,
    );
  return (
    <div className={styles.signerAction}>
      <p className={styles.fieldHint}>For file {shortHash(task.sha256)} exactly as uploaded.</p>
      <div className={styles.fieldGrid}>
        <TextField label="Board name" value={boardName} onChange={setBoardName} />
        <TextField label="Voucher / PO reference" value={reference} onChange={setReference} />
        <TextField label="Date received" type="date" value={receivedOn} onChange={setReceivedOn} />
        <TextField label="Authorized amount (USD)" value={amount} onChange={setAmount} hint="For example 7,500.00" />
        <TextField label="Authorized program" value={programSlug} onChange={setProgramSlug} />
        <TextField label="Authorized class" value={className} onChange={setClassName} />
        <TextField label="Authorized period start" type="date" value={start} onChange={setStart} />
        <TextField label="Authorized period end" type="date" value={end} onChange={setEnd} />
        <TextField label="Evidence reference" value={evidence} onChange={setEvidence} />
      </div>
      <CheckField label="The board’s signed voucher shows a receiving signature." checked={signaturePresent} onChange={setSignaturePresent} />
      <CheckField label="I confirm these voucher details match the uploaded file." checked={confirmed} onChange={setConfirmed} />
      <ActionButton label="Record voucher details" pendingLabel="Recording…" reason={gate?.message ?? null} pending={action.pending} onClick={() => void submit()} />
      <FailureNotice failure={action.failure} />
    </div>
  );
}

function ReceiptAttestationForm({ ctx, task }: { ctx: PanelContext; task: DesignatedSignerTask }) {
  const load = useAction();
  const action = useAction();
  const [statement, setStatement] = useState<VoucherReceiptStatementDto | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const gate = closedGate(ctx.gates, ACTION_GATES.receiptAttestation);
  const stale = statement !== null && statement.sha256 !== task.sha256;
  const reason = gate?.message ?? (stale ? 'The voucher file changed. Review the statement for the current file.' : confirmed ? null : 'Confirm the statement first.');
  return (
    <div className={styles.signerAction}>
      {!statement || stale ? (
        <ActionButton
          label="Review the receiving-signature statement"
          pendingLabel="Loading…"
          reason={null}
          pending={load.pending}
          variant="secondary"
          onClick={() => void load.run(() => twoStageApi.receiptStatement(ctx.memberId, ctx.caseId, task.artifactId), (dto) => setStatement(dto))}
        />
      ) : (
        <>
          <blockquote className={styles.statement}>{statement.statementText}</blockquote>
          <CheckField label="This statement is true." checked={confirmed} onChange={setConfirmed} />
          <ActionButton
            label="Attest my receiving signature"
            pendingLabel="Attesting…"
            reason={reason}
            pending={action.pending}
            onClick={() =>
              void action.run(
                () =>
                  twoStageApi.attestReceipt(ctx.memberId, ctx.caseId, task.artifactId, {
                    expectedSha256: task.sha256,
                    method: 'present_on_original',
                    statementConfirmed: true,
                    statementText: statement.statementText,
                  }),
                undefined,
                ctx,
              )
            }
          />
        </>
      )}
      <FailureNotice failure={load.failure ?? action.failure} />
    </div>
  );
}

export function SignerTaskAction({ ctx, task, caseInfo }: { ctx: PanelContext; task: DesignatedSignerTask; caseInfo: CaseSummaryDto['case'] }) {
  return task.step === 'voucher_data' ? <VoucherDataForm ctx={ctx} task={task} caseInfo={caseInfo} /> : <ReceiptAttestationForm ctx={ctx} task={task} />;
}

// ---------------------------------------------------------------------------
// Freeze → sign → send → reconcile → close (§5.9, §5.13, §5.14, §5.16-5.18).

function firstBlockerMessage(view: J5StageView | J6StageView): string | null {
  return view.blockers.find((b) => b.code !== 'DRAFT_MISSING')?.message ?? view.blockers[0]?.message ?? null;
}

function received(d: RoleDeliveryView): boolean {
  return Boolean(d.latest && (d.latest.acceptedAt !== null || d.latest.status === 'reconciled_delivered'));
}

function ReconcileForm({ ctx, stage, delivery }: { ctx: PanelContext; stage: BillingStage; delivery: RoleDeliveryView }) {
  const action = useAction();
  const [outcome, setOutcome] = useState<'delivered' | 'not_delivered'>('delivered');
  const [note, setNote] = useState('');
  const latest = delivery.latest!;
  const expectedStatus = latest.status === 'needs_reconciliation' ? 'needs_reconciliation' : 'ambiguous';
  return (
    <div className={styles.reconcile}>
      <fieldset className={styles.radioGroup}>
        <legend className={styles.fieldLabel}>What happened to the {roleLabel(delivery.role).toLowerCase()} copy?</legend>
        <label className={styles.checkField}>
          <input type="radio" name={`reconcile-${stage}-${delivery.role}`} checked={outcome === 'delivered'} onChange={() => setOutcome('delivered')} />
          <span>It arrived</span>
        </label>
        <label className={styles.checkField}>
          <input type="radio" name={`reconcile-${stage}-${delivery.role}`} checked={outcome === 'not_delivered'} onChange={() => setOutcome('not_delivered')} />
          <span>It did not arrive</span>
        </label>
      </fieldset>
      <TextField label="Evidence note" value={note} onChange={setNote} multiline hint="How you confirmed it, for example a reply from the recipient." />
      <ActionButton
        label="Record the outcome"
        pendingLabel="Recording…"
        reason={note.trim() ? null : 'Add a note on the evidence first.'}
        pending={action.pending}
        variant="secondary"
        onClick={() => void action.run(() => twoStageApi.reconcile(ctx.memberId, ctx.caseId, stage, latest.sendId, { outcome, note, expectedStatus }), undefined, ctx)}
      />
      <FailureNotice failure={action.failure} />
    </div>
  );
}

function ClosePanel({ ctx, stage, view }: { ctx: PanelContext; stage: BillingStage; view: J5StageView | J6StageView }) {
  const action = useAction();
  const [closeAction, setCloseAction] = useState<'void' | 'supersede'>('supersede');
  const [reason, setReason] = useState('');
  const [ack, setAck] = useState<Partial<Record<RecipientRole, boolean>>>({});
  const current = view.current;
  if (!current || !['draft', 'signed', 'sent'].includes(current.status)) return null;
  const attempted = current.delivery.some((d) => d.latest !== null);
  const partial = current.status === 'signed' && attempted;
  const receivedRoles = current.delivery.filter(received).map((d) => d.role);
  const allAcked = receivedRoles.every((r) => ack[r]);
  const blocked = !reason.trim() ? 'Record why this version is being closed.' : partial && !allAcked ? 'Acknowledge each recipient who already has this version.' : null;
  const submit = () =>
    partial
      ? action.run(
          () =>
            twoStageApi.cancelSend(ctx.memberId, ctx.caseId, stage, current.recordId, {
              action: closeAction,
              reason,
              versionHash: current.versionHash,
              acknowledgedRolesAlreadyReceived: receivedRoles,
            }),
          undefined,
          ctx,
        )
      : action.run(() => twoStageApi.close(ctx.memberId, ctx.caseId, stage, current.recordId, { action: closeAction, reason, versionHash: current.versionHash }), undefined, ctx);
  return (
    <Panel title={partial ? 'Cancel the remaining sends' : 'Void or supersede this version'}>
      <fieldset className={styles.radioGroup}>
        <legend className={styles.fieldLabel}>Action</legend>
        <label className={styles.checkField}>
          <input type="radio" name={`close-${stage}`} checked={closeAction === 'supersede'} onChange={() => setCloseAction('supersede')} />
          <span>Supersede (a corrected version follows)</span>
        </label>
        <label className={styles.checkField}>
          <input type="radio" name={`close-${stage}`} checked={closeAction === 'void'} onChange={() => setCloseAction('void')} />
          <span>Void</span>
        </label>
      </fieldset>
      <TextField label="Reason" value={reason} onChange={setReason} multiline />
      {partial
        ? receivedRoles.map((role) => (
            <CheckField key={role} label={`${roleLabel(role)} already received v${current.version}.`} checked={Boolean(ack[role])} onChange={(v) => setAck((a) => ({ ...a, [role]: v }))} />
          ))
        : null}
      <ActionButton label={partial ? 'Cancel remaining sends' : closeAction === 'void' ? 'Void this version' : 'Supersede this version'} reason={blocked} pending={action.pending} variant="secondary" onClick={() => void submit()} />
      <FailureNotice failure={action.failure} />
    </Panel>
  );
}

/**
 * The designated signer's approved signature image. Only he sees this card
 * (the server refuses anyone else), and only he can approve an image: the
 * upload, after he confirms the exact statement, is his approval. Nothing
 * else on the page can sign for him or change the image.
 */
const SIGNATURE_ASSET_MISSING = 'SIGNATURE_ASSET_MISSING';

function signatureAssetMissing(view: J5StageView | J6StageView, gates: CaseSummaryDto['gates']): string | null {
  const blocker = view.blockers.find((b) => String(b.code) === SIGNATURE_ASSET_MISSING);
  if (blocker) return blocker.message;
  const gate = Object.values(gates).find((g) => g.enabled === false && String(g.code) === SIGNATURE_ASSET_MISSING);
  return gate ? gate.message ?? 'Upload your signature image before signing.' : null;
}

/**
 * The one stage whose lifecycle carries the signature upload: the first that
 * reports the image missing, or J5 once an image is approved. The image is per
 * signer, not per stage, so the designated signer never sees two forms.
 */
export function signatureSlotStage(summary: Pick<CaseSummaryDto, 'j5' | 'j6' | 'gates' | 'signature'>): BillingStage | null {
  for (const stage of ['j5', 'j6'] as const) if (signatureAssetMissing(summary[stage], summary.gates) || summary.signature.active) return stage;
  return null;
}

function SignatureAssetSlot({ ctx, signature, missingMessage }: { ctx: PanelContext; signature: SignatureStatusDto; missingMessage: string | null }) {
  const action = useAction();
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState('');
  const active = signature.active;
  const replacing = active !== null;
  const reasonBlocked = !file
    ? 'Choose your signature image (a PNG).'
    : !confirmed
      ? 'Confirm the statement first.'
      : replacing && !reason.trim()
        ? 'Say why you are replacing your signature image.'
        : null;

  async function submit() {
    if (!file || reasonBlocked) return;
    const attestation = { statementConfirmed: true, statementText: signature.approvalStatement, ...(replacing ? { replace: true, revokeReason: reason.trim() } : {}) };
    await action.run(
      () => twoStageApi.uploadSignature(ctx.memberId, file, attestation),
      () => {
        setFile(null);
        setConfirmed(false);
        setReason('');
      },
      ctx,
    );
  }

  const form = (
    <>
      <div className={styles.field}>
        <label htmlFor={inputId} className={styles.fieldLabel}>
          {replacing ? 'New signature image (PNG)' : 'Signature image (PNG)'}
        </label>
        <input
          id={inputId}
          className={styles.fileInput}
          type="file"
          accept="image/png,.png"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            action.setFailure(null);
          }}
        />
        <p className={styles.fieldHint}>PNG only, up to 4 MB. It is printed above your name on the J5 and J6 documents you sign, and nowhere else.</p>
      </div>
      {replacing ? <TextField label="Why are you replacing it?" value={reason} onChange={setReason} /> : null}
      <blockquote className={styles.statement}>{signature.approvalStatement}</blockquote>
      <CheckField label="I make this statement." checked={confirmed} onChange={setConfirmed} />
      <ActionButton
        label={replacing ? 'Replace my signature image' : 'Upload your signature (PNG)'}
        pendingLabel={replacing ? 'Replacing…' : 'Uploading…'}
        reason={reasonBlocked}
        pending={action.pending}
        variant="secondary"
        onClick={() => void submit()}
      />
      <FailureNotice failure={action.failure} />
    </>
  );

  return (
    <div className={styles.signatureSlot} role="group" aria-label="Your signature">
      <p className={styles.sectionLabel}>Your signature</p>
      {active ? (
        <>
          <p className={styles.panelFact}>
            Approved {active.approvedAt.slice(0, 10)}: a {active.widthPx} × {active.heightPx} px image (fingerprint {shortHash(active.sha256)}). A draft saved before a change must be saved again to carry the current image.
          </p>
          <details>
            <summary>Replace my signature image</summary>
            {form}
          </details>
        </>
      ) : (
        <>
          <p className={styles.panelFact}>{missingMessage ?? 'Upload your signature image before signing.'}</p>
          {form}
        </>
      )}
    </div>
  );
}

export function StageLifecycle({
  ctx,
  stage,
  view,
  viewer,
  signature,
  showSignatureSlot,
}: {
  ctx: PanelContext;
  stage: BillingStage;
  view: J5StageView | J6StageView;
  viewer: CaseSummaryDto['viewer'];
  signature: SignatureStatusDto;
  /** Whether this stage carries the case's single signature upload (`signatureSlotStage`). */
  showSignatureSlot: boolean;
}) {
  const freezeAction = useAction();
  const signAction = useAction();
  const sendAction = useAction();
  const [frozen, setFrozen] = useState<FreezeDto | null>(null);
  const [intentChecked, setIntentChecked] = useState(false);
  const [retryRoles, setRetryRoles] = useState<Partial<Record<RecipientRole, boolean>>>({});
  const [sendResult, setSendResult] = useState<SendDto | null>(null);
  const current = view.current;
  const hash = current?.versionHash ?? null;

  // A checkpoint belongs to one exact version.
  useEffect(() => {
    setFrozen(null);
    setIntentChecked(false);
  }, [hash]);

  const isDraft = current?.status === 'draft';
  const signatureMissing = signatureAssetMissing(view, ctx.gates);
  const freezeReason = isDraft ? null : current ? `This version is ${current.status}; only a draft is reviewed for signature.` : 'Save a draft first.';

  const signGate = closedGate(ctx.gates, ACTION_GATES.sign);
  const signReason =
    signGate?.message ??
    (!isDraft
      ? current
        ? `This version is already ${current.status}.`
        : 'Save a draft first.'
      : !viewer.isExecutiveSigner
        ? `Only ${SIGNER_SHORT_NAME} can sign, signed in as himself.`
        : !view.canSign
          ? firstBlockerMessage(view) ?? 'Complete the steps listed first.'
          : !frozen || frozen.versionHash !== current.versionHash
            ? 'Review this exact version for signature first.'
            : !intentChecked
              ? 'Confirm the signing statement first.'
              : null);

  const sendGate = closedGate(ctx.gates, sendGates(stage));
  const sendReason =
    sendGate?.message ??
    (current?.status === 'sent'
      ? `Sent${current.sentAt ? ` ${current.sentAt.slice(0, 10)}` : ''}; every recipient has this version.`
      : current?.status !== 'signed'
        ? 'Sign this document before sending it.'
        : !view.canSend
          ? firstBlockerMessage(view) ?? 'Complete the steps listed first.'
          : null);
  const retryable = current?.delivery.filter((d) => d.nextAction === 'new_attempt_on_request') ?? [];
  const reconcilable = current?.status === 'signed' ? current.delivery.filter((d) => d.nextAction === 'reconcile' && d.latest) : [];

  return (
    <div className={styles.lifecycle} aria-label={`${stage.toUpperCase()} signing and delivery`} role="group">
      <p className={styles.sectionLabel}>Sign and send</p>
      <p className={styles.fieldHint}>Each step is checked again by the server when it runs; a button being available is never the approval.</p>

      <ActionButton
        label="Review for signature"
        pendingLabel="Checking…"
        reason={freezeReason}
        pending={freezeAction.pending}
        variant="secondary"
        onClick={() =>
          current &&
          void freezeAction.run(
            () => twoStageApi.freeze(ctx.memberId, ctx.caseId, stage, { recordId: current.recordId, versionHash: current.versionHash }),
            (dto) => {
              setFrozen(dto);
              setIntentChecked(false);
            },
          )
        }
      />
      <FailureNotice failure={freezeAction.failure} />
      {frozen && current && frozen.versionHash === current.versionHash ? (
        <div className={styles.freeze}>
          <p>
            {frozen.documentTitle} {frozen.documentNumber}, v{frozen.version}, version {shortHash(frozen.versionHash)}.{' '}
            <a href={frozen.previewPath} target="_blank" rel="noopener noreferrer">
              Open this exact DRAFT
            </a>
          </p>
          <blockquote className={styles.statement}>{frozen.intentText}</blockquote>
          <CheckField label="I have reviewed this exact version and make this statement." checked={intentChecked} onChange={setIntentChecked} />
        </div>
      ) : null}

      {viewer.isDesignatedSigner && showSignatureSlot && (signatureMissing || signature.active) ? <SignatureAssetSlot ctx={ctx} signature={signature} missingMessage={signatureMissing} /> : null}

      <ActionButton
        label={`Sign ${stage.toUpperCase()}`}
        pendingLabel="Signing…"
        reason={signReason}
        pending={signAction.pending}
        onClick={() =>
          frozen &&
          void signAction.run(
            () =>
              twoStageApi.sign(ctx.memberId, ctx.caseId, stage, {
                recordId: frozen.recordId,
                version: frozen.version,
                // FreezeDto.versionHash is the exact content hash the signer reviewed.
                contentSha256: frozen.versionHash,
                intentConfirmed: true,
                intentText: frozen.intentText,
              }),
            undefined,
            ctx,
          )
        }
      />
      <FailureNotice failure={signAction.failure} />

      {retryable.length > 0 ? (
        <fieldset className={styles.radioGroup}>
          <legend className={styles.fieldLabel}>Send a new attempt to</legend>
          {retryable.map((d) => (
            <CheckField key={d.role} label={roleLabel(d.role)} checked={Boolean(retryRoles[d.role])} onChange={(v) => setRetryRoles((r) => ({ ...r, [d.role]: v }))} />
          ))}
        </fieldset>
      ) : null}
      <ActionButton
        label={`Send ${stage.toUpperCase()}`}
        pendingLabel="Sending…"
        reason={sendReason}
        pending={sendAction.pending}
        onClick={() => {
          if (!current) return;
          const roles = retryable.filter((d) => retryRoles[d.role]).map((d) => d.role);
          void sendAction.run(
            () => twoStageApi.send(ctx.memberId, ctx.caseId, stage, { recordId: current.recordId, versionHash: current.versionHash, ...(roles.length > 0 ? { retryFailedRoles: roles } : {}) }),
            (dto) => setSendResult(dto),
            ctx,
          );
        }}
      />
      <FailureNotice failure={sendAction.failure} />
      {sendResult ? (
        <ul className={styles.outcomeList} aria-label="Send results">
          {sendResult.roles.map((r) => (
            <li key={r.role} data-outcome={r.outcome}>
              <strong>{roleLabel(r.role)}:</strong> {r.message}
            </li>
          ))}
        </ul>
      ) : null}

      {current && current.delivery.some((d) => d.latest) ? (
        <ul className={styles.deliveryList} aria-label="Delivery by recipient">
          {current.delivery.map((d) => (
            <li key={d.role} className={styles.deliveryRow}>
              <span>{roleLabel(d.role)}</span>
              {d.latest ? <StatusTag tone={SEND_STATUS_TONES[d.latest.status]}>{SEND_STATUS_LABELS[d.latest.status]}</StatusTag> : <StatusTag tone="muted">Not sent</StatusTag>}
              {d.retryWindowEndsAt ? <span className={styles.muted}>Safe same-key retry until {d.retryWindowEndsAt.slice(0, 16).replace('T', ' ')} UTC</span> : null}
              {d.followUp ? <StatusTag tone="warn">Follow up</StatusTag> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {reconcilable.map((d) => (
        <ReconcileForm key={d.role} ctx={ctx} stage={stage} delivery={d} />
      ))}

      <ClosePanel ctx={ctx} stage={stage} view={view} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payment (§5.15): an expected follow-up window, never a due date.

export function PaymentPanel({ ctx, payment }: { ctx: PanelContext; payment: PaymentDto }) {
  const action = useAction();
  const [receivedOn, setReceivedOn] = useState('');
  const [evidence, setEvidence] = useState('');
  return (
    <div className={styles.payment} role="group" aria-label="Payment">
      <p className={styles.sectionLabel}>Payment</p>
      {payment.status === 'not_applicable' ? (
        <p className={styles.panelFact}>Payment tracking starts when the J6 is sent.</p>
      ) : payment.status === 'received' ? (
        <p className={styles.panelFact}>
          <StatusTag tone="ok">Received</StatusTag> {payment.receivedOn}
        </p>
      ) : (
        <>
          <p className={styles.panelFact}>
            <StatusTag tone={payment.followUp === 'follow_up_now' ? 'warn' : 'info'}>{payment.followUp === 'follow_up_now' ? 'Follow up now' : 'Awaiting payment'}</StatusTag> Expected between{' '}
            {payment.expectedFollowUpFrom} and {payment.expectedFollowUpTo}. This is a follow-up window, not a due date.
          </p>
          <div className={styles.fieldGrid}>
            <TextField label="Date received" type="date" value={receivedOn} onChange={setReceivedOn} />
            <TextField label="Evidence" value={evidence} onChange={setEvidence} hint="For example the check number or wire reference." />
          </div>
          <ActionButton
            label="Record payment received"
            pendingLabel="Recording…"
            reason={payment.j6RecordId ? null : 'Reload the case first.'}
            pending={action.pending}
            variant="secondary"
            onClick={() => payment.j6RecordId && void action.run(() => twoStageApi.paymentReceived(ctx.memberId, ctx.caseId, { j6RecordId: payment.j6RecordId!, receivedOn, evidence }), undefined, ctx)}
          />
          <FailureNotice failure={action.failure} />
        </>
      )}
    </div>
  );
}
