/**
 * Human-readable "why this program fits" reasoning for Find Your Path results.
 * Maps quiz answers to confidence-building explanations per program category.
 */

import type { QuizAnswers } from './quizScoring';
import type { Program } from './programs';

type AnswerKey = keyof QuizAnswers;

const REASON_BY_ANSWER: Record<string, Partial<Record<string, string>>> = {
  q1: {
    computers: "You're interested in computers and technology - IT and software programs line up well.",
    health: 'You want to help people with their health - our healthcare track fits that focus.',
    building: 'You like building and making things - manufacturing and trades programs match.',
    managing: 'You enjoy coordinating and leading - project management and business tracks are a strong fit.',
    data: "You're drawn to data and numbers - cloud, management intelligence, and database programs align.",
    not_sure: "You're exploring - this program is a solid option based on your other answers.",
  },
  q2: {
    brand_new: "You're starting fresh - we recommend programs that welcome beginners.",
    some_knowledge: 'You have basics but no credentials - these programs build on that foundation.',
    work_experience: 'You have real-world experience - certification will formalize what you already know.',
    certifications: "You're ready to level up - these programs go deeper.",
  },
  q3: {
    as_fast: "You need to get working soon - this program's timeline fits that goal.",
    '3_5_months': "You can invest 3-5 months - that's a strong fit for most of our Coursera-based tracks.",
    planning_ahead: "You're planning ahead - you have time for programs that take a bit longer.",
    employed_switch: "You're switching careers while employed - this program's pace suits that.",
  },
  q4: {
    salary: 'You prioritized earning potential - research pay for the roles this track prepares you for before you commit.',
    stability: 'You want job stability - this field has steady demand.',
    remote: "You're interested in remote work - many roles in this path support it.",
    community: 'You care about community impact - this path connects you to local employers.',
    hands: 'You prefer hands-on work - this program matches that style.',
  },
  q5: {
    comfortable: "You're comfortable with tech - you can focus on the credential.",
    basic_apps: 'You use phones and basics - we have programs that start where you are.',
    tech_savvy: "You're tech-savvy — this credential will open next-level roles.",
    basics: 'You need to start from the basics - this program is designed for that.',
  },
};

/** Which answers give weight to which categories (from quizScoring). Used to pick the most relevant reason. */
const ANSWER_TO_CATEGORY: Record<string, string[]> = {
  computers: ['it-cyber', 'ai-software'],
  health: ['healthcare'],
  building: ['manufacturing'],
  managing: ['business'],
  data: ['cloud-data', 'ai-software'],
  not_sure: ['it-cyber', 'ai-software', 'cloud-data', 'business', 'healthcare', 'manufacturing', 'digital-literacy'],
  brand_new: ['digital-literacy'],
  some_knowledge: ['it-cyber', 'cloud-data', 'business'],
  work_experience: ['ai-software', 'cloud-data'],
  certifications: ['ai-software', 'cloud-data'],
  as_fast: ['digital-literacy', 'it-cyber'],
  '3_5_months': ['it-cyber', 'cloud-data', 'business'],
  planning_ahead: ['ai-software', 'cloud-data'],
  employed_switch: ['business'],
  salary: ['cloud-data', 'ai-software'],
  stability: ['it-cyber', 'healthcare'],
  remote: ['cloud-data', 'ai-software', 'business'],
  community: ['healthcare', 'manufacturing'],
  hands: ['manufacturing'],
  comfortable: [], // neutral
  basic_apps: ['digital-literacy'],
  tech_savvy: ['ai-software', 'cloud-data'],
  basics: ['digital-literacy'],
};

function getBestMatchingReason(program: Program, answers: QuizAnswers): string {
  const cat = program.category;
  const reasons: string[] = [];

  (['q1', 'q2', 'q3', 'q4', 'q5'] as AnswerKey[]).forEach((q) => {
    const ans = answers[q];
    if (!ans) return;
    const map = REASON_BY_ANSWER[q];
    if (!map) return;
    const reason = map[ans];
    if (!reason) return;

    const relevantCats = ANSWER_TO_CATEGORY[ans];
    const appliesToThisProgram = !relevantCats || relevantCats.length === 0 || relevantCats.includes(cat);
    if (appliesToThisProgram) {
      reasons.push(reason);
    }
  });

  if (reasons.length > 0) return reasons[0];
  return 'Based on your answers, this program aligns with your goals and experience level.';
}

export function getFitReasoning(program: Program, answers: QuizAnswers): string {
  return getBestMatchingReason(program, answers);
}

export function getTopFitSummary(answers: QuizAnswers): string {
  const parts: string[] = [];
  if (answers.q1 && answers.q1 !== 'not_sure') parts.push('your interests');
  if (answers.q2) parts.push('your experience level');
  if (answers.q3) parts.push('your timeline');
  if (answers.q4) parts.push('what matters most to you');
  if (parts.length >= 2) {
    return `Based on ${parts.slice(0, 3).join(', ')}, here are the programs we recommend:`;
  }
  return 'Based on your answers, here are the programs we recommend:';
}
