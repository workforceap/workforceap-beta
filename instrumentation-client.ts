import { createHydrationErrorListener, type HydrationErrorReport } from '@/lib/observability/hydrationTelemetry';

const APP_LOCALES = ['en', 'es', 'fr', 'pt'];

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const isProduction = process.env.NODE_ENV === 'production';

function isReadOnlyPortalAuditDocument(): boolean {
  if (typeof document === 'undefined') return false;
  return (
    document.documentElement.dataset.portalReadOnlyAudit === '1' ||
    document.querySelector(
      '[data-portal-audit-suppressed="root-gtm-sentry-utm-and-provider-metrics"]',
    ) !== null
  );
}

function stripLocalePrefix(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length > 0 && APP_LOCALES.includes(parts[0]!)) {
    const rest = parts.slice(1);
    return rest.length === 0 ? '/' : `/${rest.join('/')}`;
  }
  return pathname;
}

function isPortalRoute(pathname: string): boolean {
  const path = stripLocalePrefix(pathname);
  const portalPrefixes = [
    '/dashboard',
    '/admin',
    '/counselor',
    '/employer',
    '/partner',
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/verify-mfa',
    '/setup-mfa',
  ];
  return portalPrefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

let captureRouterTransitionStart: ((href: string, navigationType: string) => void) | undefined;
let initPromise: Promise<void> | null = null;

/** PII-bearing query-string keys that should be stripped from breadcrumb URLs
 *  before they reach Sentry. */
const PII_QUERY_KEYS = new Set([
  'email',
  'phone',
  'token',
  'code',
  'reset_token',
  'access_token',
  'refresh_token',
  'magic_link',
  'invite_token',
  'tokenHash',
  'token_hash',
]);

function scrubUrlForBreadcrumb(value: string): string {
  try {
    const url = new URL(value, 'https://internal.invalid');
    let mutated = false;
    for (const key of [...url.searchParams.keys()]) {
      if (PII_QUERY_KEYS.has(key.toLowerCase())) {
        url.searchParams.set(key, '[redacted]');
        mutated = true;
      }
    }
    return mutated ? url.toString() : value;
  } catch {
    return value;
  }
}

/** Replay hydration diffs that only mention extension-injected style attrs. */
function isExtensionStyleHydrationNoise(event: {
  message?: string;
  exception?: { values?: Array<{ type?: string; value?: string }> };
  contexts?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}): boolean {
  const pieces: string[] = [];
  if (typeof event.message === 'string') pieces.push(event.message);
  for (const value of event.exception?.values ?? []) {
    if (value.type) pieces.push(value.type);
    if (value.value) pieces.push(value.value);
  }
  try {
    pieces.push(JSON.stringify(event.contexts ?? {}));
    pieces.push(JSON.stringify(event.extra ?? {}));
  } catch {
    // ignore serialization failures
  }
  const blob = pieces.join('\n').toLowerCase();
  if (!blob.includes('hydration')) return false;
  return (
    blob.includes('caret-color') ||
    blob.includes('border-top-style') ||
    blob.includes('border-right-style') ||
    blob.includes('border-bottom-style') ||
    blob.includes('border-left-style') ||
    blob.includes('outline-style')
  );
}

/**
 * WAP-16 per-route hydration telemetry. Next hands React's recoverable errors
 * to `reportError`, so they surface as window `error` events before Sentry's
 * lazy chunk has loaded. The listener below is installed synchronously at
 * module evaluation (before hydration), remembers the error object, and
 * forwards it tagged with the route once the Sentry client exists. Sentry's
 * own global handler may also see the same error; `beforeSend` drops that
 * untagged duplicate so each recovery is counted once, per route.
 */
const forwardedHydrationErrors = new WeakSet<object>();

function forwardHydrationReport(report: HydrationErrorReport, error: unknown): void {
  if (error && typeof error === 'object') forwardedHydrationErrors.add(error);
  // Same gate as setSentryUser: never pull the Sentry chunk where it is not initialized.
  if (!dsn || !isProduction || isReadOnlyPortalAuditDocument() || !initPromise) return;
  void initPromise
    .then(async () => {
      const Sentry = await import('@sentry/nextjs');
      Sentry.withScope((scope) => {
        scope.setTag('hydration', 'true');
        scope.setTag('route', report.route);
        scope.setTag('locale', report.locale ?? 'none');
        if (report.reactErrorCode) scope.setTag('react_error_code', report.reactErrorCode);
        scope.setFingerprint(['hydration', report.route, report.reactErrorCode ?? report.message]);
        Sentry.captureException(error instanceof Error ? error : new Error(report.message));
      });
    })
    .catch(() => {
      // telemetry must never surface as a page error
    });
}

function isUntaggedForwardedHydrationDuplicate(
  event: { tags?: Record<string, unknown> },
  hint: { originalException?: unknown } | undefined,
): boolean {
  const original = hint?.originalException;
  if (!original || typeof original !== 'object' || !forwardedHydrationErrors.has(original)) return false;
  return event.tags?.hydration !== 'true';
}

if (typeof window !== 'undefined') {
  window.addEventListener(
    'error',
    createHydrationErrorListener({ getPathname: () => window.location.pathname, forward: forwardHydrationReport }),
  );
}

async function initSentry() {
  if (!dsn || !isProduction || isReadOnlyPortalAuditDocument()) return;

  const Sentry = await import('@sentry/nextjs');

  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_REPLAY_SAMPLE_RATE ?? '0.01'),
    replaysOnErrorSampleRate: 1.0,
    // Browser translation extensions (e.g. Google Translate) and other DOM-mutating
    // extensions rewrite/remove text nodes and race React's streaming SSR reconciler
    // ($RS/completeSegment, $RC/completeBoundary), producing non-actionable errors on
    // hydrating routes (observed on /admin). These are triggered by the visitor's
    // browser, not our code, so we drop them to keep Sentry actionable.
    ignoreErrors: [
      "Cannot read properties of null (reading 'parentNode')",
      "Cannot read properties of null (reading 'removeChild')",
      "Cannot read properties of null (reading 'insertBefore')",
      "Failed to execute 'removeChild' on 'Node'",
      "Failed to execute 'insertBefore' on 'Node'",
      "The node to be removed is not a child of this node",
      "The node before which the new node is to be inserted is not a child of this node",
    ],
    integrations: [
      // Replay default is to render the DOM verbatim. For a portal that
      // shows member names, emails, phone numbers, resume content, WIOA
      // qualification answers, etc., that's a hard-blocking privacy
      // problem if anyone with Sentry access can scrub through replays.
      // Mask everything by default; surface only what we explicitly
      // mark as safe.
      Sentry.replayIntegration({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],
    beforeSend(event, hint) {
      if (isReadOnlyPortalAuditDocument()) return null;
      // Password managers / form fillers inject caret-color and empty border
      // styles before hydrate. Sentry Replay records these as "Hydration Error"
      // on /admin and other portals (JAVASCRIPT-NEXTJS-1) — not actionable app bugs.
      if (isExtensionStyleHydrationNoise(event)) return null;
      // The route-tagged copy from forwardHydrationReport is the one we keep.
      if (isUntaggedForwardedHydrationDuplicate(event, hint)) return null;
      return event;
    },
    beforeSendTransaction(event) {
      return isReadOnlyPortalAuditDocument() ? null : event;
    },
    // Strip PII from breadcrumb URLs before they're stored on Sentry.
    // Auto-captured fetch/navigation breadcrumbs include the full URL,
    // so /forgot-password?email=…, /invite?token=…, etc. would otherwise
    // ship the PII to Sentry's index.
    beforeBreadcrumb(breadcrumb) {
      try {
        const data = breadcrumb.data as { url?: string; from?: string; to?: string } | undefined;
        if (data?.url && typeof data.url === 'string') {
          data.url = scrubUrlForBreadcrumb(data.url);
        }
        if (data?.from && typeof data.from === 'string') {
          data.from = scrubUrlForBreadcrumb(data.from);
        }
        if (data?.to && typeof data.to === 'string') {
          data.to = scrubUrlForBreadcrumb(data.to);
        }
      } catch {
        // never let a scrubber failure drop the breadcrumb
      }
      return breadcrumb;
    },
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  });

  captureRouterTransitionStart = Sentry.captureRouterTransitionStart;
}

