import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  upload: vi.fn(async (_path: string) => ({ error: null })),
  remove: vi.fn(async (_paths: string[]) => ({ error: null })),
  profile: {
    findUnique: vi.fn(async () => ({ resumeOriginalPath: 'member-1/old.pdf', resumeEnhancedPath: null })),
    create: vi.fn(async () => ({})),
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: { $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({ profile: h.profile }) },
}));
vi.mock('@/lib/member/uploadLifecycle', () => {
  class MemberUploadLifecycleError extends Error {}
  return {
    MemberUploadLifecycleError,
    assertMemberUploadWritable: vi.fn(async () => { throw new MemberUploadLifecycleError(); }),
  };
});
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: vi.fn() }));

import { replaceResumeObjectsAtomically, AtomicResumeObjectSwapError } from '@/lib/resume/atomicResumeObjectSwap';
import { swapResumeProfilePathsWithCas } from '@/lib/resume/resumeProfileStorage';
import { MemberUploadLifecycleError } from '@/lib/member/uploadLifecycle';

describe('resume upload after account deletion', () => {
  it('leaves the old pointer untouched and removes the newly staged object', async () => {
    let rejected: unknown;
    try {
      await replaceResumeObjectsAtomically({
        userId: 'member-1',
        uploads: [{ field: 'resumeOriginalPath', extension: 'pdf', contentType: 'application/pdf', body: new Uint8Array([37, 80, 68, 70]) }],
        uploadObject: h.upload,
        removeObjects: h.remove,
        makeVersionId: () => 'new',
        swapProfilePaths: (paths) => swapResumeProfilePathsWithCas('member-1', paths),
      });
    } catch (error) {
      rejected = error;
    }

    expect(rejected).toBeInstanceOf(AtomicResumeObjectSwapError);
    expect((rejected as AtomicResumeObjectSwapError).causeValue).toBeInstanceOf(MemberUploadLifecycleError);
    expect(h.upload).toHaveBeenCalledWith('member-1/resume-original-new.pdf', expect.any(Uint8Array), { upsert: false, contentType: 'application/pdf' });
    expect(h.remove).toHaveBeenCalledWith(['member-1/resume-original-new.pdf']);
    expect(h.profile.findUnique).not.toHaveBeenCalled();
    expect(h.profile.create).not.toHaveBeenCalled();
    expect(h.profile.updateMany).not.toHaveBeenCalled();
  });
});
