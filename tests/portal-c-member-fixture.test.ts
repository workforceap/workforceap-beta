import { createSign, generateKeyPairSync, type JsonWebKey } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { handlePortalCMemberFixture } from '../lib/portal-c/memberFixtureHandler';
import {
  PORTAL_C_FIXTURE_OIDC_AUDIENCE,
  PORTAL_C_FIXTURE_OIDC_ISSUER,
  PORTAL_C_FIXTURE_REPOSITORY,
  PORTAL_C_FIXTURE_WORKFLOW,
  verifyPortalCFixtureOidc,
} from '../lib/portal-c/fixtureOidc';
import { selectPreviewBranch } from '../scripts/lib/portal-c-preview-branch.mjs';
import { fixtureError } from '../scripts/portal-c-member-fixture-call.mjs';

const DEMO_URL =
  'postgresql://postgres:demo-secret@db.esbdrgaonplpvzmtrdhw.supabase.co:5432/postgres';
const PROD_URL =
  'postgresql://postgres:prod-secret@db.jqddnyuszufndwwezdwp.supabase.co:5432/postgres';
const SHA = '7f72d403ea4a772da90d664ef1d3e6d2f6c64a31';

function previewEnv(url: string): NodeJS.ProcessEnv {
  return { VERCEL_ENV: 'preview', POSTGRES_PRISMA_URL: url, VERCEL_GIT_COMMIT_SHA: SHA } as unknown as NodeJS.ProcessEnv;
}

function memberPrisma(initial = { assessmentCompleted: false, assessmentCompletedAt: null as Date | null }) {
  const stored = {
    ...initial,
    notificationsUpdates: false,
    profile: { city: null as string | null },
    messageThreadsAsMember: [],
    mentorProfile: null as null | { id: string; bio: string; isActive: boolean; approvedAt: Date | null; _count: { sessions: number; specialties: number } },
    browseMentorUserId: null as string | null,
    browseMentor: null as null | { id: string; bio: string; isActive: boolean; approvedAt: Date | null; _count: { sessions: number; specialties: number } },
    counselorSessions: [] as Array<{
      id: string;
      toolType: string;
      inputSummary: string;
      parentToolResultId: null;
      _count: { childResults: number; primaryForApplicationFeedbacks: number };
    }>,
  };
  return {
    stored,
    prisma: {
      async $transaction(fn: (tx: unknown) => Promise<unknown>) { return fn(this); },
      $executeRawUnsafe: async () => 1,
      organization: { findFirst: async () => ({ id: 'org-qa' }) },
      user: {
        findFirst: async ({ where }: { where?: { email?: string | { equals?: string } } } = {}) => {
          const email = typeof where?.email === 'string' ? where.email : where?.email?.equals;
          if (email === 'portal-c-browse-mentor@workforceap.org') {
            return stored.browseMentorUserId ? { id: stored.browseMentorUserId } : null;
          }
          return { id: 'user-fixture-1', organizationId: 'org-qa', ...stored };
        },
        findUnique: async () => ({ ...stored }),
        create: async () => {
          stored.browseMentorUserId = 'browse-mentor-user';
          return { id: stored.browseMentorUserId };
        },
        update: async ({
          data,
        }: {
          data: Partial<typeof stored>;
        }) => {
          Object.assign(stored, data);
        },
      },
      mentor: {
        findUnique: async ({ where }: { where: { userId?: string } }) => {
          if (where.userId === stored.browseMentorUserId) return stored.browseMentor;
          return stored.mentorProfile;
        },
        create: async ({ data }: { data: { bio: string; isActive?: boolean; approvedAt?: Date | null; userId?: string } }) => {
          const row = { id: data.bio.includes('browse') ? 'synthetic-browse-mentor' : 'synthetic-mentor', bio: data.bio, isActive: Boolean(data.isActive), approvedAt: data.approvedAt ?? null, _count: { sessions: 0, specialties: 0 } };
          if (data.userId === stored.browseMentorUserId || data.bio.includes('browse')) stored.browseMentor = row;
          else stored.mentorProfile = row;
          return row;
        },
        update: async ({ data }: { data: { isActive?: boolean; approvedAt?: Date | null } }) => {
          if (stored.browseMentor) Object.assign(stored.browseMentor, data);
          return stored.browseMentor;
        },
        delete: async ({ where }: { where: { userId?: string } }) => {
          if (where.userId === stored.browseMentorUserId) stored.browseMentor = null;
          else stored.mentorProfile = null;
        },
      },
      aIToolResult: {
        findFirst: async () => stored.counselorSessions[0] ?? null,
        findMany: async () => stored.counselorSessions.filter((session) => session.inputSummary.startsWith('Portal C temporary counselor session fixture')),
        create: async ({ data }: { data: { inputSummary: string; toolType: string } }) => {
          stored.counselorSessions.push({
            id: 'synthetic-counselor-session',
            toolType: data.toolType,
            inputSummary: data.inputSummary,
            parentToolResultId: null,
            _count: { childResults: 0, primaryForApplicationFeedbacks: 0 },
          });
        },
        delete: async () => { stored.counselorSessions = []; },
      },
      profile: { update: async ({ data }: { data: { city: string | null } }) => Object.assign(stored.profile, data) },
    },
  };
}

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;
jwk.kid = 'test-key';
jwk.alg = 'RS256';
jwk.use = 'sig';

