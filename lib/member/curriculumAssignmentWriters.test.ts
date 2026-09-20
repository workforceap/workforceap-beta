import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';

const REPO = join(__dirname, '..', '..');

function productionTypeScriptFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    // Worktrees and package managers can materialize nested dependency
    // junctions. They are never production source and following them makes
    // this structural test scan generated Prisma declarations.
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...productionTypeScriptFiles(path));
    } else if (
      /\.(?:ts|tsx)$/.test(entry) &&
      !/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry)
    ) {
      files.push(path);
    }
  }
  return files;
}

function balancedSegment(source: string, openAt: number): string {
  assert.equal(source[openAt], '{', 'balancedSegment must start at an opening brace');
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;

  for (let index = openAt; index < source.length; index += 1) {
    const char = source[index]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openAt, index + 1);
    }
  }
  throw new Error('Unbalanced object literal in CourseEnrollment writer');
}

function propertyObject(call: string, property: 'create' | 'update' | 'data'): string | null {
  const match = new RegExp(`\\b${property}\\s*:\\s*\\{`).exec(call);
  if (!match) return null;
  const openAt = call.indexOf('{', match.index);
  return balancedSegment(call, openAt);
}

function courseEnrollmentCalls(source: string): Array<{ kind: 'create' | 'upsert'; call: string }> {
  const calls: Array<{ kind: 'create' | 'upsert'; call: string }> = [];
  const pattern = /\bcourseEnrollment\.(create|upsert)\s*\(\s*\{/g;
  for (const match of source.matchAll(pattern)) {
    const kind = match[1] as 'create' | 'upsert';
    const openAt = source.indexOf('{', match.index);
    calls.push({ kind, call: balancedSegment(source, openAt) });
  }
  return calls;
}

/**
 * WAP-174: the one canonical program-enrollment writer. Every production
 * `courseEnrollment.create` / `.upsert` must live here; every former direct
 * writer must import it instead. This is a path allowlist, not a count, so
 * adding a writer anywhere else fails with the offending file named.
 */
const CANONICAL_ENROLLMENT_WRITER = 'lib/member/courseEnrollmentAssignment.ts';

/** Former direct writers that now delegate to the canonical helper. */
const FORMER_DIRECT_WRITERS = [
  'app/api/admin/members/create/route.ts',
  'app/api/admin/coursera/reconcile/add-to-wap/route.ts',
  'lib/coursera/syncUserFromB4B.ts',
];

test('every production CourseEnrollment create pins a curriculum version and retries preserve it', () => {
  const files = [
    ...productionTypeScriptFiles(join(REPO, 'app')),
    ...productionTypeScriptFiles(join(REPO, 'lib')),
  ];
  const writerFiles = new Set<string>();

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const { kind, call } of courseEnrollmentCalls(source)) {
      const displayPath = relative(REPO, file).split('\\').join('/');
      writerFiles.add(displayPath);
      const createData = propertyObject(call, kind === 'upsert' ? 'create' : 'data');
      assert.ok(createData, `${displayPath} ${kind} is missing its create payload`);
      assert.match(
        createData,
        /\bcurriculumVersion\s*:/,
        `${displayPath} ${kind} must pin curriculumVersion when the row is created`,
      );

      if (kind === 'upsert') {
        const updateData = propertyObject(call, 'update');
        assert.ok(updateData, `${displayPath} upsert is missing its update payload`);
        assert.doesNotMatch(
          updateData,
          /\bcurriculumVersion\s*:/,
          `${displayPath} retry must not rewrite an immutable curriculumVersion`,
        );
      }
    }
  }

  assert.deepEqual(
    [...writerFiles].sort(),
    [CANONICAL_ENROLLMENT_WRITER],
    'CourseEnrollment rows may only be created by upsertEquivalentCourseEnrollment; route new writers through it',
  );
});

test('former direct CourseEnrollment writers delegate to the canonical helper', () => {
  for (const path of FORMER_DIRECT_WRITERS) {
    const source = readFileSync(join(REPO, ...path.split('/')), 'utf8');
    assert.match(
      source,
      /upsertEquivalentCourseEnrollment\(/,
      `${path} must call upsertEquivalentCourseEnrollment instead of a direct create`,
    );
    assert.doesNotMatch(
      source,
      /courseEnrollment\s*\.\s*(?:create|createMany|upsert)\s*\(/,
      `${path} must not create CourseEnrollment rows directly`,
    );
  }
});

test('request-driven enrollment writers persist canonical program slugs', () => {
  const canonicalizedWriters = [
    'app/api/member/enroll/route.ts',
    'app/api/admin/members/[id]/program/route.ts',
    'app/api/admin/members/bulk-update/route.ts',
    'app/api/admin/members/create/route.ts',
    'app/api/admin/program-change-requests/[id]/route.ts',
    'app/api/apply/signup/route.ts',
    'app/api/invite/accept/route.ts',
  ];
  for (const path of canonicalizedWriters) {
    const source = readFileSync(join(REPO, ...path.split('/')), 'utf8');
    assert.match(
      source,
      /canonicalizeProgramSlug/,
      `${path} must canonicalize accepted legacy aliases before enrollment storage`,
    );
  }

  const reconcileSource = readFileSync(
    join(REPO, 'app', 'api', 'admin', 'coursera', 'reconcile', 'add-to-wap', 'route.ts'),
    'utf8',
  );
  assert.match(reconcileSource, /const programSlug = requestedProgram\?\.slug \?\? null/);
});
