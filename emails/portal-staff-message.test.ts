import test from 'node:test';
import assert from 'node:assert/strict';
import { portalStaffMessageHtml } from './portal-staff-message';

test('greets the member and names the staff sender', () => {
  const html = portalStaffMessageHtml({
    firstName: 'Michael',
    staffName: 'Jordan Advisor',
    bodyPreview: 'Your paperwork is approved.',
    messagesUrl: 'https://www.workforceap.org/dashboard/messages',
  });
  assert.match(html, /Hi Michael/);
  assert.match(html, /Jordan Advisor/);
  assert.match(html, /Your paperwork is approved\./);
  assert.match(html, /Open Messages/);
  assert.ok(html.includes('https://www.workforceap.org/dashboard/messages'));
});

test('escapes untrusted names and preview text', () => {
  const html = portalStaffMessageHtml({
    firstName: '<b>x</b>',
    staffName: '<img src=x onerror=1>',
    bodyPreview: '<script>alert(1)</script>',
    messagesUrl: 'https://www.workforceap.org/dashboard/messages',
  });
  assert.doesNotMatch(html, /<b>x<\/b>/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img /);
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.match(html, /&lt;script&gt;/);
});

test('uses org primary color for the CTA accent when branding is supplied', () => {
  const html = portalStaffMessageHtml({
    firstName: 'Alex',
    staffName: 'Staff',
    bodyPreview: 'Hello',
    messagesUrl: 'https://aaul.example/dashboard/messages',
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
