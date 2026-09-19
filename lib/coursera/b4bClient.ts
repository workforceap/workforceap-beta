/**
 * Coursera For Business (B4B) typed REST client.
 *
 * Intentionally does NOT `import 'server-only'`: the module uses Buffer
 * and process.env so it would never run in the browser anyway, and
 * dropping the marker makes the helper unit-testable under
 * `node --test` / `tsx` (matches the testAccountHeuristic.ts /
 * csvImport.ts pattern).
 *
 * Wraps the production B4B REST API with:
 *   - module-scope OAuth token cache (refresh when within 60s of expiry)
 *   - typed responses for the 6 endpoints we use today
 *   - automatic Authorization header injection on every request
 *   - structured `B4BApiError` on non-2xx responses
 *
 * Endpoints (all confirmed live on prod against org "Workforce Advancement
 * Project" / id `8R2W4McwOMWJp9cCBV1kvw`):
 *
 *   GET  /api/businesses.v1/{orgId}                                     → org info
 *   GET  /api/businesses.v1/{orgId}/users                                → roster
 *   GET  /api/businesses.v1/{orgId}/programs?excludeContent=true         → programs
 *   GET  /api/businesses.v1/{orgId}/contents                             → catalog
 *   GET  /api/businesses.v1/{orgId}/enrollmentReports                    → progress
 *   GET  /api/businesses.v1/{orgId}/courseGradebookReports?q=search      → grades
 *
 * Write endpoints (gated behind User.courseraEnrollmentApproved at the route
 * layer — every call here costs a paid Coursera seat):
 *
 *   POST /api/businesses.v1/{orgId}/programs/{programId}/invitations          → email invite
 *   POST /api/businesses.v1/{orgId}/programs/{programId}/memberships          → add to program
 *   POST /api/businesses.v1/{orgId}/programs/{programId}/programEnrollments   → enroll/unenroll course
 *
 * Writes never throw on 4xx — they return a discriminated `{ ok, data?, error?, status? }`
 * union so the calling state machine can route on the status code (e.g. swallow
 * a 400 "already enrolled" vs surface a 403 "no permission").
 *
 * Auth: `POST https://api.coursera.com/oauth2/client_credentials/token`
 * with HTTP Basic (clientId:clientSecret) and form body
 * `grant_type=client_credentials`. Returns a Bearer token good for ~1799s.
 *
 * Reads env on each call (never cached globally) so credentials can be
 * rotated without a process restart. Throws if either credential is missing.
 */

import { normalizeCourseraPageOffset } from './enrollmentReportFields';

const DEFAULT_OAUTH_URL = 'https://api.coursera.com/oauth2/client_credentials/token';
const DEFAULT_API_BASE = 'https://api.coursera.com/ent';

const TOKEN_REFRESH_SAFETY_MS = 60_000;

// Allow tests to swap the global fetch.
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

let cachedToken: { token: string; expiresAt: number } | null = null;
let injectedFetch: FetchLike | null = null;

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

/** Coursera-style paging envelope. Both fields are optional in practice. */
export type B4BPaging = {
  /** Numeric offset normalized from Coursera's decimal-string wire value. */
  next?: number;
  total?: number;
};

export type B4BUser = {
  id?: string;
  externalId?: string;
  email?: string;
  fullName?: string;
  membershipState?: string;
  membershipProgramIds?: string[];
  joinedAt?: number;
  lastLoginAt?: number;
};

export type B4BProgram = {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  state?: string;
  /** When `excludeContent=false` was passed; we always pass true so this is rare. */
  contents?: unknown[];
  /** Number of courses/items in the program (present when `excludeContent=false`). */
  contentCount?: number;
};

export type B4BContent = {
  id: string;
  contentType?: string;
  name?: string;
  slug?: string;
  description?: string;
};

