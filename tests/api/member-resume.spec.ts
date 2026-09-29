import { describe, it, expect, vi, beforeEach } from 'vitest';
import JSZip from 'jszip';

// ─── Mocks ───
vi.mock('next/server', () => {
  class MockNextRequest extends Request {
    get nextUrl() {
      return new URL(this.url);
    }
  }
  return {
    NextRequest: MockNextRequest,
    NextResponse: {
      json: (body: unknown, init?: ResponseInit) =>
        new Response(JSON.stringify(body), {
          ...init,
          headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
        }),
    },
  };
});

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
  getUser: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
  isSuperAdmin: vi.fn(() => Promise.resolve(false)),
  isAdmin: vi.fn(),
  isCounselor: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }),
    profile: {
      findUnique: vi.fn(),
    },
    counselorAssignment: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock('@/lib/member/getMemberResumePlainText', () => ({
  getMemberResumePlainText: vi.fn(),
}));

vi.mock('@/lib/counselor/staffMemberAccess', () => ({
  assertStaffCanAccessMemberRecord: vi.fn(),
}));

// ─── Imports after mocks ───
import { GET as resumeGET } from '@/app/api/member/resume/route';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getMemberResumePlainText } from '@/lib/member/getMemberResumePlainText';
import { assertStaffCanAccessMemberRecord } from '@/lib/counselor/staffMemberAccess';

function makeReq(url: string, init?: RequestInit) {
  class MockNextRequest extends Request {
    get nextUrl() {
      return new URL(this.url);
    }
  }
  return new MockNextRequest(url, init);
}

function storedText(text: string) {
  return { arrayBuffer: () => Promise.resolve(new TextEncoder().encode(text).buffer) };
}

