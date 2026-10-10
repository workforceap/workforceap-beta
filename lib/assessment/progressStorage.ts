/**
 * In-browser progress for the WIOA Preassessment (ops 10/9/26).
 *
 * The prompt, home card and emails tell members "your answers save as you
 * go", but the form kept answers only in memory: a refresh or a dropped phone
 * session lost them. This keeps the in-progress answers in localStorage on
 * this device only. It never holds the answer key, a score, or anything the
 * server trusts: the server re-scores the submitted answers.
 */
export const ASSESSMENT_PROGRESS_KEY = 'wap.assessmentProgress.v1';
/** Progress older than this is ignored (a stale shared computer). */
export const ASSESSMENT_PROGRESS_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

type Letter = 'A' | 'B' | 'C' | 'D';
export type AssessmentProgress = {
  answers: Record<number, Letter>;
  programInterest: string;
  step: number;
  /** Layout seed for this attempt (shuffle order); kept so a refresh shows the same order. */
  seed?: string;
};

type Stored = AssessmentProgress & { savedAt: number };

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readAssessmentProgress(now: number = Date.now()): AssessmentProgress | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(ASSESSMENT_PROGRESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    if (typeof parsed.savedAt !== 'number' || now - parsed.savedAt > ASSESSMENT_PROGRESS_MAX_AGE_MS) {
      store.removeItem(ASSESSMENT_PROGRESS_KEY);
      return null;
    }
    const answers: Record<number, Letter> = {};
    for (const [k, v] of Object.entries(parsed.answers ?? {})) {
      const id = Number(k);
      if (Number.isInteger(id) && id >= 1 && id <= 200 && (v === 'A' || v === 'B' || v === 'C' || v === 'D')) answers[id] = v;
    }
    return {
      answers,
      programInterest: typeof parsed.programInterest === 'string' ? parsed.programInterest : '',
      step: typeof parsed.step === 'number' && Number.isFinite(parsed.step) ? Math.trunc(parsed.step) : 1,
      ...(typeof parsed.seed === 'string' && /^[a-z0-9-]{1,64}$/u.test(parsed.seed) ? { seed: parsed.seed } : {}),
    };
  } catch {
    return null;
  }
}

export function writeAssessmentProgress(progress: AssessmentProgress, now: number = Date.now()): void {
  const store = storage();
  if (!store) return;
  try {
    if (Object.keys(progress.answers).length === 0 && !progress.programInterest) {
      store.removeItem(ASSESSMENT_PROGRESS_KEY);
      return;
    }
    store.setItem(ASSESSMENT_PROGRESS_KEY, JSON.stringify({ ...progress, savedAt: now } satisfies Stored));
  } catch {
    /* quota or private mode: saving is best effort */
  }
}

export function clearAssessmentProgress(): void {
  try {
    storage()?.removeItem(ASSESSMENT_PROGRESS_KEY);
  } catch {
    /* ignore */
  }
}
