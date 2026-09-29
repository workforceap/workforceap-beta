import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  APPROVED_SIGNATURE_ASSETS,
  SIGNATURE_IMAGE_ENABLED,
  SIGNER_DELEGATION_ENABLED,
  authorizeSigner,
  buildSignatureBlock,
  isApprovedSignatureAsset,
  readExecutiveSignerUserId,
  signerIntentStatement,
  validateSignRequest,
  type SignerActor,
} from './signing';

const ORG = '00000000-0000-4000-8000-000000000001';
const SIGNER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_MICHAEL = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-10-20T15:00:00Z');
const env = { BILLING_EXECUTIVE_SIGNER_USER_ID: SIGNER_ID };
const actor = (over: Partial<SignerActor> = {}): SignerActor => ({ userId: SIGNER_ID, organizationId: ORG, isActive: true, isAdmin: true, ...over });

describe('authorizeSigner: id-bound, fail closed', () => {
  it('allows only the configured executive signer, as an active provider-org admin', () => {
    assert.deepEqual(authorizeSigner({ actor: actor(), providerOrgId: ORG, stage: 'j5', now: NOW, env, designatedSignerUserId: SIGNER_ID }), { ok: true, via: 'executive', signerSubjectId: SIGNER_ID, delegationId: null });
    assert.equal(authorizeSigner({ actor: actor({ userId: SIGNER_ID.toUpperCase() }), providerOrgId: ORG, stage: 'j6', now: NOW, env, designatedSignerUserId: SIGNER_ID }).ok, true);
  });

  it('the database designation is the source of truth; unset, or an env cross-check that disagrees, denies (no default ships)', () => {
    for (const designatedSignerUserId of [undefined, null, '', '   ']) {
      const d = authorizeSigner({ actor: actor(), providerOrgId: ORG, stage: 'j5', now: NOW, env, designatedSignerUserId });
      assert.equal(!d.ok && d.reason, 'signer_not_configured', String(designatedSignerUserId));
    }
    // No env at all is fine: the database row alone decides.
    assert.equal(authorizeSigner({ actor: actor(), providerOrgId: ORG, stage: 'j5', now: NOW, designatedSignerUserId: SIGNER_ID }).ok, true);
    for (const bad of [{ BILLING_EXECUTIVE_SIGNER_USER_ID: OTHER_MICHAEL }, { BILLING_EXECUTIVE_SIGNER_USER_ID: 'michael.brown@workforceap.org' }, { BILLING_EXECUTIVE_SIGNER_USER_ID: 'Michael A. Brown' }]) {
      const d = authorizeSigner({ actor: actor(), providerOrgId: ORG, stage: 'j5', now: NOW, env: bad, designatedSignerUserId: SIGNER_ID });
      assert.equal(d.ok, false);
      assert.equal(!d.ok && d.reason, 'signer_not_configured');
      assert.equal(!d.ok && d.status, 503);
    }
    assert.equal(readExecutiveSignerUserId({}), null);
  });

  it('denies two admins both named Michael Brown unless one matches the configured id: names never bind', () => {
    // SignerActor carries no name at all: the only identity input is the verified user id.
    const first = actor({ userId: OTHER_MICHAEL });
    const second = actor({ userId: '33333333-3333-4333-8333-333333333333' });
    for (const a of [first, second]) {
      const d = authorizeSigner({ actor: a, providerOrgId: ORG, stage: 'j5', now: NOW, env, designatedSignerUserId: SIGNER_ID });
      assert.equal(!d.ok && d.reason, 'not_signer');
    }
    const unset = authorizeSigner({ actor: first, providerOrgId: ORG, stage: 'j5', now: NOW, env: {} });
    assert.equal(!unset.ok && unset.reason, 'signer_not_configured');
    assert.equal(authorizeSigner({ actor: first, providerOrgId: ORG, stage: 'j5', now: NOW, designatedSignerUserId: OTHER_MICHAEL }).ok, true);
  });

  it('denies a generic admin, a non-admin signer, an inactive signer, another tenant, or no session', () => {
    const reasons = [
      authorizeSigner({ actor: actor({ userId: OTHER_MICHAEL }), providerOrgId: ORG, stage: 'j5', now: NOW, env, designatedSignerUserId: SIGNER_ID }),
      authorizeSigner({ actor: actor({ isAdmin: false }), providerOrgId: ORG, stage: 'j5', now: NOW, env, designatedSignerUserId: SIGNER_ID }),
      authorizeSigner({ actor: actor({ isActive: false }), providerOrgId: ORG, stage: 'j5', now: NOW, env, designatedSignerUserId: SIGNER_ID }),
      authorizeSigner({ actor: actor({ organizationId: '99999999-9999-4999-8999-999999999999' }), providerOrgId: ORG, stage: 'j5', now: NOW, env, designatedSignerUserId: SIGNER_ID }),
      authorizeSigner({ actor: null, providerOrgId: ORG, stage: 'j5', now: NOW, env, designatedSignerUserId: SIGNER_ID }),
      authorizeSigner({ actor: actor(), providerOrgId: null, stage: 'j5', now: NOW, env, designatedSignerUserId: SIGNER_ID }),
    ].map((d) => (d.ok ? 'ok' : d.reason));
    assert.deepEqual(reasons, ['not_signer', 'not_admin', 'inactive', 'not_provider_org', 'not_provider_org', 'signer_not_configured']);
  });

  it('keeps delegation disabled: even a valid, approved delegation is refused', () => {
    assert.equal(SIGNER_DELEGATION_ENABLED, false);
    const delegation = { id: 'del-1', principalSubjectId: SIGNER_ID, delegateSubjectId: OTHER_MICHAEL, stage: 'j5' as const, validFrom: new Date('2026-10-01'), validUntil: new Date('2026-11-01'), revokedAt: null };
    const d = authorizeSigner({ actor: actor({ userId: OTHER_MICHAEL }), providerOrgId: ORG, stage: 'j5', now: NOW, env, designatedSignerUserId: SIGNER_ID, delegation });
    assert.equal(!d.ok && d.reason, 'not_signer');
    // The hook works only if explicitly enabled (not in this PR), for the named stage and window.
    assert.equal(authorizeSigner({ actor: actor({ userId: OTHER_MICHAEL }), providerOrgId: ORG, stage: 'j5', now: NOW, env, designatedSignerUserId: SIGNER_ID, delegation, delegationEnabled: true }).ok, true);
    assert.equal(authorizeSigner({ actor: actor({ userId: OTHER_MICHAEL }), providerOrgId: ORG, stage: 'j6', now: NOW, env, designatedSignerUserId: SIGNER_ID, delegation, delegationEnabled: true }).ok, false);
    assert.equal(authorizeSigner({ actor: actor({ userId: OTHER_MICHAEL }), providerOrgId: ORG, stage: 'j5', now: NOW, env, designatedSignerUserId: SIGNER_ID, delegation: { ...delegation, revokedAt: NOW }, delegationEnabled: true }).ok, false);
  });
});

