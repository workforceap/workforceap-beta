// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Prisma } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ $queryRaw: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/prisma', () => ({ prisma: db }));

type Queries = typeof import('./progressQueries');

/**
 * Rendered SQL (`text` = `$1`-style placeholders, plus the bound values) of the
 * three unmatched-learner queries as `origin/master` produced them before the
 * `coursera_xapi_events` probe existed. Captured by calling master's functions
 * against this same mocked client and flattening the tagged template with
 * `Prisma.sql`. The with-table branch must keep matching it byte for byte.
 */
const MASTER = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../tests/fixtures/coursera/unmatchedLearnersSql.master.json', import.meta.url)), 'utf8'),
) as Record<string, { text: string; values: unknown[] }>;

const PROBE = /to_regclass\('public\.coursera_xapi_events'\)/;
const isProbe = (strings: TemplateStringsArray) => PROBE.test(strings.join(''));

function rendered(call: unknown[]): { text: string; values: unknown[] } {
  const sql = Prisma.sql(call[0] as TemplateStringsArray, ...call.slice(1));
  return { text: sql.text, values: sql.values };
}

function nonProbeCalls(): unknown[][] {
  return db.$queryRaw.mock.calls.filter((call) => !isProbe(call[0] as TemplateStringsArray));
}

function probeCalls(): unknown[][] {
  return db.$queryRaw.mock.calls.filter((call) => isProbe(call[0] as TemplateStringsArray));
}

/** Fresh module per test so the once-per-process memo and warn flag start clean. */
async function freshQueries(): Promise<Queries> {
  vi.resetModules();
  return import('./progressQueries');
}

const CSV_LEARNER = {
  externalEmail: 'learner@partner.org',
  externalName: 'Csv Learner',
  courseCount: BigInt(2),
  badgeCount: BigInt(0),
  xapiCount: BigInt(0),
  actorIdentifier: null,
  actorHomePage: null,
  lastActivityTime: new Date('2026-09-01T00:00:00Z'),
};

/** Probe answers `present`; the first non-probe query returns `rows`, later ones (badges, grades) return []. */
function mockDatabase(present: boolean, rows: unknown[]): void {
  let served = false;
  db.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
    if (isProbe(strings)) return [{ present }];
    if (served) return [];
    served = true;
    return rows;
  });
}

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  error.mockRestore();
});

