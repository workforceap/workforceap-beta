import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildJ5Content, buildJ6Content } from '../content';
import { j6Recipients } from '../recipients';
import { canSignJ6, checkJ5Prerequisites, checkJ6Prerequisites } from '../stateMachine';
import { blockerCodeFor } from './blockers';

const NOW = new Date('2026-10-01T18:00:00.000Z');

describe('two-stage blocker codes pinned to M1 messages', () => {
  it('maps every message M1 returns for missing evidence to a stable code (none fall through to PREREQUISITE_UNMET)', () => {
    const messages: string[] = [];
    const j5 = checkJ5Prerequisites({ hasOpenJ5: true, readiness: null, programSlug: 'unknown-program' });
    if (!j5.ok) messages.push(...j5.errors);
    const j6 = checkJ6Prerequisites({ now: NOW, hasOpenJ6: true, programSlug: 'data-analytics-professional-certificate-google', priorJ5: null, classStarted: null, voucher: null, voucherAttestation: null, boardInvoice: { id: 'x', kind: 'board_signed_voucher', fileName: '', mimeType: '', byteLength: 0, sha256: '' } });
    if (!j6.ok) messages.push(...j6.errors);
    const built5 = buildJ5Content({ documentNumber: 'N', logoSha256: 'a'.repeat(64), issueDate: '2026-10-01', student: { name: '', email: 'bad' }, boardName: '', counselor: { name: 'C', email: 'c@example.test', phone: '' }, programSlug: 'data-analytics-professional-certificate-google', readiness: null as never, signatureAsset: null });
    if (!built5.ok) messages.push(...built5.errors);
    const dup = j6Recipients({ finance: { name: 'F', email: 'same@example.test' }, counselor: { name: 'C', email: 'same@example.test' }, student: { name: 'S', email: 's@example.test' } });
    if (!dup.ok) messages.push(...dup.errors);
    const sign = canSignJ6({ reviewReasons: [], classStartDate: '2026-12-01', now: NOW, voucherReceiptSignature: { ok: true } });
    if (!sign.ok) messages.push(...sign.errors);
    void buildJ6Content;
    assert.ok(messages.length >= 10);
    const unmapped = messages.filter((m) => blockerCodeFor(m) === 'PREREQUISITE_UNMET');
    assert.deepEqual(unmapped, []);
  });
});