export type B4BEnrollmentReport = {
  id?: string;
  programId: string;
  externalId: string; // typically the learner's email
  contentId: string;
  contentType?: string;
  isCompleted: boolean;
  /** Documented epoch-millisecond activity field. */
  lastActivityAt?: number;
  /** Legacy response field, also epoch milliseconds. */
  lastActivity?: number;
  enrolledAt?: number;
  overallProgress?: number;
  membershipState?: string;
  updatedAt?: number;
  contentName?: string;
  contentSlug?: string;
  fullName?: string;
  email?: string;
  programName?: string;
  programSlug?: string;
  /** Learning Path ("collection") the row was taken under; see lib/content/coursera/learningPaths.ts. */
  collectionId?: string | null;
  collectionName?: string | null;
};

export type B4BGradebookReport = {
  externalId?: string;
  email?: string;
  fullName?: string;
  programId?: string;
  courseId?: string;
  courseName?: string;
  /**
   * Item-level rolled-up percentage (0–100). Finer-grained than
   * `enrollmentReports.overallProgress` — surfaces non-zero values when a
   * learner has done a single quiz/assignment but the course-level rollup
   * still rounds to 0. We prefer this when present in `syncUserFromB4B`.
   */
  overallProgress?: number;
  /** Approx total learning hours the learner has clocked so far. */
  approxTotalLearningHrs?: number;
  /** Legacy/aggregate hours field; some Coursera responses use this name. */
  totalLearningHours?: number;
  /** Epoch ms of the learner's last activity in this course. */
  lastActivityAt?: number;
  collectionId?: string | null;
  /** e.g. "Project Management Professional Certificate". */
  collectionName?: string | null;
  /** Raw item-level breakdown (Coursera shape varies). */
  items?: Array<Record<string, unknown>>;
};

export type B4BOrgInfo = {
  id: string;
  name: string;
  slug?: string;
  description?: string;
};

export type B4BPageEnvelope<T> = {
  elements: T[];
  paging: B4BPaging;
  /** Coursera's `linked` block — rarely used by callers but preserved for debugging. */
  linked?: Record<string, unknown>;
};

/* ------------------------------------------------------------------ */
/*  Errors                                                             */
/* ------------------------------------------------------------------ */

export class B4BApiError extends Error {
  readonly status: number;
  readonly body: string;
  readonly url: string;

  constructor(args: { status: number; body: string; url: string; message?: string }) {
    super(
      args.message ??
        `Coursera B4B API error (${args.status}) at ${args.url}: ${args.body.slice(0, 240)}`,
    );
    this.name = 'B4BApiError';
    this.status = args.status;
    this.body = args.body;
    this.url = args.url;
  }
}

export class B4BConfigurationError extends Error {
  readonly code = 'COURSERA_ORG_NOT_CONFIGURED';

  constructor() {
    super('COURSERA_ORG_ID must be configured before using Coursera B4B.');
    this.name = 'B4BConfigurationError';
  }
}

/* ------------------------------------------------------------------ */
/*  Internals                                                          */
/* ------------------------------------------------------------------ */

/**
 * Reads credentials from env at the moment of the first OAuth fetch.
 * We deliberately don't throw at module-load: this module gets imported
 * by the admin pages, by the self-test, and by tests that mock fetch.
 * Module-load throws would break test discovery and make the import a
 * landmine. Instead the first real network call surfaces the error.
 */
function getCredentials() {
  const clientId = process.env.COURSERA_B4B_CLIENT_ID?.trim();
  const clientSecret = process.env.COURSERA_B4B_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      '[b4bClient] COURSERA_B4B_CLIENT_ID and COURSERA_B4B_CLIENT_SECRET must be set',
    );
  }
  return { clientId, clientSecret };
}

function getApiBase(): string {
  // COURSERA_API_BASE_URL is shared with the legacy skillset client
  // (lib/coursera/configCore.ts), whose base ends in `/api/rest/v1`. Appending
  // this client's `/api/businesses.v1/...` paths to that base 404s every call,
  // so B4B reads its own var first and ignores a legacy-shaped fallback.
  const b4b = process.env.COURSERA_B4B_API_BASE_URL?.trim();
  if (b4b) return b4b.replace(/\/$/, '');
  const legacy = process.env.COURSERA_API_BASE_URL?.trim();
  if (legacy && !/\/api\/rest\/v\d+\/?$/.test(legacy)) return legacy.replace(/\/$/, '');
  return DEFAULT_API_BASE;
}