describe('coursera_xapi_events absent (db push databases)', () => {
  it('loads the CSV/badge learners without the xAPI branch, no error, one warning', async () => {
    const { loadUnmatchedLearners } = await freshQueries();
    mockDatabase(false, [CSV_LEARNER]);

    const learners = await loadUnmatchedLearners('org-A', 25);

    expect(learners).toHaveLength(1);
    expect(learners[0]).toMatchObject({ externalEmail: 'learner@partner.org', courseCount: 2, xapiCount: 0 });
    const main = rendered(nonProbeCalls()[0]);
    expect(main.text).not.toContain('coursera_xapi_events');
    expect(main.text).toContain('FROM coursera_course_progress');
    expect(main.text).toContain('FROM coursera_badge_progress');
    // Same tenant predicates as master minus the one that belonged to the xAPI branch.
    expect(main.values).toEqual(MASTER.loadDefault.values.filter((_, index) => index !== 3));
    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('coursera_xapi_events not present');
  });

  it('counts without the xAPI branch, re-probes while absent, but warns once per process', async () => {
    const { countHiddenTestAccountUnmatchedLearners, countUnmatchedLearners, loadUnmatchedLearners } = await freshQueries();
    mockDatabase(false, [{ count: BigInt(4) }]);

    await expect(countUnmatchedLearners('org-A')).resolves.toBe(4);
    for (const call of nonProbeCalls()) expect(rendered(call).text).not.toContain('coursera_xapi_events');

    db.$queryRaw.mockClear();
    mockDatabase(false, [{ count: BigInt(1) }]);
    await expect(countHiddenTestAccountUnmatchedLearners('org-A')).resolves.toBe(1);
    expect(rendered(nonProbeCalls()[0]).text).not.toContain('coursera_xapi_events');

    db.$queryRaw.mockClear();
    mockDatabase(false, []);
    await expect(loadUnmatchedLearners('org-A')).resolves.toEqual([]);
    expect(probeCalls()).toHaveLength(1);

    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('reports the gap to every caller through onXapiTableMissing off the one probe', async () => {
    const { countHiddenTestAccountUnmatchedLearners, countUnmatchedLearners, loadUnmatchedLearners } = await freshQueries();
    const onXapiTableMissing = vi.fn();

    mockDatabase(false, [{ count: BigInt(2) }]);
    await expect(countHiddenTestAccountUnmatchedLearners('org-A', { onXapiTableMissing })).resolves.toBe(2);
    expect(onXapiTableMissing).toHaveBeenCalledTimes(1);
    // One probe, one count: the callback did not cost a second to_regclass.
    expect(probeCalls()).toHaveLength(1);
    expect(nonProbeCalls()).toHaveLength(1);

    db.$queryRaw.mockClear();
    mockDatabase(false, [{ count: BigInt(0) }]);
    await countUnmatchedLearners('org-A', { onXapiTableMissing });
    db.$queryRaw.mockClear();
    mockDatabase(false, []);
    await loadUnmatchedLearners('org-A', 25, { onXapiTableMissing });
    expect(onXapiTableMissing).toHaveBeenCalledTimes(3);
  });
});

describe('coursera_xapi_events present (production)', () => {
  it('renders exactly the SQL master rendered, then stops probing', async () => {
    const { countHiddenTestAccountUnmatchedLearners, countUnmatchedLearners, loadUnmatchedLearners } = await freshQueries();

    const cases: Array<[string, () => Promise<unknown>]> = [
      ['loadDefault', () => loadUnmatchedLearners('org-A', 25)],
      ['loadIncludeTest', () => loadUnmatchedLearners('org-A', 25, { includeTestAccounts: true })],
      ['countDefault', () => countUnmatchedLearners('org-A')],
      ['countIncludeTest', () => countUnmatchedLearners('org-A', { includeTestAccounts: true })],
      ['countHidden', () => countHiddenTestAccountUnmatchedLearners('org-A')],
    ];
    let probes = 0;
    for (const [name, run] of cases) {
      db.$queryRaw.mockClear();
      mockDatabase(true, []);
      await run();
      probes += probeCalls().length;
      expect(rendered(nonProbeCalls()[0]), name).toEqual(MASTER[name]);
    }
    expect(probes).toBe(1);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('never calls onXapiTableMissing while the table is present', async () => {
    const { countHiddenTestAccountUnmatchedLearners, countUnmatchedLearners, loadUnmatchedLearners } = await freshQueries();
    const onXapiTableMissing = vi.fn();
    mockDatabase(true, []);

    await countHiddenTestAccountUnmatchedLearners('org-A', { onXapiTableMissing });
    await countUnmatchedLearners('org-A', { onXapiTableMissing });
    await loadUnmatchedLearners('org-A', 25, { onXapiTableMissing });

    expect(onXapiTableMissing).not.toHaveBeenCalled();
    expect(probeCalls()).toHaveLength(1);
    // The hidden-test count renders the same SQL master rendered.
    expect(rendered(nonProbeCalls()[0])).toEqual(MASTER.countHidden);
  });

  it('a failing probe behaves like any other failed read: swallowed by default, thrown under strict', async () => {
    const { countUnmatchedLearners, loadUnmatchedLearners } = await freshQueries();
    const failure = new Error('fixture database unavailable');
    db.$queryRaw.mockRejectedValue(failure);

    await expect(loadUnmatchedLearners('org-A')).resolves.toEqual([]);
    await expect(countUnmatchedLearners('org-A')).resolves.toBe(0);
    await expect(loadUnmatchedLearners('org-A', 100, { strict: true })).rejects.toThrow(failure);
    expect(warn).not.toHaveBeenCalled();
  });
});
