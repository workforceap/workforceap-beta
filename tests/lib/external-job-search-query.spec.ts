import { describe, expect, it } from 'vitest';
import type { CareerMatchResult } from '@/lib/onet/types';
import {
  DEFAULT_EXTERNAL_JOB_QUERY,
  buildExternalJobBoards,
  buildExternalJobSearchQuery,
} from '@/lib/member/externalJobSearchQuery';
import { PROGRAMS } from '@/lib/content/programs';

/**
 * Review 2026-09-22: the external job-board links on /dashboard/jobs searched
 * for the literal "jobs" for every member. They now search for the member's
 * career-match occupation, else their program title, else the old literal.
 */
const careerRecommendation = {
  topOccupations: [{ onetCode: '15-1232.00', title: 'Computer User Support Specialists' }],
  recommendedPrograms: [],
} as unknown as CareerMatchResult;

describe('buildExternalJobSearchQuery', () => {
  it('uses the top career-match occupation when one is set', () => {
    expect(buildExternalJobSearchQuery({ careerRecommendation, programSlug: 'it-support' })).toEqual({
      query: 'Computer User Support Specialists',
      source: 'occupation',
    });
  });

  it('falls back to the enrolled program title when only a program is set', () => {
    const program = PROGRAMS[0];
    expect(buildExternalJobSearchQuery({ careerRecommendation: null, programSlug: program.slug })).toEqual({
      query: program.title,
      source: 'program',
    });
    // An unknown stored slug still yields a readable title, never the raw slug.
    expect(buildExternalJobSearchQuery({ programSlug: 'widget-repair-track' })).toEqual({
      query: 'Widget Repair Track',
      source: 'program',
    });
  });

  it('keeps the generic literal when neither is set', () => {
    expect(buildExternalJobSearchQuery({})).toEqual({ query: DEFAULT_EXTERNAL_JOB_QUERY, source: 'default' });
    expect(buildExternalJobSearchQuery({ careerRecommendation: { topOccupations: [] } as unknown as CareerMatchResult, programSlug: '  ' })).toEqual({
      query: 'jobs',
      source: 'default',
    });
  });
});

describe('buildExternalJobBoards', () => {
  it('URL-encodes the query and location into every board link', () => {
    const boards = buildExternalJobBoards({ query: 'Computer User Support Specialists', location: 'Round Rock, TX' });
    const byLabel = Object.fromEntries(boards.map((b) => [b.label, new URL(b.href)]));
    expect(byLabel.Indeed.searchParams.get('q')).toBe('Computer User Support Specialists');
    expect(byLabel.Indeed.searchParams.get('l')).toBe('Round Rock, TX');
    expect(byLabel.LinkedIn.searchParams.get('keywords')).toBe('Computer User Support Specialists');
    expect(byLabel.Glassdoor.searchParams.get('sc.keyword')).toBe('Computer User Support Specialists Round Rock, TX');
    expect(byLabel.ZipRecruiter.searchParams.get('search')).toBe('Computer User Support Specialists');
    for (const board of boards) expect(board.href).not.toMatch(/[ ,]/);
    expect(boards.map((b) => b.label)).toContain('WorkInTexas / AustinJobs');
  });
});
