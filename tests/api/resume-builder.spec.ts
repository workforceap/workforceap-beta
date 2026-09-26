import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ get: vi.fn(), getAll: vi.fn(() => []), set: vi.fn() })),
}));

vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(),
  resolveAuthGucContext: vi.fn(() => Promise.resolve({ role: 'authenticated', userId: 'test-user' })),
}));

vi.mock('@/lib/auth/roles', () => ({
  isSuperAdmin: vi.fn(() => Promise.resolve(false)),
  isAdmin: vi.fn(),
  isAdminInOrg: vi.fn(() => Promise.resolve(false)),
  isCounselor: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => {
  const profile = {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  };
  const user = {
    findUnique: vi.fn(),
  };
  const counselorAssignment = {
    findFirst: vi.fn(),
  };
  const memberNextBestAction = {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  };
  return { prisma: { $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }), profile, user, counselorAssignment, memberNextBestAction } };
});

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock('@/lib/content/programs', () => ({
  getProgramBySlug: vi.fn(),
}));

vi.mock('@/lib/ai/groq', () => ({
  chatCompletion: vi.fn(),
  isAIConfigured: vi.fn(),
  isGroqConfigured: vi.fn(),
}));

vi.mock('@/lib/ai/anthropicChat', () => ({
  claudeChat: vi.fn(),
  isAnthropicConfigured: vi.fn(),
}));

vi.mock('@/lib/ai/postProcess', () => ({
  cleanLongFormPlainText: vi.fn((text: string) => text.trim()),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkAIToolRateLimit: vi.fn(),
  checkResumeDraftSaveRateLimit: vi.fn(() => Promise.resolve({ success: true })),
}));

vi.mock('@/lib/member/getMemberResumePlainText', () => ({
  getMemberResumePlainText: vi.fn(),
}));

vi.mock('@/lib/workflows/completeCareerOsActions', () => ({
  completeCareerOsResumeActions: vi.fn(),
}));

vi.mock('@/lib/resume/resumeProfileStorage', () => ({
  saveEnhancedResumeText: vi.fn(),
  isResumeProfileConflict: vi.fn(),
}));

vi.mock('@/lib/counselor/staffMemberAccess', () => ({
  assertStaffCanAccessMemberRecord: vi.fn(),
}));

// ─── Imports after mocks ───
import { POST as generateResume } from '@/app/api/member/resume/generate/route';
import { POST as savePlainResume } from '@/app/api/member/resume/plain-text/route';
import { GET as getResume } from '@/app/api/member/resume/route';
import { GET as getResumePreview } from '@/app/api/member/resume/preview/route';
import { GET as getCounselorMemberResume } from '@/app/api/counselor/members/[memberId]/resume/route';
import { GET as getCounselorResumePreview } from '@/app/api/counselor/members/[memberId]/resume/preview/route';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getProgramBySlug } from '@/lib/content/programs';
import { isGroqConfigured } from '@/lib/ai/groq';
import { claudeChat, isAnthropicConfigured } from '@/lib/ai/anthropicChat';
import { checkAIToolRateLimit } from '@/lib/rate-limit';
import { getMemberResumePlainText } from '@/lib/member/getMemberResumePlainText';
import { completeCareerOsResumeActions } from '@/lib/workflows/completeCareerOsActions';
import {
  isResumeProfileConflict,
  saveEnhancedResumeText,
} from '@/lib/resume/resumeProfileStorage';
import { getResumeProfileRevision } from '@/lib/resume/resumeProfileRevision';
import { assertStaffCanAccessMemberRecord } from '@/lib/counselor/staffMemberAccess';
import { NextRequest } from 'next/server';

const UUIDS = {
  user: '550e8400-e29b-41d4-a716-446655440001',
  counselor: '550e8400-e29b-41d4-a716-446655440002',
  admin: '550e8400-e29b-41d4-a716-446655440003',
};

const LEGACY_FAILURE_TEXT = 'Given the provided information, the "base resume to improve" is a raw PDF stream that cannot be parsed for text content. The enhanced resume will use contact information only.';

function mockSupabaseAdmin(storageFn?: () => any) {
  const storage = storageFn?.() ?? {
    upload: vi.fn(() => ({ error: null })),
    createSignedUrl: vi.fn(() => ({ data: { signedUrl: 'https://example.com/signed' }, error: null })),
    download: vi.fn(() => ({ data: storedText('Synthetic candidate with verified inventory and logistics experience.'), error: null })),
  };
  vi.mocked(getSupabaseAdmin).mockReturnValue({ storage: { from: () => storage } } as any);
  return storage;
}

