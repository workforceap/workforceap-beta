import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { BillingPacketSummary } from './packetAccess';
import { describeSendResult, duplicateCopyConfirmText, postSignCue } from './sendResultCopy';

// Synthetic packet summaries only.
function packet(over: Partial<BillingPacketSummary> = {}, sendState: Partial<NonNullable<BillingPacketSummary['sendState']>> | null = null): BillingPacketSummary {
  return {
    id: 'p1', packetNumber: 'WAP-TEST-0001', status: 'signed', programSlug: 'x', programTitle: 'X', invoiceDate: '2026-09-01', dueDate: null,
    billToName: 'Test Board', referenceNumber: null, totalAmount: 100, lineItems: [], signerName: 'S', signerTitle: 'T',
    signedAt: '2026-09-01T00:00:00.000Z', sentAt: null, sentTo: [], sendCount: 0, recipients: { student: 's@example.test', counselor: null },
    supersededAt: null, supersededReason: null, supersededById: null, supersededByPacketId: null, supersedesPacketId: null, sendBlockedReason: null,
    sendState: sendState
      ? { attemptNo: 1, attemptRecipients: ['student'], nextAction: 'send', rows: [], delivered: [], remaining: ['student'], history: [], warnings: [], ...sendState }
      : null,
    ...over,
  };
}

describe('describeSendResult', () => {
  it('a recorded reconciliation is a success with its own copy, never "Sent to ."', () => {
    const r = describeSendResult(true, { kind: 'reconciliation_recorded', outcome: 'not_delivered', recipient: 'counselor' });
    assert.deepEqual(r, { ok: true, message: 'Reconciliation recorded — Counselor copy: not delivered.' });
    assert.match(describeSendResult(true, { kind: 'reconciliation_recorded', outcome: 'delivered', recipient: 'student', replacementSendable: true }).message, /replacement packet can now be sent/);
    assert.match(describeSendResult(true, { kind: 'reconciliation_recorded', outcome: 'delivered', recipient: 'student', replacementSendable: false }).message, /stays blocked/);
  });
  it('"Sent to" only with a non-empty recipient list', () => {
    assert.equal(describeSendResult(true, { kind: 'sent', sentTo: ['a@example.test'] }).message, 'Sent to a@example.test.');
    assert.equal(describeSendResult(true, { kind: 'sent', sentTo: [] }).message, 'Send state updated.');
    assert.equal(describeSendResult(true, {}).message, 'Send state updated.');
  });
  it('errors carry the server message', () => {
    assert.deepEqual(describeSendResult(false, { error: 'nope' }), { ok: false, message: 'nope' });
  });
});

describe('postSignCue', () => {
  it('asks to press Email only before the first attempt', () => {
    assert.match(postSignCue(packet())!, /Next step: press/);
    assert.match(postSignCue(packet({}, { attemptNo: null }))!, /Next step: press/);
  });
  it('follows the send state after a send', () => {
    assert.equal(postSignCue(packet({ status: 'sent' }, { nextAction: 'email_again', remaining: [], delivered: [{ recipient: 'student', email: 's@example.test', at: null, attemptNo: 1 }] })), 'Invoice WAP-TEST-0001 was emailed.');
    assert.match(postSignCue(packet({}, { nextAction: 'retry' }))!, /Retry/);
    assert.match(postSignCue(packet({}, { nextAction: 'reconcile' }))!, /reconciliation/);
    assert.match(
      postSignCue(packet({}, { nextAction: 'email_again', remaining: ['counselor'], delivered: [{ recipient: 'student', email: null, at: null, attemptNo: 1 }] }))!,
      /Send to remaining recipients/,
    );
    assert.doesNotMatch(postSignCue(packet({ status: 'sent' }, { nextAction: 'email_again', remaining: [] }))!, /press/);
  });
  it('hidden for superseded packets; re-issue cue for blocked ones', () => {
    assert.equal(postSignCue(packet({ status: 'superseded' })), null);
    assert.match(postSignCue(packet({ sendBlockedReason: 'legacy_packet' }))!, /re-issue required/);
  });
});

describe('duplicateCopyConfirmText', () => {
  it('names who already received it and when', () => {
    assert.equal(duplicateCopyConfirmText(packet({}, { delivered: [] })), null);
    const text = duplicateCopyConfirmText(packet({}, { delivered: [{ recipient: 'student', email: 's@example.test', at: '2026-09-02T15:00:00.000Z', attemptNo: 1 }] }))!;
    assert.match(text, /the student \(s@example\.test\) on September 2, 2026, attempt 1/);
  });
});
