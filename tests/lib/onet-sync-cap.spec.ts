import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    onetOccupation: { upsert: vi.fn(), findUnique: vi.fn() },
  },
}));

// Unconfigured O*NET: syncOccupation short-circuits with an error per code, so
// the test never leaves the cap query under scrutiny.
vi.mock('@/lib/onet/client', () => ({ isOnetConfigured: vi.fn(() => false) }));

import { syncTopMappedOccupations } from '@/lib/onet/sync';
import { ONET_SYNC_OCCUPATION_CAP } from '@/lib/db/scanCaps';
import { prisma } from '@/lib/db/prisma';

function sqlOf(call: unknown[]): { text: string; values: unknown[] } {
  // Tagged-template call: (strings, ...values).
  const [strings, ...values] = call as [TemplateStringsArray, ...unknown[]];
  return { text: strings.join('?').replace(/\s+/g, ' '), values };
}

describe('syncTopMappedOccupations scan cap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks for at most ONET_SYNC_OCCUPATION_CAP stalest codes, never-synced first, and reports remaining work', async () => {
    const rows = Array.from({ length: ONET_SYNC_OCCUPATION_CAP }, (_, i) => ({ onet_code: `15-${1000 + i}.00` }));
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce(rows as any);

    const result = await syncTopMappedOccupations();

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const { text, values } = sqlOf(vi.mocked(prisma.$queryRaw).mock.calls[0]);
    expect(text).toMatch(/ORDER BY MIN\(o\.updated_at\) ASC NULLS FIRST/);
    expect(text).toMatch(/LIMIT \?\s*$/);
    expect(values).toEqual([ONET_SYNC_OCCUPATION_CAP]);
    expect(ONET_SYNC_OCCUPATION_CAP).toBeLessThan(5000);

    // A full page means the next run still has work; nothing was hydrated beyond the cap.
    expect(result.attempted).toBe(ONET_SYNC_OCCUPATION_CAP);
    expect(result.errors).toHaveLength(ONET_SYNC_OCCUPATION_CAP);
    expect(result.remaining).toBe(true);
  });

  it('reports no remaining work on a short page', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ onet_code: '15-1252.00' }] as any);

    const result = await syncTopMappedOccupations();
    expect(result.attempted).toBe(1);
    expect(result.remaining).toBe(false);
  });
});