function storedText(text: string) {
  return { arrayBuffer: () => Promise.resolve(new TextEncoder().encode(text).buffer) };
}

function mockUser(overrides: Partial<{ id: string; email: string; fullName: string; phone: string; enrolledProgram: string }> = {}) {
  return {
    id: UUIDS.user,
    email: 'member@example.com',
    fullName: 'Test Member',
    phone: '555-1234',
    enrolledProgram: 'cdl',
    ...overrides,
  };
}

function mockProfile(overrides: Partial<any> = {}) {
  return {
    userId: UUIDS.user,
    profilePhone: '555-1234',
    profileAddress: '123 Main St',
    profileLinkedin: 'linkedin.com/in/test',
    profileBio: 'I worked as a logistics coordinator for four years, managed incoming shipments, trained staff on inventory checks, and used spreadsheets to reconcile stock.',
    employmentStatus: 'unemployed',
    educationLevel: 'High School',
    resumeOriginalPath: null,
    resumeEnhancedPath: null,
    ...overrides,
  };
}

function mockProgram() {
  return {
    slug: 'cdl',
    title: 'Commercial Driver Training',
    categoryLabel: 'Transportation',
  };
}

function makeGenerateRequest(body?: object): any {
  return new Request('http://localhost:3000/api/member/resume/generate', {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
    headers: { 'content-type': 'application/json' },
  });
}

