import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PORTAL_MESSAGE_OPS_INBOX, portalMessageForwardBcc } from './portalMessageOpsInbox';

describe('portalMessageForwardBcc', () => {
  it('BCCs the ops inbox for every other recipient and skips when the primary is already that address', () => {
    assert.deepEqual(portalMessageForwardBcc('member@example.test'), [PORTAL_MESSAGE_OPS_INBOX]);
    assert.deepEqual(portalMessageForwardBcc('  jordan@workforceap.org  '), [PORTAL_MESSAGE_OPS_INBOX]);
    assert.equal(portalMessageForwardBcc(PORTAL_MESSAGE_OPS_INBOX), undefined);
    assert.equal(portalMessageForwardBcc('  MICHAEL.BROWN@WORKFORCEAP.ORG  '), undefined);
  });
});