function getOauthUrl(): string {
  return process.env.COURSERA_OAUTH_TOKEN_URL?.trim() || DEFAULT_OAUTH_URL;
}

export function getB4BOrgId(): string {
  const orgId = process.env.COURSERA_ORG_ID?.trim();
  if (!orgId) throw new B4BConfigurationError();
  return orgId;
}

function fetchImpl(): FetchLike {
  if (injectedFetch) return injectedFetch;
   
  return (globalThis as any).fetch as FetchLike;
}

const TRANSIENT_B4B_STATUSES = new Set([429, 502, 503, 504]);
const B4B_FETCH_MAX_ATTEMPTS = 3;
const B4B_FETCH_BASE_DELAY_MS = 400;
// Hard per-attempt deadline. The B4B HTTP calls had NO timeout, so a slow/hung
// upstream (Coursera enrollmentReports) would block the awaiting code forever —
// including server-rendered dashboard/portal pages that call B4B during render,
// which then hit Vercel's function maxDuration and 504 (incident 2026-06-18).
// A bounded timeout converts a hang into an error so the caller's existing
// fail-soft path (e.g. fetchLearnerProgressFromB4B returns an empty map) runs.
// Tunable in prod without a deploy via COURSERA_B4B_TIMEOUT_MS; read at call
// time (not module load) so tests can override it per-case.
const B4B_ATTEMPT_TIMEOUT_DEFAULT_MS = 4000;

function b4bAttemptTimeoutMs(): number {
  const raw = Number(process.env.COURSERA_B4B_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : B4B_ATTEMPT_TIMEOUT_DEFAULT_MS;
}

class B4BTimeoutError extends Error {
  constructor(ms: number) {
    super(`Coursera B4B request timed out after ${ms}ms`);
    this.name = 'B4BTimeoutError';
  }
}

function isTransientHttpStatus(status: number): boolean {
  return TRANSIENT_B4B_STATUSES.has(status);
}

/** Reject if `operation` doesn't settle within `ms`. Unblocks the awaiter even
 * if the underlying fetch never resolves (the orphaned fetch is harmless on a
 * serverless function that's about to return). */
function withAttemptTimeout(operation: () => Promise<Response>, ms: number): Promise<Response> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new B4BTimeoutError(ms)), ms);
  });
  return Promise.race([
    operation().finally(() => clearTimeout(timer)),
    timeout,
  ]);
}

/**
 * Retries a few times on rate limits, upstream 5xx, and network failures.
 * Used for OAuth + all B4B REST reads. Writes keep a single attempt so we
 * never double-submit a Coursera enrollment POST after a timeout.
 *
 * Each attempt is bounded by b4bAttemptTimeoutMs(). A timeout is NOT retried —
 * a hung upstream won't recover within one request, and retrying would stack
 * multiple deadlines and re-introduce the long render block we're guarding
 * against. Transient HTTP statuses and network errors retry as before.
 */
