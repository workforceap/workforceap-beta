import 'server-only';

import { listContents, listPrograms, type B4BProgram, type B4BContent } from '@/lib/coursera/b4bClient';
import type { ProgramCourse } from '@/lib/content/programs';

/**
 * Cached, normalized B4B program directory with inline course contents.
 *
 * We hit `listPrograms({ excludeContent: false })` so each program comes
 * back with its `contents[]` array of courses inline. That lets the
 * member dashboard render the *real, current* Coursera course list for
 * a program — not a stale static file dump.
 *
 * Cache TTL is 1 hour. B4B's program/course directory doesn't change
 * minute-to-minute; a stale UI for an hour is preferable to a network
 * round-trip per page render.
 *
 * Failure mode: if B4B credentials are missing or the call fails,
 * `loadB4BPrograms` / `loadB4BContents` return an empty list and let callers
 * fall back to their next data source (Course DB → static catalog). They
 * never throw. A failure is NOT cached for the hour (WAP-276): it used to be
 * stored as `[]`, so one provider error made every catalog check read
 * "unavailable" for an hour. A failure is held for FAILURE_TTL_MS so an
 * outage doesn't turn every render into a provider call. Callers that must
 * tell "provider failed" from "catalog is empty" use the `*Checked` variants.
 */

const CACHE_TTL_MS = 60 * 60 * 1000;
const FAILURE_TTL_MS = 60 * 1000;

/** A provider read that says whether it failed, instead of collapsing to []. */
export type B4BLoad<T> = { ok: true; value: T } | { ok: false; error: string };

type CachedFailure = { error: string; at: number };

function failureFresh(failure: CachedFailure | null): failure is CachedFailure {
  return failure !== null && Date.now() - failure.at < FAILURE_TTL_MS;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type B4BProgramWithContents = {
  id: string;
  slug: string | null;
  name: string;
  url: string | null;
  courses: Array<{ id: string; slug: string; name: string; contentType: string }>;
};

type B4BProgramWithUrl = B4BProgram & { url?: string };

let cachedPrograms: B4BProgramWithContents[] | null = null;
let cachedAt = 0;
let programsFailure: CachedFailure | null = null;
let inFlight: Promise<B4BLoad<B4BProgramWithContents[]>> | null = null;

function isFresh(): boolean {
  return cachedPrograms !== null && Date.now() - cachedAt < CACHE_TTL_MS;
}

function normalizeProgramName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Best-effort slugify for a Coursera content `name` when its `slug`
 * isn't returned by B4B (some content types don't carry one).
 */
function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeContent(
  raw: B4BContent,
): { id: string; slug: string; name: string; contentType: string } | null {
  if (!raw.id) return null;
  const name = (raw.name ?? '').trim();
  if (!name) return null;
  const slug = raw.slug?.trim() || slugifyName(name);
  return { id: raw.id, slug, name, contentType: raw.contentType?.trim() || 'Unknown' };
}

async function fetchPrograms(): Promise<B4BLoad<B4BProgramWithContents[]>> {
  try {
    const page = await listPrograms({ excludeContent: false, limit: 100 });
    return { ok: true, value: (page.elements as B4BProgramWithUrl[]).map((p) => ({
      id: p.id,
      slug: p.slug?.trim() ?? null,
      name: (p.name ?? '').trim(),
      url: p.url?.trim() || null,
      courses: Array.isArray(p.contents)
        ? (p.contents as B4BContent[])
            .map(normalizeContent)
            .filter(
              (c): c is { id: string; slug: string; name: string; contentType: string } =>
                c !== null,
            )
        : [],
    })) };
  } catch (error) {
    console.warn(
      '[coursera/programContentsCache] listPrograms failed:',
      errorMessage(error),
    );
    return { ok: false, error: errorMessage(error) };
  }
}

