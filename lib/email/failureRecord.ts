/**
 * Failed-send record (WAP-163).
 *
 * Between 2026-06-29 and 2026-09-06, 768 outbound emails failed on one
 * header bug and nothing surfaced or re-sent them: `lib/email/send.ts` wrote a
 * `workflow_diagnostics` row with only `{ to, subject }`, which is not enough
 * to list the failures by template, to tell a permanent rejection from a
 * transient one, or to re-invoke the template with the same payload.
 *
 * Every failed send now carries a typed metadata block: template name and
 * params (when the wrapper opted in, see `SendBrandedEmailArgs.template`),
 * an error class, a retryable flag, a recipient hash for grouping and the
 * failure time. Pure helpers only — no I/O — so the classifier and the
 * metadata reader are unit-testable and shared by the sender, the admin
 * resend route and `/admin/diagnostics`.
 */
import { createHash } from 'node:crypto';

import { isEmailProviderRateLimitError } from '@/lib/email/rateLimitError';

/** `WorkflowDiagnostic.workflow` value for provider send outcomes. */
export const EMAIL_SEND_WORKFLOW = 'email_send';
/** `WorkflowDiagnostic.entityType` for a failed or re-sent template. */
export const EMAIL_TEMPLATE_ENTITY_TYPE = 'email_template';
/** `WorkflowDiagnostic.method` written by the admin resend route. */
export const EMAIL_RESEND_METHOD = 'admin_resend';

export type EmailFailureClass =
  | 'rate_limit'
  | 'header_invalid'
  | 'provider_rejected'
  | 'provider_unavailable'
  | 'network'
  | 'unknown';

export interface EmailTemplateRef {
  /** Stable template id, e.g. `applicant_followup`. Doubles as the resend registry key. */
  name: string;
  /** JSON-serialisable wrapper params; the resend route replays them verbatim. */
  params: Record<string, unknown>;
}

