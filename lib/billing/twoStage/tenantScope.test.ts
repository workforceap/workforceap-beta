import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { TENANT_SCOPED_MODELS, TenantScopeViolation, makeScopedProxy } from '@/lib/tenant/scopeProxy';

const ORG_A = '00000000-0000-4000-8000-00000000000a';
const ORG_B = '00000000-0000-4000-8000-00000000000b';

/** Every two-stage billing model that carries organizationId, as a Prisma delegate name (from the generated client). */
function twoStageModels(): string[] {
  return Prisma.dmmf.datamodel.models
    .filter((m) => m.name.startsWith('Billing') && m.fields.some((f) => f.name === 'organizationId'))
    .map((m) => m.name[0].toLowerCase() + m.name.slice(1));
}

describe('two-stage billing tenant scoping', () => {
  it('registers every two-stage model that carries organizationId', () => {
    const models = twoStageModels();
    assert.equal(models.length, 12);
    for (const model of models) assert.ok(TENANT_SCOPED_MODELS.has(model), `${model} must be tenant-scoped`);
  });

  it('injects and enforces the organization on reads and writes', async () => {
    const calls: Array<{ model: string; op: string; args: unknown }> = [];
    const delegate = (model: string) => ({
      findMany: async (args: unknown) => void calls.push({ model, op: 'findMany', args }),
      create: async (args: unknown) => void calls.push({ model, op: 'create', args }),
    });
    const fake = Object.fromEntries(twoStageModels().map((m) => [m, delegate(m)]));
    const db = makeScopedProxy(ORG_A, fake) as Record<string, ReturnType<typeof delegate>>;
    await db.billingStageRecord.findMany({ where: { caseId: 'case-1' } });
    assert.deepEqual(calls[0].args, { where: { caseId: 'case-1', organizationId: ORG_A } });
    await db.billingCase.create({ data: { subjectMemberId: 'm' } });
    assert.equal((calls[1].args as { data: { organizationId: string } }).data.organizationId, ORG_A);
    assert.throws(() => db.billingPaymentEvent.findMany({ where: { organizationId: ORG_B } }), TenantScopeViolation);
  });
});
