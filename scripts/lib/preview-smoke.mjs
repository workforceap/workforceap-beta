/**
 * Preview smoke (WAP-202): load a handful of pages on a Vercel Preview
 * deployment and fail when the running app does not serve them.
 *
 * CI builds the app, but nothing loads the built site before production. A
 * build can be green while the running app 500s (a missing env var, a
 * DB-dependent layout, a runtime-only import). This module holds the probe
 * decisions so they can be unit-tested; `scripts/preview-smoke.mjs` is the CLI
 * that `.github/workflows/preview-smoke.yml` runs after each Preview deploy.
 *
 * One probe list for production and preview: the hourly production journey
 * smoke (`app/api/cron/smoke-test/route.ts`) owns `PROBES`. That route is app
 * code and this change may not touch it, so `parseRouteProbes` reads the
 * array literal out of the route source and fails closed when it cannot. The
 * preview adds the WAP-202 pages the route does not cover (`PREVIEW_EXTRA_PROBES`).
 * If the route's list is later moved into a shared module, import it here and
 * delete the parser.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import guard from './supabase-project-guard.cjs';

const { DEMO_REF, PROD_REF } = guard;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ROUTE_PROBES_FILE = path.join(ROOT, 'app', 'api', 'cron', 'smoke-test', 'route.ts');

/** Same locale list as lib/i18n/config.ts `APP_LOCALES` (the route strips it the same way). */
const APP_LOCALES = new Set(['en', 'es', 'fr', 'pt']);

const PROBE_KINDS = new Set(['json-health', 'public-page', 'protected-redirect']);

/** A branded `<title>`: lib/marketing/pageTitle.ts and app/layout.tsx both carry the brand. */
const SITE_TITLE = /<title[^>]*>[^<]*(?:WorkforceAP|Workforce Advancement Project)[^<]*<\/title>/i;

/**
 * WAP-202 pages the production route does not probe. `/en` is the localized
 * home (must carry the site title); `/en/program-comparison` is the page
 * AGENTS.md names as the credential-free smoke test.
 */
/** @type {SmokeProbe[]} */
export const PREVIEW_EXTRA_PROBES = [
  { path: '/en', name: 'home-en', kind: 'public-page', titleMarker: true },
  { path: '/en/program-comparison', name: 'program-comparison', kind: 'public-page' },
];

export const DEFAULT_TIMEOUT_MS = 20_000;
export const DEFAULT_ATTEMPTS = 3;
export const DEFAULT_RETRY_DELAY_MS = 5_000;
const MAX_REDIRECTS = 5;

/** Statuses worth a retry on a cold Preview function; anything else is final. */
const TRANSIENT_STATUS = new Set([0, 502, 503, 504]);

/**
 * Extract `PROBES` from the smoke-test route source. Returns
 * `{ ok: true, probes }` or `{ ok: false, reason }`; never guesses.
 *
 * @param {string} source
 * @returns {{ ok: true, probes: SmokeProbe[] } | { ok: false, reason: string }}
 */
export function parseRouteProbes(source) {
  const block = /const PROBES(?:\s*:\s*[\w[\]<>]+)?\s*=\s*\[([\s\S]*?)\n\];/.exec(source);
  if (!block) return { ok: false, reason: 'no `const PROBES = [ ... ];` array in the route source' };
  /** @type {SmokeProbe[]} */
  const probes = [];
  for (const [, body] of block[1].matchAll(/\{([^{}]*)\}/g)) {
    const field = (key) => {
      const m = new RegExp(`\\b${key}\\s*:\\s*(['"\`])((?:(?!\\1).)*)\\1`).exec(body);
      return m ? m[2] : undefined;
    };
    const probe = { path: field('path'), name: field('name'), kind: field('kind') };
    const bodyMarker = field('bodyMarker');
    if (bodyMarker !== undefined) probe.bodyMarker = bodyMarker;
    if (/\brequireRedisRateLimiter\s*:\s*true\b/.test(body)) probe.requireRedisRateLimiter = true;
    if (!probe.path?.startsWith('/') || !probe.name || !PROBE_KINDS.has(probe.kind)) {
      return { ok: false, reason: `unparseable probe entry: {${body.replace(/\s+/g, ' ').trim()}}` };
    }
    probes.push(probe);
  }
  if (probes.length === 0) return { ok: false, reason: 'the PROBES array is empty' };
  return { ok: true, probes };
}