async function fetchWithTransientRetry(operation: () => Promise<Response>): Promise<Response> {
  let lastError: unknown;
  const timeoutMs = b4bAttemptTimeoutMs();
  for (let attempt = 1; attempt <= B4B_FETCH_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await withAttemptTimeout(operation, timeoutMs);
      if (isTransientHttpStatus(response.status) && attempt < B4B_FETCH_MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, B4B_FETCH_BASE_DELAY_MS * attempt));
        continue;
      }
      return response;
    } catch (err) {
      lastError = err;
      // Don't retry a timeout — bound total wall-clock so callers in a render
      // path fail-soft quickly instead of stacking 3× the deadline.
      if (err instanceof B4BTimeoutError) {
        throw err;
      }
      if (attempt < B4B_FETCH_MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, B4B_FETCH_BASE_DELAY_MS * attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Coursera B4B fetch failed');
}

/**
 * Exported for `b4bSync.ts` cron OAuth + enrollment report pulls (same fetch
 * implementation + retry policy as the typed client, without doubling config).
 */
export async function fetchCourseraWithTransientRetry(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  return fetchWithTransientRetry(() => fetchImpl()(url, init ?? {}));
}

/** Test-only: substitute fetch + reset the cached token. */
export function _setFetchForTesting(impl: FetchLike | null) {
  injectedFetch = impl;
  cachedToken = null;
}

/** Test-only: inspect the current token cache state. */
export function _getCachedTokenForTesting(): { token: string; expiresAt: number } | null {
  return cachedToken;
}

/** Test-only: clear the token cache. */
export function _resetTokenCacheForTesting() {
  cachedToken = null;
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + TOKEN_REFRESH_SAFETY_MS) {
    return cachedToken.token;
  }

  const { clientId, clientSecret } = getCredentials();
  const url = getOauthUrl();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetchWithTransientRetry(() =>
    fetchImpl()(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
    }),
  );

  const text = await response.text();
  if (!response.ok) {
    throw new B4BApiError({
      status: response.status,
      body: text,
      url,
      message: `Coursera B4B OAuth failed (${response.status}): ${text.slice(0, 240)}`,
    });
  }

  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new B4BApiError({
      status: response.status,
      body: text,
      url,
      message: 'Coursera B4B OAuth response was not valid JSON',
    });
  }

  const accessToken = typeof json.access_token === 'string' ? json.access_token : '';
  if (!accessToken) {
    throw new B4BApiError({
      status: response.status,
      body: text,
      url,
      message: 'Coursera B4B OAuth response missing access_token',
    });
  }
  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 1800;

  cachedToken = {
    token: accessToken,
    expiresAt: now + expiresIn * 1000,
  };

  return accessToken;
}

/**
 * Internal helper. Issues a request against the B4B API with auto auth.
 * Path may be absolute (`https://...`) or relative to the API base
 * (`/api/businesses.v1/...`).
 */
export async function fetchB4B(path: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith('http://') || path.startsWith('https://')
    ? path
    : `${getApiBase()}${path.startsWith('/') ? '' : '/'}${path}`;

  const method = (init.method ?? 'GET').toUpperCase();
  const isSafeRead = method === 'GET' || method === 'HEAD';

  const issue = async (): Promise<Response> => {
    const token = await getAccessToken();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('Accept', 'application/json');
    const run = () => fetchImpl()(url, { ...init, headers });
    // Never retry POST/PUT writes on transient errors — Coursera may have
    // applied the mutation before the connection dropped, and a retry would
    // duplicate side effects.
    return isSafeRead ? fetchWithTransientRetry(run) : run();
  };

  const servedFromCache =
    cachedToken !== null && cachedToken.expiresAt > Date.now() + TOKEN_REFRESH_SAFETY_MS;
  const response = await issue();

  // 401 on a cached token means Coursera revoked/rotated it server-side; the
  // cache would otherwise keep failing every call until expiry (~29 min).
  // Auth is rejected before the mutation runs, so one re-mint retry is safe
  // for writes too. A 401 on a freshly minted token is a real credential
  // problem — surface it instead of looping.
  if (response.status === 401 && servedFromCache) {
    cachedToken = null;
    return issue();
  }
  return response;
}

async function getJsonOrThrow<T>(path: string): Promise<T> {
  const response = await fetchB4B(path);
  const text = await response.text();
  if (!response.ok) {
    throw new B4BApiError({ status: response.status, body: text, url: path });
  }
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new B4BApiError({
      status: response.status,
      body: text,
      url: path,
      message: 'Coursera B4B response was not valid JSON',
    });
  }
}

function appendPagination(
  params: URLSearchParams,
  opts: { start?: number; limit?: number } | undefined,
) {
  if (opts?.start != null && Number.isFinite(opts.start) && opts.start >= 0) {
    params.set('start', String(opts.start));
  }
  if (opts?.limit != null && Number.isFinite(opts.limit) && opts.limit > 0) {
    params.set('limit', String(opts.limit));
  }
}

