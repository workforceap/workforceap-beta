import { prisma } from '../db/prisma';
import { ACTIVE_EMPLOYER_JOB_WHERE } from '../jobs/memberVisibleJob';

/** Tokenize a string into lowercase words, removing stopwords. */
function tokens(text: string): string[] {
  const STOPWORDS = new Set(['a', 'an', 'the', 'and', 'or', 'in', 'of', 'to', 'for', 'with', 'is', 'on', 'at', 'by']);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * Score a job against a skill/course name using keyword overlap.
 * Weights: title > requirements > description.
 */
function scoreJob(job: { title: string; description: string; requirements: string[] }, skillTokens: string[]): number {
  if (skillTokens.length === 0) return 0;

  const titleTokens = new Set(tokens(job.title));
  const reqText = job.requirements.join(' ');
  const reqTokens = new Set(tokens(reqText));
  const descTokens = new Set(tokens(job.description));

  let score = 0;
  for (const tok of skillTokens) {
    if (titleTokens.has(tok)) score += 3;
    else if (reqTokens.has(tok)) score += 2;
    else if (descTokens.has(tok)) score += 1;
  }
  return score / skillTokens.length;
}

export async function findBestEmployerMatch(memberId: string, newSkill: string) {
  const jobs = await prisma.job.findMany({
    where: { status: 'live', AND: [ACTIVE_EMPLOYER_JOB_WHERE] },
    select: { id: true, title: true, description: true, requirements: true },
    take: 50,
  });

  if (jobs.length === 0) return null;

  const skillTokens = tokens(newSkill);

  // Score all jobs and pick the best match
  let bestJob = jobs[0];
  let bestScore = scoreJob(jobs[0], skillTokens);

  for (let i = 1; i < jobs.length; i++) {
    const s = scoreJob(jobs[i], skillTokens);
    if (s > bestScore) {
      bestScore = s;
      bestJob = jobs[i];
    }
  }

  // Require at least a weak signal — at least one token overlap
  if (bestScore === 0) return null;

  // Return full job record for the winner
  return prisma.job.findUnique({ where: { id: bestJob.id } });
}
