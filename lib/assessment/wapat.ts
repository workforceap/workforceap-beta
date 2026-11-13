/**
 * WAPAT: Workforce Advancement Project Assessment Score.
 *
 * Source: Dad's email of 2026-11-11 ("I want to section off and rename our
 * Workforce AP assessment test and the report"). The 35 questions, ids,
 * answer key and per-attempt shuffle are unchanged; this only grades the same
 * answers into four scores by QUESTION COUNT (not the legacy point weights):
 *
 *   Vocabulary              Q1-10   correct / 10 x 100
 *   Reading Comprehension   Q11-24  correct / 14 x 100
 *   Math and Reasoning      Q25-35  correct / 11 x 100
 *   WAPAT Total             Q1-35   correct / 35 x 100   (not a mean of the sections)
 *
 * OPEN ITEM: the email writes the Math section as "question 24-35" but divides
 * by 11. Q24-35 is 12 questions and would count Q24 (Desktop publishing, a
 * computer-skills item) twice. Q25-35 is 11 questions, starts at the first math
 * item and makes 10 + 14 + 11 = 35. Q25-35 is implemented as the interpretation
 * that fits the divisor and the question content; it is NOT confirmed by the
 * sender. Change only WAPAT_SECTIONS if he says otherwise.
 *
 * Client-safe: no answer key here. Callers pass per-question correctness.
 */

export const WAPAT_NAME = 'WAPAT';
export const WAPAT_FULL_NAME = 'Workforce Advancement Project Assessment Score';

export type WapatSectionKey = 'vocabulary' | 'reading' | 'math';

export const WAPAT_SECTIONS: ReadonlyArray<{
  key: WapatSectionKey; label: string; first: number; last: number; size: number;
}> = [
  { key: 'vocabulary', label: 'Vocabulary', first: 1, last: 10, size: 10 },
  { key: 'reading', label: 'Reading Comprehension', first: 11, last: 24, size: 14 },
  { key: 'math', label: 'Math and Reasoning', first: 25, last: 35, size: 11 },
];

export const WAPAT_TOTAL_QUESTIONS = WAPAT_SECTIONS.reduce((sum, s) => sum + s.size, 0);

export type WapatScore = {
  key: WapatSectionKey | 'total';
  label: string;
  /** Question range for display, e.g. "Q1–10". */
  range: string;
  total: number;
  /** null when any question in the range has no recorded answer. */
  correct: number | null;
  /** 0-100 to one decimal; null = unavailable (incomplete or legacy record). */
  pct: number | null;
  available: boolean;
};

export type WapatResult = { sections: WapatScore[]; total: WapatScore };

export type WapatRow = { id: number; answer: unknown; correct: boolean };

export function wapatSectionForQuestion(id: number) {
  return WAPAT_SECTIONS.find((s) => id >= s.first && id <= s.last);
}

function build(key: WapatScore['key'], label: string, range: string, ids: number[], byId: Map<number, WapatRow>): WapatScore {
  const rows = ids.map((id) => byId.get(id));
  const complete = rows.every((r) => r !== undefined && r.answer !== null && r.answer !== undefined);
  if (!complete) return { key, label, range, total: ids.length, correct: null, pct: null, available: false };
  const correct = rows.filter((r) => r!.correct).length;
  return { key, label, range, total: ids.length, correct, pct: Math.round((correct / ids.length) * 1000) / 10, available: true };
}

export function computeWapat(rows: ReadonlyArray<WapatRow>): WapatResult {
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const range = (a: number, b: number) => `Q${a}–${b}`;
  const sections = WAPAT_SECTIONS.map((s) => build(s.key, s.label, range(s.first, s.last),
    Array.from({ length: s.size }, (_, i) => s.first + i), byId));
  const total = build('total', 'WAPAT Total Score', range(1, WAPAT_TOTAL_QUESTIONS),
    Array.from({ length: WAPAT_TOTAL_QUESTIONS }, (_, i) => i + 1), byId);
  return { sections, total };
}

export function formatWapatPct(score: Pick<WapatScore, 'pct'>): string {
  return score.pct === null ? 'Unavailable' : `${score.pct}%`;
}

/** Plain-text lines for emails and exports. */
export function formatWapatText(result: WapatResult): string[] {
  return [...result.sections, result.total].map((s) =>
    s.available
      ? `${s.label} (${s.range}): ${s.correct}/${s.total} = ${s.pct}%`
      : `${s.label} (${s.range}): unavailable (answers incomplete)`);
}
