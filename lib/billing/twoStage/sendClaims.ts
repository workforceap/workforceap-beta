/**
 * Per-recipient send claims for two-stage documents (pure decisions; the
 * database rows are billing_stage_sends, and the same invariants are enforced
 * by the migration's triggers).
 *
 *  - Attempts are per recipient role, scoped to one signed stage record
 *    version. Each copy is its own message to one frozen address; recipients
 *    never see each other's addresses, and each row keeps its own provider
 *    result.
 *  - Provider idempotency key: `billing-two-stage:<stage>:<record>:v<version>:a<attempt>:<role>`.
 *    A fresh key (attempt + 1) is minted for a role only after that role's
 *    latest claim definitively failed (`failed` or `reconciled_failed`). An
 *    ambiguous claim is retried with the SAME key inside the provider window,
 *    or held for reconciliation after it. An accepted role is never re-sent.
 *  - Completion: a stage is sent when every required role has exactly one
 *    accepted claim (`provider_accepted` or `reconciled_delivered`) that
 *    matches the current version (content hash, attachment hashes, frozen
 *    address), and no claim is still unresolved. Attempt numbers may differ
 *    across roles.
 *  - Delivery evidence (delivered / bounced / complained) is separate,
 *    append-only, recordable after the stage is sent, and never unsends it; a
 *    bounce or complaint flags follow-up.
 */
import type { BillingStage } from './constants';
import { STAGE_RECIPIENT_ROLES, type RecipientRole, type RecipientSnapshot } from './recipients';

/** Exactly the values of public.billing_send_statuses() in the migration (checked by the PG16 proof). */
export const SEND_STATUSES = [
  'pending',
  'provider_accepted',
  'ambiguous',
  'needs_reconciliation',
  'failed',
  'reconciled_delivered',
  'reconciled_failed',
] as const;
export type SendStatus = (typeof SEND_STATUSES)[number];

/** Exactly the values of public.billing_delivery_event_kinds() in the migration. */
export const DELIVERY_EVENT_KINDS = ['delivered', 'bounced', 'complained'] as const;
export type DeliveryEventKind = (typeof DELIVERY_EVENT_KINDS)[number];

/** Counts toward completion. */
export const ACCEPTED: ReadonlySet<SendStatus> = new Set(['provider_accepted', 'reconciled_delivered']);
/** Definitively not delivered: the only states after which a new attempt (new key) may start. */
export const DEFINITELY_FAILED: ReadonlySet<SendStatus> = new Set(['failed', 'reconciled_failed']);
/** Outcome not known yet: holds the stage. */
export const UNRESOLVED: ReadonlySet<SendStatus> = new Set(['pending', 'ambiguous', 'needs_reconciliation']);

/** Resend keeps idempotency keys for 24 hours; stay inside that with a margin. */
export const IDEMPOTENCY_SAFE_RETRY_MS = 23 * 60 * 60 * 1000;
/** A claim this fresh may still be in flight: nobody else takes it over. */
export const IN_FLIGHT_GRACE_MS = 2 * 60 * 1000;
/** A still-`pending` claim older than this is treated as an unknown outcome. */
export const RECONCILE_CLAIMED_MIN_AGE_MS = 15 * 60 * 1000;

export function sendIdempotencyKey(args: { stage: BillingStage; recordId: string; version: number; attemptNo: number; role: RecipientRole }): string {
  if (!STAGE_RECIPIENT_ROLES[args.stage].includes(args.role)) throw new Error(`${args.role} is not a ${args.stage.toUpperCase()} recipient`);
  if (!Number.isInteger(args.version) || args.version < 1 || !Number.isInteger(args.attemptNo) || args.attemptNo < 1) {
    throw new RangeError('version and attemptNo must be positive integers');
  }
  return `billing-two-stage:${args.stage}:${args.recordId}:v${args.version}:a${args.attemptNo}:${args.role}`;
}

export type ProviderOutcome =
  /** The send call resolved. Without a provider message id it is NOT an acceptance. */
  | { kind: 'accepted'; messageId: string | null | undefined }
  /** A provider error whose HTTP status was preserved (e.g. by a typed error). */
  | { kind: 'http_error'; status: number }
  /**
   * Anything thrown. `status` is set only when a typed, status-preserving error
   * supplied it (see outcomeFromThrown); a plain Error has none.
   */
  | { kind: 'thrown'; error: unknown; status?: number | null }
  /**
   * A provider error returned (not thrown), e.g. the Resend SDK's
   * `{ name, message }`, which usually carries no HTTP status and also covers
   * transport failures (`application_error`). `status` is only what the
   * adapter explicitly supplied, else null. `name` and `message` are never
   * used to infer a definite rejection.
   */
  | { kind: 'provider_error'; error: { name?: string | null; message?: string | null }; status: number | null | undefined }
  | { kind: 'timeout' }
  | { kind: 'network_error' };

type ClassifiedOutcome = 'provider_accepted' | 'failed' | 'ambiguous' | 'needs_reconciliation';

