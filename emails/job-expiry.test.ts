/**
 * Job-expiry mail reports how many live posts the cron closed. The count is
 * coerced to a non-negative integer so a bad payload cannot inject markup or
 * print "NaN", and grammar stays singular for one posting.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { employerJobExpiryHtml } from './job-expiry';

describe('employerJobExpiryHtml', () => {
  it('uses singular grammar for one expired posting', () => {
    const html = employerJobExpiryHtml({ expiredCount: 1 });
    assert.match(html, /<strong>1 of your job posting<\/strong>/);
    assert.match(html, /has been automatically closed/);
  });

  it('uses plural grammar for more than one posting', () => {
    const html = employerJobExpiryHtml({ expiredCount: 3 });
    assert.match(html, /<strong>3 of your job postings<\/strong>/);
    assert.match(html, /have been automatically closed/);
  });

  it('clamps non-numeric and negative counts to zero', () => {
    assert.match(employerJobExpiryHtml({ expiredCount: Number.NaN }), /<strong>0 of your job postings<\/strong>/);
    assert.match(employerJobExpiryHtml({ expiredCount: -4 }), /<strong>0 of your job postings<\/strong>/);
    assert.ok(!employerJobExpiryHtml({ expiredCount: Number.NaN }).includes('NaN'));
  });
});
