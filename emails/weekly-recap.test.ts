import test from 'node:test';
import assert from 'node:assert/strict';
import { weeklyRecapHtml } from './weekly-recap';

test('greets the member and renders recap line breaks', () => {
  const html = weeklyRecapHtml({
    firstName: 'Jordan',
    recapSummary: 'Finished IT Support week 2.\nBooked a counselor session.',
  });
  assert.match(html, /Hi Jordan,/);
  assert.match(html, /Finished IT Support week 2\.<br \/>\nBooked a counselor session\./);
});

test('escapes untrusted first name and recap summary', () => {
  const html = weeklyRecapHtml({
    firstName: '<img src=x onerror=1>',
    recapSummary: '<script>alert(1)</script>\n"quoted"',
  });
  assert.doesNotMatch(html, /<img /);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Hi &lt;img src=x onerror=1&gt;,/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;<br \/>\n&quot;quoted&quot;/);
});
