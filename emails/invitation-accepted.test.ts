/**
 * Invitation-accepted mail tells the inviter who joined and in which role.
 * Name, email, and role are caller-controlled and must not become markup.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { invitationAcceptedHtml } from './invitation-accepted';

describe('invitationAcceptedHtml', () => {
  it('escapes accepter name, email, and role', () => {
    const html = invitationAcceptedHtml({
      accepterName: '<script>alert(1)</script>',
      accepterEmail: '" onclick="alert(1)',
      role: '<img src=x onerror=alert(1)>',
    });
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('<img'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(html.includes('&quot; onclick=&quot;alert(1)'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  });
});
