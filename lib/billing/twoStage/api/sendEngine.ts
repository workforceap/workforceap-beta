/**
 * Per-recipient send decisions for one signed J5/J6 version, with the
 * database and the email provider behind small ports so the logic runs
 * against fakes in tests. No real provider is ever called from a test.
 *
 * Rules (M1 sendClaims.ts; the database enforces the same):
 *  - One copy per required role, each to its frozen address; never cc/bcc.
 *  - An accepted role is never re-sent.
 *  - A `pending` claim is never retried directly: older than 15 minutes it is
 *    first marked `ambiguous` (decideClaim → mark_ambiguous), younger it is
 *    in flight.
 *  - An `ambiguous` claim is retried with the SAME idempotency key inside the
 *    23 h provider window, then needs reconciliation.
 *  - A fresh key (attempt n + 1) only after a definite failure, and only for
 *    roles the caller names in retryFailedRoles.
 *  - Only a provider message id is an acceptance. A resolved result without
 *    `data.id`, a `statusCode: null`, or a plain Error is ambiguous; a 409 is
 *    needs_reconciliation; a preserved definite 4xx is failed.
 */
import type { BillingStage } from '../constants';
import type { RoleSendOutcome, SendOutcome } from '../dto';
import { assertSendMatchesSnapshot, STAGE_RECIPIENT_ROLES, type RecipientRole } from '../recipients';
import {
  classifyProviderOutcome,
  decideClaim,
  markStaleClaimAmbiguous,
  outcomeFromThrown,
  sendIdempotencyKey,
  type ProviderOutcome,
  type SendStatus,
} from '../sendClaims';

export type SendClaimRow = {
  id: string;
  role: RecipientRole;
  attemptNo: number;
  status: SendStatus;
  claimToken: string;
  claimedAt: Date;
  lastClaimedAt: Date;
  idempotencyKey: string;
  providerMessageId: string | null;
};

export type SettleInput = {
  status: 'provider_accepted' | 'failed' | 'ambiguous' | 'needs_reconciliation';
  providerMessageId: string | null;
  /** Short fixed label, never provider text or an address. */
  providerResult: string;
  lastError: string | null;
};

export type SendStorePort = {
  listClaims(): Promise<SendClaimRow[]>;
  /** pending -> ambiguous (compare-and-set on the claim token). False when another request moved it or the database says it is not stale yet. */
  markStaleAmbiguous(row: SendClaimRow): Promise<boolean>;
  /** Insert a pending claim. 'conflict' when a concurrent request claimed the same attempt. */
  insertClaim(input: { role: RecipientRole; attemptNo: number; name: string; email: string; idempotencyKey: string }): Promise<SendClaimRow | 'conflict'>;
  /** ambiguous -> pending with a new token, same key. */
  reclaimSameKey(row: SendClaimRow): Promise<SendClaimRow | 'lost' | 'window_passed'>;
  /** Final status for this attempt (compare-and-set on the claim token). False when the claim moved meanwhile. */
  settle(row: SendClaimRow, input: SettleInput): Promise<boolean>;
  /** Audit one attempt (role, attempt, outcome; no address). */
  auditAttempt(input: { role: RecipientRole; attemptNo: number; outcome: SendOutcome; sendId: string }): Promise<void>;
};

export type EmailMessage = { to: string; subject: string; html: string; text: string; attachments: Array<{ filename: string; content: Uint8Array }>; idempotencyKey: string };

/** The provider call. Resolves with the provider result or throws; `classify` maps both. */
export type EmailPort = {
  send(message: EmailMessage): Promise<{ data?: { id?: string | null } | null } | null | undefined>;
  /** Status adapter for a thrown, status-preserving provider error (ResendResolvedSendError.statusCode); undefined otherwise. */
  readStatus(error: unknown): number | null | undefined;
  /** True for a wrapper refusal made before any provider call (FixtureRecipientSkippedError). */
  isSkippedBeforeProvider(error: unknown): boolean;
};

export type Recipient = { role: RecipientRole; name: string; email: string };

type Classified = { status: SettleInput['status']; messageId: string | null; label: string };