function buildOrgPath(suffix: string): string {
  const orgId = encodeURIComponent(getB4BOrgId());
  return `/api/businesses.v1/${orgId}${suffix}`;
}

function envelopeFrom<T>(payload: unknown): B4BPageEnvelope<T> {
  const obj =
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const elements = Array.isArray(obj.elements) ? (obj.elements as T[]) : [];
  const rawPaging = obj.paging && typeof obj.paging === 'object'
    ? obj.paging as Record<string, unknown> : {};
  const paging: B4BPaging = {
    ...(rawPaging.next != null ? { next: normalizeCourseraPageOffset(rawPaging.next) } : {}),
    ...(typeof rawPaging.total === 'number' && Number.isFinite(rawPaging.total) && rawPaging.total >= 0
      ? { total: rawPaging.total } : {}),
  };
  const linked =
    obj.linked && typeof obj.linked === 'object'
      ? (obj.linked as Record<string, unknown>)
      : undefined;
  return { elements, paging, linked };
}

/* ------------------------------------------------------------------ */
/*  Public methods                                                     */
/* ------------------------------------------------------------------ */

export async function getOrgInfo(): Promise<B4BOrgInfo> {
  return getJsonOrThrow<B4BOrgInfo>(buildOrgPath(''));
}

export async function listUsers(
  opts: { start?: number; limit?: number } = {},
): Promise<B4BPageEnvelope<B4BUser>> {
  const params = new URLSearchParams();
  appendPagination(params, opts);
  const qs = params.toString();
  const path = buildOrgPath(`/users${qs ? `?${qs}` : ''}`);
  return envelopeFrom<B4BUser>(await getJsonOrThrow(path));
}

export async function listPrograms(
  opts: { start?: number; limit?: number; excludeContent?: boolean } = {},
): Promise<B4BPageEnvelope<B4BProgram>> {
  const params = new URLSearchParams();
  // The B4B YAML treats excludeContent=true as the standard form for the
  // listing endpoint; when omitted Coursera embeds full content trees and
  // the response can be enormous. Default true unless the caller opts out.
  params.set('excludeContent', opts.excludeContent === false ? 'false' : 'true');
  appendPagination(params, opts);
  const path = buildOrgPath(`/programs?${params.toString()}`);
  return envelopeFrom<B4BProgram>(await getJsonOrThrow(path));
}

export async function listContents(
  opts: { start?: number; limit?: number } = {},
): Promise<B4BPageEnvelope<B4BContent>> {
  const params = new URLSearchParams();
  appendPagination(params, opts);
  const qs = params.toString();
  const path = buildOrgPath(`/contents${qs ? `?${qs}` : ''}`);
  return envelopeFrom<B4BContent>(await getJsonOrThrow(path));
}

/**
 * Per-learner per-course progress from Coursera Business (`enrollmentReports`).
 *
 * When OAuth/env is missing or Coursera errors, callers such as
 * `fetchLearnerProgressFromB4B` catch and return an empty map — member UI then
 * falls back to local `CourseProgress` (xAPI / sync).
 *
 * The Coursera enrollmentReports endpoint supports several `q` filter modes:
 *   - default (no q): returns the full report
 *   - q=byProgramId & programId=XYZ: scope to a single program
 *   - q=byUserProgramId & programId=XYZ & externalId=email: single learner in program
 *
 * The `byUserProgramId` mode is the one we want for the reconcile UI's
 * per-row "fix enrollment" verification path.
 */
export async function getEnrollmentReports(
  opts: {
    start?: number;
    limit?: number;
    byProgramId?: boolean;
    byUserProgramId?: boolean;
    programId?: string;
    externalId?: string;
  } = {},
): Promise<B4BPageEnvelope<B4BEnrollmentReport>> {
  const params = new URLSearchParams();
  if (opts.byUserProgramId) {
    params.set('q', 'byUserProgramId');
    if (opts.programId) params.set('programId', opts.programId);
    if (opts.externalId) params.set('externalId', opts.externalId);
  } else if (opts.byProgramId) {
    params.set('q', 'byProgramId');
    if (opts.programId) params.set('programId', opts.programId);
  }
  appendPagination(params, opts);
  const qs = params.toString();
  const path = buildOrgPath(`/enrollmentReports${qs ? `?${qs}` : ''}`);
  return envelopeFrom<B4BEnrollmentReport>(await getJsonOrThrow(path));
}

