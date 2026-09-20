/**
 * Centralized Resend send wrapper. Two responsibilities:
 *
 * 1. Provide a plaintext fallback. Resend (and downstream MTAs) penalize
 *    HTML-only mail; without a `text` part Gmail/O365 reduce reputation
 *    and accessibility/screen-reader users get a blank message.
 *
 * 2. Attach List-Unsubscribe + List-Unsubscribe-Post headers. Gmail and
 *    Yahoo's Feb 2024 bulk-sender rules require both; without them,
 *    member-facing mail (welcome, weekly recap, partner digest, nudges)
 *    is increasingly likely to be bulk-blocked or routed to spam.
 *
 * Single-recipient sends automatically carry a real RFC 8058 one-click
 * unsubscribe URL (/api/unsubscribe with an HMAC token bound to the
 * recipient email; flips that account's notification prefs off).
 * Multi-recipient sends fall back to the universally supported `mailto:`
 * form (with no One-Click-Post header, which would be invalid against a
 * mailto-only List-Unsubscribe).
 *
 * Every `resend.emails.send(...)` call in the codebase goes through
 * `sendBrandedEmail(resend, ...)` so this wrapper is the only place we touch
 * the SMTP envelope; eslint.config.mjs (`DIRECT_PROVIDER_SEND_BAN`) rejects
 * a direct call anywhere else. The wrapper also skips fixture and
 * provider-suppressed recipients, retries transient provider/network
 * failures with backoff, and fixes an idempotency key per message so a retry
 * can never double-deliver.
 */
import { createHash } from 'node:crypto';

import type { Resend } from 'resend';

import { recordWorkflowDiagnostic } from '@/lib/diagnostics';
import {
  EMAIL_SEND_WORKFLOW,
  EMAIL_TEMPLATE_ENTITY_TYPE,
  buildEmailFailureMetadata,
  type EmailTemplateRef,
} from '@/lib/email/failureRecord';
import { buildUnsubscribeUrl } from '@/lib/email/unsubscribeToken';
import { currentBulkEmailDeadlineAtMs } from '@/lib/email/pacing';
import { isEmailProviderRateLimitError } from '@/lib/email/rateLimitError';
import { partitionSuppressedRecipients, recordSuppressedRecipientSkip } from '@/lib/email/suppressions';

export { isEmailProviderRateLimitError } from '@/lib/email/rateLimitError';

const RESEND_MAX_ATTEMPTS = 3;
const RESEND_RETRY_BASE_DELAY_MS = 500;
/** Never spend more than one minute of a request waiting to retry email. */
const RESEND_RETRY_MAX_TOTAL_WAIT_MS = 60_000;

type Sleep = (ms: number) => Promise<void>;

export interface SendBrandedEmailRetryOptions {
  /** Test seam; production uses a real bounded timer. */
  sleep?: Sleep;
  /** Test seam for absolute Retry-After / rate-limit reset values. */
  now?: () => number;
  /** Test seam for deterministic fallback retry jitter. */
  random?: () => number;
  /** Shared caller deadline; no provider retry sleep may cross it. */
  deadlineAtMs?: number;
  /** Caller owns an awaited equivalent diagnostic; prevents duplicate writes. */
  suppressFailureDiagnostic?: boolean;
  /**
   * Consult the provider suppression list before sending. Defaults to true
   * for bulk/cron sends (any caller that carries a deadline or runs under a
   * bulk cron pacer) and false for single request-path sends. Fail-open: an
   * unavailable list never blocks a send.
   */
  consultSuppressions?: boolean;
}

export const UNSUBSCRIBE_ADDRESS =
  process.env.EMAIL_UNSUBSCRIBE_ADDRESS || 'unsubscribe@workforceap.org';