describe('GET /api/member/resume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(false);
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null as any);

    const res = await resumeGET(makeReq('http://localhost:3000/api/member/resume') as any);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns resume metadata for authenticated user with no resume', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123' } as any);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({
      userId: 'user-123',
      resumeOriginalPath: null,
      resumeEnhancedPath: null,
    } as any);

    const res = await resumeGET(makeReq('http://localhost:3000/api/member/resume') as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.hasOriginal).toBe(false);
    expect(json.hasEnhanced).toBe(false);
    expect(json.originalUrl).toBeNull();
    expect(json.enhancedUrl).toBeNull();
  });

  it('returns signed URLs when resume files exist', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123' } as any);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({
      userId: 'user-123',
      resumeOriginalPath: 'user-123/original.pdf',
      resumeEnhancedPath: 'user-123/enhanced.txt',
    } as any);

    const sharedMock = {
      createSignedUrl: vi.fn()
        .mockResolvedValueOnce({ data: { signedUrl: 'https://signed/original' }, error: null })
        .mockResolvedValueOnce({ data: { signedUrl: 'https://signed/enhanced' }, error: null }),
      download: vi.fn().mockResolvedValue({ data: storedText('Synthetic member resume with verified work and inventory skills.'), error: null }),
    };
    const mockFrom = vi.fn(() => sharedMock);
    vi.mocked(getSupabaseAdmin).mockReturnValue({ storage: { from: mockFrom } } as any);

    const res = await resumeGET(makeReq('http://localhost:3000/api/member/resume') as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.hasOriginal).toBe(true);
    expect(json.hasEnhanced).toBe(true);
    expect(json.originalUrl).toBe('https://signed/original');
    expect(json.enhancedUrl).toBe('https://signed/enhanced');
    expect(json.enhancedText).toBe('Synthetic member resume with verified work and inventory skills.');
  });

  it('returns local metadata without signing or downloading files during a read-only audit', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123' } as any);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({
      userId: 'user-123',
      resumeOriginalPath: 'user-123/original.pdf',
      resumeEnhancedPath: 'user-123/enhanced.docx',
    } as any);

    const res = await resumeGET(makeReq('http://localhost:3000/api/member/resume?includePlainText=1', {
      headers: { 'x-workforceap-read-only-audit': '1' },
    }) as any);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      hasOriginal: true,
      hasEnhanced: true,
      originalUrl: null,
      enhancedUrl: null,
      resumePlainText: null,
      previewOriginalPath: null,
      previewEnhancedPath: null,
      auditSuppressed: true,
    });
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
    expect(getMemberResumePlainText).not.toHaveBeenCalled();
  });

  it('includes plain text when includePlainText=1', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123' } as any);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({
      userId: 'user-123',
      resumeOriginalPath: 'user-123/original.pdf',
      resumeEnhancedPath: null,
    } as any);
    vi.mocked(getMemberResumePlainText).mockResolvedValue('plain resume text');

    const mockFrom = vi.fn(() => ({
      createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed/original' }, error: null }),
    }));
    vi.mocked(getSupabaseAdmin).mockReturnValue({ storage: { from: mockFrom } } as any);

    const res = await resumeGET(
      makeReq('http://localhost:3000/api/member/resume?includePlainText=1') as any
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.resumePlainText).toBe('plain resume text');
  });

  it('returns no enhanced draft for an original-only text request when the original is unreadable', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123' } as any);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({
      userId: 'user-123',
      resumeOriginalPath: 'user-123/original.pdf',
      resumeEnhancedPath: 'user-123/enhanced.txt',
    } as any);
    vi.mocked(getMemberResumePlainText).mockImplementation(async (_userId, _maxChars, opts) =>
      opts?.originalOnly ? '' : 'AI-enhanced draft that is not original source evidence.',
    );
    const storage = {
      createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed/resume' }, error: null }),
      download: vi.fn().mockResolvedValue({
        data: storedText('Synthetic enhanced draft with enough readable resume text to inspect.'),
        error: null,
      }),
    };
    vi.mocked(getSupabaseAdmin).mockReturnValue({ storage: { from: () => storage } } as any);

    const originalOnly = await resumeGET(
      makeReq('http://localhost:3000/api/member/resume?includePlainText=1&originalOnly=1') as any,
    );
    expect(originalOnly.status).toBe(200);
    expect((await originalOnly.json()).resumePlainText).toBeNull();
    expect(getMemberResumePlainText).toHaveBeenCalledWith('user-123', 12000, { originalOnly: true });

    const defaultRead = await resumeGET(
      makeReq('http://localhost:3000/api/member/resume?includePlainText=1') as any,
    );
    expect(defaultRead.status).toBe(200);
    expect((await defaultRead.json()).resumePlainText).toMatch(/AI-enhanced draft/);
  });

  it('returns 403 when requesting another member as non-admin/non-counselor', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123' } as any);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(false);

    const res = await resumeGET(
      makeReq('http://localhost:3000/api/member/resume?memberId=user-456') as any
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('allows admin to access any member resume', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(true);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({
      userId: 'user-456',
      resumeOriginalPath: null,
      resumeEnhancedPath: null,
    } as any);

    const res = await resumeGET(
      makeReq('http://localhost:3000/api/member/resume?memberId=user-456') as any
    );
    expect(res.status).toBe(200);
    expect(prisma.profile.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-456' } })
    );
  });

  it('allows counselor to access assigned member resume', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'counselor-1' } as any);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(true);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({
      userId: 'user-456',
      resumeOriginalPath: null,
      resumeEnhancedPath: null,
    } as any);

    const res = await resumeGET(
      makeReq('http://localhost:3000/api/member/resume?memberId=user-456') as any
    );
    expect(res.status).toBe(200);
    expect(assertStaffCanAccessMemberRecord).toHaveBeenCalledWith('counselor-1', 'user-456');
  });

  it('returns 403 when counselor accesses unassigned member', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'counselor-1' } as any);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(false);

    const res = await resumeGET(
      makeReq('http://localhost:3000/api/member/resume?memberId=user-456') as any
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns 502 when storage sign fails', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123' } as any);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({
      userId: 'user-123',
      resumeOriginalPath: 'user-123/original.pdf',
      resumeEnhancedPath: null,
    } as any);

    const mockFrom = vi.fn(() => ({
      createSignedUrl: vi.fn().mockResolvedValue({ data: null, error: { message: 'Bucket not found' } }),
      download: vi.fn().mockResolvedValue({ data: storedText('Synthetic member resume with verified work and inventory skills.'), error: null }),
    }));
    vi.mocked(getSupabaseAdmin).mockReturnValue({ storage: { from: mockFrom } } as any);

    const res = await resumeGET(makeReq('http://localhost:3000/api/member/resume') as any);
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toContain('Storage is not configured');
  });

  it('returns file extensions correctly', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123' } as any);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({
      userId: 'user-123',
      resumeOriginalPath: 'user-123/original.PDF',
      resumeEnhancedPath: 'user-123/enhanced.docx',
    } as any);

    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
    zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Synthetic candidate with verified inventory and logistics experience.</w:t></w:r></w:p></w:body></w:document>');
    const docx = await zip.generateAsync({ type: 'uint8array' });
    const mockFrom = vi.fn(() => ({
      createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed' }, error: null }),
      download: vi.fn().mockResolvedValue({ data: { arrayBuffer: async () => docx.buffer }, error: null }),
    }));
    vi.mocked(getSupabaseAdmin).mockReturnValue({ storage: { from: mockFrom } } as any);

    const res = await resumeGET(makeReq('http://localhost:3000/api/member/resume') as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.originalExt).toBe('pdf');
    expect(json.enhancedExt).toBe('docx');
  });
});