/**
 * Item-level grading + total hours.
 *
 * Coursera requires `q=search` with at least one of programId / courseId /
 * emailOrExternalId to be present. We pass through whatever the caller
 * supplies and let the API validate.
 */
export async function getCourseGradebookReports(
  opts: {
    programId?: string;
    courseId?: string;
    emailOrExternalId?: string;
    start?: number;
    limit?: number;
  } = {},
): Promise<B4BPageEnvelope<B4BGradebookReport>> {
  const params = new URLSearchParams();
  params.set('q', 'search');
  if (opts.programId) params.set('programId', opts.programId);
  if (opts.courseId) params.set('courseId', opts.courseId);
  if (opts.emailOrExternalId) params.set('emailOrExternalId', opts.emailOrExternalId);
  appendPagination(params, opts);
  const path = buildOrgPath(`/courseGradebookReports?${params.toString()}`);
  return envelopeFrom<B4BGradebookReport>(await getJsonOrThrow(path));
}

/* ------------------------------------------------------------------ */
/*  Write endpoints                                                    */
/* ------------------------------------------------------------------ */

/**
 * Coursera's response shape for the three write endpoints is loosely
 * documented and varies by case (enroll vs unenroll vs membership).
 * We capture the fields the calling state machine actually reads
 * (`id`, `externalId`, `state`, `message`) and preserve the rest as a
 * passthrough Record so callers + tests can introspect without us
 * re-versioning the type every time Coursera adds a field.
 */
export type B4BInvitation = {
  id?: string;
  externalId?: string;
  email?: string;
  state?: string;
  invitedAt?: number;
} & Record<string, unknown>;

export type B4BMembership = {
  id?: string;
  externalId?: string;
  email?: string;
  state?: string;
  programId?: string;
  joinedAt?: number;
} & Record<string, unknown>;

export type B4BEnrollment = {
  id?: string;
  externalId?: string;
  contentId?: string;
  contentType?: string;
  action?: string;
  state?: string;
  enrolledAt?: number;
} & Record<string, unknown>;

/** Discriminated-union return shape used by all three write methods. */
export type B4BWriteResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; body?: string };

async function postJson<T>(
  path: string,
  body: unknown,
): Promise<B4BWriteResult<T>> {
  const response = await fetchB4B(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // Non-JSON 2xx is rare but possible; surface it as a soft error
      // rather than crashing the route handler.
      if (response.ok) {
        return {
          ok: false,
          status: response.status,
          error: 'Coursera B4B write succeeded but response was not valid JSON',
          body: text,
        };
      }
    }
  }
  if (!response.ok) {
    // Try to surface Coursera's `message` / `errorCode` field if present.
    let message = `Coursera B4B write failed (${response.status})`;
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      const msg = typeof obj.message === 'string' ? obj.message : null;
      const code = typeof obj.errorCode === 'string' ? obj.errorCode : null;
      if (msg) message = msg;
      else if (code) message = code;
    }
    return {
      ok: false,
      status: response.status,
      error: message,
      body: text || undefined,
    };
  }
  return {
    ok: true,
    status: response.status,
    data: (parsed ?? {}) as T,
  };
}

/**
 * Send a Coursera-branded invitation email to `body.email`. Coursera will:
 *   1. Send an email with a sign-up + program-join link
 *   2. On click, create a Coursera account (if needed) tied to the
 *      `externalId` we pass (we standardize on the WAP email)
 *   3. Auto-add the user to the program
 *
 * This is the entry point for users who don't yet have a Coursera account.
 * After they accept, our `listUsers` lookup will return them and the state
 * machine in `/api/member/coursera/enroll-in-course` can proceed straight
 * to `enrollUserInCourse` (membership is granted by accepting the invite).
 */
