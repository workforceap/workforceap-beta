/**
 * Provider suppression list.
 *
 * Resend stops delivering to an address after a hard bounce or a spam
 * complaint and reports later sends to it as "suppressed" — but it still
 * accepts the API request, so the app has been booking those sends as
 * successes and re-sending every week (17 addresses at the time of the
 * 2026-09-20 audit, 27 of the last 200 sends). Nothing in the app records the
 * provider outcome yet, so the send wrapper consults GET /suppressions
 * directly, cached per process for {@link SUPPRESSION_CACHE_TTL_MS}.
 *
 * Fail-open by design: no API key, a timeout, a non-2xx or a malformed body
 * all resolve to `null` ("unknown"), and the caller must then send as normal.
 * Skipping mail because a lookup failed would silently drop real email,
 * which is the exact failure mode this codebase is recovering from.
 */
import { recordWorkflowDiagnostic } from '@/lib/diagnostics';
import {
  EMAIL_SEND_WORKFLOW,
  EMAIL_TEMPLATE_ENTITY_TYPE,
  recipientHash,
  type EmailTemplateRef,
} from '@/lib/email/failureRecord';

export const SUPPRESSION_CACHE_TTL_MS = 10 * 60_000;
export const SUPPRESSION_FETCH_TIMEOUT_MS = 4_000;
/** `WorkflowDiagnostic.method` / `fallbackPath` for a send skipped on the suppression list. */
export const SUPPRESSED_SKIP_METHOD = 'skipped_suppressed';

const SUPPRESSIONS_URL = 'https://api.resend.com/suppressions';
const SUPPRESSION_PAGE_SIZE = 100;
const SUPPRESSION_MAX_PAGES = 20;
const WARN_INTERVAL_MS = SUPPRESSION_CACHE_TTL_MS;

type SuppressionCache = { fetchedAt: number; emails: Set<string> };
let cache: SuppressionCache | null = null;
let inflight: Promise<Set<string> | null> | null = null;
let lastWarnAtMs = 0;

export interface SuppressionLookupOptions {
  /** Defaults to RESEND_API_KEY; `null` disables the lookup (fail open). */
  apiKey?: string | null;
  /** Test seam. */
  fetchImpl?: typeof fetch;
  /** Test seam. */
  now?: () => number;
}

function apiKeyFromEnv(): string | null {
  const key = process.env.RESEND_API_KEY?.replace(/[\r\n\0]/g, '').trim();
  return key || null;
}

/** Lowercased bare address: `Name <a@b>` → `a@b`. */
export function bareEmailAddress(address: string): string {
  const trimmed = address.trim().toLowerCase();
  const angled = trimmed.match(/<([^>]+)>\s*$/);
  return (angled?.[1] ?? trimmed).trim();
}

type SuppressionRow = { id?: unknown; email?: unknown };
type SuppressionPage = { data?: unknown; has_more?: unknown };

async function fetchAllSuppressions(apiKey: string, fetchImpl: typeof fetch, signal: AbortSignal): Promise<Set<string>> {
  const emails = new Set<string>();
  let after: string | undefined;
  for (let page = 0; page < SUPPRESSION_MAX_PAGES; page++) {
    const url = new URL(SUPPRESSIONS_URL);
    url.searchParams.set('limit', String(SUPPRESSION_PAGE_SIZE));
    if (after) url.searchParams.set('after', after);
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal,
    });
    if (!response.ok) throw new Error(`GET /suppressions returned HTTP ${response.status}`);
    const body = (await response.json()) as SuppressionPage;
    const rows: SuppressionRow[] = Array.isArray(body.data) ? (body.data as SuppressionRow[]) : [];
    for (const row of rows) {
      if (typeof row.email === 'string' && row.email.includes('@')) emails.add(bareEmailAddress(row.email));
    }
    const lastId = rows.length > 0 ? rows[rows.length - 1]?.id : undefined;
    if (body.has_more !== true || typeof lastId !== 'string' || lastId === after) break;
    after = lastId;
  }
  return emails;
}