function signOidc(claims: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256', kid: 'test-key' }) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const data = `${encode(header)}.${encode(claims)}`;
  const signature = createSign('RSA-SHA256').update(data).sign(privateKey).toString('base64url');
  return `${data}.${signature}`;
}

function claims(overrides: Record<string, unknown> = {}) {
  return {
    iss: PORTAL_C_FIXTURE_OIDC_ISSUER,
    aud: PORTAL_C_FIXTURE_OIDC_AUDIENCE,
    exp: Math.floor(Date.now() / 1000) + 600,
    repository: PORTAL_C_FIXTURE_REPOSITORY,
    job_workflow_ref: `${PORTAL_C_FIXTURE_REPOSITORY}/${PORTAL_C_FIXTURE_WORKFLOW}@refs/heads/feature/portal-c-b0-safety-net`,
    event_name: 'deployment_status',
    ref: 'refs/heads/feature/portal-c-b0-safety-net',
    sha: SHA,
    ...overrides,
  };
}

describe('portal C preview branch', () => {
  it('uses the pull request head ref and ignores a deployment SHA ref', () => {
    expect(
      selectPreviewBranch({
        eventName: 'pull_request',
        eventBranch: 'feature/portal-c-b0-safety-net',
        refName: '',
        commitPulls: [],
        sha: SHA,
      }),
    ).toBe('feature/portal-c-b0-safety-net');
    expect(
      selectPreviewBranch({
        eventName: 'deployment_status',
        eventBranch: '',
        refName: SHA,
        sha: SHA,
        commitPulls: [{ head: { sha: SHA, ref: 'feature/portal-c-b0-safety-net' } }],
      }),
    ).toBe('feature/portal-c-b0-safety-net');
    expect(
      selectPreviewBranch({
        eventName: 'deployment_status',
        eventBranch: '',
        refName: 'master',
        sha: SHA,
        commitPulls: [{ head: { sha: 'a'.repeat(40), ref: 'feature/other' } }],
      }),
    ).toBe('');
  });
});

describe('portal C fixture OIDC', () => {
  it('accepts this workflow and rejects a foreign repository before any database call', async () => {
    const token = signOidc(claims());
    await expect(verifyPortalCFixtureOidc(token, { jwks: { keys: [jwk] } })).resolves.toMatchObject({
      ok: true,
      claims: { eventName: 'deployment_status' },
    });
    const foreign = signOidc(claims({ repository: 'other/repo' }));
    await expect(verifyPortalCFixtureOidc(foreign, { jwks: { keys: [jwk] } })).resolves.toEqual({
      ok: false,
      reason: 'wrong_repository',
    });
    const deployed = signOidc(claims({ ref: SHA, sha: SHA, event_name: 'deployment_status' }));
    await expect(verifyPortalCFixtureOidc(deployed, { jwks: { keys: [jwk] } })).resolves.toMatchObject({
      ok: true,
      claims: { ref: SHA, sha: SHA },
    });
    const { ref: _omitRef, ...withoutRef } = claims({ event_name: 'deployment_status', sha: SHA });
    const omitted = signOidc(withoutRef);
    await expect(verifyPortalCFixtureOidc(omitted, { jwks: { keys: [jwk] } })).resolves.toMatchObject({
      ok: true,
      claims: { ref: SHA, sha: SHA, eventName: 'deployment_status' },
    });
    const otherWorkflow = signOidc(
      claims({
        job_workflow_ref: `${PORTAL_C_FIXTURE_REPOSITORY}/.github/workflows/other.yml@refs/heads/feature/portal-c-b0-safety-net`,
      }),
    );
    await expect(verifyPortalCFixtureOidc(otherWorkflow, { jwks: { keys: [jwk] } })).resolves.toEqual({
      ok: false,
      reason: 'wrong_workflow',
    });
  });
});