function classifyStatus(status: number | null | undefined): ClassifiedOutcome {
  if (typeof status !== 'number' || !Number.isInteger(status)) return 'ambiguous';
  // 409: the key was reused with a different payload or is mid-flight; the
  // first request may have been accepted, so a person must look (never a
  // fresh key).
  if (status === 409) return 'needs_reconciliation';
  if (status === 408 || status === 429 || status >= 500) return 'ambiguous';
  if (status >= 400) return 'failed';
  return 'ambiguous';
}

/**
 * Map one provider call to the claim's next status. Only a provider message
 * id is an acceptance. Only a preserved HTTP status can be a definite
 * rejection: a definite 4xx (not 408, 409 or 429) is `failed`; 408, 429 and
 * 5xx are `ambiguous`. Everything else (resolved without an id, a plain or
 * unknown thrown error, a missing status, timeouts) is `ambiguous`, which is
 * retried with the same key or reconciled and never re-sent with a fresh key.
 */
export function classifyProviderOutcome(outcome: ProviderOutcome): ClassifiedOutcome {
  switch (outcome.kind) {
    case 'accepted':
      return typeof outcome.messageId === 'string' && outcome.messageId.trim() !== '' ? 'provider_accepted' : 'ambiguous';
    case 'http_error':
      return classifyStatus(outcome.status);
    case 'thrown':
    case 'provider_error':
      // Only an explicitly supplied status counts; never the error name or message.
      return classifyStatus(outcome.status);
    default:
      return 'ambiguous';
  }
}

/**
 * Build the outcome for a thrown error. `readStatus` is the adapter for a
 * typed, status-preserving provider error (M3 plugs in the email wrapper's
 * export); it must return undefined for anything else, so a plain Error stays
 * ambiguous.
 */
export function outcomeFromThrown(error: unknown, readStatus?: (error: unknown) => number | null | undefined): ProviderOutcome {
  const status = readStatus?.(error);
  return typeof status === 'number' && Number.isInteger(status) ? { kind: 'thrown', error, status } : { kind: 'thrown', error };
}

export type SendRow = {
  role: RecipientRole;
  status: SendStatus;
  claimedAt: Date;
  lastClaimedAt: Date;
};

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

/** What a send request may do for one role, given that role's latest claim. */
export function decideClaim(latest: SendRow | null, now: Date): ClaimDecision {
  if (!latest) return { action: 'claim_new' };
  switch (latest.status) {
    case 'provider_accepted':
    case 'reconciled_delivered':
      return { action: 'skip_delivered' };
    case 'failed':
    case 'reconciled_failed':
      return { action: 'new_attempt_required' };
    case 'needs_reconciliation':
      return { action: 'needs_reconciliation' };
    case 'pending':
      if (now.getTime() - latest.lastClaimedAt.getTime() < IN_FLIGHT_GRACE_MS) return { action: 'in_flight' };
      // A stale claim is treated like an unknown outcome.
      return retryInsideWindow(latest, now);
    case 'ambiguous':
      return retryInsideWindow(latest, now);
    default:
      return { action: 'needs_reconciliation' };
  }
}

export type Reconciliation = { outcome: 'delivered' | 'not_delivered'; bySubjectId: string; note: string };

/** An operator settles an unknown copy with evidence. Never automatic. */
export function reconcileSend(
  row: SendRow,
  input: Reconciliation,
): { ok: true; status: 'reconciled_delivered' | 'reconciled_failed' } | { ok: false; error: string } {
  if (!input.bySubjectId.trim() || !input.note.trim()) return { ok: false, error: 'Reconciliation needs who reconciled and a note on the evidence.' };
  // Only from an unknown outcome (the database enforces the same). A stale
  // `pending` row is first marked ambiguous (markStaleClaimAmbiguous).
  if (row.status !== 'needs_reconciliation' && row.status !== 'ambiguous') {
    return { ok: false, error: `A ${row.status} copy cannot be reconciled; only an ambiguous copy can.` };
  }
  return { ok: true, status: input.outcome === 'delivered' ? 'reconciled_delivered' : 'reconciled_failed' };
}

/** A claim older than RECONCILE_CLAIMED_MIN_AGE_MS is treated as an unknown outcome. */
export function markStaleClaimAmbiguous(row: SendRow, now: Date): 'ambiguous' | null {
  return row.status === 'pending' && now.getTime() - row.lastClaimedAt.getTime() >= RECONCILE_CLAIMED_MIN_AGE_MS ? 'ambiguous' : null;
}

export type DeliveryEvidence = { kind: DeliveryEventKind; at: Date; source: string; providerEventId?: string | null };

