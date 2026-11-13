import { beforeEach, describe, expect, it, vi } from 'vitest';

const createManyAndReturn = vi.fn();
vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn((_orgId: string, fn: (db: { job: { createManyAndReturn: typeof createManyAndReturn } }) => unknown) =>
    fn({ job: { createManyAndReturn } }),
  ),
}));

import { insertEmployerJobsBatch } from '@/lib/employer/bulkJobInsert';
import { withTenantScope } from '@/lib/tenant/withTenantScope';

beforeEach(() => {
  vi.clearAllMocks();
  createManyAndReturn.mockResolvedValue([]);
});

describe('insertEmployerJobsBatch', () => {
  it('returns immediately for an empty batch without opening a tenant scope', async () => {
    await expect(insertEmployerJobsBatch('org-a', [])).resolves.toEqual([]);
    expect(withTenantScope).not.toHaveBeenCalled();
    expect(createManyAndReturn).not.toHaveBeenCalled();
  });

  it('writes the batch through the caller organization, not a row-supplied tenant', async () => {
    createManyAndReturn.mockResolvedValue([
      { id: 'job-1', title: 'Clerk' },
      { id: 'job-2', title: 'Aide' },
    ]);
    const rows = [
      { title: 'Clerk', employerId: 'emp-1', importProvider: 'csv' },
      { title: 'Aide', employerId: 'emp-1', importProvider: '  indeed  ' },
    ];

    await expect(insertEmployerJobsBatch('org-a', rows as never)).resolves.toEqual([
      { id: 'job-1', title: 'Clerk', provider: 'csv' },
      { id: 'job-2', title: 'Aide', provider: 'indeed' },
    ]);
    expect(withTenantScope).toHaveBeenCalledExactlyOnceWith('org-a', expect.any(Function));
    expect(createManyAndReturn).toHaveBeenCalledExactlyOnceWith({ data: rows });
  });
});
