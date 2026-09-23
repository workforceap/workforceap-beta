/**
 * AI Matchmaker – Weighted scoring configuration.
 * Weights must sum to 1.0. Adjust to tune match quality.
 */

export const MATCH_WEIGHTS = {
  /** Candidate's enrolled program vs job's suggested programs */
  programAlignment: 0.35,
  /** Career readiness assessment score */
  assessmentReadiness: 0.2,
  /** Job preferred certifications vs candidate certs */
  certifications: 0.25,
  /** Progress through program courses */
  courseCompletion: 0.1,
  /** Job requirements vs program skills overlap */
  skillsMatching: 0.1,
} as const;

/** Verify weights sum to 1.0 */
const WEIGHT_SUM =
  MATCH_WEIGHTS.programAlignment +
  MATCH_WEIGHTS.assessmentReadiness +
  MATCH_WEIGHTS.certifications +
  MATCH_WEIGHTS.courseCompletion +
  MATCH_WEIGHTS.skillsMatching;

if (Math.abs(WEIGHT_SUM - 1) > 0.001) {
  throw new Error(`Match weights must sum to 1.0, got ${WEIGHT_SUM}`);
}

/** Raw score 0–1 for program alignment */
export function scoreProgramAlignment(
  enrolledProgram: string | null,
  suggestedProgramSlugs: Set<string>
): { score: number; reason: string | null } {
  if (!enrolledProgram) return { score: 0, reason: null };
  const slug = enrolledProgram.toLowerCase();
  if (suggestedProgramSlugs.has(slug)) {
    return { score: 1, reason: `Enrolled in suggested program: ${enrolledProgram}` };
  }
  return { score: 0.33, reason: `Enrolled in ${enrolledProgram}` };
}

/**
 * Raw score 0–1 for assessment readiness.
 *
 * Gives no reason text: match reasons are stored on `AIJobMatch` and shown
 * to employers, and the assessment score is staff-only
 * (lib/employer/matchReasons.ts). The score and its weight are unchanged.
 */
export function scoreAssessmentReadiness(assessmentScorePct: number | null): {
  score: number;
  reason: null;
} {
  if (assessmentScorePct == null) return { score: 0, reason: null };
  if (assessmentScorePct >= 70) return { score: 1, reason: null };
  if (assessmentScorePct >= 50) return { score: 0.5, reason: null };
  return { score: 0.2, reason: null };
}

/** Raw score 0–1 for certifications match */
export function scoreCertifications(
  candidateCerts: string[],
  jobPreferredCerts: string[]
): { score: number; reason: string | null } {
  if (jobPreferredCerts.length === 0) return { score: 0, reason: null };
  const certLower = candidateCerts.map((c) => c.toLowerCase());
  let matched = 0;
  const matchedNames: string[] = [];
  for (const want of jobPreferredCerts) {
    const w = want.toLowerCase();
    if (certLower.some((c) => c.includes(w) || w.includes(c))) {
      matched++;
      matchedNames.push(want);
    }
  }
  if (matched === 0) return { score: 0, reason: null };
  const score = matched / jobPreferredCerts.length;
  return {
    score,
    reason: matchedNames.length > 0 ? `Has certification(s): ${matchedNames.join(', ')}` : null,
  };
}

/** Raw score 0–1 for course completion */
export function scoreCourseCompletion(coursesCompleted: string[] | null): {
  score: number;
  reason: string | null;
} {
  const count = (coursesCompleted ?? []).length;
  if (count >= 3) return { score: 1, reason: `${count} courses completed` };
  if (count >= 1) return { score: 0.33, reason: `${count} courses completed` };
  return { score: 0, reason: null };
}

/** Raw score 0–1 for skills matching (job requirements vs program skills) */
export function scoreSkillsMatching(
  jobRequirements: string[],
  programSkills: string[]
): { score: number; reason: string | null } {
  if (jobRequirements.length === 0) return { score: 0, reason: null };
  const progSkillsLower = programSkills.map((s) => s.toLowerCase());
  let matched = 0;
  const matchedSkills: string[] = [];
  for (const req of jobRequirements) {
    const words = req.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    for (const word of words) {
      if (progSkillsLower.some((sk) => sk.includes(word) || word.includes(sk))) {
        matched++;
        matchedSkills.push(word);
        break;
      }
    }
  }
  if (matched === 0) return { score: 0, reason: null };
  const score = matched / jobRequirements.length;
  return {
    score,
    reason: matchedSkills.length > 0 ? `Relevant skills: ${[...new Set(matchedSkills)].slice(0, 3).join(', ')}` : null,
  };
}
