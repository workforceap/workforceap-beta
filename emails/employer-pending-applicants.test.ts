/**
 * Employer pending-applicant mail reports candidate, job, and wait counts.
 * Counts are coerced to non-negative integers so a bad payload cannot print
 * "NaN", and grammar stays singular for one candidate / job / day.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { employerPendingApplicantsHtml } from './employer-pending-applicants';

describe('employerPendingApplicantsHtml', () => {
  it('uses singular grammar for one candidate, job, and day', () => {
    const html = employerPendingApplicantsHtml({
      candidateCount: 1,
      jobsAffected: 1,
      oldestWaitingDays: 1,
    });
    assert.match(html, /<strong>1 candidate<\/strong> is waiting on <strong>1 of your job post<\/strong>/);
    assert.match(html, /<strong>1 day<\/strong>/);
  });

  it('uses plural grammar for more than one', () => {
    const html = employerPendingApplicantsHtml({
      candidateCount: 3,
      jobsAffected: 2,
      oldestWaitingDays: 5,
    });
    assert.match(html, /<strong>3 candidates<\/strong> are waiting on <strong>2 of your job posts<\/strong>/);
    assert.match(html, /<strong>5 days<\/strong>/);
  });

  it('clamps non-numeric and negative counts to zero', () => {
    const html = employerPendingApplicantsHtml({
      candidateCount: Number.NaN,
      jobsAffected: -1,
      oldestWaitingDays: Number.NaN,
    });
    assert.ok(!html.includes('NaN'));
    assert.match(html, /<strong>0 candidates<\/strong>/);
    assert.match(html, /<strong>0 of your job posts<\/strong>/);
    assert.match(html, /<strong>0 days<\/strong>/);
  });
});
