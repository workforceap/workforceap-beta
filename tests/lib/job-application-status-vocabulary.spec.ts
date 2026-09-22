import { describe, expect, it } from 'vitest';
import {
  JOB_APPLICATION_STATUS_KEYS,
  JOB_APPLICATION_STATUS_WORDS,
  jobApplicationStatusKey,
  jobApplicationStatusLabel,
  type JobApplicationStatusAudience,
} from '@/lib/status/jobApplicationStatusVocabulary';
import { employerJobPostingApplicationStatusLabel } from '@/lib/employer/jobPostingApplicationStatus';

/**
 * One vocabulary for JobPostingApplication.status. The employer hears the
 * pipeline as they work it ("New" first); the member — and a counselor
 * reading the member's record — hears the journey ("Applied" first). Neither
 * hears the enum ("pending", "rejected") or the old title-case of it.
 */

const AUDIENCES: JobApplicationStatusAudience[] = ['employer', 'member'];
const OLD_WORDS = /^(Pending|Under Review|Offer|Offered|Interview|Declined|Rejected)$/;

describe('job application status vocabulary', () => {
  it('has a word for every status × audience, never the raw key or its title-case', () => {
    for (const audience of AUDIENCES) {
      for (const key of JOB_APPLICATION_STATUS_KEYS) {
        const word = jobApplicationStatusLabel(key, audience);
        expect(word.trim().length, `${audience} ${key}`).toBeGreaterThan(0);
        expect(word, `${audience} ${key}`).not.toBe(key);
        expect(word, `${audience} ${key}`).not.toMatch(OLD_WORDS);
        expect(word).toBe(JOB_APPLICATION_STATUS_WORDS[audience][key]);
      }
    }
  });

  it('splits the waiting stages by audience: the employer owns a "New" application, the member has "Applied"', () => {
    expect(jobApplicationStatusLabel('pending', 'employer')).toBe('New');
    expect(jobApplicationStatusLabel('pending', 'member')).toBe('Applied');
    expect(jobApplicationStatusLabel('reviewing', 'employer')).toBe('Reviewing');
    expect(jobApplicationStatusLabel('reviewing', 'member')).toBe('Under review');
    expect(jobApplicationStatusLabel('offered', 'employer')).toBe('Offer extended');
    expect(jobApplicationStatusLabel('offered', 'member')).toBe('Offer received');
  });

  it('never calls a person "Rejected": both audiences read "Not selected"; "Hired" is the same for both', () => {
    for (const audience of AUDIENCES) {
      expect(jobApplicationStatusLabel('rejected', audience)).toBe('Not selected');
      expect(jobApplicationStatusLabel('hired', audience)).toBe('Hired');
    }
  });

  it('maps exactly the JobPostingApplicationStatus enum; anything else is not a key and reads as-is', () => {
    expect([...JOB_APPLICATION_STATUS_KEYS]).toEqual(['pending', 'reviewing', 'interview', 'offered', 'hired', 'rejected']);
    for (const key of JOB_APPLICATION_STATUS_KEYS) expect(jobApplicationStatusKey(key)).toBe(key);
    expect(jobApplicationStatusKey(null)).toBeNull();
    expect(jobApplicationStatusKey(undefined)).toBeNull();
    expect(jobApplicationStatusKey('PENDING')).toBeNull();
    expect(jobApplicationStatusLabel('withdrawn', 'employer')).toBe('withdrawn');
  });

  it('is what the employer helper speaks', () => {
    for (const key of JOB_APPLICATION_STATUS_KEYS) {
      expect(employerJobPostingApplicationStatusLabel(key)).toBe(JOB_APPLICATION_STATUS_WORDS.employer[key]);
    }
    expect(employerJobPostingApplicationStatusLabel('pending')).toBe('New');
    expect(employerJobPostingApplicationStatusLabel('rejected')).toBe('Not selected');
  });
});
