import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  SIGNATURE_ASSET_HEADER_BYTES,
  SIGNATURE_ASSET_MAX_BYTES,
  SIGNATURE_ASSET_MIME,
  activeSignatureAsset,
  canUploadSignatureAsset,
  inspectSignaturePng,
  signatureAssetObjectKey,
  signatureAssetStatus,
  signatureRefForContent,
  type SignerSignatureAsset,
} from './signatureAsset';
import { syntheticPng } from '../../../tests/fixtures/billing/syntheticPng';

const ORG = '00000000-0000-4000-8000-000000000001';
const SIGNER = '11111111-1111-4111-8111-111111111111';
const STAFF = '22222222-2222-4222-8222-222222222222';

describe('signature asset: PNG inspection', () => {
  it('accepts a well-formed PNG, hashes the exact bytes and returns the IHDR header the database checks', () => {
    const png = syntheticPng(300, 90);
    const r = inspectSignaturePng(png);
    assert.ok(r.ok);
    assert.equal(r.png.mimeType, SIGNATURE_ASSET_MIME);
    assert.equal(r.png.sha256, createHash('sha256').update(png).digest('hex'));
    assert.equal(r.png.byteLength, png.length);
    assert.equal(r.png.widthPx, 300);
    assert.equal(r.png.heightPx, 90);
    assert.equal(r.png.pngHeader.length, SIGNATURE_ASSET_HEADER_BYTES);
    assert.deepEqual(Buffer.from(r.png.pngHeader), png.subarray(0, 33));
  });

  it('refuses anything that is not a complete, still PNG within the bounds', () => {
    const png = syntheticPng();
    const bad = (bytes: Uint8Array) => assert.equal(inspectSignaturePng(bytes).ok, false);
    bad(new Uint8Array(0));
    bad(Buffer.from('%PDF-1.7\n' + 'x'.repeat(100)));
    bad(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), png.subarray(4)])); // JPEG magic
    const wrongCrc = Buffer.from(png);
    wrongCrc[20] ^= 0x01; // height changed, CRC stale
    bad(wrongCrc);
    bad(png.subarray(0, png.length - 12)); // no IEND
    bad(Buffer.concat([png, Buffer.from('trailing')]));
    bad(syntheticPng(120, 40, [['acTL', Buffer.alloc(8)]])); // animated
    bad(syntheticPng(6001, 1));
    assert.equal(inspectSignaturePng(new Uint8Array(SIGNATURE_ASSET_MAX_BYTES + 1)).ok, false);
  });
});

describe('signature asset: key, principal and sign gate', () => {
  it('builds the content-addressed key in the finance bucket signature/ prefix', () => {
    const sha = 'b'.repeat(64);
    assert.equal(signatureAssetObjectKey(ORG, SIGNER, sha), `signature/${ORG}/${SIGNER}/${sha}.png`);
    assert.throws(() => signatureAssetObjectKey('../x', SIGNER, sha));
    assert.throws(() => signatureAssetObjectKey(ORG, SIGNER, 'nothex'));
  });

  it('only the designated signer uploads his own signature', () => {
    assert.deepEqual(canUploadSignatureAsset({ actorUserId: SIGNER, designatedSignerUserId: SIGNER }), { ok: true });
    const other = canUploadSignatureAsset({ actorUserId: STAFF, designatedSignerUserId: SIGNER });
    assert.equal(other.ok || other.code, 'SIGNATURE_ASSET_WRONG_PRINCIPAL');
    const unset = canUploadSignatureAsset({ actorUserId: SIGNER, designatedSignerUserId: null });
    assert.equal(unset.ok || unset.code, 'SIGNER_PRINCIPAL_UNSET');
  });

  it('signing needs the active asset frozen exactly; a revoked or replaced asset fails closed', () => {
    const a1: SignerSignatureAsset = { id: 'sig-1', organizationId: ORG, signerUserId: SIGNER, sha256: 'b'.repeat(64), revokedAt: null };
    const frozen = signatureRefForContent(activeSignatureAsset([a1], SIGNER));
    assert.deepEqual(frozen, { assetId: 'sig-1', assetSha256: 'b'.repeat(64) });
    assert.deepEqual(signatureAssetStatus({ designatedSignerUserId: SIGNER, assets: [a1], frozen }), { ok: true, asset: frozen });

    const code = (g: ReturnType<typeof signatureAssetStatus>) => (g.ok ? 'ok' : g.code);
    assert.equal(code(signatureAssetStatus({ designatedSignerUserId: null, assets: [a1], frozen })), 'SIGNER_PRINCIPAL_UNSET');
    assert.equal(code(signatureAssetStatus({ designatedSignerUserId: SIGNER, assets: [], frozen })), 'SIGNATURE_ASSET_MISSING');
    assert.equal(code(signatureAssetStatus({ designatedSignerUserId: SIGNER, assets: [a1], frozen: null })), 'SIGNATURE_ASSET_MISMATCH');
    const revoked = { ...a1, revokedAt: new Date('2026-10-01T00:00:00Z') };
    assert.equal(code(signatureAssetStatus({ designatedSignerUserId: SIGNER, assets: [revoked], frozen })), 'SIGNATURE_ASSET_MISSING');
    const a2: SignerSignatureAsset = { id: 'sig-2', organizationId: ORG, signerUserId: SIGNER, sha256: 'd'.repeat(64), revokedAt: null };
    assert.equal(code(signatureAssetStatus({ designatedSignerUserId: SIGNER, assets: [revoked, a2], frozen })), 'SIGNATURE_ASSET_MISMATCH');
    // Another principal's asset never serves the designated signer.
    const staffAsset = { ...a1, signerUserId: STAFF };
    assert.equal(code(signatureAssetStatus({ designatedSignerUserId: SIGNER, assets: [staffAsset], frozen })), 'SIGNATURE_ASSET_MISSING');
    assert.equal(signatureRefForContent(null), null);
  });
});
