/**
 * Resend delivery webhook handler (transport-agnostic).
 *
 * Resend posts `email.*` events (sent, delivered, delivery_delayed, bounced,
 * complained, opened, clicked, failed) signed with Svix headers. This handler
 * verifies the signature, records the event on the matching `EmailSendLog`
 * row by provider message id, and on a hard bounce (`bounce.type ===
 * "Permanent"`) or a spam complaint turns off `notificationsUpdates` for the
 * recipient, the same switch the one-click unsubscribe route flips. The 2026-
 * 09-20 audit found 46 suppressed + 11 bounced deliveries the app kept
 * re-sending to weekly because nothing listened for these events.
 *
 * Pure with respect to I/O: every read/write goes through `ResendWebhookStore`
 * so the handler is unit-testable; the route wires the Prisma store.
 */
import type { LogWebhookEventInput } from '@/lib/webhooks/logEvent';
import { verifySvixSignature } from '@/lib/email/webhookSignature';

export const RESEND_WEBHOOK_SOURCE = 'resend';
/** `WorkflowDiagnostic.workflow` for delivery events that need an operator's eye. */
export const EMAIL_DELIVERY_WORKFLOW = 'email_delivery';

export type ResendEmailEvent =
  | 'sent'
  | 'delivered'
  | 'delivery_delayed'
  | 'bounced'
  | 'complained'
  | 'opened'
  | 'clicked'
  | 'failed';

const KNOWN_EVENTS: ReadonlySet<string> = new Set<ResendEmailEvent>([
  'sent', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'opened', 'clicked', 'failed',
]);

export interface ResendWebhookApplyInput {
  providerMessageId: string;
  event: ResendEmailEvent;
  eventAt: Date;
  bounceType: string | null;
}