/** Map one provider call to the claim's next status. */
export function classifySend(email: EmailPort, result: { ok: true; value: Awaited<ReturnType<EmailPort['send']>> } | { ok: false; error: unknown }): Classified {
  if (!result.ok) {
    if (email.isSkippedBeforeProvider(result.error)) return { status: 'failed', messageId: null, label: 'recipient_skipped' };
    const outcome: ProviderOutcome = outcomeFromThrown(result.error, (e) => email.readStatus(e));
    const status = classifyProviderOutcome(outcome);
    const code = outcome.kind === 'thrown' && typeof outcome.status === 'number' ? `http_${outcome.status}` : 'no_status';
    return { status, messageId: null, label: `provider_error:${code}` };
  }
  const id = result.value?.data?.id ?? null;
  const status = classifyProviderOutcome({ kind: 'accepted', messageId: id });
  return { status, messageId: status === 'provider_accepted' ? id : null, label: status === 'provider_accepted' ? 'accepted' : 'resolved_without_id' };
}

const ROLE_LABEL: Record<RecipientRole, string> = { finance: 'board finance', counselor: 'counselor', student: 'student' };

export function outcomeMessage(outcome: SendOutcome, role: RecipientRole, retryWindowEndsAt: string | null = null): string {
  const r = ROLE_LABEL[role];
  switch (outcome) {
    case 'ACCEPTED':
      return `Sent to the ${r}.`;
    case 'ALREADY_ACCEPTED':
      return `The ${r} already has this version.`;
    case 'FAILED':
      return `The email provider rejected the ${r} copy. Check the address; a corrected version may be needed.`;
    case 'AMBIGUOUS':
      return `The ${r} copy may or may not have been sent. Send again${retryWindowEndsAt ? ` before ${retryWindowEndsAt}` : ''} to retry safely with the same key, or reconcile it.`;
    case 'NEEDS_RECONCILIATION':
      return `The ${r} copy needs a person to confirm whether it arrived.`;
    case 'IN_FLIGHT':
      return `The ${r} copy is being sent. Check back in a few minutes.`;
    case 'FAILED_RETRY_NOT_REQUESTED':
      return `The last ${r} copy failed. Choose "Retry ${r}" to send a new copy.`;
  }
}

const OUTCOME_FOR: Record<SettleInput['status'], SendOutcome> = {
  provider_accepted: 'ACCEPTED',
  failed: 'FAILED',
  ambiguous: 'AMBIGUOUS',
  needs_reconciliation: 'NEEDS_RECONCILIATION',
};

const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;

/**
 * M1 send-guard refusals on a claim insert that mean another request claimed
 * this role at the same moment (its latest claim is now pending or accepted,
 * or the attempt number moved). The store reports these (and a unique
 * violation) as 'conflict', shown as IN_FLIGHT. Every other insert refusal
 * (receipt signature, frozen name/address, content hash, record no longer
 * signed) is permanent and surfaces as a named refusal.
 */
const CONCURRENT_CLAIM_REFUSAL = /copy is [a-z_]+: no new attempt|the next attempt for [a-z]+ is \d+|the first claim for a role is attempt 1/u;

export function isConcurrentClaimRefusal(message: string): boolean {
  return CONCURRENT_CLAIM_REFUSAL.test(message);
}

