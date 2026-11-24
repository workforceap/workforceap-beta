/**
 * Weekly stale-applicant digest interpolates employer names and counts.
 * Those fields must not become markup, and singular grammar must stay
 * accurate when exactly one employer is listed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adminStaleApplicantsDigestHtml } from './admin-stale-applicants-digest';

describe('adminStaleApplicantsDigestHtml', () => {
  it('escapes employer names and does not trust the count as markup', () => {
    const html = adminStaleApplicantsDigestHtml({
      employers: [
        { companyName: '<script>alert(1)</script>', candidateCount: 12 },
        { companyName: 'East Austin & Co', candidateCount: 10 },
      ],
    });
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(html.includes('East Austin &amp; Co'));
    assert.ok(html.includes('12 candidates waiting 5+ days'));
    assert.match(html, /2 employers have 10 or more/);
  });

  it('uses singular copy for one employer and keeps the truncated notice', () => {
    const html = adminStaleApplicantsDigestHtml({
      employers: [{ companyName: 'Acme', candidateCount: 11 }],
      truncated: true,
    });
    assert.match(html, /1 employer has 10 or more/);
    assert.match(html, /Queue scan capped/);
    assert.doesNotMatch(html, /1 employers have/);
  });
});