export interface ResendWebhookStore {
  /** Record the event on the send-log row for this provider id. `matched` is false when no row exists. */
  applyEvent(input: ResendWebhookApplyInput): Promise<{ matched: boolean; userId: string | null }>;
  /** Turn off notification updates for the account(s) behind this delivery. Returns rows changed. */
  disableNotifications(input: { userId: string | null; recipients: string[] }): Promise<number>;
  /** Raw receipt for /admin/webhook-events. */
  logReceipt(input: LogWebhookEventInput): Promise<void>;
  /** Operator-visible diagnostic (hard bounce / complaint). */
  recordDiagnostic(input: {
    status: 'error' | 'fallback';
    summary: string;
    failureReason?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export interface HandleResendWebhookInput {
  headers: Headers | Record<string, string | undefined>;
  rawBody: string;
  secret: string | undefined | null;
  store: ResendWebhookStore;
  now?: () => number;
}

export interface HandleResendWebhookResult {
  status: number;
  body: Record<string, unknown>;
}

function readHeader(headers: HandleResendWebhookInput['headers'], name: string): string | null {
  if (headers instanceof Headers) return headers.get(name);
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key ? headers[key] ?? null : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export interface ParsedResendEvent {
  type: string;
  event: ResendEmailEvent | null;
  emailId: string | null;
  createdAt: Date;
  recipients: string[];
  bounceType: string | null;
  subject: string | null;
}

/** Read the fields this handler needs from a Resend event body; tolerant of shape drift. */
export function parseResendEvent(body: unknown, fallbackNowMs: number): ParsedResendEvent | null {
  const record = asRecord(body);
  if (!record || typeof record.type !== 'string') return null;
  const data = asRecord(record.data) ?? {};
  const type = record.type;
  const event = type.startsWith('email.') ? type.slice('email.'.length) : null;
  const to = Array.isArray(data.to)
    ? data.to.filter((entry): entry is string => typeof entry === 'string')
    : typeof data.to === 'string' ? [data.to] : [];
  const createdAtRaw = typeof record.created_at === 'string' ? Date.parse(record.created_at) : NaN;
  const bounce = asRecord(data.bounce);
  return {
    type,
    event: event && KNOWN_EVENTS.has(event) ? (event as ResendEmailEvent) : null,
    emailId: typeof data.email_id === 'string' && data.email_id.trim() ? data.email_id.trim() : null,
    createdAt: Number.isFinite(createdAtRaw) ? new Date(createdAtRaw) : new Date(fallbackNowMs),
    recipients: to.map((address) => address.trim()).filter(Boolean),
    bounceType: bounce && typeof bounce.type === 'string' ? bounce.type : null,
    subject: typeof data.subject === 'string' ? data.subject : null,
  };
}

/** A delivery outcome that must stop further mail to the address. */
export function isHardDeliveryFailure(event: ResendEmailEvent | null, bounceType: string | null): boolean {
  if (event === 'complained') return true;
  if (event !== 'bounced') return false;
  // Resend classifies bounces as Permanent | Transient | Undetermined. Only a
  // permanent bounce is proof the mailbox is gone; the rest are recorded but
  // must not silence a member over a full inbox or a greylisting hiccup.
  return bounceType !== null && bounceType.toLowerCase() === 'permanent';
}

export async function handleResendWebhook(input: HandleResendWebhookInput): Promise<HandleResendWebhookResult> {
  const startedAt = (input.now ?? Date.now)();
  const payloadSize = Buffer.byteLength(input.rawBody, 'utf8');
  const msgId = readHeader(input.headers, 'svix-id');
  const receipt = (patch: Partial<LogWebhookEventInput>) => input.store.logReceipt({
    source: RESEND_WEBHOOK_SOURCE,
    eventId: msgId,
    payloadSize,
    processingTimeMs: (input.now ?? Date.now)() - startedAt,
    status: 'failed',
    ...patch,
  });

  if (!input.secret || !input.secret.trim()) {
    await receipt({ httpStatusCode: 503, errorMessage: 'RESEND_WEBHOOK_SECRET not configured' });
    return { status: 503, body: { error: 'Webhook not configured' } };
  }

  const verification = verifySvixSignature({
    secret: input.secret,
    msgId,
    timestamp: readHeader(input.headers, 'svix-timestamp'),
    signature: readHeader(input.headers, 'svix-signature'),
    payload: input.rawBody,
    nowMs: startedAt,
  });
  if (!verification.ok) {
    await receipt({ httpStatusCode: 401, errorMessage: `Signature rejected: ${verification.reason}` });
    return { status: 401, body: { error: 'Invalid signature' } };
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(input.rawBody);
  } catch {
    await receipt({ httpStatusCode: 400, errorMessage: 'Invalid JSON' });
    return { status: 400, body: { error: 'Invalid JSON' } };
  }
  const parsed = parseResendEvent(parsedBody, startedAt);
  if (!parsed) {
    await receipt({ httpStatusCode: 400, errorMessage: 'Missing event type' });
    return { status: 400, body: { error: 'Missing event type' } };
  }

  // Non-email events (domain.*, contact.*) and unknown email events are
  // acknowledged so Resend does not retry them, but nothing is written.
  if (!parsed.event || !parsed.emailId) {
    await receipt({ eventType: parsed.type, status: 'success', httpStatusCode: 200 });
    return { status: 200, body: { ok: true, ignored: true, type: parsed.type } };
  }

  const applied = await input.store.applyEvent({
    providerMessageId: parsed.emailId,
    event: parsed.event,
    eventAt: parsed.createdAt,
    bounceType: parsed.bounceType,
  });

  let notificationsDisabled = 0;
  if (isHardDeliveryFailure(parsed.event, parsed.bounceType)) {
    notificationsDisabled = await input.store.disableNotifications({
      userId: applied.userId,
      recipients: parsed.recipients,
    });
    await input.store.recordDiagnostic({
      status: 'error',
      summary: parsed.event === 'complained'
        ? `Spam complaint: notification updates turned off for ${notificationsDisabled} account(s)`
        : `Hard bounce: notification updates turned off for ${notificationsDisabled} account(s)`,
      failureReason: parsed.event === 'complained' ? 'complained' : `bounced:${parsed.bounceType ?? 'unknown'}`,
      metadata: {
        event: parsed.event,
        bounceType: parsed.bounceType,
        providerMessageId: parsed.emailId,
        matchedSendLog: applied.matched,
        recipientCount: parsed.recipients.length,
      },
    });
  }

  await receipt({ eventType: parsed.type, status: 'success', httpStatusCode: 200 });
  return {
    status: 200,
    body: {
      ok: true,
      event: parsed.event,
      matched: applied.matched,
      notificationsDisabled,
    },
  };
}