function maybeInitSentry(href?: string) {
  if (isReadOnlyPortalAuditDocument()) return;
  if (initPromise) return;
  const pathname = href ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  if (!isPortalRoute(pathname)) return;
  initPromise = initSentry();
}

/** Required by @sentry/nextjs for App Router navigation tracing.
 *  Lazily loads Sentry so marketing pages don't pay the 420KB chunk cost. */
export const onRouterTransitionStart = (href: string) => {
  if (isReadOnlyPortalAuditDocument()) return;
  maybeInitSentry(href);
  captureRouterTransitionStart?.(href, 'push');
};

// Initialize immediately on portal routes (initial page load)
maybeInitSentry();

/**
 * Associate (or clear) the authenticated user on the client Sentry scope.
 * ID ONLY — never pass email, name, or other PII (AUDIT §H-S7 privacy
 * posture mirrored from the replay/breadcrumb scrubbing above).
 *
 * Called by <SentrySetUser> once the root layout resolves the current
 * user server-side, and again with `null` on logout. No-ops when Sentry
 * hasn't been initialized (non-portal routes, non-production, or no DSN)
 * so this never forces the ~420KB chunk to load on marketing pages.
 */
export async function setSentryUser(userId: string | null): Promise<void> {
  if (!dsn || !isProduction || isReadOnlyPortalAuditDocument()) return;
  // If init is already in flight (or about to start on a portal route),
  // wait for it so setUser lands on an initialized client instead of a
  // no-op / racing against Sentry.init.
  if (!initPromise) {
    if (!userId) return; // nothing to clear if we never initialized
    maybeInitSentry();
  }
  await initPromise;
  const Sentry = await import('@sentry/nextjs');
  Sentry.setUser(userId ? { id: userId } : null);
}
