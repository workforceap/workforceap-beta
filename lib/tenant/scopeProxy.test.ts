/**
 * Track A — Tenant Isolation Hardening (Sprint A.1)
 *
 * Unit tests for the `withTenantScope` Proxy logic. Uses a fake Prisma
 * client passed via dependency injection — no DB, no module-cache hacks.
 *
 * What we're testing:
 *   - Read ops (findMany, findFirst, etc.) auto-inject organizationId
 *   - Write ops (create, update, etc.) inject org id into data and where
 *   - Caller-provided organizationId that matches the scope is allowed
 *   - Caller-provided organizationId that DOESN'T match throws
 *     TenantScopeViolation
 *   - Parent-FK models inject user.organizationId on WhereInput ops
 *   - Parent-FK create verifies the parent user's organizationId
 *   - Unrelated models still pass through unchanged
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeScopedProxy, TenantScopeViolation } from './scopeProxy';

// Pure-logic tests for the tenant scoping Proxy. Imports the
// server-only-free scopeProxy module and feeds it a fake Prisma.
const createScopedClient = <T extends object>(orgId: string, fakePrisma: T) =>
  makeScopedProxy(orgId, fakePrisma);

// ─── Fake Prisma client ─────────────────────────────────────────────────────

type CallRecord = { model: string; op: string; args: unknown };

function makeFakePrisma() {
  const calls: CallRecord[] = [];
  const makeModel = (name: string) => {
    const handler = (op: string) => async (args?: unknown) => {
      calls.push({ model: name, op, args });
      if (name === 'user' && op === 'findUnique') {
        const id = (args as { where?: { id?: string } } | undefined)?.where?.id;
        if (id === 'missing-user') return null;
        return { organizationId: id === 'user-org-b' ? ORG_B : ORG_A };
      }
      return { __recorded: true };
    };
    return {
      findMany: handler('findMany'),
      findFirst: handler('findFirst'),
      findUnique: handler('findUnique'),
      count: handler('count'),
      aggregate: handler('aggregate'),
      groupBy: handler('groupBy'),
      create: handler('create'),
      createMany: handler('createMany'),
      createManyAndReturn: handler('createManyAndReturn'),
      update: handler('update'),
      updateMany: handler('updateMany'),
      updateManyAndReturn: handler('updateManyAndReturn'),
      upsert: handler('upsert'),
      delete: handler('delete'),
      deleteMany: handler('deleteMany'),
    };
  };
  return {
    user: makeModel('user'),
    partner: makeModel('partner'),
    employer: makeModel('employer'),
    job: makeModel('job'),
    course: makeModel('course'),
    courseEnrollment: makeModel('courseEnrollment'),
    organizationProgramCatalog: makeModel('organizationProgramCatalog'),
    preScreeningResponse: makeModel('preScreeningResponse'),
    applyEligibilityScreening: makeModel('applyEligibilityScreening'),
    publicWioaScreening: makeModel('publicWioaScreening'),
    publicInquiry: makeModel('publicInquiry'),
    application: makeModel('application'),
    placementRecord: makeModel('placementRecord'),
    courseProgress: makeModel('courseProgress'),
    messageThread: makeModel('messageThread'),
    // NOT tenant-scoped and not parent-FK scoped — pass through unchanged
    blogPost: makeModel('blogPost'),
    __getCalls: () => [...calls],
    __reset: () => {
      calls.length = 0;
    },
  };
}

const ORG_A = '11111111-1111-1111-1111-111111111111';
const ORG_B = '22222222-2222-2222-2222-222222222222';

// ─── Read ops auto-inject organizationId ────────────────────────────────────

test('findMany on User auto-injects organizationId', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await db.user.findMany({ where: { fullName: 'Maria' } });
  const [call] = fake.__getCalls();
  assert.equal(call.model, 'user');
  assert.equal(call.op, 'findMany');
  assert.deepEqual(call.args, { where: { fullName: 'Maria', organizationId: ORG_A } });
});

test('findFirst on Job auto-injects organizationId', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await db.job.findFirst({ where: { title: 'IT Support' } });
  const [call] = fake.__getCalls();
  assert.equal(call.model, 'job');
  assert.deepEqual(call.args, { where: { title: 'IT Support', organizationId: ORG_A } });
});

test('count on Partner auto-injects organizationId', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await db.partner.count();
  const [call] = fake.__getCalls();
  assert.deepEqual(call.args, { where: { organizationId: ORG_A } });
});

test('findMany on PublicInquiry auto-injects organizationId', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await db.publicInquiry.findMany({ where: { source: 'contact' } });
  const [call] = fake.__getCalls();
  assert.equal(call.model, 'publicInquiry');
  assert.deepEqual(call.args, { where: { source: 'contact', organizationId: ORG_A } });
});

test('upsert on PublicInquiry injects organizationId into where and create', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await db.publicInquiry.upsert({
    where: { id: 'inquiry-1' },
    create: { id: 'inquiry-1', source: 'contact', email: 'lead@example.test' },
    update: { status: 'open' },
  });
  const [call] = fake.__getCalls();
  const args = call.args as {
    where: { organizationId: string };
    create: { organizationId: string };
  };
  assert.equal(call.model, 'publicInquiry');
  assert.equal(args.where.organizationId, ORG_A);
  assert.equal(args.create.organizationId, ORG_A);
});

test('updateMany on PublicInquiry injects organizationId and rejects a foreign org', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await db.publicInquiry.updateMany({
    where: { email: 'lead@example.test' },
    data: { status: 'closed' },
  });
  const [call] = fake.__getCalls();
  assert.deepEqual(call.args, {
    where: { email: 'lead@example.test', organizationId: ORG_A },
    data: { status: 'closed' },
  });
  expectScopeViolation(() =>
    db.publicInquiry.updateMany({
      where: { organizationId: ORG_B },
      data: { status: 'closed' },
    }),
  );
});

test('ApplyEligibilityScreening and PublicWioaScreening stay tenant-scoped', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await db.applyEligibilityScreening.findFirst({ where: { userId: 'member-1' } });
  await db.publicWioaScreening.create({
    data: { email: 'lead@example.test', organizationId: ORG_A },
  });
  const [read, write] = fake.__getCalls();
  assert.deepEqual(read.args, { where: { userId: 'member-1', organizationId: ORG_A } });
  assert.equal((write.args as { data: { organizationId: string } }).data.organizationId, ORG_A);
  expectScopeViolation(() =>
    db.applyEligibilityScreening.create({
      data: { userId: 'member-1', organizationId: ORG_B },
    }),
  );
});

test('aggregate on Employer auto-injects organizationId', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await db.employer.aggregate({ _count: { _all: true } });
  const [call] = fake.__getCalls();
  assert.deepEqual(call.args, { _count: { _all: true }, where: { organizationId: ORG_A } });
});

// ─── Caller-provided org matching the scope is OK ───────────────────────────

test('caller-provided organizationId matching scope passes through', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await db.user.findMany({ where: { organizationId: ORG_A, fullName: 'Maria' } });
  const [call] = fake.__getCalls();
  assert.deepEqual(call.args, { where: { organizationId: ORG_A, fullName: 'Maria' } });
});

// ─── Caller trying to query another tenant THROWS ───────────────────────────
//
// The proxy throws SYNCHRONOUSLY at the scope-validation step (before the
// underlying Prisma call returns a Promise), so we use try/catch instead
// of assert.rejects (which expects a Promise return value).

function expectScopeViolation(fn: () => unknown): TenantScopeViolation {
  let caught: unknown = null;
  try {
    fn();
  } catch (e) {
    caught = e;
  }
  assert.ok(caught instanceof TenantScopeViolation, `expected TenantScopeViolation, got: ${caught}`);
  return caught as TenantScopeViolation;
}

test('caller-provided organizationId mismatching scope throws TenantScopeViolation on findMany', () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  expectScopeViolation(() => db.user.findMany({ where: { organizationId: ORG_B } }));
});

test('caller-provided organizationId mismatching scope throws on update', () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  expectScopeViolation(() => db.user.update({ where: { id: 'x', organizationId: ORG_B }, data: {} }));
});

test('caller-provided organizationId mismatching scope throws on create', () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  expectScopeViolation(() => db.user.create({ data: { id: 'x', email: 'a@b.c', organizationId: ORG_B } }));
});

// ─── Write ops inject organizationId into data and where ────────────────────

test('create injects organizationId into data', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await db.user.create({ data: { id: 'u1', email: 'a@b.c', fullName: 'A' } });
  const [call] = fake.__getCalls();
  assert.equal(call.op, 'create');
  const args = call.args as { data: { organizationId: string } };
  assert.equal(args.data.organizationId, ORG_A);
});

test('createMany injects organizationId into every row', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await db.user.createMany({
    data: [
      { id: 'u1', email: 'a@b.c', fullName: 'A' },
      { id: 'u2', email: 'b@c.d', fullName: 'B' },
    ],
  });
  const [call] = fake.__getCalls();
  const args = call.args as { data: Array<{ organizationId: string }> };
  for (const row of args.data) {
    assert.equal(row.organizationId, ORG_A);
  }
});

test('update injects organizationId into where', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await db.user.update({ where: { id: 'u1' }, data: { fullName: 'A' } });
  const [call] = fake.__getCalls();
  const args = call.args as { where: { organizationId: string } };
  assert.equal(args.where.organizationId, ORG_A);
});

test('upsert injects organizationId into both create and where', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await db.user.upsert({
    where: { id: 'u1' },
    create: { id: 'u1', email: 'a@b.c', fullName: 'A' },
    update: { fullName: 'A2' },
  });
  const [call] = fake.__getCalls();
  const args = call.args as {
    where: { organizationId: string };
    create: { organizationId: string };
  };
  assert.equal(args.where.organizationId, ORG_A);
  assert.equal(args.create.organizationId, ORG_A);
});

test('deleteMany injects organizationId into where', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await db.user.deleteMany({ where: { fullName: 'old' } });
  const [call] = fake.__getCalls();
  const args = call.args as { where: { organizationId: string } };
  assert.equal(args.where.organizationId, ORG_A);
});

// ─── Parent-FK models inject user.organizationId (not a no-op) ──────────────

test('Application.findMany injects user.organizationId (not a pass-through)', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await db.application.findMany({ where: { status: 'PENDING' } });
  const [call] = fake.__getCalls();
  assert.deepEqual(call.args, {
    where: { status: 'PENDING', user: { organizationId: ORG_A } },
  });
});

test('PlacementRecord.count injects user.organizationId', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await db.placementRecord.count();
  const [call] = fake.__getCalls();
  assert.deepEqual(call.args, { where: { user: { organizationId: ORG_A } } });
});

test('CourseProgress.groupBy injects user.organizationId', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await db.courseProgress.groupBy({ by: ['userId'], where: { status: 'COMPLETED' } });
  const [call] = fake.__getCalls();
  assert.deepEqual(call.args, {
    by: ['userId'],
    where: { status: 'COMPLETED', user: { organizationId: ORG_A } },
  });
});

test('parent-FK merge keeps existing user filters and adds organizationId', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await db.placementRecord.count({ where: { user: { deletedAt: null } } });
  const [call] = fake.__getCalls();
  assert.deepEqual(call.args, {
    where: { user: { deletedAt: null, organizationId: ORG_A } },
  });
});

test('parent-FK user.organizationId mismatch throws TenantScopeViolation', () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  expectScopeViolation(() =>
    db.application.findMany({
      where: { user: { organizationId: ORG_B } },
    }),
  );
});

test('parent-FK findUnique does not inject nested user into unique where', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await db.application.findUnique({ where: { id: 'app-1' } });
  const [call] = fake.__getCalls();
  assert.deepEqual(call.args, { where: { id: 'app-1' } });
});

test('parent-FK create does not inject a missing organizationId column', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await db.application.create({
    data: { userId: 'u1', status: 'PENDING', programInterest: 'IT' },
  });
  const createCall = fake.__getCalls().find((c) => c.model === 'application' && c.op === 'create');
  assert.ok(createCall);
  const args = createCall.args as { data: Record<string, unknown> };
  assert.equal(args.data.organizationId, undefined);
  assert.equal(args.data.userId, 'u1');
});

test('parent-FK create rejects a forged organizationId (would 500 on the row)', () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  expectScopeViolation(() =>
    db.placementRecord.create({
      data: { userId: 'u1', employerName: 'Acme', organizationId: ORG_B },
    }),
  );
});

test('parent-FK create verifies parent user is in the active org', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await db.application.create({
    data: { userId: 'u1', status: 'PENDING', programInterest: 'IT' },
  });
  const lookup = fake.__getCalls().find((c) => c.model === 'user' && c.op === 'findUnique');
  assert.ok(lookup);
  assert.deepEqual(lookup.args, { where: { id: 'u1' }, select: { organizationId: true } });
});

test('parent-FK create rejects a parent user from another org', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await assert.rejects(
    () =>
      db.placementRecord.create({
        data: { userId: 'user-org-b', employerName: 'Acme', jobTitle: 'Tech' },
      }),
    (err: unknown) => {
      assert.ok(err instanceof TenantScopeViolation);
      assert.equal(err.providedOrgId, ORG_B);
      return true;
    },
  );
  assert.equal(
    fake.__getCalls().some((c) => c.model === 'placementRecord' && c.op === 'create'),
    false,
  );
});

test('parent-FK create rejects missing parent userId', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await assert.rejects(
    () => db.courseProgress.create({ data: { programSlug: 'it', courseSlug: 'c1' } }),
    (err: unknown) => {
      assert.ok(err instanceof TenantScopeViolation);
      assert.equal(err.providedOrgId, 'missing-parent-userId');
      return true;
    },
  );
});

test('parent-FK create accepts user.connect.id in the same org', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await db.application.create({
    data: { user: { connect: { id: 'u1' } }, status: 'PENDING', programInterest: 'IT' },
  });
  const lookup = fake.__getCalls().find((c) => c.model === 'user' && c.op === 'findUnique');
  assert.deepEqual((lookup?.args as { where: { id: string } }).where, { id: 'u1' });
});

test('CourseProgress.upsert verifies create.userId and does not rewrite unique where', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await db.courseProgress.upsert({
    where: { userId_programSlug_courseSlug: { userId: 'u1', programSlug: 'it', courseSlug: 'c1' } },
    create: { userId: 'u1', programSlug: 'it', courseSlug: 'c1' },
    update: { percentComplete: 10 },
  });
  const upsertCall = fake.__getCalls().find((c) => c.model === 'courseProgress' && c.op === 'upsert');
  assert.ok(upsertCall);
  const args = upsertCall.args as {
    where: { user?: unknown; userId_programSlug_courseSlug: unknown };
    create: { organizationId?: string; userId: string };
  };
  assert.equal(args.where.user, undefined);
  assert.deepEqual(args.where.userId_programSlug_courseSlug, {
    userId: 'u1',
    programSlug: 'it',
    courseSlug: 'c1',
  });
  assert.equal(args.create.organizationId, undefined);
  assert.equal(args.create.userId, 'u1');
});

test('MessageThread.findMany injects member/employer/partner org OR', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await db.messageThread.findMany({ where: { kind: 'member' } });
  const [call] = fake.__getCalls();
  assert.deepEqual(call.args, {
    where: {
      AND: [
        { kind: 'member' },
        {
          OR: [
            { member: { organizationId: ORG_A } },
            { employer: { organizationId: ORG_A } },
            { partner: { organizationId: ORG_A } },
          ],
        },
      ],
    },
  });
});

test('unrelated model (BlogPost) is still not modified', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await db.blogPost.findMany({ where: { published: true } });
  const [call] = fake.__getCalls();
  assert.deepEqual(call.args, { where: { published: true } });
});

// ─── Edge: extracting equals form ──────────────────────────────────────────

test('caller using { organizationId: { equals: "..." } } form is also checked', () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  expectScopeViolation(() =>
    db.user.findMany({
      where: { organizationId: { equals: ORG_B } as unknown as string },
    }),
  );
});

// ─── Allowing equals form when matching ────────────────────────────────────

test('caller using { organizationId: { equals: orgA } } form works when matching', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await db.user.findMany({
    where: { organizationId: { equals: ORG_A } as unknown as string },
  });
  const [call] = fake.__getCalls();
  // The original equals-form is preserved (we only spread, we don't normalize)
  assert.ok(call.args);
});

// ─── Prisma "AndReturn" variants (Codex review on PR #1041) ─────────────────
// `createManyAndReturn` (Prisma 5.14+) and `updateManyAndReturn` (5.18+) must
// be scoped just like their non-Returning counterparts. lib/employer/
// bulkJobInsert.ts uses createManyAndReturn for tenant-scoped jobs.

test('createManyAndReturn injects organizationId into every row', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await (db.job as unknown as { createManyAndReturn: (a: unknown) => Promise<unknown> }).createManyAndReturn({
    data: [
      { id: 'j1', title: 'IT Support' },
      { id: 'j2', title: 'Help Desk' },
    ],
  });
  const [call] = fake.__getCalls();
  const args = call.args as { data: Array<{ organizationId: string }> };
  for (const row of args.data) {
    assert.equal(row.organizationId, ORG_A);
  }
});

test('createManyAndReturn rejects mismatched organizationId in any row', () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  expectScopeViolation(() =>
    (db.job as unknown as { createManyAndReturn: (a: unknown) => Promise<unknown> }).createManyAndReturn({
      data: [
        { id: 'j1', title: 'Good' },
        { id: 'j2', title: 'Wrong tenant', organizationId: ORG_B },
      ],
    }),
  );
});

test('updateManyAndReturn injects organizationId into where', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await (db.job as unknown as { updateManyAndReturn: (a: unknown) => Promise<unknown> }).updateManyAndReturn({
    where: { status: 'draft' },
    data: { status: 'live' },
  });
  const [call] = fake.__getCalls();
  const args = call.args as { where: { organizationId: string } };
  assert.equal(args.where.organizationId, ORG_A);
});

test('updateManyAndReturn rejects mismatched organizationId in data', () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  expectScopeViolation(() =>
    (db.job as unknown as { updateManyAndReturn: (a: unknown) => Promise<unknown> }).updateManyAndReturn({
      where: { status: 'draft' },
      data: { status: 'live', organizationId: ORG_B },
    }),
  );
});

// ─── Nested organization relation writes (Codex P1 on PR #1041) ─────────────
// A scoped caller could try to move a row to another tenant via Prisma's
// nested relation input — the scalar organizationId check doesn't see it.
// Strict policy: reject ALL nested `organization` writes.

test('update rejects data.organization.connect to another tenant', () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  expectScopeViolation(() =>
    db.user.update({
      where: { id: 'u1' },
      data: { organization: { connect: { id: ORG_B } } } as unknown as Record<string, unknown>,
    }),
  );
});

test('update rejects data.organization.connect EVEN to the same tenant', () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  // Strict — reject all relation writes, even a no-op connect to the same
  // org. Caller should use scalar `organizationId: orgA` if they need it.
  expectScopeViolation(() =>
    db.user.update({
      where: { id: 'u1' },
      data: { organization: { connect: { id: ORG_A } } } as unknown as Record<string, unknown>,
    }),
  );
});

test('update rejects data.organization.create (would create new org and link)', () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  expectScopeViolation(() =>
    db.user.update({
      where: { id: 'u1' },
      data: {
        organization: { create: { name: 'Sneaky', slug: 'sneaky' } },
      } as unknown as Record<string, unknown>,
    }),
  );
});

test('update rejects data.organization.disconnect', () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  expectScopeViolation(() =>
    db.user.update({
      where: { id: 'u1' },
      data: { organization: { disconnect: true } } as unknown as Record<string, unknown>,
    }),
  );
});

test('create rejects data.organization.connect to another tenant', () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  expectScopeViolation(() =>
    db.user.create({
      data: {
        id: 'u1',
        email: 'a@b.c',
        fullName: 'A',
        organization: { connect: { id: ORG_B } },
      } as unknown as Record<string, unknown>,
    }),
  );
});

test('createManyAndReturn rejects nested organization in any row', () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  expectScopeViolation(() =>
    (
      db.job as unknown as { createManyAndReturn: (a: unknown) => Promise<unknown> }
    ).createManyAndReturn({
      data: [
        { id: 'j1', title: 'OK' },
        {
          id: 'j2',
          title: 'Sneaky',
          organization: { connect: { id: ORG_B } },
        },
      ],
    }),
  );
});

test('upsert.update rejects nested organization', () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  expectScopeViolation(() =>
    db.user.upsert({
      where: { id: 'u1' },
      create: { id: 'u1', email: 'a@b.c', fullName: 'A' },
      update: { organization: { connect: { id: ORG_B } } } as unknown as Record<string, unknown>,
    }),
  );
});

test('regular updates without nested organization still work', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await db.user.update({ where: { id: 'u1' }, data: { fullName: 'New Name' } });
  const [call] = fake.__getCalls();
  const args = call.args as { where: { organizationId: string }; data: { fullName: string } };
  assert.equal(args.where.organizationId, ORG_A);
  assert.equal(args.data.fullName, 'New Name');
});

// ─── upsert.update scalar org rejection (Codex P1, PR #1041 b6a1db4b0a) ─────
// The upsert.update branch previously didn't validate the scalar
// `update.organizationId`. A caller could pass `update: { organizationId:
// otherOrgId }` and once the row existed, the update path would move it
// across tenants. The where-clause check passed because we inject the
// scoped orgId into where, but the update payload was passed through
// untouched. Now the scalar org check runs in the update branch too.

test('upsert.update rejects scalar organizationId mismatching scope', () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  expectScopeViolation(() =>
    db.user.upsert({
      where: { id: 'u1' },
      create: { id: 'u1', email: 'a@b.c', fullName: 'A' },
      update: { organizationId: ORG_B } as unknown as Record<string, unknown>,
    }),
  );
});

test('upsert.update allows scalar organizationId matching scope', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await db.user.upsert({
    where: { id: 'u1' },
    create: { id: 'u1', email: 'a@b.c', fullName: 'A' },
    update: { fullName: 'A2', organizationId: ORG_A } as unknown as Record<string, unknown>,
  });
  const [call] = fake.__getCalls();
  const args = call.args as {
    where: { organizationId: string };
    update: { organizationId: string; fullName: string };
  };
  assert.equal(args.where.organizationId, ORG_A);
  assert.equal(args.update.organizationId, ORG_A);
  assert.equal(args.update.fullName, 'A2');
});

// ─── createMany single-object data form (Codex P2, PR #1041 b6a1db4b0a) ────
// Prisma 5.22's createMany / createManyAndReturn accepts `data` as either
// an array OR a single object. The original code blindly called `.map()`
// on it and would throw `data.map is not a function` for the object form.
// The proxy now normalizes both shapes.

test('createMany with single-object data injects organizationId (object form)', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await db.user.createMany({
    data: { id: 'u1', email: 'a@b.c', fullName: 'A' } as unknown as Array<Record<string, unknown>>,
  });
  const [call] = fake.__getCalls();
  const args = call.args as { data: { organizationId: string; id: string } };
  // Output should preserve the single-object shape.
  assert.ok(!Array.isArray(args.data), 'expected single-object data shape preserved');
  assert.equal(args.data.organizationId, ORG_A);
  assert.equal(args.data.id, 'u1');
});

test('createManyAndReturn with single-object data injects organizationId', async () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  await (db.job as unknown as { createManyAndReturn: (a: unknown) => Promise<unknown> }).createManyAndReturn({
    data: { id: 'j1', title: 'IT Support' },
  });
  const [call] = fake.__getCalls();
  const args = call.args as { data: { organizationId: string; id: string } };
  assert.ok(!Array.isArray(args.data));
  assert.equal(args.data.organizationId, ORG_A);
});

test('createMany single-object with mismatched organizationId throws', () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  expectScopeViolation(() =>
    db.user.createMany({
      data: {
        id: 'u1',
        email: 'a@b.c',
        fullName: 'A',
        organizationId: ORG_B,
      } as unknown as Array<Record<string, unknown>>,
    }),
  );
});

test('createMany single-object rejects nested organization relation', () => {
  const fake = makeFakePrisma();
  const db = createScopedClient(ORG_A, fake);
  expectScopeViolation(() =>
    db.user.createMany({
      data: {
        id: 'u1',
        email: 'a@b.c',
        fullName: 'A',
        organization: { connect: { id: ORG_B } },
      } as unknown as Array<Record<string, unknown>>,
    }),
  );
});
