import test from 'node:test';
import assert from 'node:assert/strict';
import { partnerWeeklyDigestHtml } from './partner-weekly-digest';

test('lists stages and this-week wins', () => {
  const html = partnerWeeklyDigestHtml({
    partnerName: 'Austin ISD',
    weekLabel: 'Oct 26 – Nov 2, 2026',
    stageLines: ['2 in Enrolled', '1 in Placed'],
    successLines: ['Sam: Placed at Globex — Support Analyst'],
  });
  assert.match(html, /Hi Austin ISD team,/);
  assert.match(html, /Oct 26 – Nov 2, 2026/);
  assert.match(html, /<li>2 in Enrolled<\/li>/);
  assert.match(html, /<li>Sam: Placed at Globex — Support Analyst<\/li>/);
});

test('says there were no new wins when success lines are empty', () => {
  const html = partnerWeeklyDigestHtml({
    partnerName: 'Partner',
    weekLabel: 'this week',
    stageLines: ['1 in Applied'],
    successLines: [],
  });
  assert.match(html, /no new certifications or placements logged for your referrals/);
  assert.doesNotMatch(html, /<ul><\/ul>/);
});

test('escapes untrusted partner name, week label, stages and wins', () => {
  const html = partnerWeeklyDigestHtml({
    partnerName: '<b>Acme</b>',
    weekLabel: '<img src=x onerror=1>',
    stageLines: ['<script>steal()</script>'],
    successLines: ['Sam earned <img src=x onerror=1>'],
  });
  assert.doesNotMatch(html, /<b>Acme<\/b>/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img /);
  assert.match(html, /Hi &lt;b&gt;Acme&lt;\/b&gt; team,/);
  assert.match(html, /&lt;img src=x onerror=1&gt;/);
  assert.match(html, /&lt;script&gt;steal\(\)&lt;\/script&gt;/);
});
