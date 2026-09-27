import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { sendMilestoneCascadeEmail } from '@/lib/email';
import { MemberLifecycleWriteError, withActiveMemberWrite } from '@/lib/member/activeWrite';
import type { ActionDraft } from './types';
import {
  CASCADE_DISPATCH_LEASE_MS, CASCADE_IDEMPOTENCY_WINDOW_MS, CascadeDispatchStateSchema, summarizeCascadeDispatch,
  type CascadeDispatchState, type CascadeDispatchSummary,
} from './dispatchState';

export class CascadeDispatchError extends Error {
  constructor(message: string, public readonly code: string, public readonly status: number, public readonly retryable = false) { super(message); }
}
export type DraftDispatchOutcome =
  | { ok: true; kind: 'sent_email'; messageId?: string }
  | { ok: true; kind: 'logged_only'; reason: string }
  | { ok: false; reason: string };

export async function dispatchApprovedDraft(args: { draft: ActionDraft; recipientEmail: string; recipientUserId: string; idempotencyKey?: string }): Promise<DraftDispatchOutcome> {
  const { draft } = args;
  if (draft.type !== 'celebrate_milestone') return { ok: true, kind: 'logged_only', reason: `advisory action: ${draft.type}` };
  try {
    const result = await sendMilestoneCascadeEmail({ to: args.recipientEmail, recipientUserId: args.recipientUserId, subject: draft.subject, bodyText: draft.body, idempotencyKey: args.idempotencyKey });
    if (result.ok && args.idempotencyKey && !result.messageId?.trim()) return { ok: false, reason: 'The email provider did not return an acceptance receipt.' };
    return result.ok ? { ok: true, kind: 'sent_email', messageId: result.messageId } : { ok: false, reason: result.error ?? 'Provider acceptance could not be confirmed.' };
  } catch {
    return { ok: false, reason: 'Provider acceptance could not be confirmed.' };
  }
}

export interface DispatchAllResult {
  outcomes: Array<{ draftIndex: number; type: ActionDraft['type']; outcome: DraftDispatchOutcome }>;
  emailsSent: number; emailsFailed: number; advisoryCount: number;
  dispatch: CascadeDispatchSummary;
}
function resultFor(state: CascadeDispatchState): DispatchAllResult {
  const dispatch = summarizeCascadeDispatch(state);
  return {
    emailsSent: dispatch.accepted, emailsFailed: dispatch.failed + dispatch.uncertain, advisoryCount: dispatch.advisory, dispatch,
    outcomes: state.entries.map(e => ({ draftIndex: e.draftIndex, type: e.type as ActionDraft['type'], outcome:
      e.status === 'accepted' ? { ok: true, kind: 'sent_email', ...(e.providerMessageId ? { messageId: e.providerMessageId } : {}) } :
      e.status === 'advisory' ? { ok: true, kind: 'logged_only', reason: 'Advisory action recorded for staff.' } :
      { ok: false, reason: e.error ?? 'Provider acceptance not confirmed.' },
    })),
  };
}
const asJson = (state: CascadeDispatchState): Prisma.InputJsonValue => JSON.parse(JSON.stringify(state));
const hashDrafts = (email: string, drafts: ActionDraft[]) => createHash('sha256').update(JSON.stringify({ email, drafts })).digest('hex');

/**
 * Claims one cascade before sending. Every draft has a stable provider key and
 * a durable pre-send marker. Accepted drafts are never sent again. Unknown or
 * failed attempts reuse the same key only within the provider's safe window.
 * All provider and database calls are awaited; write failures stop dispatch.
 */