describe('fixture deployment and target binding', () => {
  const verify = async () => ({ ok: true as const, claims: {
    repository: PORTAL_C_FIXTURE_REPOSITORY, workflowRef: 'workflow', eventName: 'deployment_status', ref: SHA, sha: SHA,
  } });

  it('creates an inactive mentor workspace only for the synthetic member and removes it on verified restore', async () => {
    const { prisma, stored } = memberPrisma();
    const call = (payload: unknown) => handlePortalCMemberFixture({ authorization: 'Bearer token', env: previewEnv(DEMO_URL), verify, prisma, payload });
    const original = await call({ action: 'snapshot' });
    expect((await call({ action: 'prepare-mentor' })).status).toBe(200);
    expect(stored.mentorProfile).toMatchObject({ isActive: false, approvedAt: null });
    expect((await call({ action: 'restore', snapshot: original.body.snapshot })).status).toBe(200);
    expect(stored.mentorProfile).toBeNull();
  });

  it('prepare removes a leftover marked mentor so inventory sees a plain member', async () => {
    const { prisma, stored } = memberPrisma({ assessmentCompleted: true, assessmentCompletedAt: new Date('2026-01-01T00:00:00Z') });
    const call = (payload: unknown) => handlePortalCMemberFixture({ authorization: 'Bearer token', env: previewEnv(DEMO_URL), verify, prisma, payload });
    expect((await call({ action: 'prepare-mentor' })).status).toBe(200);
    expect(stored.mentorProfile).not.toBeNull();
    const prepared = await call({ action: 'prepare' });
    expect(prepared.status).toBe(200);
    expect(stored.mentorProfile).toBeNull();
    const leftoverSnapshot = prepared.body as { snapshot: { before: { mentorId: string | null } } };
    expect(leftoverSnapshot.snapshot.before.mentorId).toBeNull();
  });

  it('prepare deletes a leftover mentor even when the relation is missing and adds a browse mentor', async () => {
    const { prisma, stored } = memberPrisma({ assessmentCompleted: true, assessmentCompletedAt: new Date('2026-01-01T00:00:00Z') });
    const call = (payload: unknown) => handlePortalCMemberFixture({ authorization: 'Bearer token', env: previewEnv(DEMO_URL), verify, prisma, payload });
    stored.mentorProfile = { id: 'orphan-mentor', bio: 'Portal C temporary mentor fixture; restored by the serialized CI job.', isActive: false, approvedAt: null, _count: { sessions: 0, specialties: 0 } };
    const prepared = await call({ action: 'prepare' });
    expect(prepared.status).toBe(200);
    expect(stored.mentorProfile).toBeNull();
    expect(stored.browseMentor).toMatchObject({ isActive: true });
    const orphanSnapshot = (prepared.body as { snapshot: unknown }).snapshot;
    expect((await call({ action: 'restore', snapshot: orphanSnapshot })).status).toBe(200);
    expect(stored.browseMentor).toBeNull();
  });

  it('prepare adds a marked counselor session when none exist and restore removes it', async () => {
    const { prisma, stored } = memberPrisma({ assessmentCompleted: true, assessmentCompletedAt: new Date('2026-01-01T00:00:00Z') });
    const call = (payload: unknown) => handlePortalCMemberFixture({ authorization: 'Bearer token', env: previewEnv(DEMO_URL), verify, prisma, payload });
    const prepared = await call({ action: 'prepare' });
    expect(prepared.status).toBe(200);
    expect(stored.counselorSessions).toHaveLength(1);
    expect(stored.counselorSessions[0]?.inputSummary).toMatch(/temporary counselor session fixture/);
    const sessionSnapshot = (prepared.body as { snapshot: unknown }).snapshot;
    expect((await call({ action: 'restore', snapshot: sessionSnapshot })).status).toBe(200);
    expect(stored.counselorSessions).toHaveLength(0);
  });

  it('refuses to delete a temporary counselor session if unexpected children appear', async () => {
    const { prisma, stored } = memberPrisma({ assessmentCompleted: true, assessmentCompletedAt: new Date('2026-01-01T00:00:00Z') });
    const call = (payload: unknown) => handlePortalCMemberFixture({ authorization: 'Bearer token', env: previewEnv(DEMO_URL), verify, prisma, payload });
    const prepared = await call({ action: 'prepare' });
    stored.counselorSessions[0]!._count.childResults = 1;
    const blockedSnapshot = (prepared.body as { snapshot: unknown }).snapshot;
    expect((await call({ action: 'restore', snapshot: blockedSnapshot })).status).toBe(500);
    expect(stored.counselorSessions).toHaveLength(1);
  });

  it('refuses to delete a temporary mentor if unexpected sessions appear', async () => {
    const { prisma, stored } = memberPrisma();
    const call = (payload: unknown) => handlePortalCMemberFixture({ authorization: 'Bearer token', env: previewEnv(DEMO_URL), verify, prisma, payload });
    const original = await call({ action: 'snapshot' });
    await call({ action: 'prepare-mentor' });
    stored.mentorProfile!._count.sessions = 1;
    expect((await call({ action: 'restore', snapshot: original.body.snapshot })).status).toBe(500);
    expect(stored.mentorProfile).not.toBeNull();
  });

  it('refuses a token for a different deployment before acquiring a database client', async () => {
    let opened = false;
    const result = await handlePortalCMemberFixture({ authorization: 'Bearer token', payload: { action: 'prepare' },
      env: { ...previewEnv(DEMO_URL), VERCEL_GIT_COMMIT_SHA: 'b'.repeat(40) }, verify,
      getPrisma: () => { opened = true; throw new Error('must not connect'); },
    });
    expect(result).toMatchObject({ status: 403, body: { error: 'deployment_sha_mismatch' } });
    expect(opened).toBe(false);
  });

  it('refuses a restore snapshot naming another user', async () => {
    const { prisma, stored } = memberPrisma();
    const result = await handlePortalCMemberFixture({ authorization: 'Bearer token', env: previewEnv(DEMO_URL), verify, prisma,
      payload: { action: 'restore', snapshot: { userId: 'another-user-id', before: { assessmentCompleted: true, assessmentCompletedAt: null } } },
    });
    expect(result.status).toBe(500);
    expect(stored.assessmentCompleted).toBe(false);
  });

  it('captures the original state before the gate reset and restores that state after preparation', async () => {
    const original = new Date('2026-01-01T00:00:00.000Z');
    const { prisma, stored } = memberPrisma({ assessmentCompleted: true, assessmentCompletedAt: original });
    const call = (payload: unknown) => handlePortalCMemberFixture({ authorization: 'Bearer token', env: previewEnv(DEMO_URL), verify, prisma, payload });
    const captured = await call({ action: 'snapshot' });
    expect(stored.assessmentCompleted).toBe(true);
    await call({ action: 'ensure-incomplete' });
    expect(stored.assessmentCompleted).toBe(false);
    await call({ action: 'prepare' });
    expect(stored.assessmentCompleted).toBe(true);
    const result = await call({ action: 'restore', snapshot: captured.body.snapshot });
    expect(result.status).toBe(200);
    expect(stored.assessmentCompletedAt).toEqual(original);
  });
});

