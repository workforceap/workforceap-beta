'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { KitEmptyState } from '@/components/portal/kit';
import { GATE_CODES, type BillingStage, type CaseListItemDto, type CaseSummaryDto, type ErrorCode } from '@/lib/billing/twoStage/dto';
import TwoStageBillingWorkbench from './TwoStageBillingWorkbench';
import TwoStageStageEditor from './TwoStageStageEditor';
import { ClassStartedPanel, FailureNotice, J5ReadinessPanel, PaymentPanel, SignerTaskAction, signatureSlotStage, StageLifecycle, VoucherPanel, type PanelContext } from './TwoStageStagePanels';
import { twoStageApi, type ApiFailure } from './twoStageClient';
import styles from './TwoStageBillingWorkbench.module.css';

export type EnrolledProgram = { slug: string; title: string };

type TwoStageBillingCaseProps = {
  memberId: string;
  memberName: string;
  memberEmail: string | null;
  counselor: { name: string; email: string } | null;
  /** The member's enrolled program (primary enrollment first), used to open a case. */
  enrolledPrograms: readonly EnrolledProgram[];
};

type State =
  | { phase: 'loading' }
  /** A release gate (for example MIGRATION_NOT_APPLIED) or an access refusal: nothing can be prepared here. */
  | { phase: 'unavailable'; failure: ApiFailure }
  | { phase: 'error'; failure: ApiFailure }
  | { phase: 'no_case'; cases: CaseListItemDto[] }
  | { phase: 'ready'; cases: CaseListItemDto[]; caseId: string; summary: CaseSummaryDto };

const GATE_CODE_SET: ReadonlySet<ErrorCode> = new Set(GATE_CODES);
/** Answers that mean "not available to this viewer here", not "try again". */
const UNAVAILABLE_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>(['ADMIN_REQUIRED', 'PROVIDER_ORG_ONLY', 'MEMBER_NOT_FOUND']);

function isUnavailable(failure: ApiFailure): boolean {
  const code = failure.body?.code;
  return Boolean(code && (GATE_CODE_SET.has(code) || UNAVAILABLE_CODES.has(code)));
}

function pickCase(cases: readonly CaseListItemDto[], programs: readonly EnrolledProgram[], preferred: string | null): CaseListItemDto | null {
  if (preferred) {
    const match = cases.find((c) => c.id === preferred);
    if (match) return match;
  }
  for (const p of programs) {
    const match = cases.find((c) => c.programSlug === p.slug);
    if (match) return match;
  }
  return cases[0] ?? null;
}

/**
 * Client container for the two-stage J5/J6 page: lists or opens the
 * member's case, loads the authoritative summary (`CaseSummaryDto`) and wires
 * the workbench to the M3 routes. It holds no authority of its own: every
 * button sends a request and the server's answer is what is shown.
 */
