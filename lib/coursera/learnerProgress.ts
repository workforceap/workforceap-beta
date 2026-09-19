/**
 * Coursera-authoritative learner progress (B4B enrollmentReports).
 *
 * Member-facing UI treats `GET …/enrollmentReports` as the primary source for
 * completion % (`overallProgress`, `isCompleted`). Local `CourseProgress`
 * rows remain populated from xAPI (and sync jobs) for audit, diagnostics,
 * grades, and fallback when B4B is unreachable — see `loadMemberProgramTrainingView`.
 *
 * Design constraints (per #1077):
 *   - Don't import 'server-only': makes the module unit-testable under
 *     `node --test` / `tsx`, matching the b4bClient.ts pattern.
 *   - Cache per-(email, programId) results in Redis for 30 minutes so a single
 *     page render — and any nearby admin pulls — don't fan out into a swarm
 *     of B4B requests against the shared OAuth quota.
 *   - Fail soft: if B4B is unreachable, return an empty map so the
 *     caller falls back to local rows (the historic behavior).
 *   - Never write to the DB from a render path. Background sync (#1076)
 *     is the only writer.
 */

import {
  getEnrollmentReports,
  B4BConfigurationError,
  getB4BOrgId,
  listPrograms,
  type B4BEnrollmentReport,
  type B4BProgram,
} from './b4bClient';
import { getCacheOrFetch, invalidateCache } from '@/lib/cache';
import { enrollmentActivityMilliseconds, nextEnrollmentReportStart } from './enrollmentReportFields';

const PROGRAM_LIST_TTL_SECONDS = 60 * 60; // 1 hour
const LEARNER_PROGRESS_TTL_SECONDS = 30 * 60; // 30 minutes
const MAX_PROVIDER_PAGES = 10;
const LEARNER_REQUEST_BUDGET_MS = 8_000;

class LearnerProgressDeadline extends Error {}

async function withinLearnerDeadline<T>(operation: () => Promise<T>, deadline: number): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new LearnerProgressDeadline('Coursera learner read reached its time limit');
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new LearnerProgressDeadline('Coursera learner read reached its time limit')), remaining);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

export type LearnerProgressEntry = {
  contentId: string;
  contentType: 'Course' | 'Specialization' | 'Video';
  programId: string;
  isCompleted: boolean;
  /** 0-100, authoritative from Coursera. */
  overallProgress: number;
  lastActivityAt: Date | null;
};

export type LearnerProgressByContent = Map<string, LearnerProgressEntry> & {
  /** Partial reads can display individual facts, but cannot supply a program average. */
  coverage?: 'complete' | 'capped' | 'unavailable';
};

function markLearnerCoverageCapped(result: LearnerProgressByContent): void {
  // A limit reached after an earlier program failed must not erase that failure.
  if (result.coverage !== 'unavailable') result.coverage = 'capped';
}

/** Serialize a LearnerProgressByContent Map for Redis JSON storage. */
function serializeProgress(map: LearnerProgressByContent) {
  return { entries: Array.from(map.entries()), coverage: map.coverage ?? 'unavailable' };
}

/** Deserialize Redis JSON back to a LearnerProgressByContent Map. */
function deserializeProgress(data: unknown): LearnerProgressByContent {
  const map: LearnerProgressByContent = new Map();
  const payload = data && typeof data === 'object' && !Array.isArray(data)
    ? data as { entries?: unknown; coverage?: unknown } : null;
  const entries = payload?.entries ?? data;
  map.coverage = payload?.coverage === 'complete' || payload?.coverage === 'capped'
    ? payload.coverage : 'unavailable';
  if (!Array.isArray(entries)) return map;
  for (const item of entries) {
    if (Array.isArray(item) && item.length === 2) {
      const [key, entry] = item as [string, LearnerProgressEntry];
      const activity = entry.lastActivityAt ? new Date(entry.lastActivityAt) : null;
      map.set(key, {
        ...entry,
        lastActivityAt: activity && Number.isFinite(activity.getTime()) ? activity : null,
      });
    }
  }
  return map;
}

/** Stable cache key: lowercase email + programId scope tag. */
function learnerCacheKey(email: string, programId: string | undefined): string {
  return `${email.trim().toLowerCase()}::${programId ?? '*'}`;
}

/* ------------------------------------------------------------------ */
/*  Test helpers                                                       */
/* ------------------------------------------------------------------ */

/** Wipe both caches. Test-only. */
export function _resetLearnerProgressCachesForTesting() {
  // No-op: Redis cache is external and tests mock the client.
}

/** Inspect the per-learner cache. Test-only. */
export function _getLearnerCacheEntryForTesting(
  _email: string,
  _programId: string | undefined,
): undefined {
  // Redis cache is external; tests verify behavior via mock call counts.
  return undefined;
}