export async function runSend(args: {
  stage: BillingStage;
  recordId: string;
  version: number;
  /** The frozen recipient snapshot (billing_stage_recipients). */
  recipients: readonly Recipient[];
  /** The copy for one role (subject, body, the exact archived attachments). */
  messageFor: (role: RecipientRole) => Omit<EmailMessage, 'to' | 'idempotencyKey'>;
  retryFailedRoles: readonly RecipientRole[];
  now: Date;
  store: SendStorePort;
  email: EmailPort;
  /** Called once, right before the first provider call: from then on an unknown failure is OUTCOME_UNCERTAIN. */
  onProviderCall?: () => void;
}): Promise<RoleSendOutcome[]> {
  const outcomes: RoleSendOutcome[] = [];
  const claims = await args.store.listClaims();
  const snapshot = args.recipients.map((r) => ({ role: r.role, email: r.email }));
  for (const role of STAGE_RECIPIENT_ROLES[args.stage]) {
    const recipient = args.recipients.find((r) => r.role === role);
    const base = { role, name: recipient?.name ?? '', email: recipient?.email ?? '' };
    const done = (outcome: SendOutcome, row: SendClaimRow | null, status: SendStatus | null = row?.status ?? null) => {
      const windowEnd = row && outcome === 'AMBIGUOUS' ? new Date(row.claimedAt.getTime() + RETRY_WINDOW_MS).toISOString() : null;
      outcomes.push({
        ...base,
        outcome,
        sendId: row?.id ?? null,
        attemptNo: row?.attemptNo ?? null,
        status,
        providerMessageId: row?.providerMessageId ?? null,
        message: outcomeMessage(outcome, role, windowEnd),
      });
    };
    if (!recipient) throw new Error(`The frozen ${args.stage.toUpperCase()} recipients are missing ${role}.`);
    const match = assertSendMatchesSnapshot(args.stage, snapshot, { role, email: recipient.email });
    if (!match.ok) throw new Error(match.error);

    let latest = claims.filter((c) => c.role === role).sort((a, b) => b.attemptNo - a.attemptNo)[0] ?? null;
    let decision = decideClaim(latest, args.now).action;
    if (decision === 'mark_ambiguous' && latest) {
      if (!(await args.store.markStaleAmbiguous(latest))) {
        done('IN_FLIGHT', latest);
        continue;
      }
      latest = { ...latest, status: markStaleClaimAmbiguous(latest, args.now) ?? 'ambiguous' };
      decision = decideClaim(latest, args.now).action;
    }

    let claim: SendClaimRow;
    switch (decision) {
      case 'skip_delivered':
        done('ALREADY_ACCEPTED', latest);
        continue;
      case 'in_flight':
        done('IN_FLIGHT', latest);
        continue;
      case 'needs_reconciliation': {
        if (latest && latest.status === 'ambiguous') {
          // Past the 23 h window: a same-key retry could deliver twice.
          await args.store.settle(latest, { status: 'needs_reconciliation', providerMessageId: null, providerResult: 'retry_window_passed', lastError: null });
          done('NEEDS_RECONCILIATION', latest, 'needs_reconciliation');
        } else done('NEEDS_RECONCILIATION', latest);
        continue;
      }
      case 'new_attempt_required':
      case 'claim_new': {
        if (decision === 'new_attempt_required' && !args.retryFailedRoles.includes(role)) {
          done('FAILED_RETRY_NOT_REQUESTED', latest);
          continue;
        }
        const attemptNo = (latest?.attemptNo ?? 0) + 1;
        const inserted = await args.store.insertClaim({
          role,
          attemptNo,
          name: recipient.name,
          email: recipient.email,
          idempotencyKey: sendIdempotencyKey({ stage: args.stage, recordId: args.recordId, version: args.version, attemptNo, role }),
        });
        if (inserted === 'conflict') {
          done('IN_FLIGHT', latest);
          continue;
        }
        claim = inserted;
        break;
      }
      case 'retry_same_key': {
        const reclaimed = latest ? await args.store.reclaimSameKey(latest) : 'lost';
        if (reclaimed === 'lost') {
          done('IN_FLIGHT', latest);
          continue;
        }
        if (reclaimed === 'window_passed') {
          await args.store.settle(latest!, { status: 'needs_reconciliation', providerMessageId: null, providerResult: 'retry_window_passed', lastError: null });
          done('NEEDS_RECONCILIATION', latest, 'needs_reconciliation');
          continue;
        }
        claim = reclaimed;
        break;
      }
      default:
        done('NEEDS_RECONCILIATION', latest);
        continue;
    }

    args.onProviderCall?.();
    let result: Parameters<typeof classifySend>[1];
    try {
      result = { ok: true, value: await args.email.send({ ...args.messageFor(role), to: recipient.email, idempotencyKey: claim.idempotencyKey }) };
    } catch (error) {
      result = { ok: false, error };
    }
    const classified = classifySend(args.email, result);
    let settled = false;
    try {
      settled = await args.store.settle(claim, {
        status: classified.status,
        providerMessageId: classified.messageId,
        providerResult: classified.label,
        lastError: classified.status === 'provider_accepted' ? null : classified.label,
      });
    } catch {
      // The provider call happened but its result could not be written: the
      // claim stays pending and becomes ambiguous after 15 minutes.
      done('AMBIGUOUS', claim, 'pending');
      continue;
    }
    if (!settled) {
      done('IN_FLIGHT', claim);
      continue;
    }
    const finalRow = { ...claim, status: classified.status, providerMessageId: classified.messageId } as SendClaimRow;
    await args.store.auditAttempt({ role, attemptNo: claim.attemptNo, outcome: OUTCOME_FOR[classified.status], sendId: claim.id });
    done(OUTCOME_FOR[classified.status], finalRow);
  }
  return outcomes;
}
