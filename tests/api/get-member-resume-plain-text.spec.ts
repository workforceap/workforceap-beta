import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findProfile: vi.fn(),
  download: vi.fn(),
  extract: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    profile: { findUnique: mocks.findProfile },
  },
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    storage: {
      from: () => ({ download: mocks.download }),
    },
  }),
}));

vi.mock('@/lib/resume/extractTextFromResumeBuffer', () => ({
  extractTextFromResumeBuffer: mocks.extract,
}));

import { getMemberResumePlainText } from '@/lib/member/getMemberResumePlainText';

describe('getMemberResumePlainText substantive text gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findProfile.mockResolvedValue({
      resumeOriginalPath: 'member-1/resume-original-v1.txt',
      resumeEnhancedPath: null,
    });
    mocks.download.mockResolvedValue({
      data: {
        arrayBuffer: async () => new ArrayBuffer(8),
      },
      error: null,
    });
  });

  it('does not surface a stored extraction below 40 normalized characters', async () => {
    mocks.extract.mockResolvedValue('x'.repeat(39));

    await expect(getMemberResumePlainText('member-1')).resolves.toBe('');
  });

  it('does not query metadata or storage during a read-only audit', async () => {
    await expect(
      getMemberResumePlainText('member-1', 8000, { readOnlyAudit: true }),
    ).resolves.toBe('');

    expect(mocks.findProfile).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('surfaces a safe stored extraction at the shared 40-character boundary', async () => {
    mocks.extract.mockResolvedValue('x'.repeat(40));

    await expect(getMemberResumePlainText('member-1')).resolves.toBe('x'.repeat(40));
  });

  it('falls through an undersized preferred variant to a substantive alternate', async () => {
    mocks.findProfile.mockResolvedValue({
      resumeOriginalPath: 'member-1/resume-original-v1.txt',
      resumeEnhancedPath: 'member-1/resume-enhanced-v1.txt',
    });
    mocks.extract
      .mockResolvedValueOnce('x'.repeat(12))
      .mockResolvedValueOnce('Database administrator with SQL, backup, recovery, and security experience.');

    const result = await getMemberResumePlainText('member-1', 8000, { preferOriginal: true });

    expect(result).toMatch(/Database administrator/);
    expect(mocks.download).toHaveBeenCalledTimes(2);
  });

  it('never uses an enhanced draft as the source when originalOnly is requested', async () => {
    mocks.findProfile.mockResolvedValue({
      resumeOriginalPath: 'member-1/resume-original-v1.pdf',
      resumeEnhancedPath: 'member-1/resume-enhanced-v1.txt',
    });
    mocks.extract
      .mockRejectedValueOnce(new Error('Unreadable original'))
      .mockRejectedValueOnce(new Error('Unreadable original'))
      .mockResolvedValueOnce('Enhanced draft for non-Rewriter session context with enough real text.');

    await expect(getMemberResumePlainText('member-1', 8000, { originalOnly: true })).resolves.toBe('');
    expect(mocks.download).toHaveBeenCalledTimes(1);
    expect(mocks.download).toHaveBeenCalledWith('member-1/resume-original-v1.pdf');

    // Other session tools retain the fallback; Rewriter's originalOnly read
    // above cannot consume it when extraction fails.
    await expect(getMemberResumePlainText('member-1', 8000, { preferOriginal: true }))
      .resolves.toMatch(/Enhanced draft/);
    expect(mocks.download).toHaveBeenNthCalledWith(2, 'member-1/resume-original-v1.pdf');
    expect(mocks.download).toHaveBeenNthCalledWith(3, 'member-1/resume-enhanced-v1.txt');
  });

  it('keeps enhanced-only storage out of an originalOnly read', async () => {
    mocks.findProfile.mockResolvedValue({
      resumeOriginalPath: null,
      resumeEnhancedPath: 'member-1/resume-enhanced-v1.txt',
    });
    mocks.extract.mockResolvedValue('Enhanced draft for non-Rewriter context with enough real text.');

    await expect(getMemberResumePlainText('member-1', 8000, { originalOnly: true })).resolves.toBe('');
    expect(mocks.download).not.toHaveBeenCalled();
    await expect(getMemberResumePlainText('member-1', 8000, { preferOriginal: true }))
      .resolves.toMatch(/Enhanced draft/);
    expect(mocks.download).toHaveBeenCalledWith('member-1/resume-enhanced-v1.txt');
  });

  it('skips a stored AI extraction-failure narrative and returns the original resume', async () => {
    mocks.findProfile.mockResolvedValue({
      resumeOriginalPath: 'member-1/resume-original-v1.txt',
      resumeEnhancedPath: 'member-1/resume-enhanced-v1.txt',
    });
    mocks.extract
      .mockResolvedValueOnce(
        'Given the provided information, the "base resume to improve" is a raw PDF stream that cannot be parsed for text content. Therefore, the enhanced resume will contain only a generic summary.',
      )
      .mockResolvedValueOnce(
        'Jordan Candidate\nExperience\nDatabase administrator using SQL, backups, and recovery.',
      );

    const result = await getMemberResumePlainText('member-1');

    expect(result).toMatch(/Jordan Candidate/);
    expect(result).not.toMatch(/raw PDF stream/i);
    expect(mocks.download).toHaveBeenCalledTimes(2);
  });
});
