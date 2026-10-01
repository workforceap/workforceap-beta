// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A B4B provider error must not be cached as an empty catalog for the hour
 * (WAP-276): the admin Coursera health page read that `[]` as "unavailable"
 * on every catalog check, and the auto-heal seeded canonical mappings from it.
 * Failures are held briefly, then retried; successes keep the hour-long cache.
 */

const client = vi.hoisted(() => ({ listPrograms: vi.fn(), listContents: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/coursera/b4bClient', () => ({
  listPrograms: client.listPrograms,
  listContents: client.listContents,
}));

import {
  _resetB4BProgramContentsCacheForTesting,
  loadB4BContents,
  loadB4BContentsChecked,
  loadB4BPrograms,
  loadB4BProgramsChecked,
} from '@/lib/coursera/programContentsCache';

const PROGRAM_PAGE = {
  elements: [
    {
      id: 'prog-1',
      slug: 'data-analytics',
      name: 'Data Analytics',
      contents: [{ id: 'course-1', slug: 'intro', name: 'Intro to Data', contentType: 'Course' }],
    },
  ],
};
const CONTENTS_PAGE = { elements: [{ id: 'course-1', slug: 'intro', name: 'Intro to Data', contentType: 'Course' }] };

describe('B4B program contents cache after a provider error', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-25T01:00:00Z'));
    _resetB4BProgramContentsCacheForTesting();
    client.listPrograms.mockReset();
    client.listContents.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports a failed program read instead of an empty catalog', async () => {
    client.listPrograms.mockRejectedValueOnce(new Error('B4B 503'));

    await expect(loadB4BProgramsChecked()).resolves.toEqual({ ok: false, error: 'B4B 503' });
    // The lenient reader keeps its never-throws contract.
    await expect(loadB4BPrograms()).resolves.toEqual([]);
  });

  it('serves the real catalog a few minutes after a failure, not a cached [] for an hour', async () => {
    client.listPrograms.mockRejectedValueOnce(new Error('B4B 503')).mockResolvedValue(PROGRAM_PAGE);

    await expect(loadB4BPrograms()).resolves.toEqual([]);
    vi.setSystemTime(new Date('2026-09-25T01:05:00Z'));

    const programs = await loadB4BPrograms();
    expect(programs.map((p) => p.courses.map((c) => c.id))).toEqual([['course-1']]);
  });

  it('holds a failure briefly so an outage does not call the provider on every read', async () => {
    client.listPrograms.mockRejectedValue(new Error('B4B 503'));

    await loadB4BProgramsChecked();
    vi.setSystemTime(new Date('2026-09-25T01:00:30Z'));
    await loadB4BProgramsChecked();

    expect(client.listPrograms).toHaveBeenCalledTimes(1);
  });

  it('keeps a successful catalog for the hour', async () => {
    client.listPrograms.mockResolvedValue(PROGRAM_PAGE);

    await loadB4BProgramsChecked();
    vi.setSystemTime(new Date('2026-09-25T01:45:00Z'));
    await expect(loadB4BProgramsChecked()).resolves.toMatchObject({ ok: true });

    expect(client.listPrograms).toHaveBeenCalledTimes(1);
  });

  it('treats contents the same way', async () => {
    client.listContents.mockRejectedValueOnce(new Error('timeout')).mockResolvedValue(CONTENTS_PAGE);

    await expect(loadB4BContentsChecked()).resolves.toEqual({ ok: false, error: 'timeout' });
    vi.setSystemTime(new Date('2026-09-25T01:05:00Z'));
    await expect(loadB4BContents()).resolves.toEqual([
      { id: 'course-1', slug: 'intro', name: 'Intro to Data', contentType: 'Course' },
    ]);
  });
});
