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
 * Every `resend.emails.send(...)` call in lib/email.ts should be replaced
 * with `sendBrandedEmail(resend, ...)` so this wrapper is the only
 * place we touch the SMTP envelope.
 */
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

export type FixtureSkippedEmailResult = {
  ok: false;
  skipped: true;
  reason: 'fixture_recipient';
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

export function isFixtureEmailRecipient(address: string): boolean {
  const domain = normalizedRecipientDomain(address);
  if (!domain) return false;
  return fixtureDomains().some((fixture) => domain === fixture || domain.endsWith(`.${fixture}`));
}

function resendRetryDelayMs(
  error: unknown,
  attempt: number,
  nowMs: number,
  random: () => number,
): number | null {
  if (!isEmailProviderRateLimitError(error)) return null;
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
  const backoff = RESEND_RETRY_BASE_DELAY_MS * (2 ** (attempt - 1));
  // Retry-After/rate-limit metadata is authoritative and remains exact.
  if (hintedDelay !== null) return hintedDelay;
  const jitter = 1 + Math.max(0, Math.min(1, random())) * 0.25;
  return Math.round(backoff * jitter);
}

export class FixtureRecipientSkippedError extends Error {
  readonly skipped = true;
  readonly reason = 'fixture_recipient' as const;

  constructor() {
    super('fixture_recipient');
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

  const text = args.text && args.text.trim().length > 0 ? args.text : htmlToPlainText(args.html);
  const payload = {
    from: args.from,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text,
    replyTo: args.replyTo,
    cc: args.cc,
    bcc: args.bcc,
    headers: sanitizeHeaders({
      // Single-recipient mail gets a tokenized RFC 8058 one-click URL bound
      // to that recipient; multi-recipient mail falls back to mailto-only.
      ...buildDeliverabilityHeaders(
        typeof args.to === 'string' ? buildUnsubscribeUrl(args.to) : undefined,
      ),
      ...args.headers,
    }),
    ...(args.attachments ? { attachments: args.attachments } : {}),
  };
  const sleep = retryOptions.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = retryOptions.now ?? Date.now;
  const random = retryOptions.random ?? Math.random;
  let totalRetryWaitMs = 0;

  for (let attempt = 1; attempt <= RESEND_MAX_ATTEMPTS; attempt++) {
    let result: Awaited<ReturnType<Resend['emails']['send']>>;
    try {
      result = args.idempotencyKey
        ? await resend.emails.send(payload, { idempotencyKey: args.idempotencyKey })
        : await resend.emails.send(payload);
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
  if ('skipped' in result) throw new FixtureRecipientSkippedError();
  return result;
}
