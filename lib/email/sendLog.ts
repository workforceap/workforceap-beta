/**
 * Email send log writer (`email_send_logs`).
 *
 * The 2026-09-20 delivery audit found that no successful send was recorded
 * anywhere: only failures reached workflow_diagnostics, Resend's history
 * expires after ~28 days, and 57 bounced/suppressed deliveries were invisible
 * to the app. This module writes one row per send, keyed by a dedupe key, at
 * each transition (skipped → sending → sent | failed), and stores the
 * provider's message id so /api/webhooks/resend can attach delivery events.
 *
 * Hard rules:
 * - Best-effort. A store failure is swallowed and never changes the send's
 *   outcome or throws into the caller. The writer waits at most
 *   EMAIL_SEND_LOG_WRITE_BUDGET_MS for its writes so a slow database cannot
 *   hold a request open.
 * - Writes for one send are serialised, so `sent` can never be overtaken by
 *   the earlier `sending` upsert.
 * - No raw recipient address is stored; only a sha256 prefix and the domain.
 */
import { createHash } from 'node:crypto';

import { prisma } from '@/lib/db/prisma';
import { classifyEmailSendFailure, recipientHash } from '@/lib/email/failureRecord';
import { UNTYPED_EMAIL_TEMPLATE_KEY, resolveEmailTemplateKey } from '@/lib/email/templateKeys';

export type EmailSendLogStatus = 'skipped' | 'sending' | 'sent' | 'failed';

/** Longest a send waits for its own log writes before moving on without them. */
export const EMAIL_SEND_LOG_WRITE_BUDGET_MS = 1_500;

export interface EmailSendLogEntry {
  dedupeKey: string;
  templateKey: string | null;
  status: EmailSendLogStatus;
  provider: 'resend';
  idempotencyKey: string | null;
  providerMessageId: string | null;
  recipientHash: string | null;
  recipientDomain: string | null;
  recipientCount: number;
  subject: string;
  userId: string | null;
  entityType: string | null;
  entityId: string | null;
  /** Provider attempts made so far for this call (1-based once sending). */
  attempts: number;
  skipReason: string | null;
  failureReason: string | null;
  failureClass: string | null;
  sentAt: Date | null;
}

export interface EmailSendLogStore {
  /** Insert or update the row for `entry.dedupeKey`. May throw; the writer swallows it. */
  record(entry: EmailSendLogEntry): Promise<void>;
}

export interface EmailSendLogSubject {
  to: string | string[];
  subject: string;
  idempotencyKey?: string;
  templateKey?: string | null;
  template?: { name?: string | null } | null;
  userId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}

/** `YYYY-MM-DD` in UTC; the day bucket that makes a same-day repeat one row. */
export function utcDayBucket(atMs: number): string {
  return new Date(atMs).toISOString().slice(0, 10);
}

function recipientList(to: string | string[]): string[] {
  return (Array.isArray(to) ? to : [to]).map((address) => address.trim().toLowerCase()).filter(Boolean);
}

function recipientDomain(address: string | undefined): string | null {
  if (!address) return null;
  const match = address.trim().toLowerCase().match(/@([^>\s]+)>?$/);
  return match?.[1]?.replace(/\.$/, '') ?? null;
}

/**
 * The row key for a send. The caller's idempotency key is authoritative when
 * present (it already means "this exact message"); otherwise the template,
 * the sorted recipients, the subject and the UTC day are hashed together.
 */
export function buildEmailDedupeKey(args: EmailSendLogSubject, atMs: number): string {
  const explicit = args.idempotencyKey?.trim();
  if (explicit) return explicit;
  const templateKey = resolveEmailTemplateKey(args) ?? UNTYPED_EMAIL_TEMPLATE_KEY;
  const recipients = recipientList(args.to).sort().join(',');
  const digest = createHash('sha256')
    .update(`${recipients}|${args.subject}|${utcDayBucket(atMs)}`)
    .digest('hex')
    .slice(0, 32);
  return `${templateKey}/${digest}`;
}

export function buildEmailSendLogBase(args: EmailSendLogSubject, atMs: number): Omit<EmailSendLogEntry, 'status'> {
  const recipients = recipientList(args.to);
  return {
    dedupeKey: buildEmailDedupeKey(args, atMs),
    templateKey: resolveEmailTemplateKey(args),
    provider: 'resend',
    idempotencyKey: args.idempotencyKey?.trim() || null,
    providerMessageId: null,
    recipientHash: recipientHash(args.to),
    recipientDomain: recipientDomain(recipients[0]),
    recipientCount: Math.max(1, recipients.length),
    subject: args.subject,
    userId: args.userId ?? null,
    entityType: args.entityType ?? null,
    entityId: args.entityId ?? null,
    attempts: 0,
    skipReason: null,
    failureReason: null,
    failureClass: null,
    sentAt: null,
  };
}

