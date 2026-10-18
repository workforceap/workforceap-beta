import supabaseProjectGuard from '@/scripts/lib/supabase-project-guard.cjs';
import fixture from '@/scripts/lib/preview-e2e-member-fixture.cjs';
import { verifyPortalCFixtureOidc, type FixtureOidcFailure } from '@/lib/portal-c/fixtureOidc';

const ACTIONS = new Set(['ensure-incomplete', 'prepare', 'restore']);

type FixtureAction = 'ensure-incomplete' | 'prepare' | 'restore';

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
  const before = snapshot.before as { assessmentCompleted?: unknown; assessmentCompletedAt?: unknown };
  if (typeof before.assessmentCompleted !== 'boolean') return false;
  if (before.assessmentCompletedAt !== null && typeof before.assessmentCompletedAt !== 'string') {
    return false;
  }
  return true;
}

export async function handlePortalCMemberFixture(input: {
  authorization: string | null;
  payload: unknown;
  env?: NodeJS.ProcessEnv;
  prisma: unknown;
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
  const prisma = input.prisma as Parameters<typeof fixture.ensureIncompleteBaseline>[0];

  try {
    if (action === 'ensure-incomplete') {
      const result = await fixture.ensureIncompleteBaseline(prisma);
      return { status: 200, body: { ok: true, changed: Boolean(result?.changed) } };
    }
    if (action === 'prepare') {
      const snapshot = await fixture.prepareMemberForSignedInRoutes(prisma);
      return { status: 200, body: { ok: true, snapshot } };
    }
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
