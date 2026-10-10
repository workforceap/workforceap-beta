import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getWorkspaceEmailAvailability, getWorkspaceEmailProvider } from './provider';

const originalProvider = process.env.WORKSPACE_EMAIL_PROVIDER;
afterEach(() => {
  if (originalProvider === undefined) delete process.env.WORKSPACE_EMAIL_PROVIDER;
  else process.env.WORKSPACE_EMAIL_PROVIDER = originalProvider;
});

describe('workspace mailbox availability', () => {
  it('does not offer a placeholder as real provisioning when unconfigured', () => {
    delete process.env.WORKSPACE_EMAIL_PROVIDER;
    assert.equal(getWorkspaceEmailAvailability().available, false);
    assert.throws(() => getWorkspaceEmailProvider(), /Mailbox creation is not connected/);
  });

  it('rejects the fixture stub even when explicitly selected', () => {
    process.env.WORKSPACE_EMAIL_PROVIDER = 'noop';
    assert.equal(getWorkspaceEmailAvailability().available, false);
    assert.throws(() => getWorkspaceEmailProvider(), /Mailbox creation is not connected/);
  });

  it('keeps unimplemented real providers unavailable', () => {
    for (const provider of ['google', 'microsoft']) {
      process.env.WORKSPACE_EMAIL_PROVIDER = provider;
      assert.equal(getWorkspaceEmailAvailability().available, false);
      assert.throws(() => getWorkspaceEmailProvider(), /not implemented/);
    }
  });
});