/**
 * Strip HTML tags + decode the small set of entities the template
 * helpers emit into a reasonable plaintext fallback. This is a best-
 * effort conversion — for emails where plaintext fidelity matters
 * (security alerts, magic links) the caller should still pass an
 * explicit `text` field.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|li|h[1-6]|tr|td|blockquote|table|thead|tbody)[^>]*>/gi, '\n')
    .replace(/<a\s+[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi, (_m, href, text) => {
      const inner = String(text).trim();
      return inner && inner !== href ? `${inner} (${href})` : href;
    })
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Drop CR/LF/NUL from every header value (and any header whose name carries
 * them) before handing the map to the mail SDK. One malformed env var or
 * caller-supplied value must never be able to fail an entire send — the
 * underlying fetch throws on the whole request, not just the bad header.
 */
export function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (/[\r\n\0]/.test(name)) continue;
    clean[name] = String(value ?? '').replace(/[\r\n\0]/g, '').trim();
  }
  return clean;
}

export function buildDeliverabilityHeaders(unsubscribeUrl?: string): Record<string, string> {
  if (unsubscribeUrl) {
    // RFC 8058 one-click: HTTPS URI first, mailto fallback second.
    return {
      'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:${UNSUBSCRIBE_ADDRESS}?subject=unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };
  }
  // Without an HTTPS URI, One-Click POST is impossible (RFC 8058 forbids
  // pairing List-Unsubscribe-Post with a mailto-only header), so send the
  // universally supported mailto form alone.
  return {
    'List-Unsubscribe': `<mailto:${UNSUBSCRIBE_ADDRESS}?subject=unsubscribe>`,
  };
}

/**
 * Why the wrapper refused to hand a message to the provider: a reserved or
 * configured fixture recipient, or an address the provider itself has already
 * suppressed (hard bounce / complaint) and would not deliver anyway.
 */
export type SkippedEmailReason = 'fixture_recipient' | 'suppressed_recipient';

export function isRecipientSkipReason(value: unknown): value is SkippedEmailReason {
  return value === 'fixture_recipient' || value === 'suppressed_recipient';
}

export type FixtureSkippedEmailResult = {
  ok: false;
  skipped: true;
  reason: SkippedEmailReason;
  data: null;
  error: null;
};

export interface SendBrandedEmailArgs {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  /** Optional override; defaults to HTML stripped to plaintext. */
  text?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  /** Caller-supplied headers are merged on top of the defaults. */
  headers?: Record<string, string>;
  attachments?: Array<{ filename: string; content: string | Buffer }>;
  /** Stable per-message request key; retries must preserve the original payload. */
  idempotencyKey?: string;
  /**
   * Template id + the wrapper's own params (WAP-163). Recorded on a failed
   * send so /admin/diagnostics can list the failure by template and the admin
   * resend route can re-invoke the same wrapper with the same payload. Leave
   * unset for mail that must never be replayed from a stored row (password
   * resets, login codes, one-time links).
   */
  template?: EmailTemplateRef;
}

/**
 * Persist a send failure to workflow diagnostics so /admin/diagnostics shows
 * email problems instead of them dying in server logs. Fire-and-forget: the
 * diagnostic write must never change send behavior or throw.
 *
 * WAP-163: the row carries the typed failure record (template, params, error
 * class, retryable, recipient hash) so it can be listed and re-sent later.
 */
function recordEmailFailure(args: SendBrandedEmailArgs, error: unknown) {
  const metadata = buildEmailFailureMetadata(args, error);
  void recordWorkflowDiagnostic({
    workflow: EMAIL_SEND_WORKFLOW,
    status: 'error',
    entityType: EMAIL_TEMPLATE_ENTITY_TYPE,
    entityId: metadata.template,
    summary: `Email send failed: "${args.subject}"`,
    provider: 'resend',
    failureReason: error instanceof Error ? error.message : typeof error === 'string' ? error : 'Send threw',
    metadata: { ...metadata },
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function readHeader(headers: unknown, name: string): unknown {
  if (headers instanceof Headers) return headers.get(name);
  const record = asRecord(headers);
  if (!record) return undefined;
  const key = Object.keys(record).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key ? record[key] : undefined;
}

function parseRetryAfterMs(value: unknown, nowMs: number): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) return numeric * 1_000;
  if (typeof value === 'string') {
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return Math.max(0, timestamp - nowMs);
  }
  return null;
}

function parseRateLimitResetMs(value: unknown, nowMs: number): number | null {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  if (numeric >= 1_000_000_000_000) return Math.max(0, numeric - nowMs);
  if (numeric >= 1_000_000_000) return Math.max(0, numeric * 1_000 - nowMs);
  return numeric * 1_000;
}

function normalizedRecipientDomain(address: string): string | null {
  const match = address.trim().toLowerCase().match(/@([^>\s]+)>?$/);
  return match?.[1]?.replace(/\.$/, '') ?? null;
}

function fixtureDomains(): string[] {
  const configured = (process.env.EMAIL_FIXTURE_DOMAINS ?? '')
    .split(',')
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, '').replace(/^\./, '').replace(/\.$/, ''))
    .filter(Boolean);
  return ['example.com', 'test', 'invalid', 'localhost', ...configured];
}

