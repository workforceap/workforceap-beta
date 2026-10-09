/**
 * Straight-line detection for the 35-question WIOA Preassessment.
 *
 * Ops (10/9/26): a member with a CS master's submitted "A" for all 35
 * questions in about two minutes and was recorded at 27%, a score counselors
 * then see for WIOA review. Clicking the same letter everywhere is not an
 * answer, so the form asks the member to re-read and the server refuses it.
 *
 * Client-safe: contains no answer key. Thresholds are set so an honest test
 * is never blocked: the most frequent letter in the real key covers 9 of 35
 * questions, and no five-question section has the same correct letter.
 */
export type AnswerLetter = 'A' | 'B' | 'C' | 'D';

/** Server refuses a submission when one letter covers this many answers or more. */
export const STRAIGHT_LINE_MIN_SAME = 20;

export const STRAIGHT_LINE_MESSAGE =
  'Your answers are almost all the same letter. Please go back and read each question. Your counselor uses this preassessment for WIOA funding review.';

export const SECTION_SAME_ANSWER_WARNING =
  'All five answers in this section are the same letter. Please check each question, then press Next again to continue.';

/** Highest number of answers sharing one letter. */
export function mostRepeatedAnswerCount(answers: Record<number | string, string>): number {
  const counts = new Map<string, number>();
  for (const value of Object.values(answers)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Math.max(0, ...counts.values());
}

export function isStraightLined(answers: Record<number | string, string>): boolean {
  return mostRepeatedAnswerCount(answers) >= STRAIGHT_LINE_MIN_SAME;
}

/** True when every answer in a section (2+ questions) is the same letter. */
export function sectionAllSame(letters: readonly (string | undefined)[]): boolean {
  if (letters.length < 2 || letters.some((l) => !l)) return false;
  return letters.every((l) => l === letters[0]);
}
