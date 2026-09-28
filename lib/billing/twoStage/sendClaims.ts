/**
 * Per-recipient send claims for two-stage documents (pure decisions; the
 * database rows are billing_stage_sends). Ported from draft #2687's send
 * ledger and narrowed to this flow:
 *
 *  - One row per (record, stage, attempt, recipient role): the unique row is
 *    the claim, so two requests cannot both send the same copy.
 *  - Each copy is its own message to one address; recipients never see each
 *    other's addresses, and each row keeps its own provider result.
 *  - The provider idempotency key is stage- and version-qualified, so a J5
 *    retry can never collide with a J6 send.
 *  - An unknown outcome (timeout, network, 5xx, 429) is `ambiguous` and may be
 *    retried with the same key only inside the provider's idempotency window;
 *    after that it needs operator reconciliation. Delivered copies are never
 *    sent again by a retry.
 */
import type { BillingStage } from './constants';
import { STAGE_RECIPIENT_ROLES, type RecipientRole } from './recipients';

export type SendStatus =
  | 'claimed'
  | 'sent'
  | 'rejected_definite'
  | 'ambiguous'
  | 'needs_reconciliation'
  | 'reconciled_delivered'
  | 'reconciled_not_delivered';

export const DELIVERED: ReadonlySet<SendStatus> = new Set(['sent', 'reconciled_delivered']);
export const SETTLED: ReadonlySet<SendStatus> = new Set(['sent', 'reconciled_delivered', 'reconciled_not_delivered', 'rejected_definite']);

/** Resend keeps idempotency keys for 24 hours; stay inside that with a margin. */
export const IDEMPOTENCY_SAFE_RETRY_MS = 23 * 60 * 60 * 1000;
/** A claim this fresh may still be in flight: nobody else takes it over. */
export const IN_FLIGHT_GRACE_MS = 2 * 60 * 1000;
/** An operator may reconcile a still-`claimed` row only after this long. */
export const RECONCILE_CLAIMED_MIN_AGE_MS = 15 * 60 * 1000;

export function sendIdempotencyKey(args: { stage: BillingStage; recordId: string; version: number; attemptNo: number; role: RecipientRole }): string {
  if (!STAGE_RECIPIENT_ROLES[args.stage].includes(args.role)) throw new Error(`${args.role} is not a ${args.stage.toUpperCase()} recipient`);
  if (!Number.isInteger(args.version) || args.version < 1 || !Number.isInteger(args.attemptNo) || args.attemptNo < 1) {
    throw new RangeError('version and attemptNo must be positive integers');
  }
  return `billing-two-stage:${args.stage}:${args.recordId}:v${args.version}:a${args.attemptNo}:${args.role}`;
}

export type ProviderOutcome =
  | { kind: 'accepted'; messageId: string }
  | { kind: 'http_error'; status: number }
  | { kind: 'timeout' }
  | { kind: 'network_error' };

/** Map one provider call to the row's next status. */
export function classifyProviderOutcome(outcome: ProviderOutcome): 'sent' | 'rejected_definite' | 'ambiguous' | 'needs_reconciliation' {
  if (outcome.kind === 'accepted') return outcome.messageId ? 'sent' : 'ambiguous';
  if (outcome.kind === 'timeout' || outcome.kind === 'network_error') return 'ambiguous';
  const { status } = outcome;
  // 409: the key was reused with a different payload or is mid-flight; a person must look.
  if (status === 409) return 'needs_reconciliation';
  if (status === 408 || status === 429 || status >= 500) return 'ambiguous';
  if (status >= 400) return 'rejected_definite';
  return 'ambiguous';
}

export type SendRow = {
  role: RecipientRole;
  status: SendStatus;
  claimedAt: Date;
  lastClaimedAt: Date;
};

/**
 * Two separate facts per copy:
 *  - provider acceptance (status 'sent': accepted_at + provider_message_id), or
 *    an audited reconciled_delivered. This is what gates a stage's 'sent'
 *    (all required roles in one attempt).
 *  - later delivery evidence (delivered / bounced / complained, with time and
 *    source), recorded once. A bounce or complaint never unsends the stage; it
 *    flags the case for follow-up.
 */
export type DeliveryEvidence = { status: 'delivered' | 'bounced' | 'complained'; at: Date; source: string };

export function recordDeliveryEvidence(
  row: { status: SendStatus; deliveryStatus: DeliveryEvidence['status'] | null },
  evidence: DeliveryEvidence,
): { ok: true; evidence: DeliveryEvidence } | { ok: false; error: string } {
  if (!DELIVERED.has(row.status)) return { ok: false, error: 'Delivery evidence applies only to an accepted or reconciled copy.' };
  if (row.deliveryStatus) return { ok: false, error: 'Delivery evidence is already recorded for this copy.' };
  if (!evidence.source.trim()) return { ok: false, error: 'Record where the delivery evidence came from.' };
  return { ok: true, evidence };
}

export type ClaimDecision =
  | { action: 'claim_new' }
  | { action: 'retry_same_key' }
  | { action: 'skip_delivered' }
  | { action: 'in_flight' }
  | { action: 'needs_reconciliation' }
  | { action: 'new_attempt_required' };