function makePlainResumeRequest(body: object): Request {
  return new Request('http://localhost:3000/api/member/resume/plain-text', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeGetResumeRequest(search?: string) {
  return new NextRequest(`http://localhost:3000/api/member/resume${search ?? ''}`);
}

function makeCounselorRequest(memberId: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(`http://localhost:3000/api/counselor/members/${memberId}/resume`, init);
}

// ─────────────────────────────────────────────
// POST /api/member/resume/generate
// ─────────────────────────────────────────────
describe('POST /api/member/resume/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAnthropicConfigured).mockReturnValue(false);
    vi.mocked(isGroqConfigured).mockReturnValue(false);
    vi.mocked(checkAIToolRateLimit).mockResolvedValue({ success: true });
    vi.mocked(getMemberResumePlainText).mockResolvedValue('');
    vi.mocked(getProgramBySlug).mockReturnValue(mockProgram() as any);
    vi.mocked(completeCareerOsResumeActions).mockResolvedValue({ completedCount: 0, actionIds: [] });
    vi.mocked(saveEnhancedResumeText).mockResolvedValue(`${UUIDS.user}/resume-enhanced-version.txt`);
    vi.mocked(isResumeProfileConflict).mockReturnValue(false);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(false);
    mockSupabaseAdmin();
  });

  it('returns 401 for unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null as any);

    const res = await generateResume(makeGenerateRequest());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 404 when user is not found', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser() as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const res = await generateResume(makeGenerateRequest());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'User not found' });
  });

  it('generates resume from member profile using Anthropic when configured', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser() as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser(),
      profile: mockProfile(),
    } as any);
    vi.mocked(isAnthropicConfigured).mockReturnValue(true);
    vi.mocked(claudeChat).mockResolvedValue('# Test Member\n\n## Professional Summary\nExperienced professional');
    vi.mocked(prisma.profile.upsert).mockResolvedValue({} as any);

    const res = await generateResume(makeGenerateRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.resume).toContain('Test Member');
    expect(body.fallbackUsed).toBe(false);
    expect(body.path).toBe(`${UUIDS.user}/resume-enhanced-version.txt`);
    expect(claudeChat).toHaveBeenCalledWith(
      expect.stringContaining('expert resume writer'),
      expect.stringContaining('Name: Test Member'),
      { maxTokens: 2000, allowGeminiFallback: false },
    );
    expect(checkAIToolRateLimit).toHaveBeenCalledWith(UUIDS.user);
    expect(saveEnhancedResumeText).toHaveBeenCalledWith(
      UUIDS.user,
      expect.stringContaining('Test Member'),
      { resumeOriginalPath: null, resumeEnhancedPath: null },
    );
  });

  it('rejects a sparse profile before an AI call or storage write', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser() as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser(),
      profile: mockProfile({ profileBio: null, employmentStatus: null, educationLevel: null }),
    } as any);
    vi.mocked(isAnthropicConfigured).mockReturnValue(true);

    const res = await generateResume(makeGenerateRequest());
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain('work history, skills, or education');
    expect(claudeChat).not.toHaveBeenCalled();
    expect(saveEnhancedResumeText).not.toHaveBeenCalled();
    expect(checkAIToolRateLimit).not.toHaveBeenCalled();
  });

  it('rejects an unreadable uploaded original instead of rewriting an older enhanced draft', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser() as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser(),
      profile: mockProfile({
        profileBio: null,
        resumeOriginalPath: `${UUIDS.user}/resume-original.pdf`,
        resumeEnhancedPath: `${UUIDS.user}/resume-enhanced.txt`,
      }),
    } as any);
    vi.mocked(getMemberResumePlainText).mockResolvedValue('');
    vi.mocked(isAnthropicConfigured).mockReturnValue(true);

    const res = await generateResume(makeGenerateRequest());
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain('could not read enough text');
    expect(getMemberResumePlainText).toHaveBeenCalledWith(UUIDS.user, 6000, { originalOnly: true });
    expect(claudeChat).not.toHaveBeenCalled();
    expect(saveEnhancedResumeText).not.toHaveBeenCalled();
  });

  it('keeps an unreadable uploaded original even when the profile bio has substance', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser() as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser(),
      profile: mockProfile({ resumeOriginalPath: `${UUIDS.user}/resume-original.pdf` }),
    } as any);
    vi.mocked(getMemberResumePlainText).mockResolvedValue('');
    vi.mocked(isAnthropicConfigured).mockReturnValue(true);

    const res = await generateResume(makeGenerateRequest());
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain('could not read enough text');
    expect(claudeChat).not.toHaveBeenCalled();
    expect(saveEnhancedResumeText).not.toHaveBeenCalled();
  });

  it('does not let client-supplied text bypass extraction of an uploaded original', async () => {
    const originalPath = `${UUIDS.user}/resume-original.pdf`;
    vi.mocked(getUser).mockResolvedValue(mockUser() as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser(),
      profile: mockProfile({ resumeOriginalPath: originalPath }),
    } as any);
    vi.mocked(getMemberResumePlainText).mockResolvedValue('');
    vi.mocked(isAnthropicConfigured).mockReturnValue(true);

    const res = await generateResume(makeGenerateRequest({
      resumeBase: 'Client supplied profile summary with logistics coordination experience.',
      resumeRevision: getResumeProfileRevision(originalPath, null),
    }));

    expect(res.status).toBe(422);
    expect(getMemberResumePlainText).toHaveBeenCalledWith(UUIDS.user, 6000, { originalOnly: true });
    expect(claudeChat).not.toHaveBeenCalled();
    expect(saveEnhancedResumeText).not.toHaveBeenCalled();
  });

  it('rejects a draft claiming source experience is missing before saving', async () => {
    const originalPath = `${UUIDS.user}/resume-original.pdf`;
    vi.mocked(getUser).mockResolvedValue(mockUser() as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser(),
      profile: mockProfile({ resumeOriginalPath: originalPath }),
    } as any);
    vi.mocked(getMemberResumePlainText).mockResolvedValue(
      'Jane Doe\nExperience Operations Manager | Acme Logistics\nManaged incoming shipments and trained staff.',
    );
    vi.mocked(isAnthropicConfigured).mockReturnValue(true);
    vi.mocked(claudeChat).mockResolvedValue(
      '# Jane Doe\n\n## Experience — No employment history was provided in the resume or profile.',
    );

    const res = await generateResume(makeGenerateRequest());

    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain('did not preserve details');
    expect(saveEnhancedResumeText).not.toHaveBeenCalled();
  });

  it('rejects raw PDF body text before a model call when the stored original is unreadable', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser() as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser(),
      profile: mockProfile({ profileBio: null, resumeOriginalPath: `${UUIDS.user}/resume-original.pdf` }),
    } as any);
    vi.mocked(isAnthropicConfigured).mockReturnValue(true);

    const res = await generateResume(makeGenerateRequest({
      resumeBase: '%PDF-1.7\n1 0 obj\nstream\nraw bytes cannot be a resume\nendstream\nendobj',
      resumeRevision: getResumeProfileRevision(`${UUIDS.user}/resume-original.pdf`, null),
    }));
    expect(res.status).toBe(422);
    expect(claudeChat).not.toHaveBeenCalled();
    expect(saveEnhancedResumeText).not.toHaveBeenCalled();
  });

  it('falls back to Groq when Anthropic is not configured', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser() as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser(),
      profile: mockProfile(),
    } as any);
    vi.mocked(isAnthropicConfigured).mockReturnValue(false);
    vi.mocked(isGroqConfigured).mockReturnValue(true);
    vi.mocked(claudeChat).mockResolvedValue('# Test Member\n\n## Experience\nDriver at ABC Corp');
    vi.mocked(prisma.profile.upsert).mockResolvedValue({} as any);

    const res = await generateResume(makeGenerateRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.fallbackUsed).toBe(false);
    expect(claudeChat).toHaveBeenCalledWith(
      expect.stringContaining('expert resume writer'),
      expect.stringContaining('Name: Test Member'),
      { maxTokens: 2000, allowGeminiFallback: false },
    );
  });

  it('keeps the existing resume when AI is not configured', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser() as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser(),
      profile: mockProfile(),
    } as any);
    const res = await generateResume(makeGenerateRequest());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toContain('temporarily unavailable');
    expect(saveEnhancedResumeText).not.toHaveBeenCalled();
  });

  it('keeps the existing resume when AI returns empty response', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser() as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser(),
      profile: mockProfile(),
    } as any);
    vi.mocked(isAnthropicConfigured).mockReturnValue(true);
    vi.mocked(claudeChat).mockResolvedValue('');
    vi.mocked(prisma.profile.upsert).mockResolvedValue({} as any);

    const res = await generateResume(makeGenerateRequest());
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain('not readable');
    expect(saveEnhancedResumeText).not.toHaveBeenCalled();
  });

  it('does not save model commentary about an unreadable PDF as a resume', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser() as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser(),
      profile: mockProfile(),
    } as any);
    vi.mocked(isAnthropicConfigured).mockReturnValue(true);
    vi.mocked(claudeChat).mockResolvedValue(LEGACY_FAILURE_TEXT);

    const res = await generateResume(makeGenerateRequest());
    expect(res.status).toBe(422);
    expect(saveEnhancedResumeText).not.toHaveBeenCalled();
  });

  it('rate-limits every configured provider before generation', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser() as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser(),
      profile: mockProfile(),
    } as any);
    vi.mocked(isAnthropicConfigured).mockReturnValue(true);
    vi.mocked(checkAIToolRateLimit).mockResolvedValue({ success: false });

    const res = await generateResume(makeGenerateRequest());
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain('limit reached');
    expect(claudeChat).not.toHaveBeenCalled();
    expect(saveEnhancedResumeText).not.toHaveBeenCalled();
  });

  it('keeps the existing resume when there is no profile evidence', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser() as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser(),
      profile: null,
    } as any);
    const res = await generateResume(makeGenerateRequest());
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain('work history, skills, or education');
  });

  it('uses resumeBase from request body when provided', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser() as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser(),
      profile: mockProfile(),
    } as any);
    vi.mocked(isAnthropicConfigured).mockReturnValue(true);
    vi.mocked(claudeChat).mockResolvedValue('# Enhanced Resume\n\nProfessional summary with verified experience and skills.');

    const res = await generateResume(makeGenerateRequest({
      resumeBase: 'My original resume content with enough verified work history to improve safely.',
      resumeRevision: getResumeProfileRevision(null, null),
    }));
    expect(res.status).toBe(200);
    expect(claudeChat).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('My original resume content'),
      expect.any(Object)
    );
  });

  it('returns 500 when Supabase storage upload fails', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser() as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser(),
      profile: mockProfile(),
    } as any);
    vi.mocked(isAnthropicConfigured).mockReturnValue(true);
    vi.mocked(claudeChat).mockResolvedValue('# Resume\n\nVerified professional experience and skills for this member.');
    vi.mocked(saveEnhancedResumeText).mockRejectedValue(new Error('Storage error'));

    const res = await generateResume(makeGenerateRequest());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to save resume' });
  });

  it('completes career OS actions after successful generation', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser() as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser(),
      profile: mockProfile(),
    } as any);
    vi.mocked(isAnthropicConfigured).mockReturnValue(true);
    vi.mocked(claudeChat).mockResolvedValue('# Resume\n\nVerified professional experience and skills for this member.');

    await generateResume(makeGenerateRequest());
    expect(completeCareerOsResumeActions).toHaveBeenCalledWith(UUIDS.user);
  });

  it('returns 409 when a newer original lands while AI generation is in flight', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser() as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser(),
      profile: mockProfile({
        resumeOriginalPath: `${UUIDS.user}/resume-original-a.pdf`,
        resumeEnhancedPath: `${UUIDS.user}/resume-enhanced-a.txt`,
      }),
    } as any);
    vi.mocked(isAnthropicConfigured).mockReturnValue(true);
    vi.mocked(claudeChat).mockResolvedValue('# Resume\n\nVerified professional experience and skills for this member.');
    vi.mocked(getMemberResumePlainText).mockResolvedValue(
      'Synthetic source resume with verified inventory work and logistics experience.',
    );
    const conflict = new Error('stale lineage');
    vi.mocked(saveEnhancedResumeText).mockRejectedValue(conflict);
    vi.mocked(isResumeProfileConflict).mockImplementation((error) => error === conflict);

    const res = await generateResume(makeGenerateRequest());

    expect(res.status).toBe(409);
    expect(saveEnhancedResumeText).toHaveBeenCalledWith(
      UUIDS.user,
      expect.any(String),
      {
        resumeOriginalPath: `${UUIDS.user}/resume-original-a.pdf`,
        resumeEnhancedPath: `${UUIDS.user}/resume-enhanced-a.txt`,
      },
    );
    expect(completeCareerOsResumeActions).not.toHaveBeenCalled();
  });
});