describe('portal C member fixture handler', () => {
  it('does not touch the database unless the deployment is a DEMO preview', async () => {
    const { prisma } = memberPrisma();
    let updates = 0;
    const originalUpdate = prisma.user.update;
    prisma.user.update = async (args) => {
      updates += 1;
      return originalUpdate(args);
    };
    const hidden = await handlePortalCMemberFixture({
      authorization: 'Bearer not-a-jwt',
      payload: { action: 'ensure-incomplete' },
      env: { VERCEL_ENV: 'production' } as unknown as NodeJS.ProcessEnv,
      prisma,
      verify: async () => {
        throw new Error('production must not verify or write');
      },
    });
    expect(hidden).toEqual({ status: 404, body: { error: 'not_found' } });

    const refused = await handlePortalCMemberFixture({
      authorization: 'Bearer header.payload.sig',
      payload: { action: 'ensure-incomplete' },
      env: previewEnv(PROD_URL),
      prisma,
      verify: async () => ({
        ok: true,
        claims: {
          repository: PORTAL_C_FIXTURE_REPOSITORY,
          workflowRef: 'workflow',
          eventName: 'pull_request',
          ref: 'refs/heads/feature/portal-c-b0-safety-net',
          sha: SHA,
        },
      }),
    });
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ error: 'demo_required', classification: 'prod' });
    expect(updates).toBe(0);
  });

  it('resets, prepares, and restores only the portal-qa test member', async () => {
    const { prisma, stored } = memberPrisma({
      assessmentCompleted: true,
      assessmentCompletedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const verify = async () =>
      ({
        ok: true as const,
        claims: {
          repository: PORTAL_C_FIXTURE_REPOSITORY,
          workflowRef: 'workflow',
          eventName: 'pull_request',
          ref: 'refs/heads/feature/portal-c-b0-safety-net',
          sha: SHA,
        },
      });
    const reset = await handlePortalCMemberFixture({
      authorization: 'Bearer header.payload.sig',
      payload: { action: 'ensure-incomplete' },
      env: previewEnv(DEMO_URL),
      prisma,
      verify,
    });
    expect(reset).toMatchObject({ status: 200, body: { ok: true, changed: true } });
    expect(stored.assessmentCompleted).toBe(false);

    const prepared = await handlePortalCMemberFixture({
      authorization: 'Bearer header.payload.sig',
      payload: { action: 'prepare' },
      env: previewEnv(DEMO_URL),
      prisma,
      verify,
    });
    expect(prepared.status).toBe(200);
    expect(stored.assessmentCompleted).toBe(true);
    const snapshot = (prepared.body as { snapshot: unknown }).snapshot;

    stored.assessmentCompleted = true;
    const restored = await handlePortalCMemberFixture({
      authorization: 'Bearer header.payload.sig',
      payload: { action: 'restore', snapshot },
      env: previewEnv(DEMO_URL),
      prisma,
      verify,
    });
    expect(restored.status).toBe(200);
    expect(stored.assessmentCompleted).toBe(false);
    expect(stored.assessmentCompletedAt).toBeNull();
  });

  it('redacts database URLs from fixture failures', async () => {
    const prisma = {
      async $transaction(fn: (tx: unknown) => Promise<unknown>) { return fn(this); },
      $executeRawUnsafe: async () => 1,
      organization: {
        findFirst: async () => {
          throw new Error('connect postgresql://user:secret@db.example/postgres failed');
        },
      },
      user: { findFirst: async () => null, findUnique: async () => null, update: async () => ({}) },
      aIToolResult: { findFirst: async () => null, findMany: async () => [], create: async () => ({}), delete: async () => ({}) },
    };
    const result = await handlePortalCMemberFixture({
      authorization: 'Bearer header.payload.sig',
      payload: { action: 'ensure-incomplete' },
      env: previewEnv(DEMO_URL),
      prisma,
      verify: async () => ({
        ok: true,
        claims: {
          repository: PORTAL_C_FIXTURE_REPOSITORY,
          workflowRef: 'workflow',
          eventName: 'pull_request',
          ref: 'refs/heads/feature/portal-c-b0-safety-net',
          sha: SHA,
        },
      }),
    });
    expect(result.status).toBe(500);
    expect(JSON.stringify(result.body)).not.toContain('secret');
    expect(fixtureError(500, result.body)).toContain('fixture_failed');
  });
});
