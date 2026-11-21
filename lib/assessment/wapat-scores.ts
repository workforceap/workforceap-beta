import { ASSESSMENT_QUESTIONS, type QuestionChoice } from './answer-key';

export const WAPAT_SHORT_NAME = 'WAPAT';
export const WAPAT_FULL_NAME = 'Workforce Advancement Project Assessment Score';

/** Confirmed section ranges (Mike 2026-11-13; Math is Q25–35, not Q24–35). */
export const WAPAT_SECTION_RANGES = {
  vocabulary: { label: 'Vocabulary', start: 1, end: 10, count: 10 },
  reading: { label: 'Reading Comprehension', start: 11, end: 24, count: 14 },
  math: { label: 'Math and Reasoning', start: 25, end: 35, count: 11 },
  total: { label: 'WAPAT Total', start: 1, end: 35, count: 35 },
} as const;

export type WapatSectionScore = { correct: number; pct: number };

export type WapatScores = {
  vocabulary: WapatSectionScore;
  reading: WapatSectionScore;
  math: WapatSectionScore;
  total: WapatSectionScore;
};

/** Flat row for CSV / admin props (no answer key on the client). */
export type WapatScoresRow = {
  vocabularyCorrect: number;
  vocabularyPct: number;
  readingCorrect: number;
  readingPct: number;
  mathCorrect: number;
  mathPct: number;
  totalCorrect: number;
  totalPct: number;
};

function countCorrectInRange(
  answers: Record<number, QuestionChoice>,
  start: number,
  end: number,
): number {
  let correct = 0;
  for (const q of ASSESSMENT_QUESTIONS) {
    if (q.id < start || q.id > end) continue;
    if (answers[q.id] === q.correct) correct += 1;
  }
  return correct;
}

function pctFromCounts(correct: number, count: number): number {
  return count > 0 ? Math.round((correct / count) * 100) : 0;
}

export function scoreWapat(answers: Record<number, QuestionChoice>): WapatScores {
  const vocabularyCorrect = countCorrectInRange(answers, 1, 10);
  const readingCorrect = countCorrectInRange(answers, 11, 24);
  const mathCorrect = countCorrectInRange(answers, 25, 35);
  const totalCorrect = vocabularyCorrect + readingCorrect + mathCorrect;

  return {
    vocabulary: { correct: vocabularyCorrect, pct: pctFromCounts(vocabularyCorrect, 10) },
    reading: { correct: readingCorrect, pct: pctFromCounts(readingCorrect, 14) },
    math: { correct: mathCorrect, pct: pctFromCounts(mathCorrect, 11) },
    total: { correct: totalCorrect, pct: pctFromCounts(totalCorrect, 35) },
  };
}

export function wapatToRow(scores: WapatScores): WapatScoresRow {
  return {
    vocabularyCorrect: scores.vocabulary.correct,
    vocabularyPct: scores.vocabulary.pct,
    readingCorrect: scores.reading.correct,
    readingPct: scores.reading.pct,
    mathCorrect: scores.math.correct,
    mathPct: scores.math.pct,
    totalCorrect: scores.total.correct,
    totalPct: scores.total.pct,
  };
}

/** Re-score from stored answers (historical rows use the same ranges). */
export function scoreWapatFromStoredAnswers(answers: unknown): WapatScores | null {
  if (!answers || typeof answers !== 'object') return null;
  const recorded = answers as Record<string | number, string | undefined>;
  const typed: Record<number, QuestionChoice> = {};
  for (const [k, v] of Object.entries(recorded)) {
    const id = typeof k === 'number' ? k : parseInt(k, 10);
    if (Number.isNaN(id) || v == null) continue;
    if (!['A', 'B', 'C', 'D'].includes(v)) continue;
    typed[id] = v as QuestionChoice;
  }
  if (Object.keys(typed).length === 0) return null;
  return scoreWapat(typed);
}

export function formatWapatScoreBlock(scores: WapatScores): string {
  const { vocabulary, reading, math, total } = scores;
  const lines = [
    `${WAPAT_FULL_NAME} (${WAPAT_SHORT_NAME})`,
    `  ${WAPAT_SECTION_RANGES.vocabulary.label} (Q1–10): ${vocabulary.correct}/10 (${vocabulary.pct}%)`,
    `  ${WAPAT_SECTION_RANGES.reading.label} (Q11–24): ${reading.correct}/14 (${reading.pct}%)`,
    `  ${WAPAT_SECTION_RANGES.math.label} (Q25–35): ${math.correct}/11 (${math.pct}%)`,
    `  ${WAPAT_SECTION_RANGES.total.label} (Q1–35): ${total.correct}/35 (${total.pct}%)`,
  ];
  return lines.join('\n');
}