function warnLookupFailed(error: unknown, nowMs: number): void {
  if (nowMs - lastWarnAtMs < WARN_INTERVAL_MS) return;
  lastWarnAtMs = nowMs;
  console.warn(
    '[email/suppressions] provider suppression list unavailable; sending without it',
    { error: error instanceof Error ? error.message : String(error) },
  );
}

/**
 * Cached set of provider-suppressed addresses, or `null` when the list is
 * unknown (no key, provider unreachable, malformed response). A stale cache
 * is preferred over `null` when a refresh fails.
 */
export async function loadProviderSuppressions(options: SuppressionLookupOptions = {}): Promise<Set<string> | null> {
  const now = options.now ?? Date.now;
  const apiKey = options.apiKey === undefined ? apiKeyFromEnv() : options.apiKey;
  if (!apiKey) return null;
  const nowMs = now();
  if (cache && nowMs - cache.fetchedAt < SUPPRESSION_CACHE_TTL_MS) return cache.emails;
  if (inflight) return inflight;

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUPPRESSION_FETCH_TIMEOUT_MS);
  timer.unref?.();
  inflight = fetchAllSuppressions(apiKey, fetchImpl, controller.signal)
    .then((emails) => {
      cache = { fetchedAt: now(), emails };
      return emails;
    })
    .catch((error: unknown) => {
      warnLookupFailed(error, nowMs);
      return cache?.emails ?? null;
    })
    .finally(() => {
      clearTimeout(timer);
      inflight = null;
    });
  return inflight;
}

export interface SuppressionPartition {
  /** False when the list could not be consulted; nothing was filtered. */
  consulted: boolean;
  suppressed: string[];
  deliverable: string[];
}

/** Split recipients by the provider suppression list; fail-open when it is unknown. */
export async function partitionSuppressedRecipients(
  recipients: string[],
  options: SuppressionLookupOptions = {},
): Promise<SuppressionPartition> {
  const suppressions = await loadProviderSuppressions(options);
  if (!suppressions) return { consulted: false, suppressed: [], deliverable: recipients };
  const suppressed: string[] = [];
  const deliverable: string[] = [];
  for (const recipient of recipients) {
    (suppressions.has(bareEmailAddress(recipient)) ? suppressed : deliverable).push(recipient);
  }
  return { consulted: true, suppressed, deliverable };
}

/** Test seam: forget the cached list and any in-flight refresh. */
export function resetProviderSuppressionCache(): void {
  cache = null;
  inflight = null;
  lastWarnAtMs = 0;
}

function recipientDomains(addresses: string[]): string[] {
  return Array.from(new Set(addresses.map((address) => bareEmailAddress(address).split('@')[1] ?? '').filter(Boolean)));
}

/**
 * Record a send that was skipped because every `to` recipient is on the
 * provider suppression list, so /admin/diagnostics can show the address is
 * dead instead of the cron booking another "success". Fire-and-forget; stores
 * a recipient hash and domain, never the raw address.
 */
export function recordSuppressedRecipientSkip(
  args: { to: string | string[]; subject: string; template?: EmailTemplateRef },
  suppressed: string[],
): void {
  const template = args.template?.name?.trim() || null;
  void recordWorkflowDiagnostic({
    workflow: EMAIL_SEND_WORKFLOW,
    status: 'fallback',
    entityType: EMAIL_TEMPLATE_ENTITY_TYPE,
    entityId: template,
    summary: 'Email skipped: recipient is on the provider suppression list',
    provider: 'resend',
    method: SUPPRESSED_SKIP_METHOD,
    fallbackPath: SUPPRESSED_SKIP_METHOD,
    metadata: {
      template,
      recipientHash: recipientHash(args.to),
      recipientDomains: recipientDomains(suppressed),
      suppressedCount: suppressed.length,
      skippedAt: new Date().toISOString(),
    },
  });
}