describe('POST /api/member/resume/plain-text lineage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue(mockUser() as any);
    vi.mocked(saveEnhancedResumeText).mockResolvedValue(`${UUIDS.user}/resume-enhanced-b.txt`);
    vi.mocked(isResumeProfileConflict).mockReturnValue(false);
    vi.mocked(completeCareerOsResumeActions).mockResolvedValue({ completedCount: 0, actionIds: [] });
  });

  it('rejects a stale editor after a newer original resume is uploaded', async () => {
    vi.mocked(prisma.profile.findUnique).mockResolvedValue(mockProfile({
      resumeOriginalPath: `${UUIDS.user}/resume-original-b.pdf`,
      resumeEnhancedPath: null,
    }) as any);

    const res = await savePlainResume(makePlainResumeRequest({
      plainText: 'Verified work experience and education from the older resume draft.',
      resumeRevision: getResumeProfileRevision(`${UUIDS.user}/resume-original-a.pdf`, null),
    }));

    expect(res.status).toBe(409);
    expect(saveEnhancedResumeText).not.toHaveBeenCalled();
  });

  it('saves against both captured pointers and returns the next opaque revision', async () => {
    const originalPath = `${UUIDS.user}/resume-original-a.pdf`;
    const enhancedPath = `${UUIDS.user}/resume-enhanced-a.txt`;
    vi.mocked(prisma.profile.findUnique).mockResolvedValue(mockProfile({
      resumeOriginalPath: originalPath,
      resumeEnhancedPath: enhancedPath,
    }) as any);

    const res = await savePlainResume(makePlainResumeRequest({
      plainText: 'Verified work experience and education for the current resume draft.',
      resumeRevision: getResumeProfileRevision(originalPath, enhancedPath),
    }));

    expect(res.status).toBe(200);
    expect(saveEnhancedResumeText).toHaveBeenCalledWith(
      UUIDS.user,
      expect.stringContaining('Verified work experience'),
      { resumeOriginalPath: originalPath, resumeEnhancedPath: enhancedPath },
    );
    expect(await res.json()).toMatchObject({
      ok: true,
      resumeRevision: getResumeProfileRevision(
        originalPath,
        `${UUIDS.user}/resume-enhanced-b.txt`,
      ),
    });
  });

  it('returns 409 when the profile changes between revision validation and CAS', async () => {
    const originalPath = `${UUIDS.user}/resume-original-a.pdf`;
    vi.mocked(prisma.profile.findUnique).mockResolvedValue(mockProfile({
      resumeOriginalPath: originalPath,
      resumeEnhancedPath: null,
    }) as any);
    const conflict = new Error('concurrent replacement');
    vi.mocked(saveEnhancedResumeText).mockRejectedValue(conflict);
    vi.mocked(isResumeProfileConflict).mockImplementation((error) => error === conflict);

    const res = await savePlainResume(makePlainResumeRequest({
      plainText: 'Verified work experience and education for the current resume draft.',
      resumeRevision: getResumeProfileRevision(originalPath, null),
    }));

    expect(res.status).toBe(409);
    expect(completeCareerOsResumeActions).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
// GET /api/member/resume
// ─────────────────────────────────────────────
describe('GET /api/member/resume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMemberResumePlainText).mockResolvedValue('');
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(false);
    mockSupabaseAdmin();
  });

  it('returns 401 for unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null as any);

    const res = await getResume(makeGetResumeRequest());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns resume metadata and enhanced text for authenticated user', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser() as any);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({
      ...mockProfile(),
      resumeOriginalPath: `${UUIDS.user}/resume-original.pdf`,
      resumeEnhancedPath: `${UUIDS.user}/resume-enhanced.txt`,
    } as any);
    const storage = mockSupabaseAdmin(() => ({
      createSignedUrl: vi.fn(() => ({ data: { signedUrl: 'https://example.com/signed' }, error: null })),
      download: vi.fn(() => ({ data: storedText('# Test Member\n\n## Professional Summary\nExperienced professional\n\n## Experience\nDriver at ABC Corp\n\n## Education\nHigh School\n\n## Core Skills\nCommunication'), error: null })),
    }));

    const res = await getResume(makeGetResumeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasOriginal).toBe(true);
    expect(body.hasEnhanced).toBe(true);
    expect(body.originalUrl).toBe('https://example.com/signed');
    expect(body.enhancedUrl).toBe('https://example.com/signed');
    expect(body.enhancedText).toContain('Professional Summary');
    expect(body.enhancedText).toContain('Experience');
    expect(body.enhancedText).toContain('Education');
    expect(body.enhancedText).toContain('Core Skills');
    expect(body.originalExt).toBe('pdf');
    expect(body.enhancedExt).toBe('txt');
    expect(body.resumeRevision).toBe(getResumeProfileRevision(
      `${UUIDS.user}/resume-original.pdf`,
      `${UUIDS.user}/resume-enhanced.txt`,
    ));
  });

  it('quarantines an unsafe legacy enhanced draft without deleting the original', async () => {
    const originalPath = `${UUIDS.user}/resume-original.pdf`;
    const enhancedPath = `${UUIDS.user}/resume-enhanced.txt`;
    vi.mocked(getUser).mockResolvedValue(mockUser() as any);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue(mockProfile({
      resumeOriginalPath: originalPath,
      resumeEnhancedPath: enhancedPath,
    }) as any);
    const storage = mockSupabaseAdmin(() => ({
      createSignedUrl: vi.fn(() => ({ data: { signedUrl: 'https://example.com/original' }, error: null })),
      download: vi.fn(() => ({ data: storedText(LEGACY_FAILURE_TEXT), error: null })),
    }));

    const res = await getResume(makeGetResumeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      hasOriginal: true,
      originalUrl: 'https://example.com/original',
      hasEnhanced: false,
      enhancedUnavailable: true,
      enhancedUrl: null,
      enhancedText: null,
      enhancedExt: null,
      previewEnhancedPath: null,
      resumeRevision: getResumeProfileRevision(originalPath, enhancedPath),
    });
    expect(storage.createSignedUrl).toHaveBeenCalledTimes(1);
    expect(storage.createSignedUrl).toHaveBeenCalledWith(originalPath, 3600);
  });

  it('blocks a direct enhanced preview of the same legacy failure text', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser() as any);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue(mockProfile({
      resumeEnhancedPath: `${UUIDS.user}/resume-enhanced.txt`,
    }) as any);
    mockSupabaseAdmin(() => ({
      download: vi.fn(() => ({ data: storedText(LEGACY_FAILURE_TEXT), error: null })),
    }));

    const res = await getResumePreview(
      new NextRequest('http://localhost:3000/api/member/resume/preview?variant=enhanced'),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain('not readable');
  });

  it('returns empty metadata when no resume exists', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser() as any);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue(mockProfile() as any);

    const res = await getResume(makeGetResumeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasOriginal).toBe(false);
    expect(body.hasEnhanced).toBe(false);
    expect(body.originalUrl).toBeNull();
    expect(body.enhancedUrl).toBeNull();
    expect(body.enhancedText).toBeNull();
  });

  it('returns 403 when non-staff tries to access another member resume', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser({ id: 'other-user' }) as any);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(false);

    const res = await getResume(makeGetResumeRequest('?memberId=' + UUIDS.user));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('allows admin to access any member resume', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser({ id: UUIDS.admin }) as any);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(true);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({
      ...mockProfile(),
      resumeEnhancedPath: `${UUIDS.user}/resume-enhanced.txt`,
    } as any);
    mockSupabaseAdmin(() => ({
      createSignedUrl: vi.fn(() => ({ data: { signedUrl: 'https://example.com/signed' }, error: null })),
      download: vi.fn(() => ({ data: storedText('Synthetic member resume with verified inventory and logistics experience.'), error: null })),
    }));

    const res = await getResume(makeGetResumeRequest('?memberId=' + UUIDS.user));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasEnhanced).toBe(true);
  });

  it('allows assigned counselor to access member resume', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser({ id: UUIDS.counselor }) as any);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(true);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({
      ...mockProfile(),
      resumeEnhancedPath: `${UUIDS.user}/resume-enhanced.txt`,
    } as any);
    mockSupabaseAdmin(() => ({
      createSignedUrl: vi.fn(() => ({ data: { signedUrl: 'https://example.com/signed' }, error: null })),
      download: vi.fn(() => ({ data: storedText('Synthetic member resume with verified inventory and logistics experience.'), error: null })),
    }));

    const res = await getResume(makeGetResumeRequest('?memberId=' + UUIDS.user));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasEnhanced).toBe(true);
  });

  it('returns 403 when counselor is not assigned to member', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser({ id: UUIDS.counselor }) as any);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(false);

    const res = await getResume(makeGetResumeRequest('?memberId=' + UUIDS.user));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('includes plain text when includePlainText param is set', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser() as any);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({
      ...mockProfile(),
      resumeEnhancedPath: `${UUIDS.user}/resume-enhanced.txt`,
    } as any);
    vi.mocked(getMemberResumePlainText).mockResolvedValue('Plain text resume content');
    mockSupabaseAdmin(() => ({
      createSignedUrl: vi.fn(() => ({ data: { signedUrl: 'https://example.com/signed' }, error: null })),
      download: vi.fn(() => ({ data: storedText('Synthetic member resume with verified inventory and logistics experience.'), error: null })),
    }));

    const res = await getResume(makeGetResumeRequest('?includePlainText=1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resumePlainText).toBe('Plain text resume content');
    expect(getMemberResumePlainText).toHaveBeenCalledWith(UUIDS.user, 12000);
  });

  it('keeps the original available when the enhanced download URL cannot be signed', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser() as any);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({
      ...mockProfile(),
      resumeOriginalPath: `${UUIDS.user}/resume-original.pdf`,
      resumeEnhancedPath: `${UUIDS.user}/resume-enhanced.txt`,
    } as any);
    const sign = vi.fn()
      .mockResolvedValueOnce({ data: { signedUrl: 'https://example.com/original' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'Bucket not found' } });
    mockSupabaseAdmin(() => ({
      createSignedUrl: sign,
      download: vi.fn(() => ({ data: storedText('Synthetic member resume with verified inventory and logistics experience.'), error: null })),
    }));

    const res = await getResume(makeGetResumeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      hasOriginal: true,
      originalUrl: 'https://example.com/original',
      hasEnhanced: false,
      enhancedUnavailable: true,
      enhancedUrl: null,
    });
  });
});

