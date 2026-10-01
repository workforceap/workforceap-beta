import { describe, expect, it } from 'vitest';
import {
  JOB_POSTING_STATUS_KEYS,
  JOB_POSTING_STATUS_WORDS,
  jobPostingStatusKey,
  jobPostingStatusLabel,
  type JobPostingStatusAudience,
} from '@/lib/status/jobPostingStatusVocabulary';
import {
  employerJobPortalStatusLabel,
  employerJobStatusLabel,
} from '@/lib/employer/jobStatusDisplay';

/**
 * One vocabulary for JobPosting.status. The employer hears what happens next
 * ("Awaiting approval"); the admin hears the queue word ("Awaiting review");
 * every other value is the enum truth and reads the same for both.
 */

const AUDIENCES: JobPostingStatusAudience[] = ['employer', 'admin'];

describe('job posting status vocabulary', () => {
  it('has a word for every status × audience, never the raw key', () => {
    for (const audience of AUDIENCES) {
      for (const key of JOB_POSTING_STATUS_KEYS) {
        const word = jobPostingStatusLabel(key, audience);
        expect(word.trim().length, `${audience} ${key}`).toBeGreaterThan(0);
        expect(word, `${audience} ${key}`).not.toBe(key);
        expect(word).toBe(JOB_POSTING_STATUS_WORDS[audience][key]);
      }
    }
  });

  it('splits only `pending`: employer sees what happens next, admin sees the queue word', () => {
    expect(jobPostingStatusLabel('pending', 'employer')).toBe('Awaiting approval');
    expect(jobPostingStatusLabel('pending', 'admin')).toBe('Awaiting review');
    for (const audience of AUDIENCES) {
      expect(jobPostingStatusLabel('pending', audience)).not.toMatch(/^(Pending|In review)$/);
    }
    for (const key of JOB_POSTING_STATUS_KEYS) {
      if (key === 'pending') continue;
      expect(jobPostingStatusLabel(key, 'employer'), key).toBe(jobPostingStatusLabel(key, 'admin'));
    }
  });

  it('maps every JobStatusEnum value plus the derived `expired`; anything else is not a key and reads as-is', () => {
    for (const key of JOB_POSTING_STATUS_KEYS) expect(jobPostingStatusKey(key)).toBe(key);
    expect(jobPostingStatusKey(null)).toBeNull();
    expect(jobPostingStatusKey(undefined)).toBeNull();
    expect(jobPostingStatusKey('PENDING')).toBeNull();
    expect(jobPostingStatusLabel('archived', 'admin')).toBe('archived');
  });

  it('is what the employer helpers speak, with the portal overlay kept on top', () => {
    for (const key of JOB_POSTING_STATUS_KEYS) {
      expect(employerJobStatusLabel(key)).toBe(JOB_POSTING_STATUS_WORDS.employer[key]);
    }
    expect(employerJobStatusLabel('pending')).toBe('Awaiting approval');
    expect(employerJobPortalStatusLabel('pending')).toBe('Awaiting approval');
    // The board's own reading of live/approved/closed is unchanged.
    expect(employerJobPortalStatusLabel('live')).toBe('Active');
    expect(employerJobPortalStatusLabel('approved')).toBe('Paused');
    expect(employerJobPortalStatusLabel('filled')).toBe('Closed');
    expect(employerJobPortalStatusLabel('expired')).toBe('Expired');
  });
});
