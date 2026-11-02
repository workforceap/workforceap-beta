import test from 'node:test';
import assert from 'node:assert/strict';
import { invitationHtml } from './invitation';

test('omits the personal message and login code when they are absent', () => {
  const html = invitationHtml({
    inviterName: 'Jordan Lee',
    role: 'counselor',
  });
  assert.match(html, /Jordan Lee has invited you to join WorkforceAP/);
  assert.match(html, /Your role:<\/strong> counselor/);
  assert.doesNotMatch(html, /<em>/);
  assert.doesNotMatch(html, /Your login code/);
});

test('escapes untrusted inviter, role, personal message, login code and invite path', () => {
  const html = invitationHtml({
    inviterName: '<img src=x onerror=1>',
    role: '<script>admin</script>',
    personalMessage: '" onclick="alert(1)',
    loginCode: '<b>12-34</b>',
    branding: {
      orgId: 'org-x',
      name: '<svg onload=1>',
      logoUrl: 'https://cdn.example/x.png',
      primaryColor: '#0066ff',
      supportEmail: 'ops@example.org',
      domain: 'https://evil.example/" onclick="alert(1)',
      domainLabel: 'evil.example',
    },
  });
  assert.doesNotMatch(html, /<img /);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<svg /);
  assert.doesNotMatch(html, /<b>12-34<\/b>/);
  assert.doesNotMatch(html, /onclick="alert/);
  assert.match(html, /&lt;img src=x onerror=1&gt; has invited you to join &lt;svg onload=1&gt;/);
  assert.match(html, /Your role:<\/strong> &lt;script&gt;admin&lt;\/script&gt;/);
  assert.match(html, /&quot; onclick=&quot;alert\(1\)/);
  assert.match(html, /&lt;b&gt;12-34&lt;\/b&gt;/);
  assert.match(
    html,
    /href="https:\/\/evil\.example\/&quot; onclick=&quot;alert\(1\)\/invite"/,
  );
});