export async function inviteUserToProgram(
  orgId: string,
  programId: string,
  body: {
    externalId: string;
    fullName?: string;
    email: string;
    sendEmail?: boolean;
  },
): Promise<B4BWriteResult<B4BInvitation>> {
  const path =
    `/api/businesses.v1/${encodeURIComponent(orgId)}` +
    `/programs/${encodeURIComponent(programId)}/invitations`;
  return postJson<B4BInvitation>(path, {
    externalId: body.externalId,
    fullName: body.fullName,
    email: body.email,
    // Coursera accepts `sendEmail` as the documented flag; default true
    // because the whole point of this call is to ask Coursera to email
    // the learner. Tests can pass false to suppress for fixture data.
    sendEmail: body.sendEmail ?? true,
  });
}

/**
 * Add a user (who already has a Coursera account in our roster) to a
 * specific program. Used when `listUsers` finds the user but their
 * `membershipProgramIds` doesn't include the active program — typically
 * a multi-program WAP member who joined Program A and is now being
 * enrolled in Program B.
 */
export async function createProgramMembership(
  orgId: string,
  programId: string,
  body: {
    externalId: string;
    fullName?: string;
    email: string;
    sendWelcomeEmail?: boolean;
  },
): Promise<B4BWriteResult<B4BMembership>> {
  const path =
    `/api/businesses.v1/${encodeURIComponent(orgId)}` +
    `/programs/${encodeURIComponent(programId)}/memberships`;
  return postJson<B4BMembership>(path, {
    externalId: body.externalId,
    fullName: body.fullName,
    email: body.email,
    // Default false: the welcome email is noisy when we then immediately
    // enroll the user in a course. The state-machine route uses our own
    // "Enrolled — refresh to see progress" toast instead.
    sendWelcomeEmail: body.sendWelcomeEmail ?? false,
  });
}

/**
 * Toggle a user's enrollment in a specific Course or Specialization
 * inside a program. `action: 'ENROLL'` is the happy path; `'UNENROLL'`
 * is reserved for admin-driven seat reclamation.
 *
 * Coursera returns 400 with errorCode `ALREADY_ENROLLED` when re-enrolling;
 * the calling route swallows that as `{ status: 'already-enrolled' }`.
 */
export async function enrollUserInCourse(
  orgId: string,
  programId: string,
  body: {
    externalId: string;
    contentType: 'Course' | 'Specialization';
    contentId: string;
    action: 'ENROLL' | 'UNENROLL';
  },
): Promise<B4BWriteResult<B4BEnrollment>> {
  const path =
    `/api/businesses.v1/${encodeURIComponent(orgId)}` +
    `/programs/${encodeURIComponent(programId)}/programEnrollments`;
  return postJson<B4BEnrollment>(path, {
    externalId: body.externalId,
    contentType: body.contentType,
    contentId: body.contentId,
    action: body.action,
  });
}

/* ------------------------------------------------------------------ */
/*  Convenience: paginate-until-exhausted                              */
/* ------------------------------------------------------------------ */

/**
 * Drains a paginated B4B endpoint into a single array.
 *
 * Coursera's paging is `{ next?: number, total?: number }` plus the count
 * of returned `elements`. We stop when:
 *   - the page came back empty, OR
 *   - `start + elements.length >= total`, OR
 *   - we exceed `safetyCap` pages (defensive, ~1M users).
 */
export async function listAllUsers(opts: { pageLimit?: number; safetyCap?: number } = {}) {
  const pageLimit = opts.pageLimit ?? 1000;
  const safetyCap = opts.safetyCap ?? 1000;
  const all: B4BUser[] = [];
  let start = 0;
  let pages = 0;

  while (pages < safetyCap) {
    pages += 1;
    const page = await listUsers({ start, limit: pageLimit });
    if (page.elements.length === 0) break;
    all.push(...page.elements);
    const total = page.paging.total ?? 0;
    if (total > 0 && start + page.elements.length >= total) break;
    if (page.elements.length < pageLimit) break;
    start += page.elements.length;
  }

  return { elements: all, pagesFetched: pages };
}
