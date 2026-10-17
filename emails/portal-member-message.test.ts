import test from 'node:test';
import assert from 'node:assert/strict';
import { portalMemberMessageHtml } from './portal-member-message';

test('greets staff and names the member sender', () => {
  const html = portalMemberMessageHtml({
    firstName: 'Michael',
    memberName: 'John Cofield',
    bodyPreview: 'Looking forward to also talk about entrepreneurship',
    threadUrl: 'https://www.workforceap.org/counselor/messages?memberId=member-1',
  });
  assert.match(html, /Hi Michael/);
  assert.match(html, /John Cofield/);
  assert.match(html, /Looking forward to also talk about entrepreneurship/);
  assert.match(html, /Open Messages/);
  assert.ok(html.includes('https://www.workforceap.org/counselor/messages?memberId=member-1'));
});

test('escapes untrusted names and preview text', () => {
  const html = portalMemberMessageHtml({
    firstName: '<b>x</b>',
    memberName: '<img src=x onerror=1>',
    bodyPreview: '<script>alert(1)</script>',
    threadUrl: 'https://www.workforceap.org/admin/messages',
  });
  assert.doesNotMatch(html, /<b>x<\/b>/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img /);
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.match(html, /&lt;script&gt;/);
});

test('uses org primary color for the CTA accent when branding is supplied', () => {
  const html = portalMemberMessageHtml({
    firstName: 'Alex',
    memberName: 'Member',
    bodyPreview: 'Hello',
    threadUrl: 'https://aaul.example/admin/messages',
    branding: {
      orgId: 'org-aaul',
      name: 'AAUL',
      logoUrl: 'https://cdn.example.com/aaul-logo.png',
      primaryColor: '#004B87',
      supportEmail: 'help@aaul.example',
      domain: 'https://aaul.example',
      domainLabel: 'aaul.example',
    },
  });
  assert.match(html, /color: #004B87/);
});
