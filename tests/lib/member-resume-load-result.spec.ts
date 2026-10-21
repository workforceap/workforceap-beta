// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findProfile: vi.fn(),
  admin: vi.fn(),
  from: vi.fn(),
  download: vi.fn(),
  extract: vi.fn(),
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: { profile: { findUnique: mocks.findProfile } } }));
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: mocks.admin }));
vi.mock('@/lib/resume/extractTextFromResumeBuffer', () => ({ extractTextFromResumeBuffer: mocks.extract }));

import {
  __resetAdminUnavailableWarningForTests,
  getMemberResumeLoadResult,
  getMemberResumePlainText,
} from '@/lib/member/getMemberResumePlainText';

const USER = 'member-synthetic';
const ORIGINAL = `${USER}/original.pdf`;
const ENHANCED = `${USER}/enhanced.txt`;
const TEXT = 'Synthetic candidate. IT support specialist with experience resolving service requests and documenting solutions.';

beforeEach(() => {
  vi.resetAllMocks();
  __resetAdminUnavailableWarningForTests();
  mocks.findProfile.mockResolvedValue({ resumeOriginalPath: ORIGINAL, resumeEnhancedPath: ENHANCED });
  mocks.from.mockReturnValue({ download: mocks.download });
  mocks.admin.mockReturnValue({ storage: { from: mocks.from } });
  mocks.download.mockResolvedValue({ data: { arrayBuffer: async () => new ArrayBuffer(8) }, error: null });
  mocks.extract.mockResolvedValue(TEXT);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('member resume load outcome', () => {
  it('returns readable text only from the signed-in member-owned path', async () => {
    await expect(getMemberResumeLoadResult(USER, 70)).resolves.toEqual({ status: 'available', text: TEXT.slice(0, 70) });
    expect(mocks.findProfile).toHaveBeenCalledWith({ where: { userId: USER } });
    expect(mocks.from).toHaveBeenCalledWith('member-resumes');
    expect(mocks.download).toHaveBeenCalledExactlyOnceWith(ENHANCED);
  });

  it.each([null, { resumeOriginalPath: null, resumeEnhancedPath: null }])(
    'confirms absence only when metadata has no requested resume reference (%j)', async (profile) => {
      mocks.findProfile.mockResolvedValue(profile);
      await expect(getMemberResumeLoadResult(USER)).resolves.toEqual({ status: 'absent' });
      expect(mocks.admin).not.toHaveBeenCalled();
      expect(mocks.download).not.toHaveBeenCalled();
    },
  );

  it('keeps a metadata failure throwable for callers with a database retry policy', async () => {
    const failure = new Error('synthetic database unavailable');
    mocks.findProfile.mockRejectedValue(failure);
    await expect(getMemberResumeLoadResult(USER)).rejects.toBe(failure);
    await expect(getMemberResumePlainText(USER)).rejects.toBe(failure);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it('reports audit suppression without reading metadata, storage, or extraction', async () => {
    await expect(getMemberResumeLoadResult(USER, 8000, { readOnlyAudit: true })).resolves.toEqual({ status: 'audit-suppressed' });
    await expect(getMemberResumePlainText(USER, 8000, { readOnlyAudit: true })).resolves.toBe('');
    expect(mocks.findProfile).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.extract).not.toHaveBeenCalled();
  });

  it('does not present a foreign or malformed reference as absent and never downloads it', async () => {
    mocks.findProfile.mockResolvedValue({ resumeOriginalPath: 'different-member/original.pdf', resumeEnhancedPath: '../escape.txt' });
    await expect(getMemberResumeLoadResult(USER)).resolves.toEqual({ status: 'unavailable' });
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('skips a foreign preferred reference while retaining the owned alternate', async () => {
    mocks.findProfile.mockResolvedValue({ resumeOriginalPath: ORIGINAL, resumeEnhancedPath: 'different-member/enhanced.txt' });
    await expect(getMemberResumeLoadResult(USER)).resolves.toEqual({ status: 'available', text: TEXT });
    expect(mocks.download).toHaveBeenCalledExactlyOnceWith(ORIGINAL);
  });

  it('reports unavailable when a storage client cannot be created without changing the string API', async () => {
    mocks.admin.mockImplementation(() => { throw new Error('synthetic missing configuration'); });
    await expect(getMemberResumeLoadResult(USER)).resolves.toEqual({ status: 'unavailable' });
    await expect(getMemberResumePlainText(USER)).resolves.toBe('');
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it.each(['provider-error', 'no-data', 'exception'])('distinguishes a %s download failure from absence', async (failure) => {
    if (failure === 'exception') mocks.download.mockRejectedValue(new Error('synthetic storage failure'));
    else mocks.download.mockResolvedValue({ data: null, error: failure === 'provider-error' ? { message: 'synthetic' } : null });
    await expect(getMemberResumeLoadResult(USER)).resolves.toEqual({ status: 'unavailable' });
    await expect(getMemberResumePlainText(USER)).resolves.toBe('');
    expect(mocks.extract).not.toHaveBeenCalled();
  });

  it.each(['blank', 'short', 'exception'])('distinguishes %s extraction from a missing file', async (failure) => {
    if (failure === 'exception') mocks.extract.mockRejectedValue(new Error('synthetic parser failure'));
    else mocks.extract.mockResolvedValue(failure === 'blank' ? '' : 'short');
    await expect(getMemberResumeLoadResult(USER)).resolves.toEqual({ status: 'unavailable' });
    await expect(getMemberResumePlainText(USER)).resolves.toBe('');
  });

  it('retains original-first fallback after extraction failure', async () => {
    mocks.extract.mockRejectedValueOnce(new Error('synthetic unreadable original'));
    await expect(getMemberResumeLoadResult(USER, 8000, { preferOriginal: true })).resolves.toEqual({ status: 'available', text: TEXT });
    expect(mocks.download.mock.calls.map(([path]) => path)).toEqual([ORIGINAL, ENHANCED]);
  });

  it('never promotes an enhanced draft into original-only generation context', async () => {
    mocks.extract.mockRejectedValueOnce(new Error('synthetic unreadable original'));
    await expect(getMemberResumeLoadResult(USER, 8000, { originalOnly: true })).resolves.toEqual({ status: 'unavailable' });
    expect(mocks.download).toHaveBeenCalledExactlyOnceWith(ORIGINAL);
    await expect(getMemberResumeLoadResult(USER, 8000, { enhancedOnly: true })).resolves.toEqual({ status: 'available', text: TEXT });
    expect(mocks.download.mock.calls.map(([path]) => path)).toEqual([ORIGINAL, ENHANCED]);
  });
});