describe('review then sign over the exact version', () => {
  const target = { id: 'rec-1', version: 1, status: 'draft' as const, contentSha256: 'c'.repeat(64), documentTitle: 'Quote / Voucher Request', documentNumber: 'WAP-Q-2026-0001' };
  const intent = signerIntentStatement(target);
  const request = { recordId: 'rec-1', version: 1, contentSha256: 'c'.repeat(64), intentConfirmed: true, intentText: intent };

  it('accepts a request that echoes the previewed hash and the exact intent statement', () => {
    assert.deepEqual(validateSignRequest(target, request), { ok: true, intent });
    assert.match(intent, /^I, Michael A\. Brown, PMP, ChE \u2014 Executive Director, have reviewed Quote \/ Voucher Request WAP-Q-2026-0001 \(version cccccccccccc\)/);
  });

  it('refuses a stale or different version, an unconfirmed intent, or an already signed record', () => {
    assert.equal(validateSignRequest(target, { ...request, contentSha256: 'd'.repeat(64) }).ok, false);
    assert.equal(validateSignRequest(target, { ...request, version: 2 }).ok, false);
    assert.equal(validateSignRequest(target, { ...request, recordId: 'rec-2' }).ok, false);
    assert.equal(validateSignRequest(target, { ...request, intentConfirmed: false }).ok, false);
    assert.equal(validateSignRequest(target, { ...request, intentText: 'I agree' }).ok, false);
    assert.equal(validateSignRequest({ ...target, status: 'signed' }, request).ok, false);
  });

  it('prints the frozen signature image; no image is ever approved in code', () => {
    const image = { assetId: 'sig-asset-1', assetSha256: 'e'.repeat(64) };
    const block = buildSignatureBlock({ signedAt: new Date('2026-10-20T15:04:05Z'), intent, image });
    assert.equal(block.method, 'approved_image');
    assert.deepEqual(block.image, image);
    assert.equal(block.name, 'Michael A. Brown, PMP, ChE');
    assert.equal(block.title, 'Executive Director');
    assert.equal(block.signedAt, '2026-10-20T15:04:05.000Z');
    assert.ok(block.attestation.endsWith(intent));
    // Without an image the block is the typed fallback, which the database refuses to sign.
    const typed = buildSignatureBlock({ signedAt: new Date('2026-10-20T15:04:05Z'), intent });
    assert.equal(typed.method, 'typed_attestation');
    assert.equal(typed.image, null);
    assert.equal(SIGNATURE_IMAGE_ENABLED, true);
    assert.equal(APPROVED_SIGNATURE_ASSETS.length, 0);
    assert.equal(isApprovedSignatureAsset('e'.repeat(64)), false);
    assert.equal(isApprovedSignatureAsset('e'.repeat(64), true), false);
  });
});