export type EmailSendLogPatch = Partial<Pick<
  EmailSendLogEntry,
  'attempts' | 'providerMessageId' | 'skipReason' | 'failureReason' | 'failureClass' | 'sentAt'
>>;

export interface EmailSendLogWriter {
  readonly dedupeKey: string;
  /** Queue a status write. Never throws. */
  write(status: EmailSendLogStatus, patch?: EmailSendLogPatch): void;
  /** Queue a `failed` write classified from the provider error. Never throws. */
  fail(error: unknown, attempts: number): void;
  /** Wait for queued writes, bounded by EMAIL_SEND_LOG_WRITE_BUDGET_MS. Never rejects. */
  settle(): Promise<void>;
}

let lastStoreWarningAtMs = 0;
function warnOnce(error: unknown): void {
  const now = Date.now();
  if (now - lastStoreWarningAtMs < 60_000) return;
  lastStoreWarningAtMs = now;
  console.error('[email-send-log] write failed (send unaffected):', error instanceof Error ? error.message : error);
}

function boundedWait(promise: Promise<void>, budgetMs: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, budgetMs);
    (timer as { unref?: () => void }).unref?.();
    promise.then(
      () => { clearTimeout(timer); resolve(); },
      () => { clearTimeout(timer); resolve(); },
    );
  });
}

export function createEmailSendLogWriter(
  store: EmailSendLogStore,
  args: EmailSendLogSubject,
  atMs: number,
  budgetMs: number = EMAIL_SEND_LOG_WRITE_BUDGET_MS,
): EmailSendLogWriter {
  const base = buildEmailSendLogBase(args, atMs);
  let tail: Promise<void> = Promise.resolve();
  let attempts = 0;
  let providerMessageId: string | null = null;

  const enqueue = (entry: EmailSendLogEntry) => {
    tail = tail
      .then(() => store.record(entry))
      .catch(warnOnce);
  };

  return {
    dedupeKey: base.dedupeKey,
    write(status, patch = {}) {
      try {
        attempts = patch.attempts ?? attempts;
        providerMessageId = patch.providerMessageId ?? providerMessageId;
        enqueue({
          ...base,
          ...patch,
          status,
          attempts,
          providerMessageId,
        });
      } catch (error) {
        warnOnce(error);
      }
    },
    fail(error, failedAttempts) {
      let failureClass: string | null = null;
      try {
        failureClass = classifyEmailSendFailure(error).errorClass;
      } catch {
        failureClass = null;
      }
      const failureReason = error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : (error as { message?: unknown } | null)?.message
            ? String((error as { message?: unknown }).message)
            : 'Send threw';
      this.write('failed', { attempts: failedAttempts, failureReason: failureReason.slice(0, 1_000), failureClass });
    },
    settle() {
      return boundedWait(tail, budgetMs);
    },
  };
}

/** Production store: one upsert per transition, keyed by dedupe key. */
export const prismaEmailSendLogStore: EmailSendLogStore = {
  async record(entry) {
    await prisma.emailSendLog.upsert({
      where: { dedupeKey: entry.dedupeKey },
      create: {
        dedupeKey: entry.dedupeKey,
        templateKey: entry.templateKey,
        status: entry.status,
        provider: entry.provider,
        idempotencyKey: entry.idempotencyKey,
        providerMessageId: entry.providerMessageId,
        recipientHash: entry.recipientHash,
        recipientDomain: entry.recipientDomain,
        recipientCount: entry.recipientCount,
        subject: entry.subject,
        userId: entry.userId,
        entityType: entry.entityType,
        entityId: entry.entityId,
        attempts: entry.attempts,
        skipReason: entry.skipReason,
        failureReason: entry.failureReason,
        failureClass: entry.failureClass,
        sentAt: entry.sentAt,
      },
      update: {
        status: entry.status,
        templateKey: entry.templateKey ?? undefined,
        idempotencyKey: entry.idempotencyKey ?? undefined,
        // Only ever set forward; a retry that has no id yet must not erase one.
        providerMessageId: entry.providerMessageId ?? undefined,
        userId: entry.userId ?? undefined,
        entityType: entry.entityType ?? undefined,
        entityId: entry.entityId ?? undefined,
        attempts: entry.attempts,
        skipReason: entry.skipReason,
        failureReason: entry.failureReason,
        failureClass: entry.failureClass,
        sentAt: entry.sentAt ?? undefined,
      },
    });
  },
};
