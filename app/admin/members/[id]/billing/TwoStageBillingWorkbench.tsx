'use client';

import type { ReactNode } from 'react';
import { StatusTag } from '@/components/portal/kit';
import {
  AI_SOFTWARE_CONTACT_HOURS,
  AUTHORIZED_SIGNER,
  CLASS_LENGTH_CALENDAR_MONTHS,
  PAYMENT_FOLLOW_UP_MAX_DAYS,
  PAYMENT_FOLLOW_UP_MIN_DAYS,
  STANDARD_CONTACT_HOURS,
  TUITION_AND_FEES_CENTS,
  TUITION_AND_FEES_LABEL,
} from '@/lib/billing/twoStage/constants';
import {
  GATE_CODES,
  GATE_NAMES,
  J5_READINESS_KEYS,
  J6_READINESS_KEYS,
  type BillingStage,
  type Blocker,
  type CaseSummaryDto,
  type ContactField,
  type DesignatedSignerTask,
  type J5StageView,
  type J6StageView,
  type ReadinessKey,
  type RecipientRole,
  type StageVersionView,
  type TwoStageBillingReadiness,
} from '@/lib/billing/twoStage/dto';
import { formatUsdCents } from '@/lib/billing/twoStage/lineItem';
import { STAGE_RECIPIENT_ROLES } from '@/lib/billing/twoStage/recipients';
import {
  CONTACT_SOURCE_LABELS,
  GATE_LABELS,
  J6_LABEL_OVERRIDES,
  MATCH_LABELS,
  READINESS_LABELS,
  SEND_STATUS_LABELS,
  SEND_STATUS_TONES,
  SIGNER_SHORT_NAME,
  STAGE_STATUS_LABELS,
  STAGE_STATUS_TONES,
  WAITING_ON_SIGNER_LABEL,
  roleLabel,
  rolesSentence,
  shortHash,
} from './twoStagePresentation';
import styles from './TwoStageBillingWorkbench.module.css';

export type { TwoStageBillingReadiness };

type StageView = J5StageView | J6StageView;
type StageReadiness = Partial<Record<ReadinessKey, boolean>>;

const GATE_CODE_SET: ReadonlySet<string> = new Set(GATE_CODES);

export type TwoStageBillingWorkbenchProps = {
  memberName: string;
  /** Shown only until the case summary is loaded; afterwards contacts come from the summary. */
  memberEmail: string | null;
  counselor: { name: string; email: string } | null;
  /** Server-computed, advisory readiness per stage card (`CaseSummaryDto.readinessByStage`). */
  readinessByStage?: CaseSummaryDto['readinessByStage'];
  readinessWaitingOn?: CaseSummaryDto['readinessWaitingOn'];
  waitingOnDesignatedSigner?: CaseSummaryDto['waitingOnDesignatedSigner'];
  viewer?: CaseSummaryDto['viewer'];
  gates?: CaseSummaryDto['gates'];
  caseInfo?: CaseSummaryDto['case'];
  j5?: J5StageView;
  j6?: J6StageView;
  /** Why draft preparation cannot open (for example the migration gate's message); shown as each disabled button's reason. */
  unavailableReason?: string;
  /** Opens the J5 draft editor (POST …/j5/draft/review, PUT …/j5/draft). Opening never writes or authorizes. */
  onPrepareJ5?: () => void;
  /** Opens the J6 draft editor (POST …/j6/draft/review, PUT …/j6/draft). Opening never writes or authorizes. */
  onPrepareJ6?: () => void;
  /** Rendered inside each stage card: its editor, evidence and lifecycle actions. */
  stageContent?: Partial<Record<BillingStage, ReactNode>>;
  /** Michael's own step for a task. Called only when the server says `task.viewerIsDesignatedSigner && task.ready`. */
  renderSignerTaskAction?: (task: DesignatedSignerTask) => ReactNode;
};

type CheckStatus = 'verified' | 'attention' | 'unchecked' | 'waiting';

const CHECK_TEXT: Record<CheckStatus, string> = {
  verified: 'Verified',
  attention: 'Needs attention',
  unchecked: 'Not checked',
  waiting: WAITING_ON_SIGNER_LABEL,
};

function checkStatus(value: boolean | undefined, waiting: boolean): CheckStatus {
  if (value === true) return 'verified';
  if (waiting) return 'waiting';
  return value === false ? 'attention' : 'unchecked';
}