function normalizedRecipientAddress(address: string): string {
  const trimmed = address.trim().toLowerCase();
  const angled = trimmed.match(/<([^>]+)>\s*$/);
  return (angled?.[1] ?? trimmed).trim();
}

function recipientLocalPart(address: string): string | null {
  const bare = normalizedRecipientAddress(address);
  const at = bare.lastIndexOf('@');
  return at > 0 ? bare.slice(0, at) : null;
}

/** Domain the platform sends from (EMAIL_FROM); `<anything>-test@` there is a seeded fixture account. */
export function sendingDomain(): string {
  return normalizedRecipientDomain(process.env.EMAIL_FROM || 'hello@workforceap.org') ?? 'workforceap.org';
}

/**
 * Local-part shapes used by seeded/smoke fixtures that live in production
 * with real-looking domains (2026-09-20 audit: 13 such accounts received
 * every cron and produced 41 of 57 suppressed/bounced deliveries).
 */
const FIXTURE_LOCAL_PART_PATTERNS: readonly RegExp[] = [
  /^test-smoke-/,
  /referral-member-/,
  /match-candidate/,
];

function fixtureAddresses(): Set<string> {
  return new Set(
    (process.env.EMAIL_FIXTURE_ADDRESSES ?? '')
      .split(',')
      .map((address) => address.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isFixtureEmailRecipient(address: string): boolean {
  const domain = normalizedRecipientDomain(address);
  if (!domain) return false;
  if (fixtureDomains().some((fixture) => domain === fixture || domain.endsWith(`.${fixture}`))) return true;
  if (fixtureAddresses().has(normalizedRecipientAddress(address))) return true;
  const local = recipientLocalPart(address);
  if (!local) return false;
  if (local.endsWith('-test') && domain === sendingDomain()) return true;
  return FIXTURE_LOCAL_PART_PATTERNS.some((pattern) => pattern.test(local));
}

const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED', 'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
]);
const TRANSIENT_PROVIDER_ERROR_NAMES = new Set(['internal_server_error', 'application_error']);

/**
 * True for a failure worth a second attempt with the identical payload: a
 * provider 5xx / 408, or a network-layer error (undici "fetch failed" whose
 * cause is a reset or timeout). Permanent rejections — 4xx validation, an
 * unknown recipient, the historical CRLF-header TypeError — are not retried.
 */
export function isTransientProviderError(error: unknown, depth = 0): boolean {
  if (error == null || depth > 3) return false;
  const record = asRecord(error);
  if (record) {
    const status = Number(record.status ?? record.statusCode ?? record.status_code);
    if (Number.isFinite(status) && (status >= 500 || status === 408)) return true;
    if (TRANSIENT_PROVIDER_ERROR_NAMES.has(String(record.name ?? '').toLowerCase())) return true;
    if (TRANSIENT_NETWORK_CODES.has(String(record.code ?? '').toUpperCase())) return true;
    if (record.cause !== undefined && isTransientProviderError(record.cause, depth + 1)) return true;
  }
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return /fetch failed|socket hang up|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED|network timeout|timed out/i.test(message);
}

/**
 * Per-message key when the caller supplies none, so a provider retry (ours,
 * or a platform re-invocation the same day) cannot double-deliver the same
 * message. Hashes recipients + subject + body + UTC day: a different body
 * (a second contact-form message, a fresh test send) is a different key.
 */
export function defaultIdempotencyKey(
  args: Pick<SendBrandedEmailArgs, 'to' | 'subject' | 'html' | 'template'>,
  nowMs: number,
): string {
  const templateKey = (args.template?.name?.trim() || 'email').replace(/[^a-z0-9_-]/gi, '_').slice(0, 64);
  const recipients = (Array.isArray(args.to) ? args.to : [args.to])
    .map((recipient) => normalizedRecipientAddress(recipient))
    .sort()
    .join(',');
  const dayBucket = new Date(nowMs).toISOString().slice(0, 10);
  const digest = createHash('sha256')
    .update(`${recipients}\n${args.subject}\n${args.html}\n${dayBucket}`)
    .digest('hex');
  return `${templateKey}/${digest}`;
}

function resendRetryDelayMs(
  error: unknown,
  attempt: number,
  nowMs: number,
  random: () => number,
): number | null {
  const backoff = RESEND_RETRY_BASE_DELAY_MS * (2 ** (attempt - 1));
  const jitteredBackoff = () => Math.round(backoff * (1 + Math.max(0, Math.min(1, random())) * 0.25));
  if (!isEmailProviderRateLimitError(error)) {
    // No provider hint to honor for a 5xx / network failure: plain backoff.
    return isTransientProviderError(error) ? jitteredBackoff() : null;
  }
  const record = asRecord(error);
  if (!record) return null;

  const rateLimit = asRecord(record.rateLimit ?? record.rate_limit);
  const retryAfterMs = Number(record.retryAfterMs ?? record.retry_after_ms);
  const hintedDelay = Number.isFinite(retryAfterMs) && retryAfterMs >= 0
    ? retryAfterMs
    : parseRetryAfterMs(
        record.retryAfter ?? record.retry_after ?? readHeader(record.headers, 'retry-after'),
        nowMs,
      ) ?? parseRateLimitResetMs(
        rateLimit?.reset
          ?? record.rateLimitReset
          ?? record.rate_limit_reset
          ?? readHeader(record.headers, 'ratelimit-reset')
          ?? readHeader(record.headers, 'x-ratelimit-reset'),
        nowMs,
      );
  // Retry-After/rate-limit metadata is authoritative and remains exact.
  if (hintedDelay !== null) return hintedDelay;
  return jitteredBackoff();
}

export class FixtureRecipientSkippedError extends Error {
  readonly skipped = true;
  readonly reason: SkippedEmailReason;

  constructor(reason: SkippedEmailReason = 'fixture_recipient') {
    super(reason);
    this.reason = reason;
    this.name = 'FixtureRecipientSkippedError';
  }
}

export async function sendBrandedEmail(
  resend: Resend,
  args: SendBrandedEmailArgs,
  retryOptions: SendBrandedEmailRetryOptions = {},
): Promise<Awaited<ReturnType<Resend['emails']['send']>> | FixtureSkippedEmailResult> {
  const recipients = [args.to, args.cc, args.bcc]
    .flatMap((value) => value === undefined ? [] : Array.isArray(value) ? value : [value]);
  if (recipients.some(isFixtureEmailRecipient)) {
    return { ok: false, skipped: true, reason: 'fixture_recipient', data: null, error: null };
  }
  const now = retryOptions.now ?? Date.now;

  // Bulk/cron sends drop recipients the provider has already suppressed
  // (it would report the send as "suppressed" while we booked a success).
  // A multi-recipient message keeps going to the deliverable addresses; a
  // message with no deliverable `to` left is skipped and recorded.
  let to = args.to;
  let cc = args.cc;
  let bcc = args.bcc;
  const consultSuppressions = retryOptions.consultSuppressions
    ?? (retryOptions.deadlineAtMs !== undefined || currentBulkEmailDeadlineAtMs() !== undefined);
  if (consultSuppressions) {
    const partition = await partitionSuppressedRecipients(recipients, { now });
    if (partition.suppressed.length > 0) {
      const suppressed = new Set(partition.suppressed);
      const keep = (value: string | string[] | undefined): string | string[] | undefined => {
        if (value === undefined) return undefined;
        if (Array.isArray(value)) return value.filter((entry) => !suppressed.has(entry));
        return suppressed.has(value) ? undefined : value;
      };
      const deliverableTo = keep(args.to);
      if (deliverableTo === undefined || (Array.isArray(deliverableTo) && deliverableTo.length === 0)) {
        recordSuppressedRecipientSkip(args, partition.suppressed);
        return { ok: false, skipped: true, reason: 'suppressed_recipient', data: null, error: null };
      }
      to = deliverableTo;
      cc = keep(args.cc);
      bcc = keep(args.bcc);
    }
  }

  const text = args.text && args.text.trim().length > 0 ? args.text : htmlToPlainText(args.html);
  const payload = {
    from: args.from,
    to,
    subject: args.subject,
    html: args.html,
    text,
    replyTo: args.replyTo,
    cc,
    bcc,
    headers: sanitizeHeaders({
      // Single-recipient mail gets a tokenized RFC 8058 one-click URL bound
      // to that recipient; multi-recipient mail falls back to mailto-only.
      ...buildDeliverabilityHeaders(
        typeof to === 'string' ? buildUnsubscribeUrl(to) : undefined,
      ),
      ...args.headers,
    }),
    ...(args.attachments ? { attachments: args.attachments } : {}),
  };
  const sleep = retryOptions.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const random = retryOptions.random ?? Math.random;
  // Fixed before the first attempt so every retry replays the same request.
  const idempotencyKey = args.idempotencyKey ?? defaultIdempotencyKey({ ...args, to }, now());
  let totalRetryWaitMs = 0;

  for (let attempt = 1; attempt <= RESEND_MAX_ATTEMPTS; attempt++) {
    let result: Awaited<ReturnType<Resend['emails']['send']>>;
    try {
      result = await resend.emails.send(payload, { idempotencyKey });
    } catch (err) {
      const nowMs = now();
      const delayMs = resendRetryDelayMs(err, attempt, nowMs, random);
      if (
        delayMs !== null
        && attempt < RESEND_MAX_ATTEMPTS
        && totalRetryWaitMs + delayMs <= RESEND_RETRY_MAX_TOTAL_WAIT_MS
        && (retryOptions.deadlineAtMs === undefined || nowMs + delayMs < retryOptions.deadlineAtMs)
      ) {
        totalRetryWaitMs += delayMs;
        await sleep(delayMs);
        continue;
      }
      if (!retryOptions.suppressFailureDiagnostic) recordEmailFailure(args, err);
      throw err;
    }

    // Resend resolves with { data, error } instead of throwing on API errors.
    if (!result.error) return result;
    const nowMs = now();
    const delayMs = resendRetryDelayMs(result.error, attempt, nowMs, random);
    if (
      delayMs !== null
      && attempt < RESEND_MAX_ATTEMPTS
      && totalRetryWaitMs + delayMs <= RESEND_RETRY_MAX_TOTAL_WAIT_MS
      && (retryOptions.deadlineAtMs === undefined || nowMs + delayMs < retryOptions.deadlineAtMs)
    ) {
      totalRetryWaitMs += delayMs;
      await sleep(delayMs);
      continue;
    }
    const message = result.error.message ?? result.error.name ?? 'Resend API error';
    if (!retryOptions.suppressFailureDiagnostic) recordEmailFailure(args, result.error);
    throw new Error(message);
  }
  throw new Error('Resend retry budget exhausted');
}


/** Production wrappers use this so a skipped fixture can never be booked as sent. */
export async function sendBrandedEmailOrThrowOnSkip(
  resend: Resend,
  args: SendBrandedEmailArgs,
  retryOptions: SendBrandedEmailRetryOptions = {},
): Promise<Awaited<ReturnType<Resend['emails']['send']>>> {
  const result = await sendBrandedEmail(resend, args, {
    ...retryOptions,
    deadlineAtMs: retryOptions.deadlineAtMs ?? currentBulkEmailDeadlineAtMs(),
  });
  if ('skipped' in result) throw new FixtureRecipientSkippedError(result.reason);
  return result;
}