export default function TwoStageBillingCase({ memberId, memberName, memberEmail, counselor, enrolledPrograms }: TwoStageBillingCaseProps) {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [editing, setEditing] = useState<BillingStage | null>(null);
  const [opening, setOpening] = useState(false);
  const [openFailure, setOpenFailure] = useState<ApiFailure | null>(null);
  const [programSlug, setProgramSlug] = useState(enrolledPrograms[0]?.slug ?? '');
  const selected = useRef<string | null>(null);
  const loadSeq = useRef(0);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const id = ++loadSeq.current;
      const listed = await twoStageApi.listCases(memberId, signal);
      if (id !== loadSeq.current) return;
      if (!listed.ok) {
        setState(isUnavailable(listed) ? { phase: 'unavailable', failure: listed } : { phase: 'error', failure: listed });
        return;
      }
      const cases = listed.data.cases;
      const chosen = pickCase(cases, enrolledPrograms, selected.current);
      if (!chosen) {
        setState({ phase: 'no_case', cases });
        return;
      }
      const summary = await twoStageApi.getCase(memberId, chosen.id, signal);
      if (id !== loadSeq.current) return;
      if (!summary.ok) {
        setState(isUnavailable(summary) ? { phase: 'unavailable', failure: summary } : { phase: 'error', failure: summary });
        return;
      }
      selected.current = chosen.id;
      setState({ phase: 'ready', cases, caseId: chosen.id, summary: summary.data });
    },
    [memberId, enrolledPrograms],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch(() => undefined); // an aborted read on unmount
    return () => controller.abort();
  }, [load]);

  const refresh = useCallback(() => {
    void load().catch(() => undefined);
  }, [load]);

  const openCase = async () => {
    setOpening(true);
    setOpenFailure(null);
    const result = await twoStageApi.openCase(memberId, { programSlug });
    setOpening(false);
    if (!result.ok) {
      setOpenFailure(result);
      if (result.body?.code === 'CASE_EXISTS' || result.uncertain) refresh();
      return;
    }
    selected.current = result.data.case.id;
    refresh();
  };

  const shell = { memberName, memberEmail, counselor };

  if (state.phase === 'loading') {
    return (
      <div aria-busy="true">
        <p className={styles.muted}>Loading the billing case…</p>
        <TwoStageBillingWorkbench {...shell} unavailableReason="Loading the billing case…" />
      </div>
    );
  }

  if (state.phase === 'unavailable' || state.phase === 'error') {
    const unavailable = state.phase === 'unavailable';
    const notEnabled = state.failure.body?.code === 'MIGRATION_NOT_APPLIED';
    return (
      <div>
        <KitEmptyState
          framed
          headingAs="h2"
          kind="unavailable"
          tone={unavailable ? 'warn' : 'danger'}
          title={notEnabled ? 'J5/J6 billing isn’t enabled here yet' : unavailable ? 'J5/J6 billing isn’t available here' : 'The billing case could not be loaded'}
          description={state.failure.message}
          primaryAction={unavailable ? undefined : { label: 'Reload', onClick: refresh }}
          data-code={state.failure.body?.code}
          className={styles.stateBox}
        />
        <TwoStageBillingWorkbench {...shell} unavailableReason={state.failure.message} />
      </div>
    );
  }

  if (state.phase === 'no_case') {
    const noProgram = enrolledPrograms.length === 0;
    return (
      <div>
        <section className={styles.openCase} aria-labelledby="billing-open-case-heading">
          <h2 className={styles.introTitle} id="billing-open-case-heading">
            No J5/J6 billing case yet
          </h2>
          {noProgram ? (
            <p className={styles.introText}>This member has no program enrollment on file. Assign the program first; the billing case follows the enrolled program.</p>
          ) : (
            <>
              <p className={styles.introText}>A case holds both documents for one program. Opening it records who opened it; it does not create, sign or send a document.</p>
              {enrolledPrograms.length > 1 ? (
                <div className={styles.field}>
                  <label htmlFor="billing-open-program" className={styles.fieldLabel}>
                    Program
                  </label>
                  <select id="billing-open-program" className={styles.control} value={programSlug} onChange={(e) => setProgramSlug(e.target.value)}>
                    {enrolledPrograms.map((p) => (
                      <option key={p.slug} value={p.slug}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </>
          )}
          <div className={styles.actionRow}>
            <button type="button" className={styles.primaryButton} disabled={noProgram || opening} aria-describedby="billing-open-reason" onClick={() => void openCase()}>
              {opening ? 'Opening…' : `Open billing case${enrolledPrograms.length === 1 ? ` for ${enrolledPrograms[0].title}` : ''}`}
            </button>
            <p id="billing-open-reason" className={styles.reason}>
              {noProgram ? 'No enrolled program on file.' : 'The server checks the program’s approved class and hours.'}
            </p>
          </div>
          <FailureNotice failure={openFailure} />
        </section>
        <TwoStageBillingWorkbench {...shell} unavailableReason="Open the billing case first." />
      </div>
    );
  }

  const { summary, caseId, cases } = state;
  const ctx: PanelContext = { memberId, caseId, gates: summary.gates, onChanged: refresh };
  const signatureStage = signatureSlotStage(summary);
  const editor = (stage: BillingStage) =>
    editing === stage ? (
      <TwoStageStageEditor
        memberId={memberId}
        caseId={caseId}
        stage={stage}
        j5Current={stage === 'j6' ? summary.j5.current : null}
        boardInvoices={summary.j6.boardInvoice ? [summary.j6.boardInvoice] : []}
        canSaveDraft={summary[stage].canSaveDraft}
        onSaved={refresh}
        onClose={() => setEditing(null)}
      />
    ) : null;

  return (
    <div>
      {cases.length > 1 ? (
        <div className={styles.field}>
          <label htmlFor="billing-case-select" className={styles.fieldLabel}>
            Billing case
          </label>
          <select
            id="billing-case-select"
            className={styles.control}
            value={caseId}
            onChange={(e) => {
              selected.current = e.target.value;
              setEditing(null);
              refresh();
            }}
          >
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.className ?? c.programSlug} (opened {c.createdAt.slice(0, 10)})
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <TwoStageBillingWorkbench
        {...shell}
        caseInfo={summary.case}
        gates={summary.gates}
        viewer={summary.viewer}
        readinessByStage={summary.readinessByStage}
        readinessWaitingOn={summary.readinessWaitingOn}
        waitingOnDesignatedSigner={summary.waitingOnDesignatedSigner}
        j5={summary.j5}
        j6={summary.j6}
        onPrepareJ5={() => setEditing('j5')}
        onPrepareJ6={() => setEditing('j6')}
        renderSignerTaskAction={(task) => <SignerTaskAction ctx={ctx} task={task} caseInfo={summary.case} />}
        stageContent={{
          j5: (
            <>
              {editor('j5')}
              <J5ReadinessPanel ctx={ctx} attestation={summary.j5.readinessAttestation} />
              <StageLifecycle ctx={ctx} stage="j5" view={summary.j5} viewer={summary.viewer} signature={summary.signature} showSignatureSlot={signatureStage === 'j5'} />
            </>
          ),
          j6: (
            <>
              {editor('j6')}
              <VoucherPanel ctx={ctx} voucher={summary.j6.voucher} />
              <ClassStartedPanel ctx={ctx} classStarted={summary.j6.classStarted} />
              <StageLifecycle ctx={ctx} stage="j6" view={summary.j6} viewer={summary.viewer} signature={summary.signature} showSignatureSlot={signatureStage === 'j6'} />
              <PaymentPanel ctx={ctx} payment={summary.payment} />
            </>
          ),
        }}
      />
    </div>
  );
}
