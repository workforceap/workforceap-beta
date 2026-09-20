import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';

/**
 * Stripe subscription event-ordering fields during the rolling deployment:
 * binding + cursor columns stay nullable (no guessed backfill), while the
 * revision guard is a required counter defaulting to 0 on both tenants.
 * Read from the generated Prisma DMMF, i.e. what the client actually enforces.
 */
function field(model: string, name: string) {
  const m = Prisma.dmmf.datamodel.models.find((candidate) => candidate.name === model);
  if (!m) throw new Error(`${model} model missing from the Prisma client`);
  const f = m.fields.find((candidate) => candidate.name === name);
  if (!f) throw new Error(`${model}.${name} missing from the Prisma client`);
  return f;
}

describe('organization Stripe event-ordering fields', () => {
  it('keeps the organization binding and cursor fields nullable', () => {
    expect(field('Organization', 'stripeSubscriptionId')).toMatchObject({ type: 'String', isRequired: false, dbName: 'stripe_subscription_id' });
    expect(field('Organization', 'stripeSubscriptionEventAt')).toMatchObject({ type: 'Int', isRequired: false, dbName: 'stripe_subscription_event_at' });
    expect(field('Organization', 'stripeSubscriptionEventId')).toMatchObject({ type: 'String', isRequired: false, dbName: 'stripe_subscription_event_id' });
    for (const name of ['stripeSubscriptionId', 'stripeSubscriptionEventAt', 'stripeSubscriptionEventId']) {
      expect(field('Organization', name).hasDefaultValue).toBe(false);
    }
  });

  it('guards revisions independently on organizations and employers with a required counter defaulting to 0', () => {
    for (const model of ['Organization', 'Employer']) {
      expect(field(model, 'stripeSubscriptionRevision')).toMatchObject({
        type: 'Int',
        isRequired: true,
        default: 0,
        dbName: 'stripe_subscription_revision',
      });
    }
    expect(field('Employer', 'stripeSubscriptionEventAt')).toMatchObject({ type: 'Int', isRequired: false });
    expect(field('Employer', 'stripeSubscriptionEventId')).toMatchObject({ type: 'String', isRequired: false });
  });
});
