import type { ScoreBreakdown } from './score';

/**
 * The member from the 2026-09-22 production screenshot: everything done except
 * certificates (0), 2 of 5 pathway steps, 2 of 3 applications. Under the old
 * 105-point weights this read 86/105; with the 100-point weights it is 82/100
 * (Resume & Profile 100%, Training & Certs 61%, Interview & Jobs 83%, Engagement 100%).
 */
export const SCREENSHOT_MEMBER_BREAKDOWN: ScoreBreakdown = {
  completeProfile: { earned: 5, max: 5, done: true },
  setGoals: { earned: 9, max: 9, done: true },
  buildResume: { earned: 19, max: 19, done: true },
  complete2Resources: { earned: 9, max: 9, done: true },
  practiceInterview: { earned: 14, max: 14, done: true },
  startPathway: { earned: 5, max: 5, done: true },
  completePathwaySteps: { earned: 6, max: 14, done: false },
  addApplications: { earned: 10, max: 15, done: false },
  trackCertifications: { earned: 0, max: 5, done: false },
  weeklyConsistency: { earned: 5, max: 5, done: true },
};

export function zeroScoreBreakdown(): ScoreBreakdown {
  return {
    completeProfile: { earned: 0, max: 5, done: false },
    setGoals: { earned: 0, max: 9, done: false },
    buildResume: { earned: 0, max: 19, done: false },
    complete2Resources: { earned: 0, max: 9, done: false },
    practiceInterview: { earned: 0, max: 14, done: false },
    startPathway: { earned: 0, max: 5, done: false },
    completePathwaySteps: { earned: 0, max: 14, done: false },
    addApplications: { earned: 0, max: 15, done: false },
    trackCertifications: { earned: 0, max: 5, done: false },
    weeklyConsistency: { earned: 0, max: 5, done: false },
  };
}
