// @vitest-environment node
import { glob, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import config from '../vitest.config';
import { VITEST_LIBRARY_SPECS } from '../scripts/vitest-library-specs.mjs';

const NODE_TEST_GLOBS = [
  'lib/**/*.test.ts',
  'app/**/*.test.ts',
  'emails/**/*.test.ts',
  'shared/**/*.test.ts',
  'scripts/**/*.test.ts',
  'scripts/**/*.test.cjs',
] as const;

const NODE_REAL_DB_SKIP = new Set(['lib/auth/roles.test.ts']);
const VITEST_OWNED_OUTSIDE_LIB = new Set(['app/api/apply/signup/route.test.ts']);
const KB_TEST_LANE = new Set(['scripts/knowledge-index.test.mjs']);
const AUDIT_ONLY_UNCOLLECTED = 'graph/evidence/';

function normalize(file: string): string {
  return file.replaceAll('\\', '/');
}

function matchesGlob(file: string, pattern: string): boolean {
  let expression = '^';
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    if (char === '*' && pattern[index + 1] === '*') {
      index++;
      if (pattern[index + 1] === '/') {
        expression += '(?:.*/)?';
        index++;
      } else {
        expression += '.*';
      }
    } else if (char === '*') {
      expression += '[^/]*';
    } else if (char === '?') {
      expression += '[^/]';
    } else {
      expression += char.replace(/[\\.^$+|]/g, '\\$&');
    }
  }
  return new RegExp(`${expression}$`).test(file);
}

async function discoverSuites(): Promise<string[]> {
  const patterns = [
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/*.spec.ts',
    '**/*.spec.tsx',
    '**/*.test.js',
    '**/*.test.mjs',
    '**/*.test.cjs',
    '**/*.spec.js',
    '**/*.spec.mjs',
  ];
  const files = new Set<string>();
  // One traversal keeps this whole-repository guard bounded on Windows too.
  for await (const file of glob(patterns, {
    exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
  })) {
    files.add(normalize(file));
  }
  return [...files].sort();
}

async function vitestCollected(): Promise<Set<string>> {
  const collected = new Set<string>();
  for await (const file of glob(config.test?.include ?? [], { exclude: config.test?.exclude ?? [] })) {
    collected.add(normalize(file));
  }
  return collected;
}

async function nodeOwned(): Promise<{ runnable: string[]; skippedVitest: string[]; skippedRealDb: string[] }> {
  const discovered: string[] = [];
  for (const pattern of NODE_TEST_GLOBS) {
    for await (const file of glob(pattern)) {
      discovered.push(normalize(file));
    }
  }
  const runnable: string[] = [];
  const skippedVitest: string[] = [];
  const skippedRealDb: string[] = [];
  for (const file of new Set(discovered)) {
    const source = await readFile(file, 'utf8');
    const importsVitest = /from\s+['"]vitest['"]/.test(source) || /require\(['"]vitest['"]\)/.test(source);
    if (importsVitest) {
      skippedVitest.push(file);
      continue;
    }
    if (NODE_REAL_DB_SKIP.has(file)) {
      skippedRealDb.push(file);
      continue;
    }
    runnable.push(file);
  }
  return { runnable, skippedVitest, skippedRealDb };
}

describe('library test runner ownership', () => {
  it('registers every library suite that imports Vitest exactly once', async () => {
    const discovered: string[] = [];
    for await (const file of glob('lib/**/*.test.ts')) {
      const source = await readFile(file, 'utf8');
      if (/from\s+['"]vitest['"]|require\(['"]vitest['"]\)/.test(source)) {
        discovered.push(normalize(file));
      }
    }
    expect([...VITEST_LIBRARY_SPECS].sort()).toEqual(discovered.sort());
    expect(new Set(VITEST_LIBRARY_SPECS).size).toBe(VITEST_LIBRARY_SPECS.length);
  });

  it('collects every registered suite with the actual Vitest include/exclude rules', async () => {
    const collected = await vitestCollected();
    const missing = VITEST_LIBRARY_SPECS.filter((file) => !collected.has(file));
    expect(missing, 'Suites delegated by the Node runner must be collected by Vitest').toEqual([]);
    const libraryFiles = [...collected].filter((file) => file.startsWith('lib/')).sort();
    expect(libraryFiles, 'Do not collect node:test library suites in Vitest').toEqual(
      [...VITEST_LIBRARY_SPECS].sort(),
    );
  });
});

describe('repository test-runner coverage', () => {
  it('assigns every product suite to exactly one collecting lane', async () => {
    const suites = await discoverSuites();
    const vitest = await vitestCollected();
    const node = await nodeOwned();
    const nodeRunnable = new Set(node.runnable);
    const nodeVitestSkip = new Set(node.skippedVitest);
    const owners = new Map<string, string[]>();

    const add = (file: string, lane: string) => {
      const current = owners.get(file) ?? [];
      current.push(lane);
      owners.set(file, current);
    };

    for (const file of suites) {
      if (file.startsWith('tests/e2e/')) add(file, 'playwright');
      if (vitest.has(file)) add(file, 'vitest');
      if (nodeRunnable.has(file)) add(file, 'node-unit');
      if (KB_TEST_LANE.has(file)) add(file, 'kb:test');
    }

    const explicitNodeSkip = new Set([...node.skippedVitest, ...node.skippedRealDb]);
    const unowned = suites.filter((file) => {
      if (file.startsWith(AUDIT_ONLY_UNCOLLECTED)) return false;
      if (explicitNodeSkip.has(file) && (owners.get(file) ?? []).length === 0) return false;
      return (owners.get(file) ?? []).length === 0;
    });
    const duplicated = suites.filter((file) => (owners.get(file) ?? []).length > 1);

    expect(unowned, 'Every product *.test.* / *.spec.* file must belong to a runner').toEqual([]);
    expect(duplicated, 'A suite must not be collected by two product lanes').toEqual([]);
    expect([...nodeVitestSkip].sort()).toEqual(
      [...VITEST_LIBRARY_SPECS, ...VITEST_OWNED_OUTSIDE_LIB].sort(),
    );
    expect(node.skippedRealDb).toEqual([...NODE_REAL_DB_SKIP]);
  });
});
