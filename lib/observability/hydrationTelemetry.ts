/**
 * Per-route hydration telemetry (WAP-16).
 *
 * Next's app router owns the React root and forwards React's recoverable
 * errors (hydration mismatches, Suspense boundaries that fell back to client
 * rendering) to `reportError`, which fires a window `error` event; there is no
 * public `onRecoverableError` option to pass. `instrumentation-client.ts`
 * therefore installs `createHydrationErrorListener` before hydration starts,
 * so every such error is classified, tagged with the route it happened on and
 * forwarded to the Sentry client when one is running. Without a route tag the
 * production issue for `/dashboard/weekly-recap` could not be told apart from
 * the intermittent one on the referral/points pages.
 *
 * Pure module: no DOM, Sentry or Next imports, so it is unit-testable in Node.
 */
import { splitLocalePrefix } from '@/lib/i18n/config';

/** React error codes React 18/19 emit for hydration and Suspense-hydration recoveries. */
export const REACT_HYDRATION_ERROR_CODES: ReadonlySet<string> = new Set([
  '418', '419', '420', '421', '422', '423', '424', '425',
]);

/** Development (unminified) message shapes for the same recoveries. */
const HYDRATION_MESSAGE_PATTERN =
  /hydrat|(?:did|does) not match|didn't match|switched to client rendering|server rendered html/i;

export type HydrationErrorReport = {
  /** Locale-stripped pathname with dynamic ids redacted, e.g. `/admin/members/[id]`. */
  route: string;
  /** Locale prefix the page was served under, or null for unprefixed portal paths. */
  locale: string | null;
  /** Minified React error code (`418`, `423`, ...) or null for a development message. */
  reactErrorCode: string | null;
  /** First line of the message, URL parameters stripped. */
  message: string;
};

/** `Minified React error #418; visit https://react.dev/errors/418?...` → `418`. */
export function extractReactErrorCode(message: string): string | null {
  const minified = message.match(/Minified React error #(\d+)/);
  if (minified) return minified[1] ?? null;
  const url = message.match(/react\.dev\/errors\/(\d+)/);
  return url?.[1] ?? null;
}

function messageOf(error: unknown, fallback?: string): string {
  if (error instanceof Error && typeof error.message === 'string') return error.message;
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  if (typeof error === 'string') return error;
  return fallback ?? '';
}

export function isHydrationError(error: unknown, fallbackMessage?: string): boolean {
  const message = messageOf(error, fallbackMessage);
  if (!message) return false;
  const code = extractReactErrorCode(message);
  if (code) return REACT_HYDRATION_ERROR_CODES.has(code);
  return HYDRATION_MESSAGE_PATTERN.test(message);
}

const ID_SEGMENT = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{4,}|[0-9a-f]{16,}|c[a-z0-9]{20,})$/i;

/** Keep route cardinality bounded and ids out of tags: `/admin/members/<uuid>` → `/admin/members/[id]`. */
export function redactRouteIds(pathname: string): string {
  const parts = pathname.split('/').map((segment) => (ID_SEGMENT.test(segment) ? '[id]' : segment));
  return parts.join('/') || '/';
}

/** Tag a recoverable error with the route it happened on; null when it is not a hydration recovery. */
export function tagHydrationError(error: unknown, pathname: string, fallbackMessage?: string): HydrationErrorReport | null {
  if (!isHydrationError(error, fallbackMessage)) return null;
  const rawMessage = messageOf(error, fallbackMessage);
  const { locale, pathnameWithoutLocale } = splitLocalePrefix(pathname || '/');
  const firstLine = rawMessage.split('\n')[0] ?? rawMessage;
  return {
    route: redactRouteIds(pathnameWithoutLocale),
    locale,
    reactErrorCode: extractReactErrorCode(rawMessage),
    message: firstLine.replace(/\?[^\s]*/g, '').trim(),
  };
}

export type HydrationErrorListenerOptions = {
  getPathname: () => string;
  forward: (report: HydrationErrorReport, error: unknown) => void;
};

/** Window `error` listener: classifies `event.error` (or `event.message`) and forwards hydration recoveries. */
export function createHydrationErrorListener(options: HydrationErrorListenerOptions) {
  return (event: { error?: unknown; message?: string }): void => {
    const report = tagHydrationError(event.error, options.getPathname(), event.message);
    if (!report) return;
    options.forward(report, event.error ?? new Error(report.message));
  };
}

/** Minimal shape of a Sentry event as seen by `beforeSend`; kept local so this module stays Sentry-free. */
export type SentryEventLike = {
  tags?: Record<string, unknown>;
  exception?: { values?: Array<{ type?: string; value?: string; mechanism?: { type?: string } }> };
};

/**
 * True for the copy of a hydration recovery that Sentry's own window `error`
 * global handler captured. The listener from `createHydrationErrorListener`
 * sees the same `error` event and forwards it route-tagged, so this copy is
 * a duplicate; error-boundary captures (`mechanism.type` generic) and the
 * tagged copy itself are kept.
 */
export function isUntaggedGlobalHandlerHydrationEvent(event: SentryEventLike): boolean {
  if (event.tags?.hydration === 'true') return false;
  const first = event.exception?.values?.[0];
  if (!first || first.mechanism?.type !== 'onerror') return false;
  return isHydrationError(undefined, first.value);
}