/** Delivery evidence is appended for an accepted copy, including after the stage is sent. */
export function recordDeliveryEvidence(
  row: { status: SendStatus },
  evidence: DeliveryEvidence,
  existing: ReadonlyArray<{ providerEventId?: string | null }> = [],
): { ok: true; evidence: DeliveryEvidence } | { ok: false; error: string } {
  if (!ACCEPTED.has(row.status)) return { ok: false, error: 'Delivery evidence applies only to an accepted or reconciled-delivered copy.' };
  if (!(DELIVERY_EVENT_KINDS as readonly string[]).includes(evidence.kind)) return { ok: false, error: 'Unknown delivery evidence kind.' };
  if (!evidence.source.trim()) return { ok: false, error: 'Record where the delivery evidence came from.' };
  if (evidence.providerEventId && existing.some((e) => e.providerEventId === evidence.providerEventId)) {
    return { ok: false, error: 'This provider event is already recorded.' };
  }
  return { ok: true, evidence };
}

/** One claim row as the completion rule sees it. */
export type ClaimRow = {
  role: RecipientRole;
  status: SendStatus;
  attemptNo: number;
  contentSha256: string;
  email: string;
  attachmentSha256s: readonly string[];
};

/** The signed stage record version the claims must match. */
export type CurrentVersion = { contentSha256: string; attachmentSha256s: readonly string[]; snapshot: RecipientSnapshot };

export type RolePlan =
  | { role: RecipientRole; action: 'accepted'; attemptNo: number }
  | { role: RecipientRole; action: 'claim'; attemptNo: number; freshKey: true }
  | { role: RecipientRole; action: 'held'; attemptNo: number; status: SendStatus };

export type DeliveryState = {
  expected: RecipientRole[];
  /** Roles with exactly one accepted claim matching the current version. */
  accepted: RecipientRole[];
  /** Roles whose latest claim is pending, ambiguous or awaiting reconciliation. */
  held: RecipientRole[];
  /** Per role: skip (accepted), claim with a fresh key (never tried / definitively failed), or hold. */
  plan: RolePlan[];
  /** The stage may move to `sent`. */
  complete: boolean;
  /** Accepted roles with bounced/complained evidence: flag for follow-up (never unsends). */
  followUp: RecipientRole[];
};

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * Per-role completion. Mirrors billing_stage_record_rules() and
 * billing_stage_send_guard() in the migration. A claim whose content hash,
 * attachment hashes or address differs from the current version never counts.
 */
export function deliveryState(
  stage: BillingStage,
  version: CurrentVersion,
  rows: readonly ClaimRow[],
  events: ReadonlyArray<{ role: RecipientRole; kind: DeliveryEventKind }> = [],
): DeliveryState {
  const expected = [...STAGE_RECIPIENT_ROLES[stage]];
  const extra = rows.filter((r) => !expected.includes(r.role));
  if (extra.length > 0) throw new Error(`Unexpected ${stage.toUpperCase()} recipient(s): ${extra.map((r) => r.role).join(', ')}`);
  const addressOf = new Map(version.snapshot.map((s) => [s.role, s.email] as const));
  const matches = (r: ClaimRow) =>
    r.contentSha256 === version.contentSha256 && sameList(r.attachmentSha256s, version.attachmentSha256s) && r.email === addressOf.get(r.role);

  const accepted: RecipientRole[] = [];
  const held: RecipientRole[] = [];
  const plan: RolePlan[] = [];
  for (const role of expected) {
    const mine = rows.filter((r) => r.role === role).sort((a, b) => a.attemptNo - b.attemptNo);
    const acceptedRows = mine.filter((r) => ACCEPTED.has(r.status) && matches(r));
    const latest = mine.at(-1);
    if (acceptedRows.length === 1) {
      accepted.push(role);
      plan.push({ role, action: 'accepted', attemptNo: acceptedRows[0].attemptNo });
    } else if (latest && UNRESOLVED.has(latest.status)) {
      held.push(role);
      plan.push({ role, action: 'held', attemptNo: latest.attemptNo, status: latest.status });
    } else {
      plan.push({ role, action: 'claim', attemptNo: (latest?.attemptNo ?? 0) + 1, freshKey: true });
    }
  }
  const unresolved = rows.some((r) => UNRESOLVED.has(r.status));
  const followUp = accepted.filter((role) => events.some((e) => e.role === role && (e.kind === 'bounced' || e.kind === 'complained')));
  return { expected, accepted, held, plan, complete: accepted.length === expected.length && !unresolved, followUp };
}

/**
 * Which roles already received an earlier version of this stage (from each
 * closed version's accepted_roles_at_close), e.g. "finance already received
 * v1" while v2 is prepared. Informational: the new version still goes to
 * every role of its own frozen snapshot.
 */
export function rolesThatReceivedEarlierVersions(
  prior: ReadonlyArray<{ version: number; acceptedRolesAtClose: readonly RecipientRole[] | null | undefined }>,
): Array<{ role: RecipientRole; versions: number[] }> {
  const byRole = new Map<RecipientRole, number[]>();
  for (const record of [...prior].sort((a, b) => a.version - b.version)) {
    for (const role of record.acceptedRolesAtClose ?? []) byRole.set(role, [...(byRole.get(role) ?? []), record.version]);
  }
  return [...byRole.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([role, versions]) => ({ role, versions }));
}
