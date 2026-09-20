import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';

/**
 * Placement-survey "sent" state policy: `sentAt` is null until the first
 * provider acceptance, and each delivery attempt is identified on the row.
 *
 * The schema shape is read from the generated Prisma DMMF (what the client
 * actually enforces), not from schema.prisma text. The reader/counter and
 * export halves of this policy are behavioural specs:
 * tests/api/placement-survey.spec.ts (admin list + pipeline routes),
 * tests/app/admin-placement-surveys-page.spec.tsx (admin page),
 * tests/lib/member-export-placement-survey.spec.ts (GDPR export).
 */

function field(model: string, name: string) {
  const m = Prisma.dmmf.datamodel.models.find((candidate) => candidate.name === model);
  assert.ok(m, `${model} model missing from the Prisma client`);
  const f = m.fields.find((candidate) => candidate.name === name);
  assert.ok(f, `${model}.${name} missing from the Prisma client`);
  return f;
}

test('PlacementSurvey.sentAt is a nullable timestamp so pre-acceptance rows carry no epoch "sent" truth', () => {
  const sentAt = field('PlacementSurvey', 'sentAt');
  assert.equal(sentAt.type, 'DateTime');
  assert.equal(sentAt.isRequired, false, 'sentAt must be optional (DateTime?)');
  assert.equal(sentAt.hasDefaultValue, false, 'sentAt must not default to now()/epoch');
  assert.equal(sentAt.dbName, 'sent_at');
});

test('PlacementSurvey persists delivery-attempt identity alongside the frozen token expiry', () => {
  const tokenExpiresAt = field('PlacementSurvey', 'tokenExpiresAt');
  assert.equal(tokenExpiresAt.type, 'DateTime');
  assert.equal(tokenExpiresAt.isRequired, true, 'tokenExpiresAt is required (frozen per attempt)');
  assert.equal(tokenExpiresAt.dbName, 'token_expires_at');

  const deliveryAttempt = field('PlacementSurvey', 'deliveryAttempt');
  assert.equal(deliveryAttempt.type, 'Int');
  assert.equal(deliveryAttempt.isRequired, true);
  assert.equal(deliveryAttempt.default, 1);
  assert.equal(deliveryAttempt.dbName, 'delivery_attempt');

  const acceptedAttempt = field('PlacementSurvey', 'acceptedAttempt');
  assert.equal(acceptedAttempt.type, 'Int');
  assert.equal(acceptedAttempt.isRequired, true);
  assert.equal(acceptedAttempt.default, 0, 'no attempt is accepted until Resend stamps one');
  assert.equal(acceptedAttempt.dbName, 'accepted_attempt');

  const deliveryPayload = field('PlacementSurvey', 'deliveryPayload');
  assert.equal(deliveryPayload.type, 'Json');
  assert.equal(deliveryPayload.isRequired, false, 'deliveryPayload is Json?');
  assert.equal(deliveryPayload.dbName, 'delivery_payload');
});