function retryInsideWindow(row: SendRow, now: Date): ClaimDecision {
  return now.getTime() - row.claimedAt.getTime() < IDEMPOTENCY_SAFE_RETRY_MS ? { action: 'retry_same_key' } : { action: 'needs_reconciliation' };
}

/** What a send request may do for one recipient of the current attempt. */
export function decideClaim(existing: SendRow | null, now: Date): ClaimDecision {
  if (!existing) return { action: 'claim_new' };
  switch (existing.status) {
    case 'sent':
    case 'reconciled_delivered':
      return { action: 'skip_delivered' };
    case 'rejected_definite':
    case 'reconciled_not_delivered':
      return { action: 'new_attempt_required' };
    case 'needs_reconciliation':
      return { action: 'needs_reconciliation' };
    case 'claimed':
      if (now.getTime() - existing.lastClaimedAt.getTime() < IN_FLIGHT_GRACE_MS) return { action: 'in_flight' };
      // A stale claim is treated like an unknown outcome.
      return retryInsideWindow(existing, now);
    case 'ambiguous':
      return retryInsideWindow(existing, now);
    default:
      return { action: 'needs_reconciliation' };
  }
}

export type Reconciliation = { outcome: 'delivered' | 'not_delivered'; bySubjectId: string; note: string };

/** An operator settles an unknown copy with evidence. Never automatic. */
export function reconcileSend(
  row: SendRow,
  input: Reconciliation,
  now: Date,
): { ok: true; status: 'reconciled_delivered' | 'reconciled_not_delivered' } | { ok: false; error: string } {
  if (!input.bySubjectId.trim() || !input.note.trim()) return { ok: false, error: 'Reconciliation needs who reconciled and a note on the evidence.' };
  // Manual reconciliation is a separate audited path, only from an unknown
  // outcome (the database enforces the same). A stale `claimed` row is first
  // marked ambiguous (see markStaleClaimAmbiguous), never reconciled directly.
  const reconcilable = row.status === 'needs_reconciliation' || row.status === 'ambiguous';
  if (!reconcilable) return { ok: false, error: `A ${row.status} copy cannot be reconciled; only an ambiguous copy can.` };
  return { ok: true, status: input.outcome === 'delivered' ? 'reconciled_delivered' : 'reconciled_not_delivered' };
}

/** A claim older than RECONCILE_CLAIMED_MIN_AGE_MS is treated as an unknown outcome. */
export function markStaleClaimAmbiguous(row: SendRow, now: Date): 'ambiguous' | null {
  return row.status === 'claimed' && now.getTime() - row.lastClaimedAt.getTime() >= RECONCILE_CLAIMED_MIN_AGE_MS ? 'ambiguous' : null;
}

export type DeliveryState = {
  expected: RecipientRole[];
  delivered: RecipientRole[];
  unsettled: RecipientRole[];
  failed: RecipientRole[];
  missing: RecipientRole[];
  /** Every expected recipient has a delivered copy: the record may move to `sent`. */
  complete: boolean;
};

/**
 * Delivery against the stage's exact recipient set. A stage is complete only
 * when ONE attempt delivered every required role (sent or reconciled_delivered)
 * and no copy of any attempt is still unsettled; deliveries spread across
 * attempts do not add up. Mirrors billing_stage_record_rules() in the migration.
 */
export function deliveryState(
  stage: BillingStage,
  rows: ReadonlyArray<Pick<SendRow, 'role' | 'status'> & { attemptNo: number; deliveryStatus?: DeliveryEvidence['status'] | null }>,
): DeliveryState & { completeAttemptNo: number | null; followUp: RecipientRole[] } {
  const expected = [...STAGE_RECIPIENT_ROLES[stage]];
  const extra = rows.filter((r) => !expected.includes(r.role));
  if (extra.length > 0) throw new Error(`Unexpected ${stage.toUpperCase()} recipient(s): ${extra.map((r) => r.role).join(', ')}`);
  const deliveredRoles = new Set(rows.filter((r) => DELIVERED.has(r.status)).map((r) => r.role));
  const delivered = expected.filter((role) => deliveredRoles.has(role));
  const unsettled = expected.filter((role) => rows.some((r) => r.role === role && !SETTLED.has(r.status)));
  const failed = expected.filter((role) => !deliveredRoles.has(role) && rows.some((r) => r.role === role && ['rejected_definite', 'reconciled_not_delivered'].includes(r.status)));
  const missing = expected.filter((role) => !rows.some((r) => r.role === role));
  const attempts = [...new Set(rows.map((r) => r.attemptNo))].sort((x, y) => x - y);
  const completeAttemptNo =
    unsettled.length > 0
      ? null
      : attempts.find((n) => expected.every((role) => rows.some((r) => r.attemptNo === n && r.role === role && DELIVERED.has(r.status)))) ?? null;
  const followUp = expected.filter((role) => rows.some((r) => r.role === role && (r.deliveryStatus === 'bounced' || r.deliveryStatus === 'complained')));
  return { expected, delivered, unsettled, failed, missing, complete: completeAttemptNo !== null, completeAttemptNo, followUp };
}