// ─────────────────────────────────────────────
// GET /api/counselor/members/[memberId]/resume
// ─────────────────────────────────────────────
describe('GET /api/counselor/members/[memberId]/resume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(false);
    mockSupabaseAdmin();
  });

  it('returns 401 for unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null as any);

    const res = await getCounselorMemberResume(makeCounselorRequest(UUIDS.user), { params: Promise.resolve({ memberId: UUIDS.user }) });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns resume for assigned counselor', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser({ id: UUIDS.counselor }) as any);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(true);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({
      ...mockProfile(),
      resumeOriginalPath: `${UUIDS.user}/resume-original.pdf`,
      resumeEnhancedPath: `${UUIDS.user}/resume-enhanced.txt`,
    } as any);
    // assertStaffCanAccessMemberRecord checks member org + counselor assignment internally
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ organizationId: 'org-1' } as any);
    vi.mocked(prisma.counselorAssignment.findFirst).mockResolvedValue({
      counselor: { userId: UUIDS.counselor },
    } as any);
    mockSupabaseAdmin(() => ({
      createSignedUrl: vi.fn(() => ({ data: { signedUrl: 'https://example.com/signed' }, error: null })),
      download: vi.fn(() => ({ data: storedText('# Counselor View\n\n## Summary\nCandidate with verified logistics and inventory experience.'), error: null })),
    }));

    const res = await getCounselorMemberResume(makeCounselorRequest(UUIDS.user), { params: Promise.resolve({ memberId: UUIDS.user }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasOriginal).toBe(true);
    expect(body.hasEnhanced).toBe(true);
    expect(body.enhancedText).toContain('Counselor View');
  });

  it('hides unsafe enhanced text and blocks its direct counselor preview', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser({ id: UUIDS.counselor }) as any);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(true);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue(mockProfile({
      resumeOriginalPath: `${UUIDS.user}/resume-original.pdf`,
      resumeEnhancedPath: `${UUIDS.user}/resume-enhanced.txt`,
    }) as any);
    const storage = mockSupabaseAdmin(() => ({
      createSignedUrl: vi.fn(() => ({ data: { signedUrl: 'https://example.com/original' }, error: null })),
      download: vi.fn(() => ({ data: storedText(LEGACY_FAILURE_TEXT), error: null })),
    }));

    const res = await getCounselorMemberResume(
      makeCounselorRequest(UUIDS.user),
      { params: Promise.resolve({ memberId: UUIDS.user }) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      hasOriginal: true,
      hasEnhanced: false,
      enhancedUnavailable: true,
      enhancedUrl: null,
      enhancedText: null,
      previewEnhancedPath: null,
    });
    expect(storage.createSignedUrl).toHaveBeenCalledTimes(1);

    const preview = await getCounselorResumePreview(
      new NextRequest(`http://localhost:3000/api/counselor/members/${UUIDS.user}/resume/preview?variant=enhanced`),
      { params: Promise.resolve({ memberId: UUIDS.user }) },
    );
    expect(preview.status).toBe(422);
  });

  it('does not mint provider URLs or download content during a read-only audit', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser({ id: UUIDS.counselor }) as any);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(true);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({
      ...mockProfile(),
      resumeOriginalPath: `${UUIDS.user}/resume-original.pdf`,
      resumeEnhancedPath: `${UUIDS.user}/resume-enhanced.txt`,
    } as any);
    const storage = {
      createSignedUrl: vi.fn(),
      download: vi.fn(),
    };
    mockSupabaseAdmin(() => storage);

    const res = await getCounselorMemberResume(
      makeCounselorRequest(UUIDS.user, {
        headers: { 'x-workforceap-read-only-audit': '1' },
      }),
      { params: Promise.resolve({ memberId: UUIDS.user }) },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      hasOriginal: true,
      hasEnhanced: true,
      originalUrl: null,
      enhancedUrl: null,
      previewOriginalPath: null,
      previewEnhancedPath: null,
      auditSuppressed: true,
    });
    expect(storage.createSignedUrl).not.toHaveBeenCalled();
    expect(storage.download).not.toHaveBeenCalled();
  });

  it('returns 403 for unassigned counselor', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser({ id: UUIDS.counselor }) as any);
    vi.mocked(prisma.counselorAssignment.findFirst).mockResolvedValue(null);

    const res = await getCounselorMemberResume(makeCounselorRequest(UUIDS.user), { params: Promise.resolve({ memberId: UUIDS.user }) });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns empty metadata when member has no resume', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser({ id: UUIDS.counselor }) as any);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(true);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ organizationId: 'org-1' } as any);
    vi.mocked(prisma.counselorAssignment.findFirst).mockResolvedValue({
      counselor: { userId: UUIDS.counselor },
    } as any);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue(null);

    const res = await getCounselorMemberResume(makeCounselorRequest(UUIDS.user), { params: Promise.resolve({ memberId: UUIDS.user }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasOriginal).toBe(false);
    expect(body.hasEnhanced).toBe(false);
  });

  it('keeps the original available when enhanced storage download fails', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser({ id: UUIDS.counselor }) as any);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(true);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ organizationId: 'org-1' } as any);
    vi.mocked(prisma.counselorAssignment.findFirst).mockResolvedValue({
      counselor: { userId: UUIDS.counselor },
    } as any);
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({
      ...mockProfile(),
      resumeOriginalPath: `${UUIDS.user}/resume-original.pdf`,
      resumeEnhancedPath: `${UUIDS.user}/resume-enhanced.txt`,
    } as any);
    mockSupabaseAdmin(() => ({
      createSignedUrl: vi.fn(() => ({ data: { signedUrl: 'https://example.com/signed' }, error: null })),
      download: vi.fn(() => ({ data: null, error: { message: 'Download failed' } })),
    }));

    const res = await getCounselorMemberResume(makeCounselorRequest(UUIDS.user), { params: Promise.resolve({ memberId: UUIDS.user }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      hasOriginal: true,
      originalUrl: 'https://example.com/signed',
      hasEnhanced: false,
      enhancedUnavailable: true,
      enhancedUrl: null,
    });
  });
});