export interface EmailFailureMetadata {
  /**
   * Raw recipients. Rows written before 2026-09-20 carry them; new rows do
   * not (see `buildEmailFailureMetadata`), so this is empty for them and the
   * recipient is identified by `recipientHash` + `recipientDomain`.
   */
  to: string[];
  /** Raw subject on historical rows only; new rows store the template key instead. */
  subject: string;
  template: string | null;
  templateParams?: Record<string, unknown>;
  errorClass: EmailFailureClass;
  retryable: boolean;
  /** Whether the admin resend route can replay this row (template + params stored). */
  resendable: boolean;
  recipientHash: string | null;
  /** Domain of the first recipient (lowercased), for grouping without the address. */
  recipientDomain: string | null;
  failedAt: string;
  /** Set by the resend route once a replay has been attempted. */
  resentAt?: string;
  resentOk?: boolean;
  resentDiagnosticId?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function statusOf(error: unknown): number | null {
  const record = asRecord(error);
  if (!record) return null;
  const status = Number(record.status ?? record.statusCode ?? record.status_code);
  return Number.isFinite(status) ? status : null;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  const record = asRecord(error);
  if (record && typeof record.message === 'string') return record.message;
  return typeof error === 'string' ? error : '';
}

/**
 * Classify a provider failure and say whether replaying the same payload is
 * plausible. `retryable` is about the payload, not the moment: a permanent
 * rejection (unknown recipient, invalid payload) stays false; the CRLF header
 * bug is a code defect that has since been fixed, so its rows are retryable.
 */
export function classifyEmailSendFailure(error: unknown): { errorClass: EmailFailureClass; retryable: boolean } {
  const message = messageOf(error);
  const status = statusOf(error);
  const record = asRecord(error);
  const name = String(record?.name ?? record?.code ?? '').toLowerCase();

  if (isEmailProviderRateLimitError(error)) return { errorClass: 'rate_limit', retryable: true };
  if (/carriage return|line feed|null characters|invalid header/i.test(message)) {
    return { errorClass: 'header_invalid', retryable: true };
  }
  if (/fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network/i.test(message) || name === 'fetcherror') {
    return { errorClass: 'network', retryable: true };
  }
  if ((status !== null && status >= 500) || name === 'internal_server_error' || name === 'application_error') {
    return { errorClass: 'provider_unavailable', retryable: true };
  }
  if (
    (status !== null && status >= 400 && status < 500)
    || /validation_error|invalid_(?:from|to|attachment|parameter)|not_found|missing_required_field|unauthorized|forbidden/i.test(name || message)
  ) {
    return { errorClass: 'provider_rejected', retryable: false };
  }
  return { errorClass: 'unknown', retryable: true };
}

/** Short stable hash of the first recipient (lowercased) so rows group without exposing the address in indexes. */
export function recipientHash(to: string | string[] | undefined): string | null {
  const first = (Array.isArray(to) ? to[0] : to)?.trim().toLowerCase();
  if (!first) return null;
  return createHash('sha256').update(first).digest('hex').slice(0, 16);
}

/** Lowercased domain of the first recipient, or null when there is none. */
export function recipientDomain(to: string | string[] | undefined): string | null {
  const first = (Array.isArray(to) ? to[0] : to)?.trim().toLowerCase();
  const at = first?.lastIndexOf('@') ?? -1;
  if (!first || at <= 0 || at === first.length - 1) return null;
  return first.slice(at + 1).replace(/>$/, '');
}

function jsonSafe(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export function buildEmailFailureMetadata(
  args: { to: string | string[]; subject: string; template?: EmailTemplateRef },
  error: unknown,
  now: Date = new Date(),
): EmailFailureMetadata {
  const { errorClass, retryable } = classifyEmailSendFailure(error);
  const template = args.template?.name?.trim() || null;
  const params = template && args.template ? jsonSafe(args.template.params ?? {}) : undefined;
  // The raw address and subject are not stored: the recipient is identified
  // by hash + domain and the message by its template key. `templateParams`
  // is the one place an address may remain, because the admin resend route
  // replays the wrapper with exactly those params; wrappers that must never
  // be replayed do not pass `template` and so store none.
  return {
    to: [],
    subject: '',
    template,
    ...(params ? { templateParams: params } : {}),
    errorClass,
    retryable,
    resendable: Boolean(template && params),
    recipientHash: recipientHash(args.to),
    recipientDomain: recipientDomain(args.to),
    failedAt: now.toISOString(),
  };
}

const FAILURE_CLASSES: ReadonlySet<string> = new Set<EmailFailureClass>([
  'rate_limit', 'header_invalid', 'provider_rejected', 'provider_unavailable', 'network', 'unknown',
]);

/**
 * Read a stored diagnostic's metadata defensively. Rows written before this
 * module (the 768 historical failures) carry only `{ to, subject }`; they read
 * back as non-resendable `unknown` failures instead of throwing.
 */
export function parseEmailFailureMetadata(value: unknown): EmailFailureMetadata {
  const record = asRecord(value) ?? {};
  const to = Array.isArray(record.to)
    ? record.to.filter((entry): entry is string => typeof entry === 'string')
    : typeof record.to === 'string' ? [record.to] : [];
  const template = typeof record.template === 'string' && record.template.trim() ? record.template : null;
  const templateParams = asRecord(record.templateParams) ?? undefined;
  const errorClass = typeof record.errorClass === 'string' && FAILURE_CLASSES.has(record.errorClass)
    ? (record.errorClass as EmailFailureClass)
    : 'unknown';
  return {
    to,
    subject: typeof record.subject === 'string' ? record.subject : '',
    template,
    ...(templateParams ? { templateParams } : {}),
    errorClass,
    retryable: typeof record.retryable === 'boolean' ? record.retryable : errorClass !== 'provider_rejected',
    resendable: Boolean(template && templateParams),
    recipientHash: typeof record.recipientHash === 'string' ? record.recipientHash : null,
    recipientDomain: typeof record.recipientDomain === 'string'
      ? record.recipientDomain
      : recipientDomain(to),
    failedAt: typeof record.failedAt === 'string' ? record.failedAt : '',
    ...(typeof record.resentAt === 'string' ? { resentAt: record.resentAt } : {}),
    ...(typeof record.resentOk === 'boolean' ? { resentOk: record.resentOk } : {}),
    ...(typeof record.resentDiagnosticId === 'string' ? { resentDiagnosticId: record.resentDiagnosticId } : {}),
  };
}
