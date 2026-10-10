/**
 * Per-attempt randomization for the WIOA Preassessment (ops 10/9/26).
 *
 * Each attempt has a seed. The seed shuffles the question order inside each
 * five-question section and the answer order on every question. The screen
 * shows A-D in the shuffled order, but every answer is SUBMITTED AND STORED
 * BY ITS ORIGINAL LETTER, so the answer key, scoring, saved answers, retake
 * history and staff answer sheets are unchanged. Copying "the answers" from
 * someone else, or from your own earlier attempt, no longer works, and
 * clicking one display letter everywhere lands on a random mix.
 *
 * Client-safe: pure functions over the public question list (no answer key).
 */
import type { AssessmentQuestionPublic, QuestionChoice } from './questions';

const LETTERS: readonly QuestionChoice[] = ['A', 'B', 'C', 'D'];

/** Deterministic 32-bit PRNG (mulberry32) from a string seed. */
function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], next: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export type DisplayedChoice = {
  /** Letter shown on screen (A-D, in display order). */
  displayLetter: QuestionChoice;
  /** Original letter: what is submitted, stored and scored. */
  value: QuestionChoice;
  label: string;
};

export type DisplayedQuestion = Omit<AssessmentQuestionPublic, 'choices'> & {
  /** 1-based position shown on screen (Question 1..35). */
  displayNumber: number;
  choices: DisplayedChoice[];
};

/**
 * Lay out the questions for one attempt. Sections (by `sectionSize`) keep
 * their topic order; questions shuffle within a section; choices shuffle
 * within a question. Same seed, same layout (refresh-safe).
 */
export function layoutAssessment(
  questions: readonly AssessmentQuestionPublic[],
  seed: string,
  sectionSize = 5,
): DisplayedQuestion[] {
  const next = rng(`wap-preassessment:${seed}`);
  const sorted = [...questions].sort((a, b) => a.id - b.id);
  const out: DisplayedQuestion[] = [];
  for (let start = 0; start < sorted.length; start += sectionSize) {
    for (const q of shuffled(sorted.slice(start, start + sectionSize), next)) {
      const choices = shuffled(q.choices, next).map((c, i) => ({ displayLetter: LETTERS[i], value: c.value, label: c.label }));
      out.push({ ...q, displayNumber: out.length + 1, choices });
    }
  }
  return out;
}

/** A fresh attempt seed (not secret; it only varies the layout). */
export function newAttemptSeed(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Same shape the form persists and submits; anything else is ignored. */
export function isValidAttemptSeed(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9-]{1,64}$/u.test(value);
}

/**
 * On-screen letters for a stored answer sheet. Used to refuse a click-through
 * of one display letter after shuffle: submitted values are original letters,
 * so a same-display-letter sheet looks mixed unless we reconstruct the layout.
 */
export function displayLettersForAnswers(
  questions: readonly AssessmentQuestionPublic[],
  seed: string,
  answers: Record<number | string, string>,
): Record<number, string> {
  const out: Record<number, string> = {};
  for (const q of layoutAssessment(questions, seed)) {
    const original = answers[q.id];
    const shown = q.choices.find((c) => c.value === original);
    if (shown) out[q.id] = shown.displayLetter;
  }
  return out;
}