function CheckList({
  stage,
  keys,
  readiness,
  waitingOn,
}: {
  stage: BillingStage;
  keys: readonly ReadinessKey[];
  readiness: StageReadiness;
  waitingOn: CaseSummaryDto['readinessWaitingOn'];
}) {
  return (
    <ul className={styles.checkList}>
      {keys.map((key) => {
        const waiting = stage === 'j6' && (waitingOn as Partial<Record<ReadinessKey, string>>)[key] === 'designated_signer';
        const status = checkStatus(readiness[key], waiting);
        const label = (stage === 'j6' ? J6_LABEL_OVERRIDES[key] : undefined) ?? READINESS_LABELS[key];
        return (
          <li className={styles.checkRow} key={key} data-status={status}>
            <span className={styles.checkLabel}>{label}</span>
            <span className={status === 'verified' ? styles.verified : status === 'waiting' ? styles.waiting : styles.unverified}>{CHECK_TEXT[status]}</span>
          </li>
        );
      })}
    </ul>
  );
}

function BlockerList({ blockers }: { blockers: readonly Blocker[] }) {
  if (blockers.length === 0) return null;
  const ordered = [...blockers].sort((a, b) => Number(b.hardHold) - Number(a.hardHold));
  return (
    <div className={styles.blockers}>
      <p className={styles.sectionLabel}>What the next step needs</p>
      <ul className={styles.blockerList}>
        {ordered.map((b, i) => (
          <li key={`${b.code}-${i}`} className={b.hardHold ? styles.blockerHold : styles.blocker} data-code={b.code} data-hard-hold={b.hardHold ? 'true' : undefined}>
            <span className={styles.blockerTags}>
              {b.hardHold ? <StatusTag tone="danger">Hold</StatusTag> : null}
              {b.waitingOn === 'designated_signer' ? <StatusTag tone="info">{WAITING_ON_SIGNER_LABEL}</StatusTag> : null}
              {GATE_CODE_SET.has(b.code) ? <StatusTag tone="muted">Release gate</StatusTag> : null}
            </span>
            <span className={styles.blockerMessage}>{b.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function contactText(field: ContactField): string {
  return field.value ? `${field.value} (${CONTACT_SOURCE_LABELS[field.source]})` : CONTACT_SOURCE_LABELS.none;
}

type RecipientRow = { role: RecipientRole; name: string | null; email: string | null; phone: string | null; note: string | null };

const OPEN_STATUSES = new Set(['draft', 'signed', 'sent']);

/**
 * Recipients come from the stage's saved version (its frozen recipient rows)
 * when one is open, otherwise from the stage's role set and the summary's
 * contacts. Roles are read from the DTO, so a role added on the server shows
 * up here without a UI change.
 */
function recipientRows(stage: BillingStage, view: StageView | undefined): RecipientRow[] {
  const current = view?.current && OPEN_STATUSES.has(view.current.status) ? view.current : null;
  if (current) {
    return current.recipients.map((r) => ({ role: r.role, name: r.name, email: r.email, phone: r.phone, note: current.status === 'draft' ? 'saved draft' : 'as signed' }));
  }
  const contacts = (view?.contacts ?? {}) as Partial<Record<RecipientRole, { name: ContactField; email: ContactField; phone?: ContactField }>>;
  return STAGE_RECIPIENT_ROLES[stage].map((role) => {
    const c = contacts[role];
    return {
      role,
      name: c?.name.value ?? null,
      email: c?.email.value ?? null,
      phone: c?.phone?.value ?? null,
      note: c ? CONTACT_SOURCE_LABELS[c.email.value ? c.email.source : 'none'] : null,
    };
  });
}

function RecipientList({ stage, view }: { stage: BillingStage; view: StageView | undefined }) {
  const rows = recipientRows(stage, view);
  const roles = rows.map((r) => r.role);
  const delivery = new Map((view?.current?.delivery ?? []).map((d) => [d.role, d]));
  return (
    <>
      <span>{rolesSentence(roles)}</span>
      <span className={styles.recipientNote}> Each recipient gets their own copy; nobody is copied in secret.</span>
      {view ? (
        <ul className={styles.recipientList} aria-label={`${stage.toUpperCase()} recipients`}>
          {rows.map((r) => {
            const d = delivery.get(r.role);
            return (
              <li key={r.role} className={styles.recipientRow} data-role={r.role}>
                <span className={styles.recipientRole}>{roleLabel(r.role)}</span>
                <span className={styles.recipientValue}>
                  {r.name || r.email ? [r.name, r.email, r.phone].filter(Boolean).join(' · ') : 'Not on file yet'}
                  {r.note ? <span className={styles.recipientSource}> ({r.note})</span> : null}
                </span>
                {d?.latest ? <StatusTag tone={SEND_STATUS_TONES[d.latest.status]}>{SEND_STATUS_LABELS[d.latest.status]}</StatusTag> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}

function VersionLine({ current, history, earlier }: { current: StageVersionView | null; history: number; earlier: StageView['rolesThatReceivedEarlierVersions'] }) {
  if (!current) return <p className={styles.versionLine}>No draft saved yet.</p>;
  return (
    <div className={styles.versionLine}>
      <StatusTag tone={STAGE_STATUS_TONES[current.status]}>{STAGE_STATUS_LABELS[current.status]}</StatusTag>
      <span>
        v{current.version} · {current.documentNumber} · issue date {current.issueDate} · version {shortHash(current.versionHash)}
      </span>
      {history > 0 ? <span className={styles.muted}> · {history} earlier version{history === 1 ? '' : 's'}</span> : null}
      {earlier.map((e) => (
        <span key={e.role} className={styles.earlier}>
          {roleLabel(e.role)} already received v{e.versions.join(', v')}.
        </span>
      ))}
    </div>
  );
}

function SignerTasks({
  tasks,
  viewer,
  renderAction,
}: {
  tasks: readonly DesignatedSignerTask[];
  viewer: CaseSummaryDto['viewer'] | undefined;
  renderAction?: (task: DesignatedSignerTask) => ReactNode;
}) {
  if (tasks.length === 0) return null;
  return (
    <div className={styles.signerTasks} aria-label={WAITING_ON_SIGNER_LABEL}>
      <p className={styles.sectionLabel}>{WAITING_ON_SIGNER_LABEL}</p>
      {viewer?.isDesignatedSigner ? (
        <p className={styles.signerNote}>You are signed in as the designated signer. These steps are yours.</p>
      ) : (
        <p className={styles.signerNote}>Only {SIGNER_SHORT_NAME}, signed in as himself, can complete these steps. A staff account cannot.</p>
      )}
      <ol className={styles.signerTaskList}>
        {tasks.map((task) => (
          <li key={task.step} className={styles.signerTask} data-step={task.step}>
            <span className={styles.signerTaskHead}>
              <StatusTag tone="info">{WAITING_ON_SIGNER_LABEL}</StatusTag>
              <span className={styles.muted}>File {shortHash(task.sha256)}</span>
            </span>
            <span>{task.message}</span>
            {task.viewerIsDesignatedSigner && task.ready && renderAction ? (
              renderAction(task)
            ) : task.viewerIsDesignatedSigner && !task.ready ? (
              <span className={styles.muted}>
                {task.step === 'voucher_receipt_signature'
                  ? 'Available after the voucher details are recorded and a signer is designated.'
                  : 'Available once a designated signer is configured.'}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function HoldsAndMatches({ view }: { view: J6StageView }) {
  const mismatches = (view.matches ?? []).filter((m) => m.result === 'mismatch');
  if (view.holds.length === 0 && mismatches.length === 0) return null;
  return (
    <div className={styles.holds} role="group" aria-label="J6 holds">
      <p className={styles.sectionLabel}>On hold</p>
      <p className={styles.holdNote}>A hold clears only when the evidence is corrected. No note or exception clears it.</p>
      {mismatches.length > 0 ? (
        <dl className={styles.matchList}>
          {mismatches.map((m) => (
            <div key={m.check} className={styles.matchRow}>
              <dt>{MATCH_LABELS[m.check]}</dt>
              <dd>
                Expected {m.expected}; voucher shows {m.actual}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

function StageCard({
  stage,
  heading,
  description,
  note,
  attachments,
  keys,
  readiness,
  waitingOn,
  view,
  onPrepare,
  unavailableReason,
  children,
}: {
  stage: BillingStage;
  heading: string;
  description: string;
  note: string;
  attachments: string;
  keys: readonly ReadinessKey[];
  readiness: StageReadiness;
  waitingOn: CaseSummaryDto['readinessWaitingOn'];
  view: StageView | undefined;
  onPrepare?: () => void;
  unavailableReason?: string;
  children?: ReactNode;
}) {
  const actionAvailable = Boolean(onPrepare);
  const verified = keys.every((key) => readiness[key] === true);
  const reason = !onPrepare
    ? unavailableReason ?? 'Preparation is not yet available. The secure billing workflow is being connected.'
    : verified
      ? 'Opens draft preparation; signing and email require separate review.'
      : 'Opens draft preparation to review the missing details; signing and email stay blocked until verified.';
  const hasDraft = view?.current?.status === 'draft';

  return (
    <section className={styles.stage} aria-labelledby={`billing-${stage}-heading`} data-stage={stage}>
      <div className={styles.stageHeading}>
        <span className={styles.stageNumber}>{stage === 'j5' ? '01' : '02'}</span>
        <div className={styles.stageHeadingText}>
          <p className={styles.eyebrow}>{stage.toUpperCase()}</p>
          <h2 className={styles.title} id={`billing-${stage}-heading`}>{heading}</h2>
          <p className={styles.description}>{description}</p>
          {view ? <VersionLine current={view.current} history={view.history.length} earlier={view.rolesThatReceivedEarlierVersions} /> : null}
        </div>
      </div>

      <div className={styles.stageBody}>
        <div className={styles.stageMain}>
          <p className={styles.sectionLabel}>Before creating the draft</p>
          <CheckList stage={stage} keys={keys} readiness={readiness} waitingOn={waitingOn} />
          <p className={styles.stageNote}>{note}</p>
          {view ? <BlockerList blockers={view.blockers} /> : null}
          {stage === 'j6' && view ? <HoldsAndMatches view={view as J6StageView} /> : null}
        </div>
        <div className={styles.delivery}>
          <p className={styles.sectionLabel}>Document and delivery</p>
          <dl className={styles.summary}>
            <div><dt>File</dt><dd>{attachments}</dd></div>
            <div><dt>Recipients</dt><dd><RecipientList stage={stage} view={view} /></dd></div>
            <div><dt>Archive</dt><dd>{stage === 'j5'
              ? 'Exact signed quote, signer action, and per-recipient send results in the student billing record'
              : 'Exact signed cover letter and original voucher, voucher provenance, signer action, and per-recipient send results in the student billing record'}</dd></div>
          </dl>
          <p className={styles.deliveryGate}>
            {AUTHORIZED_SIGNER.name} must authenticate and explicitly sign this stage’s final document.
          </p>
        </div>
      </div>

      <div className={styles.stageFooter}>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={!actionAvailable}
          aria-describedby={`billing-${stage}-reason`}
          onClick={actionAvailable ? onPrepare : undefined}
        >
          {hasDraft ? `Edit ${stage.toUpperCase()} ${heading} draft` : `Create ${stage.toUpperCase()} ${heading}`}
        </button>
        <p id={`billing-${stage}-reason`} className={styles.reason}>
          {reason}
        </p>
      </div>
      {children ? <div className={styles.stageExtras}>{children}</div> : null}
    </section>
  );
}

function GatePanel({ gates }: { gates: CaseSummaryDto['gates'] }) {
  return (
    <section className={styles.gates} aria-labelledby="billing-gates-heading">
      <h2 className={styles.sectionLabel} id="billing-gates-heading">Release gates</h2>
      <ul className={styles.gateList}>
        {GATE_NAMES.map((name) => {
          const g = gates[name];
          const tone = g.enabled === true ? 'ok' : g.enabled === false ? 'warn' : 'muted';
          const word = g.enabled === true ? 'Open' : g.enabled === false ? 'Closed' : 'Checked when used';
          return (
            <li key={name} className={styles.gateRow} data-gate={name} data-enabled={String(g.enabled)}>
              <span className={styles.gateName}>{GATE_LABELS[name]}</span>
              <StatusTag tone={tone}>{word}</StatusTag>
              {g.enabled !== true && g.message ? <span className={styles.gateMessage}>{g.message}</span> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ContactsLine({ memberEmail, counselor, j5, j6 }: Pick<TwoStageBillingWorkbenchProps, 'memberEmail' | 'counselor' | 'j5' | 'j6'>) {
  if (!j5) {
    return (
      <p className={styles.contacts}>
        <strong>Contacts on file:</strong> Student {memberEmail || 'email not on file'} · Counselor{' '}
        {counselor ? `${counselor.name} (${counselor.email})` : 'not assigned'}.
        {' '}The counselor phone is entered in the draft.
      </p>
    );
  }
  const c = j5.contacts;
  const finance = j6?.contacts.finance;
  return (
    <p className={styles.contacts}>
      <strong>Contacts on file:</strong> Student {contactText(c.student.email)} · Counselor {contactText(c.counselor.name)}, {contactText(c.counselor.email)}, phone{' '}
      {contactText(c.counselor.phone)}
      {finance ? <> · Board finance {contactText(finance.name)}, {contactText(finance.email)}</> : null}. Any counselor or finance contact can be entered in the draft.
    </p>
  );
}

/** Presentation of the two stages. It never signs, sends, uploads, or calls an API; the container does, and the server decides. */
export default function TwoStageBillingWorkbench({
  memberName,
  memberEmail,
  counselor,
  readinessByStage,
  readinessWaitingOn = {},
  waitingOnDesignatedSigner = [],
  viewer,
  gates,
  caseInfo,
  j5,
  j6,
  unavailableReason,
  onPrepareJ5,
  onPrepareJ6,
  stageContent,
  renderSignerTaskAction,
}: TwoStageBillingWorkbenchProps) {
  return (
    <div className={styles.workbench}>
      <div className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>Student billing · {memberName}</p>
          <h2 className={styles.introTitle}>Two documents, two approval points</h2>
          <p className={styles.introText}>Prepare the quote when the counselor asks. Request payment after the signed voucher arrives and class begins.</p>
          <p className={styles.classRule}>
            Approved classes are {STANDARD_CONTACT_HOURS} hours, except IBM AI &amp; Software Developer at {AI_SOFTWARE_CONTACT_HOURS} hours. The end date is{' '}
            {CLASS_LENGTH_CALENDAR_MONTHS} calendar months after the confirmed start date.
          </p>
          {caseInfo ? (
            <p className={styles.caseLine}>
              Case: {caseInfo.className ?? caseInfo.programSlug}
              {caseInfo.contactHours ? ` · ${caseInfo.contactHours} hours` : ''} · opened {caseInfo.createdAt.slice(0, 10)}
              {caseInfo.createdBy.displayName ? ` by ${caseInfo.createdBy.displayName}` : ''}
            </p>
          ) : null}
        </div>
        <div className={styles.amount}>
          <span>Single line item</span>
          <strong>{TUITION_AND_FEES_LABEL} · {formatUsdCents(TUITION_AND_FEES_CENTS)}</strong>
        </div>
      </div>

      <ContactsLine memberEmail={memberEmail} counselor={counselor} j5={j5} j6={j6} />

      {gates ? <GatePanel gates={gates} /> : null}

      <div className={styles.stages}>
        <StageCard
          stage="j5"
          heading="Quote / Voucher Request"
          description="Request the board voucher for the approved student and class. This is a quote, not a payment request."
          note="A board voucher is not required to prepare J5."
          attachments="Signed WAP quote / voucher request"
          keys={J5_READINESS_KEYS}
          readiness={readinessByStage?.j5 ?? {}}
          waitingOn={readinessWaitingOn}
          view={j5}
          onPrepare={onPrepareJ5}
          unavailableReason={unavailableReason}
        >
          {stageContent?.j5}
        </StageCard>
        <StageCard
          stage="j6"
          heading="Invoice / Voucher Cover Letter"
          description="Request payment once the signed board voucher is on file and the student has started class."
          note="Keep the board’s signed voucher as its own original file; the cover letter is a separate signed document."
          attachments="Signed WAP cover letter + original signed board voucher"
          keys={J6_READINESS_KEYS}
          readiness={readinessByStage?.j6 ?? {}}
          waitingOn={readinessWaitingOn}
          view={j6}
          onPrepare={onPrepareJ6}
          unavailableReason={unavailableReason}
        >
          <SignerTasks tasks={waitingOnDesignatedSigner} viewer={viewer} renderAction={renderSignerTaskAction} />
          {stageContent?.j6}
        </StageCard>
      </div>

      <p className={styles.paymentNote}>
        After J6 is sent, track payment separately. Follow up in {PAYMENT_FOLLOW_UP_MIN_DAYS}–{PAYMENT_FOLLOW_UP_MAX_DAYS} days if a check or wire has not arrived.
      </p>
    </div>
  );
}