export async function dispatchApprovedCascade(args: {
  cascadeId: string; drafts: ActionDraft[]; recipientEmail: string;
  approvedByUserId: string;
  sourceDrafts: Prisma.JsonValue | null;
  scopeWhere?: Prisma.MilestoneCascadeWhereInput;
}): Promise<DispatchAllResult> {
  const now = new Date();
  const row = await prisma.$transaction(tx => tx.milestoneCascade.findFirst({
    where: { id: args.cascadeId, AND: [args.scopeWhere ?? {}, { user: { deletedAt: null, billingDeletionPendingAt: null, billingDeletionOperationId: null, email: { equals: args.recipientEmail.trim().toLowerCase(), mode: 'insensitive' } } }] },
    include: { user: { select: { email: true, deletedAt: true } } },
  }));
  if (!row || row.user.deletedAt) throw new CascadeDispatchError('Cascade is unavailable.', 'not_found', 404);
  const recipientEmail = args.recipientEmail.trim().toLowerCase();
  if (!recipientEmail || recipientEmail !== row.user.email.trim().toLowerCase()) throw new CascadeDispatchError('Recipient changed. Reload before approving.', 'recipient_changed', 409);
  const draftHash = hashDrafts(recipientEmail, args.drafts);
  let state: CascadeDispatchState;
  if (row.status === 'awaiting_approval') {
    if (row.dispatchState !== null || JSON.stringify(row.drafts) !== JSON.stringify(args.sourceDrafts)) throw new CascadeDispatchError('Drafts changed. Reload before approving.', 'drafts_changed', 409);
    state = {
      version: 1, recipientEmail, draftHash, claimId: null, leaseUntil: null,
      entries: args.drafts.map((draft, draftIndex) => ({ draftIndex, type: draft.type, status: draft.type === 'celebrate_milestone' ? 'pending' : 'advisory',
        idempotencyKey: `milestone/${row.id}/${draftIndex}/${draftHash}`, attempts: 0, firstAttemptAt: null, lastAttemptAt: null, providerMessageId: null, error: null })),
    };
  } else {
    const parsed = CascadeDispatchStateSchema.safeParse(row.dispatchState);
    if (!parsed.success || parsed.data.draftHash !== draftHash || parsed.data.recipientEmail !== recipientEmail || parsed.data.entries.length !== args.drafts.length || parsed.data.entries.some((e, i) => e.draftIndex !== i || e.type !== args.drafts[i].type || e.idempotencyKey !== `milestone/${row.id}/${i}/${draftHash}`)) {
      throw new CascadeDispatchError('Delivery history cannot be verified. Staff reconciliation is required before another send.', 'dispatch_reconciliation_required', 409);
    }
    state = parsed.data;
    if (row.status === 'sent') {
      if (state.entries.some(e => e.status !== 'accepted' && e.status !== 'advisory')) throw new CascadeDispatchError('Saved delivery status is inconsistent. Staff reconciliation is required.', 'dispatch_reconciliation_required', 409);
      return resultFor(state);
    }
    if (row.status !== 'approved') throw new CascadeDispatchError('Cascade is not available for dispatch.', 'invalid_status', 409);
    const summary = summarizeCascadeDispatch(state, now);
    if (summary.retryAfter) throw new CascadeDispatchError(summary.blockedReason!, 'dispatch_in_progress', 409, true);
    if (summary.blockedReason) throw new CascadeDispatchError(summary.blockedReason, 'dispatch_reconciliation_required', 409);
    // All acceptances may have persisted before a final status write failed.
    // In that case only finalize the row; do not contact the provider again.
  }
  const hasRemaining = state.entries.some(e => e.status !== 'accepted' && e.status !== 'advisory');
  if (row.expiresAt <= now && hasRemaining) throw new CascadeDispatchError('Cascade has expired; no further messages will be sent.', 'expired', 409);
  const claimId = randomUUID();
  state = { ...state, claimId, leaseUntil: new Date(now.getTime() + CASCADE_DISPATCH_LEASE_MS).toISOString() };
  let claim;
  try {
    claim = await withActiveMemberWrite(row.userId, tx => tx.milestoneCascade.updateMany({
      where: { id: row.id, AND: [args.scopeWhere ?? {}, { user: { deletedAt: null, billingDeletionPendingAt: null, billingDeletionOperationId: null, email: { equals: args.recipientEmail.trim().toLowerCase(), mode: 'insensitive' } } }], status: row.status, ...(hasRemaining ? { expiresAt: { gt: now } } : {}),
        dispatchState: row.dispatchState === null ? { equals: Prisma.DbNull } : { equals: row.dispatchState },
        ...(row.status === 'awaiting_approval' ? { drafts: { equals: args.sourceDrafts ?? Prisma.DbNull } } : {}),
      },
      data: { status: 'approved', dispatchState: asJson(state),
        ...(row.status === 'awaiting_approval' ? { drafts: args.drafts as unknown as Prisma.InputJsonValue, approvedByUserId: args.approvedByUserId, approvedAt: now } : {}),
      },
    }));
  } catch (error) {
    if (error instanceof MemberLifecycleWriteError) {
      throw new CascadeDispatchError('The member account is no longer active.', 'member_inactive', 409);
    }
    throw error;
  }
  if (claim.count !== 1) throw new CascadeDispatchError('Another request changed this cascade. Reload before retrying.', 'dispatch_conflict', 409, true);
  let persisted = asJson(state);
  async function save(final = false) {
    if (!final) state.leaseUntil = new Date(Date.now() + CASCADE_DISPATCH_LEASE_MS).toISOString();
    const complete = state.entries.every(e => e.status === 'accepted' || e.status === 'advisory');
    try {
      const changed = await prisma.$transaction(tx => tx.milestoneCascade.updateMany({
        // The tenant and recipient were verified by the owned claim. Once a
        // provider attempt begins, deletion may anonymize the User row. The
        // exact claimed state is the CAS guard for truthful receipt writes.
        where: { id: row!.id, status: 'approved', dispatchState: { equals: persisted } },
        data: { dispatchState: asJson(state), ...(final ? { status: complete ? 'sent' : 'approved', sentAt: complete ? new Date() : null } : {}) },
      }));
      if (changed.count !== 1) throw new Error('Dispatch state changed concurrently');
      persisted = asJson(state);
    } catch {
      throw new CascadeDispatchError('Delivery progress could not be saved. Reload after the current attempt finishes; do not start a separate send.', 'dispatch_persistence_failed', 503, true);
    }
  }
  for (const entry of state.entries) {
    if (entry.status === 'accepted' || entry.status === 'advisory') continue;
    if (new Date() >= row.expiresAt) throw new CascadeDispatchError('Cascade has expired; no further messages will be sent.', 'expired', 409);
    if (entry.firstAttemptAt && Date.now() >= new Date(entry.firstAttemptAt).getTime() + CASCADE_IDEMPOTENCY_WINDOW_MS) throw new CascadeDispatchError('The safe retry window has ended. Staff reconciliation is required.', 'dispatch_reconciliation_required', 409);
    entry.status = 'sending';
    entry.firstAttemptAt ??= new Date().toISOString();
    entry.lastAttemptAt = new Date().toISOString();
    entry.attempts++;
    entry.error = null;
    await save(); // No outbound request until its idempotency key is durable.
    const outcome = await dispatchApprovedDraft({ draft: args.drafts[entry.draftIndex], recipientEmail: state.recipientEmail, recipientUserId: row.userId, idempotencyKey: entry.idempotencyKey });
    if (outcome.ok && outcome.kind === 'sent_email') {
      entry.status = 'accepted'; entry.providerMessageId = outcome.messageId ?? null;
    } else {
      entry.status = 'failed'; entry.error = outcome.ok ? 'Unexpected dispatch outcome.' : outcome.reason.slice(0, 1000);
    }
    await save(); // Stop on a failed checkpoint; never overwrite an uncertain send.
  }
  state.claimId = null; state.leaseUntil = null;
  await save(true);
  return resultFor(state);
}
