function firstRecordString(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  for (const candidate of Object.values(value as Record<string, unknown>)) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractCourseSlugFromObjectId(objectId: string | null) {
  if (!objectId) return null;
  try {
    const url = new URL(objectId);
    const learnIndex = url.pathname.toLowerCase().indexOf('/learn/');
    if (learnIndex >= 0) {
      const learnPath = url.pathname.slice(learnIndex + '/learn/'.length);
      const learnSlug = learnPath.split('/').filter(Boolean).shift();
      if (learnSlug) return toSlug(learnSlug);
    }
    const last = url.pathname.split('/').filter(Boolean).pop();
    return last ? toSlug(last) : null;
  } catch {
    const byPath = objectId.split('/').filter(Boolean).pop();
    if (byPath) return toSlug(byPath);
    const byColon = objectId.split(':').filter(Boolean).pop();
    return byColon ? toSlug(byColon) : null;
  }
}

function activityPath(objectId: string | null): string {
  if (!objectId) return '';
  try {
    return new URL(objectId).pathname;
  } catch {
    return objectId.split(/[?#]/, 1)[0];
  }
}

function isItemObjectId(objectId: string | null): boolean {
  return /(?:^|\/)item(?:\/|$)/i.test(activityPath(objectId));
}

function isCourseObjectId(objectId: string | null): boolean {
  // An untyped statement needs an object that names the course itself.
  // Coursera uses both /learn/<slug> and /course/<courseId> course URLs;
  // nested item/activity URLs must not pass. A courseId extension also
  // appears on every item in that course.
  return /\/(?:learn|course)\/[^/]+\/?$/i.test(activityPath(objectId));
}

/** Activity type derived from definition, object path, and itemType. Coursera emits
 *  two distinct shapes — course-level events (one per course) and item-level events
 *  (one per quiz/lecture/assignment inside a course). They have different
 *  semantics: a `completed` verb on an *item* means a single lesson finished,
 *  not the whole course. The pipeline must distinguish these. */
export type XapiActivityType = 'course' | 'item' | 'unknown';

export type ParsedXapiStatement = {
  email?: string;
  actorIdentifier?: string;
  actorHomePage?: string;
  courseName?: string;
  courseSlug?: string;
  statementId?: string;
  /** Provider learner-event timestamp, populated by the xAPI parser only. */
  timestamp?: string | null;
  verbId?: string;
  courseObjectId?: string | null;
  /** Coursera's canonical course identifier from
   *  `context.extensions["http://coursera.org/xapi/extensions/courseId"]`.
   *  Use this for catalog lookup — it's stable across course/item events. */
  courseraCourseId?: string | null;
  /** Coursera's program identifier from the matching extension URI. */
  courseraProgramId?: string | null;
  /** What the statement is *about* — distinguishes course vs item events. */
  activityType?: XapiActivityType;
  /** Coursera's item-type discriminator (e.g. `ITEM_TYPE_LECTURE`,
   *  `ITEM_TYPE_STAFF_GRADED_ASSIGNMENT`). Only present on item events. */
  itemType?: string | null;
  resultScoreScaled?: number | null;
  resultScoreRaw?: number | null;
  resultCompletion?: boolean | null;
  resultSuccess?: boolean | null;
  /** Normalized to 0–100 when present */
  resultProgressPercent?: number | null;
  rawStatement: Record<string, unknown>;
};

/** @deprecated Use ParsedXapiStatement */
export type ParsedCompletionStatement = ParsedXapiStatement;

export function flattenXapiStatementPayload(payload: unknown): Record<string, unknown>[] {
  const items = Array.isArray(payload) ? payload : [payload];
  return items.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === 'object' && !Array.isArray(item)
  );
}

function readScore(result: Record<string, unknown> | null): {
  scaled: number | null;
  raw: number | null;
} {
  if (!result?.score || typeof result.score !== 'object' || Array.isArray(result.score)) {
    return { scaled: null, raw: null };
  }
  const score = result.score as Record<string, unknown>;
  const scaled = typeof score.scaled === 'number' && Number.isFinite(score.scaled) ? score.scaled : null;
  const raw = typeof score.raw === 'number' && Number.isFinite(score.raw) ? score.raw : null;
  return { scaled, raw };
}

function readProgressPercent(result: Record<string, unknown> | null): number | null {
  if (!result || typeof result.progress !== 'number' || !Number.isFinite(result.progress)) return null;
  const p = result.progress;
  if (p >= 0 && p <= 1) return Math.round(p * 100);
  if (p > 1 && p <= 100) return Math.round(p);
  if (p > 100) return 100;
  return null;
}

export function parseXapiStatement(statement: Record<string, unknown>): ParsedXapiStatement | null {
  const actor = statement.actor && typeof statement.actor === 'object'
    ? (statement.actor as Record<string, unknown>)
    : null;
  const mbox = typeof actor?.mbox === 'string' ? actor.mbox.trim() : '';
  const email = mbox.toLowerCase().startsWith('mailto:') ? mbox.slice(7).trim().toLowerCase() : mbox.toLowerCase();
  const account = actor?.account && typeof actor.account === 'object'
    ? (actor.account as Record<string, unknown>)
    : null;
  const actorIdentifier = typeof account?.name === 'string' ? account.name.trim() : '';
  const actorHomePage = typeof account?.homePage === 'string' ? account.homePage.trim() : '';
  const statementId = typeof statement.id === 'string' ? statement.id : undefined;

  if (!email && !actorIdentifier && !statementId) return null;

  const verb = statement.verb && typeof statement.verb === 'object'
    ? (statement.verb as Record<string, unknown>)
    : null;
  const verbId = typeof verb?.id === 'string' && verb.id.trim() !== '' ? verb.id.trim() : 'unknown';

  const result = statement.result && typeof statement.result === 'object'
    ? (statement.result as Record<string, unknown>)
    : null;
  const { scaled, raw } = readScore(result);
  const resultCompletion = typeof result?.completion === 'boolean' ? result.completion : null;
  const resultSuccess = typeof result?.success === 'boolean' ? result.success : null;
  // A score is a grade, including on course-level events. Missing progress
  // stays unknown; only an explicit progress field supplies a percentage.
  const resultProgressPercent = readProgressPercent(result);

  const object = statement.object && typeof statement.object === 'object'
    ? (statement.object as Record<string, unknown>)
    : null;
  const objectId = typeof object?.id === 'string' ? object.id.trim() : null;
  const definition = object?.definition && typeof object.definition === 'object'
    ? (object.definition as Record<string, unknown>)
    : null;
  const courseName =
    (typeof definition?.name === 'string' ? definition.name.trim() : null) ||
    firstRecordString(definition?.name) ||
    undefined;

  // Coursera xAPI emits identifiers via context.extensions URIs. These are the
  // authoritative course/program/item identifiers — far more reliable than
  // pulling the last URL segment out of object.id, which gave us "ezm1l" /
  // "0wndn" looking-like-slugs (they're item IDs, not course slugs).
  const context = statement.context && typeof statement.context === 'object'
    ? (statement.context as Record<string, unknown>)
    : null;
  const extensions = context?.extensions && typeof context.extensions === 'object'
    ? (context.extensions as Record<string, unknown>)
    : null;
  const courseraCourseId = readNonEmptyString(
    extensions?.['http://coursera.org/xapi/extensions/courseId'],
  );
  const courseraProgramId = readNonEmptyString(
    extensions?.['http://coursera.org/xapi/extensions/programId'],
  );
  const itemType = readNonEmptyString(
    extensions?.['http://coursera.org/xapi/extensions/itemType'],
  );

  const definitionType = readNonEmptyString(definition?.type)?.toLowerCase() ?? '';
  // Item markers take precedence over a conflicting course definition: the
  // courseId extension accompanies item events and must not complete a course.
  const activityType: XapiActivityType = definitionType.endsWith('/activities/item') || itemType || isItemObjectId(objectId)
    ? 'item'
    : definitionType.endsWith('/activities/course')
      ? 'course'
      : 'unknown';

  // courseSlug is best-effort. Prefer the URL-tail heuristic only for course-
  // level events (where the tail is the courseId path segment). For item-level
  // events the tail is an item ID — never a course slug — so don't pollute
  // downstream lookups. Catalog matching now uses `courseraCourseId` directly.
  const courseSlug =
    activityType === 'course' || (activityType === 'unknown' && objectId?.includes('/learn/'))
      ? extractCourseSlugFromObjectId(objectId) || (courseName ? toSlug(courseName) : undefined)
      : courseName ? toSlug(courseName) : undefined;

  return {
    email: email || undefined,
    actorIdentifier: actorIdentifier || undefined,
    actorHomePage: actorHomePage || undefined,
    courseName,
    courseSlug,
    statementId,
    timestamp: typeof statement.timestamp === 'string' ? statement.timestamp : null,
    verbId: verbId,
    courseObjectId: objectId,
    courseraCourseId,
    courseraProgramId,
    activityType,
    itemType,
    resultScoreScaled: scaled,
    resultScoreRaw: raw,
    resultCompletion,
    resultSuccess,
    resultProgressPercent,
    rawStatement: statement,
  };
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** True when the statement should mark a *course* complete on the member's
 *  record. Coursera fires `completed` on individual items (lectures,
 *  assignments) too — those are NOT course completions and must be excluded
 *  here, otherwise a single quiz completion would mark the whole course done.
 *  Item-level start/progress events are still tracked as progress signals (see
 *  isXapiCourseProgressVerb), they just don't trigger course-completion
 *  side effects. */
export function isXapiCompletionVerb(parsed: ParsedXapiStatement): boolean {
  // Item-level activities never represent a course completion. Skip them
  // regardless of verb.
  if (parsed.activityType === 'item' || parsed.itemType || isItemObjectId(parsed.courseObjectId ?? null)) return false;

  // An untyped statement must name the course object as well as carry the
  // canonical courseId. Item statements carry courseId too, so it alone is
  // insufficient evidence for course-completion side effects.
  if (parsed.activityType === 'unknown' && (
    !(parsed.courseraCourseId ?? '').trim() || !isCourseObjectId(parsed.courseObjectId ?? null)
  )) {
    return false;
  }

  const verbId = (parsed.verbId ?? '').toLowerCase();
  return (
    verbId.includes('completed')
    || verbId.includes('passed')
    || parsed.resultCompletion === true
    || parsed.resultSuccess === true
  );
}

export function isXapiCourseProgressVerb(parsed: ParsedXapiStatement): boolean {
  const verbId = (parsed.verbId ?? '').toLowerCase();
  if (isXapiCompletionVerb(parsed)) return true;
  return (
    verbId.includes('progressed')
    || verbId.includes('started')
    || verbId.includes('registered')
    || verbId.includes('initialized')
  );
}

export function parseCompletionStatements(payload: unknown): ParsedCompletionStatement[] {
  return flattenXapiStatementPayload(payload)
    .map(parseXapiStatement)
    .filter((s): s is ParsedXapiStatement => Boolean(s))
    .filter(isXapiCompletionVerb);
}
