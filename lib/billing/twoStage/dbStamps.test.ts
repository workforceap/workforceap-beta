import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';

/**
 * Every column the database stamps itself (trigger, wall clock) must be
 * omittable in a Prisma create: either it has a DB default the trigger then
 * overwrites, or it is nullable and set only by a later transition.
 */
const DB_STAMPED: Record<string, string[]> = {
  BillingCase: ['memberMergedAt', 'createdAt'],
  BillingArtifact: ['createdAt'],
  BillingAttestation: ['attestedAt'],
  BillingDesignatedSigner: ['designatedAt'],
  BillingVoucherReceiptSignature: ['attestedAt'],
  BillingSignerSignatureAsset: ['uploadedAt', 'approvedAt', 'revokedAt'],
  BillingStageRecord: ['signedAt', 'sentAt', 'supersededAt', 'voidedAt', 'sendCancelledAt', 'acceptedRolesAtClose'],
  BillingStageSend: ['claimedAt', 'lastClaimedAt', 'acceptedAt', 'reconciledAt'],
  BillingDeliveryEvent: ['recordedAt'],
  BillingPaymentEvent: ['recordedAt'],
};

// Type level: the stamp is an optional key of the (unchecked) create input.
type Optional<T, K extends keyof T> = undefined extends T[K] ? true : false;
const typeLevel: true[] = [
  true satisfies Optional<Prisma.BillingCaseUncheckedCreateInput, 'memberMergedAt'>,
  true satisfies Optional<Prisma.BillingCaseUncheckedCreateInput, 'createdAt'>,
  true satisfies Optional<Prisma.BillingArtifactUncheckedCreateInput, 'createdAt'>,
  true satisfies Optional<Prisma.BillingAttestationUncheckedCreateInput, 'attestedAt'>,
  true satisfies Optional<Prisma.BillingDesignatedSignerUncheckedCreateInput, 'designatedAt'>,
  true satisfies Optional<Prisma.BillingVoucherReceiptSignatureUncheckedCreateInput, 'attestedAt'>,
  true satisfies Optional<Prisma.BillingSignerSignatureAssetUncheckedCreateInput, 'uploadedAt'>,
  true satisfies Optional<Prisma.BillingSignerSignatureAssetUncheckedCreateInput, 'approvedAt'>,
  true satisfies Optional<Prisma.BillingSignerSignatureAssetUncheckedCreateInput, 'revokedAt'>,
  true satisfies Optional<Prisma.BillingStageRecordUncheckedCreateInput, 'signedAt'>,
  true satisfies Optional<Prisma.BillingStageRecordUncheckedCreateInput, 'sentAt'>,
  true satisfies Optional<Prisma.BillingStageRecordUncheckedCreateInput, 'supersededAt'>,
  true satisfies Optional<Prisma.BillingStageRecordUncheckedCreateInput, 'voidedAt'>,
  true satisfies Optional<Prisma.BillingStageRecordUncheckedCreateInput, 'sendCancelledAt'>,
  true satisfies Optional<Prisma.BillingStageSendUncheckedCreateInput, 'claimedAt'>,
  true satisfies Optional<Prisma.BillingStageSendUncheckedCreateInput, 'lastClaimedAt'>,
  true satisfies Optional<Prisma.BillingStageSendUncheckedCreateInput, 'acceptedAt'>,
  true satisfies Optional<Prisma.BillingStageSendUncheckedCreateInput, 'reconciledAt'>,
  true satisfies Optional<Prisma.BillingDeliveryEventUncheckedCreateInput, 'recordedAt'>,
  true satisfies Optional<Prisma.BillingPaymentEventUncheckedCreateInput, 'recordedAt'>,
];

describe('DB-stamped columns are omittable in Prisma creates', () => {
  it('each stamp has a default or is optional in the generated client', () => {
    assert.equal(typeLevel.length, 20);
    const models = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));
    for (const [model, fields] of Object.entries(DB_STAMPED)) {
      const m = models.get(model);
      assert.ok(m, `${model} exists`);
      for (const name of fields) {
        const f = m.fields.find((x) => x.name === name);
        assert.ok(f, `${model}.${name} exists`);
        assert.ok(f.hasDefaultValue || !f.isRequired, `${model}.${name} must have a default or be optional`);
      }
    }
  });
});
