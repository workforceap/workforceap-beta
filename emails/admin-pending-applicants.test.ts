/**
 * Admin pending-applicant mail reports a count in HTML. The count is coerced
 * to a non-negative integer so a bad payload cannot print "NaN", and grammar
 * stays singular for one application.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adminPendingApplicantsHtml } from './admin-pending-applicants';

describe('adminPendingApplicantsHtml', () => {
  it('uses singular grammar for one pending application', () => {
    const html = adminPendingApplicantsHtml({ pendingCount: 1 });
    assert.match(html, /<strong>1 pending application<\/strong>/);
    assert.match(html, /that is more than 3 days old/);
  });

  it('uses plural grammar for more than one application', () => {
    const html = adminPendingApplicantsHtml({ pendingCount: 4 });
    assert.match(html, /<strong>4 pending applications<\/strong>/);
    assert.match(html, /that are more than 3 days old/);
  });

  it('clamps non-numeric and negative counts to zero', () => {
    assert.match(adminPendingApplicantsHtml({ pendingCount: Number.NaN }), /<strong>0 pending applications<\/strong>/);
    assert.match(adminPendingApplicantsHtml({ pendingCount: -3 }), /<strong>0 pending applications<\/strong>/);
    assert.ok(!adminPendingApplicantsHtml({ pendingCount: Number.NaN }).includes('NaN'));
  });
});