/**
 * Drop cached B4B progress for one learner (all program scopes).
 * Call after `syncUserFromB4B` / cron writes so the member dashboard and any
 * server-render path using `fetchLearnerProgressFromB4B` sees fresh Coursera
 * numbers on the next fetch instead of waiting out the 30-minute TTL.
 */
export async function invalidateLearnerProgressCacheForEmail(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;
  await invalidateCache(`coursera:learner:${normalized}::*`);
}

/* ------------------------------------------------------------------ */
/*  Internals                                                          */
/* ------------------------------------------------------------------ */

function normalizeContentType(raw: string | undefined): LearnerProgressEntry['contentType'] {
  if (raw === 'Specialization' || raw === 'Video') return raw;
  return 'Course';
}

function clampPercent(n: number | undefined): number {
  if (n == null || !Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}

function reportToEntry(report: B4BEnrollmentReport): LearnerProgressEntry {
  return {
    contentId: report.contentId,
    contentType: normalizeContentType(report.contentType),
    programId: report.programId,
    isCompleted: report.isCompleted === true,
    overallProgress: clampPercent(report.overallProgress),
    lastActivityAt: (() => {
      const milliseconds = enrollmentActivityMilliseconds(report);
      return milliseconds == null ? null : new Date(milliseconds);
    })(),
  };
}

/**
 * Resolve the set of B4B program IDs to query. We deliberately scope by
 * program rather than calling the unfiltered enrollmentReports endpoint
 * because the unfiltered call returns the entire org's roster — wasteful
 * and a quota risk for what is effectively a per-learner lookup.
 */
async function resolveProgramIds(opts: { programId?: string; deadline: number }): Promise<{ ids: string[]; capped: boolean }> {
  if (opts.programId) return { ids: [opts.programId], capped: false };

  return getCacheOrFetch(
    `coursera:program-ids:v2:${getB4BOrgId()}`,
    async () => {
      const ids = new Set<string>();
      let start = 0;
      for (let pageNumber = 0; pageNumber < MAX_PROVIDER_PAGES; pageNumber++) {
        const page = await withinLearnerDeadline(
          () => listPrograms({ start, limit: 100, excludeContent: true }), opts.deadline,
        );
        page.elements.forEach((p: B4BProgram) => { if (p.id) ids.add(p.id); });
        const next = nextEnrollmentReportStart({
          start, batchLength: page.elements.length, limit: 100, ...page.paging,
        });
        if (next === null) return { ids: [...ids], capped: false };
        start = next;
      }
      return { ids: [...ids], capped: true };
    },
    PROGRAM_LIST_TTL_SECONDS,
  );
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Fetch learner progress from Coursera For Business.
 *
 * Returns a map keyed by `contentId` (Coursera course/specialization id).
 * Empty map = either the learner has no enrollments OR the API was
 * unreachable — callers fall back to local `CourseProgress` / rollup for display.
 *
 * @param email     The learner's externalId in Coursera (their email).
 * @param opts.programId  Scope the lookup to a single program. Strongly
 *                        recommended on the dashboard render path: avoids
 *                        a `listPrograms` round-trip.
 * @param opts.skipCache  When true, bypass the Redis cache and refetch.
 *                        Used by the manual "Refresh from Coursera" button.
 * @param opts.readOnlyAudit  Return the local-fallback signal without OAuth,
 *                            Coursera, or Redis side effects during release QA.
 */
export async function fetchLearnerProgressFromB4B(
  email: string,
  opts: { programId?: string; skipCache?: boolean; readOnlyAudit?: boolean } = {},
): Promise<LearnerProgressByContent> {
  if (!email || typeof email !== 'string' || opts.readOnlyAudit) return new Map();

  let orgId: string;
  try {
    orgId = getB4BOrgId();
  } catch (error) {
    if (!(error instanceof B4BConfigurationError)) throw error;
    // Missing provider configuration must not break the member's local view
    // or become a cached claim that the learner has no provider progress.
    const unavailable: LearnerProgressByContent = new Map();
    unavailable.coverage = 'unavailable';
    return unavailable;
  }

  // New envelope carries coverage; never reuse an older first-page-only cache.
  const cacheKey = `coursera:learner:${learnerCacheKey(email, opts.programId)}:v2:${orgId}`;

  if (opts.skipCache) {
    await invalidateCache(cacheKey);
    return _fetchLearnerProgressFromB4BUncached(email, opts);
  }

  const cached = await getCacheOrFetch(
    cacheKey,
    async () => {
      const result = await _fetchLearnerProgressFromB4BUncached(email, opts);
      return serializeProgress(result);
    },
    LEARNER_PROGRESS_TTL_SECONDS,
  );

  return deserializeProgress(cached);
}

async function _fetchLearnerProgressFromB4BUncached(
  email: string,
  opts: { programId?: string } = {},
): Promise<LearnerProgressByContent> {
  const result: LearnerProgressByContent = new Map();
  result.coverage = 'complete';
  const deadline = Date.now() + LEARNER_REQUEST_BUDGET_MS;

  try {
    const programs = await withinLearnerDeadline(
      () => resolveProgramIds({ programId: opts.programId, deadline }), deadline,
    );
    if (programs.capped) result.coverage = 'capped';
    if (programs.ids.length === 0) {
      return result;
    }

    // Drain each program independently with a bounded quota. A later-page
    // failure retains observed facts, but the coverage flag blocks averages.
    let pagesRead = 0;
    for (const programId of programs.ids) {
      if (pagesRead >= MAX_PROVIDER_PAGES) {
        markLearnerCoverageCapped(result);
        break;
      }
      let start = 0;
      try {
        while (pagesRead < MAX_PROVIDER_PAGES) {
          pagesRead++;
          const page = await withinLearnerDeadline(() => getEnrollmentReports({
            byUserProgramId: true, programId, externalId: email, start, limit: 200,
          }), deadline);
          for (const report of page.elements) {
            if (!report?.contentId) continue;
            // Preserve explicit completion when duplicate provider rows disagree,
            // then prefer higher progress within the same completion state.
            const incoming = reportToEntry(report);
            const existing = result.get(incoming.contentId);
            const preferred = !existing || (incoming.isCompleted && !existing.isCompleted)
              || (incoming.isCompleted === existing.isCompleted && incoming.overallProgress > existing.overallProgress)
              ? incoming : existing;
            const latestActivity = Math.max(existing?.lastActivityAt?.getTime() ?? 0, incoming.lastActivityAt?.getTime() ?? 0);
            result.set(incoming.contentId, {
              ...preferred,
              lastActivityAt: latestActivity > 0 ? new Date(latestActivity) : null,
            });
          }
          const next = nextEnrollmentReportStart({
            start, batchLength: page.elements.length, limit: 200, ...page.paging,
          });
          if (next === null) break;
          start = next;
          if (pagesRead === MAX_PROVIDER_PAGES) markLearnerCoverageCapped(result);
        }
      } catch (err) {
        if (err instanceof LearnerProgressDeadline) markLearnerCoverageCapped(result);
        else result.coverage = 'unavailable';
        console.warn(`[learnerProgress] enrollmentReports failed for program=${programId}:`,
          err instanceof Error ? err.message : err);
        if (err instanceof LearnerProgressDeadline) break;
      }
    }
  } catch (err) {
    result.coverage = err instanceof LearnerProgressDeadline ? 'capped' : 'unavailable';
    console.warn(
      `[learnerProgress] B4B unavailable for email=${email}:`,
      err instanceof Error ? err.message : err,
    );
    // Fall through and return the empty map so the caller falls back to
    // local rows. Redis caching is handled by the caller.
  }

  return result;
}

/**
 * Latest activity timestamp across a learner progress map. Used by the
 * dashboard to render "Updated from Coursera <relative time> ago".
 */
export function getLearnerProgressLastActivity(
  progress: LearnerProgressByContent,
): Date | null {
  let latest: Date | null = null;
  for (const entry of progress.values()) {
    if (entry.lastActivityAt && (!latest || entry.lastActivityAt > latest)) {
      latest = entry.lastActivityAt;
    }
  }
  return latest;
}

/**
 * Filter a list of catalog `courseId`s down to the ones we expect B4B to
 * recognize: non-empty and not the `TODO_courseId_*` placeholders that
 * exist in `courseraDiscoveredCatalog.ts` for programs whose IDs haven't
 * been reverse-engineered yet.
 */
export function filterRecognizedCourseraCourseIds(ids: Array<string | undefined | null>): string[] {
  return ids.filter((id): id is string => typeof id === 'string' && id.length > 0 && !id.startsWith('TODO_'));
}

/**
 * Average `overallProgress` across the program's courses *if every course
 * is represented in the B4B response*. Returns null when the data is
 * incomplete — the caller should fall back to the local rollup in that
 * case rather than display a blended-but-misleading number.
 *
 * Why "all-or-nothing"? Mixing B4B values for some courses with zeros
 * for others would understate progress whenever a course wasn't
 * surfaced by enrollmentReports yet (e.g. a brand-new enrollment that
 * Coursera hasn't materialized). The local-DB rollup is designed for
 * partial data; the B4B average should only override when authoritative.
 */
export function averageProgramProgressFromB4B(args: {
  progress: LearnerProgressByContent;
  courseraCourseIds: string[];
}): number | null {
  if (args.progress.coverage && args.progress.coverage !== 'complete') return null;
  const ids = filterRecognizedCourseraCourseIds(args.courseraCourseIds);
  if (ids.length === 0) return null;

  let sum = 0;
  for (const id of ids) {
    const entry = args.progress.get(id);
    if (!entry) return null;
    sum += entry.overallProgress;
  }
  return Math.round(sum / ids.length);
}