export function loadRouteProbes(file = ROUTE_PROBES_FILE) {
  return parseRouteProbes(readFileSync(file, 'utf8'));
}

/**
 * Route probes first, then the preview extras whose path the route does not already cover.
 *
 * @param {SmokeProbe[]} routeProbes
 * @returns {SmokeProbe[]}
 */
export function buildPreviewProbes(routeProbes) {
  const seen = new Set(routeProbes.map((p) => p.path));
  return [...routeProbes, ...PREVIEW_EXTRA_PROBES.filter((p) => !seen.has(p.path))];
}

/** `https://…` origin with no path, or null. */
export function normalizeOrigin(raw) {
  try {
    const url = new URL(String(raw ?? '').trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** The bypass secret only ever goes to a Vercel deployment host. */
export function isVercelDeploymentOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && /^[a-z0-9-]+\.vercel\.app$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function stripLocale(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length > 0 && APP_LOCALES.has(parts[0])) {
    return parts.length === 1 ? '/' : `/${parts.slice(1).join('/')}`;
  }
  return pathname;
}

/**
 * Vercel Deployment Protection answers 401 with its SSO page, or redirects to
 * vercel.com/sso-api. Either means "we never reached the app".
 */
export function isVercelProtectionResponse(status, headers, body = '') {
  const location = headers.get('location') ?? '';
  if (status >= 300 && status < 400 && /^https:\/\/vercel\.com\/(?:sso-api|login)/i.test(location)) {
    return true;
  }
  if (status !== 401 && status !== 403) return false;
  const cookie = headers.get('set-cookie') ?? '';
  return (
    /_vercel_sso_nonce/i.test(cookie) ||
    /vercel\.com\/sso-api/i.test(body) ||
    /Authentication Required/i.test(body)
  );
}

/** Next's App Router error shell, rendered when a server component throws. */
export function errorBoundaryMarker(body) {
  if (/<html[^>]*\bid=["']__next_error__["']/i.test(body)) return 'Next error shell (__next_error__)';
  if (/Application error: a (?:server|client)-side exception has occurred/i.test(body)) {
    return 'Next "Application error" page';
  }
  return null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * GET `path`, following same-origin redirects by hand so every hop's status is
 * visible (a 500 halfway through a redirect chain is a failure, not a pass).
 */
async function fetchChain(origin, path, ctx) {
  const hops = [];
  let url = new URL(path, origin);
  for (let i = 0; i <= MAX_REDIRECTS; i += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);
    const headers = { 'user-agent': 'workforceap-preview-smoke (github-actions)', accept: 'text/html,application/json' };
    if (ctx.bypassSecret && url.origin === origin && isVercelDeploymentOrigin(origin)) {
      headers['x-vercel-protection-bypass'] = ctx.bypassSecret;
    }
    let res;
    try {
      res = await ctx.fetchImpl(url.href, { method: 'GET', redirect: 'manual', headers, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    const body = await res.text();
    hops.push({ status: res.status, path: `${url.pathname}${url.search}` });
    if (isVercelProtectionResponse(res.status, res.headers, body)) {
      return { hops, protectedByVercel: true, status: res.status, body, url };
    }
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      const next = new URL(location, url);
      if (next.origin !== origin) {
        return { hops, status: res.status, body, url, offOrigin: next.href };
      }
      url = next;
      continue;
    }
    return { hops, status: res.status, body, url };
  }
  return { hops, status: hops.at(-1)?.status ?? 0, body: '', url, tooManyRedirects: true };
}

/** Pure verdict for one probe given its redirect chain. */
export function evaluateProbe(probe, chain) {
  const statuses = chain.hops.map((h) => h.status);
  const serverError = chain.hops.find((h) => h.status >= 500);
  if (serverError) return `HTTP ${serverError.status} at ${serverError.path}`;
  if (chain.tooManyRedirects) return `more than ${MAX_REDIRECTS} redirects (${statuses.join(' → ')})`;
  if (chain.offOrigin) return `redirected off the preview origin (${statuses.join(' → ')})`;

  if (probe.kind === 'protected-redirect') {
    const first = chain.hops[0]?.status;
    if (!(first >= 300 && first < 400)) return `expected a redirect to /login, got HTTP ${first}`;
    const pathOk = stripLocale(chain.url.pathname) === '/login';
    const redirectTo = chain.url.searchParams.get('redirectTo');
    if (!pathOk || redirectTo !== probe.path) {
      return `redirect landed on ${chain.url.pathname}${chain.url.search} (expected /login?redirectTo=${probe.path})`;
    }
    if (chain.status !== 200) return `login page answered HTTP ${chain.status}`;
    const boundary = errorBoundaryMarker(chain.body);
    return boundary ? `login page rendered the ${boundary}` : null;
  }

  if (chain.status !== 200) return `HTTP ${chain.status} (${statuses.join(' → ')})`;
  if (chain.body.length === 0) return 'empty response body';

  if (probe.kind === 'json-health') {
    let parsed;
    try {
      parsed = JSON.parse(chain.body);
    } catch {
      return 'invalid health JSON';
    }
    return parsed?.status === 'ok' ? null : `health status ${String(parsed?.status)}`;
  }

  const boundary = errorBoundaryMarker(chain.body);
  if (boundary) return `rendered the ${boundary}`;
  if (probe.bodyMarker && !chain.body.includes(probe.bodyMarker)) return `missing page marker: ${probe.bodyMarker}`;
  if (probe.titleMarker && !SITE_TITLE.test(chain.body)) return 'missing the site title in <title>';
  return null;
}

/** Facts from `/api/health` and `/api/health/ready` bodies that are worth a line in the summary. */
function healthNotes(probe, chain, expectedSha) {
  const notes = [];
  let parsed;
  try {
    parsed = JSON.parse(chain.body);
  } catch {
    return { notes, mismatch: null };
  }
  let mismatch = null;
  if (typeof parsed?.version === 'string' && expectedSha) {
    if (!expectedSha.startsWith(parsed.version)) {
      mismatch = `serves ${parsed.version}, expected ${expectedSha.slice(0, 7)}`;
    } else {
      notes.push(`serves ${parsed.version}`);
    }
  }
  if (parsed?.supabaseRef === PROD_REF) notes.push('WARNING: wired to the PRODUCTION Supabase project');
  else if (parsed?.supabaseRef === DEMO_REF) notes.push('DEMO Supabase');
  // The production route requires redis; a preview may legitimately run without Upstash.
  if (probe.requireRedisRateLimiter && typeof parsed?.rateLimiter === 'string') {
    notes.push(`rateLimiter=${parsed.rateLimiter}`);
  }
  return { notes, mismatch };
}

/**
 * @typedef {{ status: number, headers: { get(name: string): string | null }, text(): Promise<string> }} SmokeResponse
 * @typedef {(url: string, init: { method: string, redirect: string, headers: Record<string, string>, signal: AbortSignal }) => Promise<SmokeResponse>} SmokeFetch
 * @typedef {{ path: string, name: string, kind: string, bodyMarker?: string, titleMarker?: boolean, requireRedisRateLimiter?: boolean }} SmokeProbe
 * @typedef {SmokeProbe & { ok: boolean, status: number, reason?: string, chain?: string, durationMs?: number, attempts?: number, notes?: string[] }} SmokeResult
 * @typedef {{ result: 'pass' | 'fail' | 'protected', checked: number, results: SmokeResult[] }} SmokeOutcome
 */

/**
 * Run every probe against `origin`. Resolves to
 * `{ result: 'pass' | 'fail' | 'protected', results, checked }`.
 * `protected` means Vercel Deployment Protection answered instead of the app
 * and no (or a wrong) bypass secret was supplied.
 *
 * @param {{
 *   origin: string,
 *   probes: SmokeProbe[],
 *   fetchImpl?: SmokeFetch,
 *   bypassSecret?: string,
 *   expectedSha?: string,
 *   timeoutMs?: number,
 *   attempts?: number,
 *   retryDelayMs?: number,
 * }} options
 * @returns {Promise<SmokeOutcome>}
 */
export async function runPreviewSmoke({
  origin,
  probes,
  fetchImpl = /** @type {SmokeFetch} */ (/** @type {unknown} */ (globalThis.fetch)),
  bypassSecret = '',
  expectedSha = '',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  attempts = DEFAULT_ATTEMPTS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
}) {
  const ctx = { fetchImpl, bypassSecret, timeoutMs };
  /** @type {SmokeResult[]} */
  const results = [];
  for (const probe of probes) {
    let chain;
    let reason;
    let tries = 0;
    for (tries = 1; tries <= attempts; tries += 1) {
      const started = Date.now();
      try {
        chain = await fetchChain(origin, probe.path, ctx);
      } catch (error) {
        chain = {
          hops: [{ status: 0, path: probe.path }],
          status: 0,
          body: '',
          url: new URL(probe.path, origin),
          error: error?.name === 'AbortError' ? `timed out after ${timeoutMs}ms` : String(error?.message ?? error),
        };
      }
      chain.durationMs = Date.now() - started;
      if (chain.protectedByVercel) break;
      reason = chain.error ?? evaluateProbe(probe, chain);
      const lastStatus = chain.hops.at(-1)?.status ?? 0;
      if (!reason || !TRANSIENT_STATUS.has(lastStatus) || tries === attempts) break;
      await sleep(retryDelayMs);
    }

    if (chain.protectedByVercel) {
      return {
        result: 'protected',
        checked: results.length,
        results: [...results, { ...probe, ok: false, status: chain.status, reason: 'Vercel Deployment Protection answered, not the app' }],
      };
    }

    /** @type {SmokeResult} */
    const entry = {
      ...probe,
      ok: !reason,
      status: chain.status,
      chain: chain.hops.map((h) => h.status).join(' → '),
      durationMs: chain.durationMs,
      attempts: Math.min(tries, attempts),
      notes: [],
    };
    if (probe.kind === 'json-health' && chain.status === 200) {
      const { notes, mismatch } = healthNotes(probe, chain, expectedSha);
      entry.notes = notes;
      if (mismatch && !reason) reason = mismatch;
      entry.ok = !reason;
    }
    if (reason) entry.reason = reason;
    results.push(entry);
  }
  return { result: results.every((r) => r.ok) ? 'pass' : 'fail', checked: results.length, results };
}

/** Markdown table for `$GITHUB_STEP_SUMMARY`. Never includes the origin. */
export function formatSummary(outcome, { shortSha = '' } = {}) {
  const icon = { pass: 'PASS', fail: 'FAIL', protected: 'SKIPPED' }[outcome.result];
  const lines = [
    `### Preview smoke: ${icon}${shortSha ? ` (${shortSha})` : ''}`,
    '',
    '| Probe | Path | Kind | Result | Status chain | Time | Notes |',
    '| -- | -- | -- | -- | -- | -- | -- |',
  ];
  for (const r of outcome.results) {
    const notes = [...(r.notes ?? []), ...(r.attempts > 1 ? [`${r.attempts} attempts`] : [])].join('; ');
    lines.push(
      `| ${r.name} | \`${r.path}\` | ${r.kind} | ${r.ok ? 'ok' : `**${r.reason}**`} | ${r.chain ?? r.status} | ${r.durationMs ?? '-'}ms | ${notes} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}