/** Programs, or the provider error. Only a successful read is cached for the hour. */
export async function loadB4BProgramsChecked(): Promise<B4BLoad<B4BProgramWithContents[]>> {
  if (isFresh()) return { ok: true, value: cachedPrograms! };
  if (failureFresh(programsFailure)) return { ok: false, error: programsFailure.error };
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const result = await fetchPrograms();
    if (result.ok) {
      cachedPrograms = result.value;
      cachedAt = Date.now();
      programsFailure = null;
    } else {
      programsFailure = { error: result.error, at: Date.now() };
    }
    return result;
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

export async function loadB4BPrograms(): Promise<B4BProgramWithContents[]> {
  const result = await loadB4BProgramsChecked();
  return result.ok ? result.value : [];
}

/**
 * Find a single B4B program by id, slug, or normalized title.
 * Resolution order matches `getOrgScopedProgramUrl` so URL + courses
 * stay aligned across the same lookup chain.
 */
export async function findB4BProgramBy(opts: {
  programId?: string | null;
  slug?: string | null;
  title?: string | null;
}): Promise<B4BProgramWithContents | null> {
  const programs = await loadB4BPrograms();
  if (programs.length === 0) return null;

  if (opts.programId) {
    const byId = programs.find((p) => p.id === opts.programId);
    if (byId) return byId;
  }
  if (opts.slug) {
    const bySlug = programs.find((p) => p.slug === opts.slug);
    if (bySlug) return bySlug;
  }
  if (opts.title) {
    const target = normalizeProgramName(opts.title);
    const byName = programs.find((p) => normalizeProgramName(p.name) === target);
    if (byName) return byName;
  }
  return null;
}

/**
 * Returns the live B4B course list for a program in `ProgramCourse`
 * shape, or null if no match. `estimatedHours` defaults to 10 because
 * B4B doesn't expose it; the static catalog can override per-course
 * via the `Course` DB table when seeded.
 */
export async function loadProgramCoursesFromB4B(opts: {
  programId?: string | null;
  slug?: string | null;
  title?: string | null;
}): Promise<ProgramCourse[] | null> {
  const program = await findB4BProgramBy(opts);
  if (!program) return null;
  if (program.courses.length === 0) return null;
  return program.courses.map((c) => ({
    slug: c.slug,
    name: c.name,
    estimatedHours: 10,
    courseraCourseId: c.id,
  }));
}

/* ------------------------------------------------------------------ */
/*  Org-level contents cache (flat — for course-level matching)        */
/* ------------------------------------------------------------------ */

/**
 * B4B `listContents()` returns the org's full content catalog as a flat
 * list — every Course and Specialization the org has access to, mixed.
 * This is the right shape for course-level canonical mapping because our
 * static catalog programs are courses + specializations *inside* the
 * single B4B umbrella program, not B4B program peers.
 *
 * See `seedCanonicalMappingsFromB4B` for the consumer.
 */
export type B4BContentEntry = {
  id: string;
  slug: string | null;
  name: string;
  contentType: 'Course' | 'Specialization' | string;
};

let cachedContents: B4BContentEntry[] | null = null;
let contentsCachedAt = 0;
let contentsFailure: CachedFailure | null = null;
let contentsInFlight: Promise<B4BLoad<B4BContentEntry[]>> | null = null;

function contentsFresh(): boolean {
  return cachedContents !== null && Date.now() - contentsCachedAt < CACHE_TTL_MS;
}

async function fetchContents(): Promise<B4BLoad<B4BContentEntry[]>> {
  try {
    // B4B paginates; 1000 is plenty for our org and stays well under the
    // 500 hard cap we picked for admin routes. Drain in one shot.
    const page = await listContents({ limit: 1000 });
    return { ok: true, value: (page.elements as B4BContent[])
      .map((c) => {
        if (!c.id) return null;
        const name = (c.name ?? '').trim();
        if (!name) return null;
        const slug = c.slug?.trim() || slugifyName(name);
        return {
          id: c.id,
          slug,
          name,
          contentType: c.contentType ?? 'Course',
        } as B4BContentEntry;
      })
      .filter((c): c is B4BContentEntry => c !== null) };
  } catch (error) {
    console.warn(
      '[coursera/programContentsCache] listContents failed:',
      errorMessage(error),
    );
    return { ok: false, error: errorMessage(error) };
  }
}

/** Contents, or the provider error. Only a successful read is cached for the hour. */
export async function loadB4BContentsChecked(): Promise<B4BLoad<B4BContentEntry[]>> {
  if (contentsFresh()) return { ok: true, value: cachedContents! };
  if (failureFresh(contentsFailure)) return { ok: false, error: contentsFailure.error };
  if (contentsInFlight) return contentsInFlight;
  contentsInFlight = (async () => {
    const result = await fetchContents();
    if (result.ok) {
      cachedContents = result.value;
      contentsCachedAt = Date.now();
      contentsFailure = null;
    } else {
      contentsFailure = { error: result.error, at: Date.now() };
    }
    return result;
  })();
  try {
    return await contentsInFlight;
  } finally {
    contentsInFlight = null;
  }
}

export async function loadB4BContents(): Promise<B4BContentEntry[]> {
  const result = await loadB4BContentsChecked();
  return result.ok ? result.value : [];
}

/** Test-only cache reset. */
export function _resetB4BProgramContentsCacheForTesting(): void {
  cachedPrograms = null;
  cachedAt = 0;
  programsFailure = null;
  inFlight = null;
  cachedContents = null;
  contentsCachedAt = 0;
  contentsFailure = null;
  contentsInFlight = null;
}
