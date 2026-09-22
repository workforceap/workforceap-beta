import type { CareerMatchResult } from '@/lib/onet/types';
import { programDisplayTitle } from '@/lib/content/programTitle';

/** Query used when the member has neither a career match nor a program on file. */
export const DEFAULT_EXTERNAL_JOB_QUERY = 'jobs';

export type ExternalJobSearchSource = 'occupation' | 'program' | 'default';

export type ExternalJobSearch = { query: string; source: ExternalJobSearchSource };

/**
 * Keyword the external job-board links search for. Prefers the member's top
 * career-quiz occupation (User.careerRecommendationJson), then the enrolled
 * program's catalog title, then the generic literal the page always used.
 */
export function buildExternalJobSearchQuery(input: {
  careerRecommendation?: CareerMatchResult | null;
  programSlug?: string | null;
}): ExternalJobSearch {
  const occupation = input.careerRecommendation?.topOccupations?.[0]?.title?.trim();
  if (occupation) return { query: occupation, source: 'occupation' };

  const slug = input.programSlug?.trim();
  if (slug) {
    const title = programDisplayTitle(slug).trim();
    if (title) return { query: title, source: 'program' };
  }

  return { query: DEFAULT_EXTERNAL_JOB_QUERY, source: 'default' };
}

export type ExternalJobBoard = { label: string; href: string; note: string; bestFor: string };

/** External job-board links for a query + location; every parameter is URL-encoded. */
export function buildExternalJobBoards(args: { query: string; location: string }): ExternalJobBoard[] {
  const { query, location } = args;
  return [
    {
      label: 'Indeed',
      href: `https://www.indeed.com/jobs?${new URLSearchParams({ q: query, l: location }).toString()}`,
      note: 'Largest local coverage across industries.',
      bestFor: 'fastest broad search',
    },
    {
      label: 'LinkedIn',
      href: `https://www.linkedin.com/jobs/search/?${new URLSearchParams({ keywords: query, location }).toString()}`,
      note: 'Strong for professional, tech, and corporate roles.',
      bestFor: 'office, tech, and employer networking',
    },
    {
      label: 'Glassdoor',
      href: `https://www.glassdoor.com/Job/jobs.htm?${new URLSearchParams({ 'sc.keyword': `${query} ${location}` }).toString()}`,
      note: 'Job listings plus salary and company review context.',
      bestFor: 'salary checks before you apply',
    },
    {
      label: 'ZipRecruiter',
      href: `https://www.ziprecruiter.com/jobs-search?${new URLSearchParams({ search: query, location }).toString()}`,
      note: 'Good metro and suburb coverage.',
      bestFor: 'wider Austin-metro reach',
    },
    {
      label: 'WorkInTexas / AustinJobs',
      href: 'https://www.workintexas.com/vosnet/Default.aspx',
      note: 'Texas Workforce Commission portal for local and public-sector roles.',
      bestFor: 'public-sector and workforce-system jobs',
    },
  ];
}
