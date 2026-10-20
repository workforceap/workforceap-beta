import supabaseProjectGuard from '@/scripts/lib/supabase-project-guard.cjs';
import fixture from '@/scripts/lib/preview-e2e-member-fixture.cjs';
import { verifyPortalCFixtureOidc, type FixtureOidcFailure } from '@/lib/portal-c/fixtureOidc';
import { resolvePortalCMemberRouteFixtures } from '@/lib/portal-c/memberRouteFixtures';

const ACTIONS = new Set(['snapshot', 'ensure-incomplete', 'prepare', 'prepare-mentor', 'route-fixtures', 'restore']);

type FixtureAction = 'snapshot' | 'ensure-incomplete' | 'prepare' | 'prepare-mentor' | 'route-fixtures' | 'restore';

export type FixtureSnapshot = {
  userId: string;
  before: {
    assessmentCompleted: boolean;
    assessmentCompletedAt: string | null;
  };
  applied?: boolean;
};

type HandlerResult = {
  status: number;
  body: Record<string, unknown>;
};

function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'fixture_failed';
  return message.replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgresql://***').slice(0, 300);
}

function isSnapshot(value: unknown): value is FixtureSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const snapshot = value as { userId?: unknown; before?: unknown };
  if (typeof snapshot.userId !== 'string' || snapshot.userId.length < 8 || snapshot.userId.length > 80) {
    return false;
  }
  if (!snapshot.before || typeof snapshot.before !== 'object' || Array.isArray(snapshot.before)) {
    return false;
  }
  const before = snapshot.before as { assessmentCompleted?: unknown; assessmentCompletedAt?: unknown; notificationsUpdates?: unknown; city?: unknown; threads?: unknown; mentorId?: unknown };
  if (typeof before.assessmentCompleted !== 'boolean') return false;
  if (before.assessmentCompletedAt !== null && typeof before.assessmentCompletedAt !== 'string') {
    return false;
  }
  if (before.mentorId !== undefined && before.mentorId !== null && typeof before.mentorId !== 'string') return false;
  const validDate = (value: unknown) => value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)));
  if (!validDate(before.assessmentCompletedAt)) return false;
  if (before.notificationsUpdates !== undefined) {
    if (typeof before.notificationsUpdates !== 'boolean' || (before.city !== null && typeof before.city !== 'string') || !Array.isArray(before.threads)) return false;
    if (typeof before.city === 'string' && before.city.length > 300) return false;
    if (before.threads.length > 100 || before.threads.some(thread => !thread || typeof thread.id !== 'string' || !validDate(thread.memberLastReadAt))) return false;
  } else if (before.city !== undefined || before.threads !== undefined) return false;
  return true;
}

export async function handlePortalCMemberFixture(input: {
  authorization: string | null;
  payload: unknown;
  env?: NodeJS.ProcessEnv;
  prisma?: unknown;
  getPrisma?: () => unknown;
  verify?: typeof verifyPortalCFixtureOidc;
}): Promise<HandlerResult> {
  const env = input.env ?? process.env;
  if (env.VERCEL_ENV !== 'preview') {
    return { status: 404, body: { error: 'not_found' } };
  }

  const header = input.authorization ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match || match[1].length > 12_000) {
    return { status: 401, body: { error: 'bad_token' } };
  }
  const verify = input.verify ?? verifyPortalCFixtureOidc;
  const verified = await verify(match[1]);
  if (!verified.ok) {
    const reason: FixtureOidcFailure = verified.reason;
    return {
      status: 401,
      body: verified.hint ? { error: reason, detail: verified.hint } : { error: reason },
    };
  }

  // A token for another repository revision must not control this deployment.
  if (!env.VERCEL_GIT_COMMIT_SHA || verified.claims.sha !== env.VERCEL_GIT_COMMIT_SHA) {
    return { status: 403, body: { error: 'deployment_sha_mismatch' } };
  }

  const classification = supabaseProjectGuard.projectForUrl(env.POSTGRES_PRISMA_URL);
  if (classification !== 'demo') {
    return { status: 403, body: { error: 'demo_required', classification } };
  }

  const payload =
    input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
      ? (input.payload as { action?: unknown; snapshot?: unknown })
      : {};
  if (typeof payload.action !== 'string' || !ACTIONS.has(payload.action)) {
    return { status: 400, body: { error: 'invalid_action' } };
  }
  const action = payload.action as FixtureAction;
  try {
    const prisma = (input.getPrisma ? input.getPrisma() : input.prisma) as Parameters<typeof fixture.ensureIncompleteBaseline>[0];
    if (action === 'snapshot') {
      return { status: 200, body: { ok: true, snapshot: await fixture.snapshotMember(prisma) } };
    }
    if (action === 'ensure-incomplete') {
      const result = await fixture.ensureIncompleteBaseline(prisma);
      return { status: 200, body: { ok: true, changed: Boolean(result?.changed), snapshot: result.snapshot } };
    }
    if (action === 'prepare') {
      const snapshot = await fixture.prepareMemberForSignedInRoutes(prisma);
      return { status: 200, body: { ok: true, snapshot } };
    }
    if (action === 'prepare-mentor') return { status: 200, body: { ok: true, ...await fixture.prepareMentorFixture(prisma) } };
    if (action === 'route-fixtures') return { status: 200, body: { ok: true, ...await resolvePortalCMemberRouteFixtures(prisma) } };
    if (!isSnapshot(payload.snapshot)) {
      return { status: 400, body: { error: 'invalid_snapshot' } };
    }
    await fixture.restoreMemberSnapshot(prisma, payload.snapshot);
    await fixture.verifyRestored(prisma, payload.snapshot);
    return { status: 200, body: { ok: true } };
  } catch (error) {
    return { status: 500, body: { error: 'fixture_failed', detail: publicError(error) } };
  }
}
