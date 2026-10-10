'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PROGRAM_TITLES } from '@/lib/content/programs';
// AUDIT-2026-05-16 §C-B3: client never imports the answer key. Question
// text + choices come from the public questions file; scoring is done
// server-side in /api/member/assessment/submit which is the source of
// truth for raw/pct (it re-derives the score from answers, ignoring any
// client-supplied score).
import {
  ASSESSMENT_QUESTIONS_PUBLIC as ASSESSMENT_QUESTIONS,
  type QuestionChoice,
} from '@/lib/assessment/questions';
import { sectionAllSame, SECTION_SAME_ANSWER_WARNING } from '@/lib/assessment/answerPattern';
import { clearAssessmentProgress, readAssessmentProgress, writeAssessmentProgress } from '@/lib/assessment/progressStorage';
import { layoutAssessment, newAttemptSeed } from '@/lib/assessment/layout';
import styles from './AssessmentForm.module.css';
import { assessmentConfirmMessage } from '@/lib/member/assessmentConfirmMessage';

const ASSESSMENT_REDIRECT_KEY = 'assessment_intended_destination';

const TOTAL_STEPS = 8;

/** Step 1: About you. Steps 2–8: question ranges (inclusive). */
const STEP_CONFIG = [
  { id: 1, title: 'About you', questionRange: null as [number, number] | null },
  { id: 2, title: 'Basic skills', questionRange: [1, 5] as [number, number] },
  { id: 3, title: 'Technical aptitude', questionRange: [6, 10] as [number, number] },
  { id: 4, title: 'Problem solving', questionRange: [11, 15] as [number, number] },
  { id: 5, title: 'Communication', questionRange: [16, 20] as [number, number] },
  { id: 6, title: 'Learning style', questionRange: [21, 25] as [number, number] },
  { id: 7, title: 'Career goals', questionRange: [26, 30] as [number, number] },
  { id: 8, title: 'Final questions', questionRange: [31, 35] as [number, number] },
];

type AssessmentOutcome = {
  message: string;
  pct: number;
  staffNotificationSent?: boolean;
};

type AssessmentFormProps = {
  defaultFirstName: string;
  defaultLastName: string;
  defaultPhone: string;
  defaultRedirectTo?: string;
  /**
   * Credential-free proofs (`/dev/member/assessment?state=confirm`): skip the
   * wizard and render the post-submit score billboard.
   */
  previewOutcome?: AssessmentOutcome;
  /** Credential-free proofs: open the wizard on this 1-based step. */
  previewStep?: number;
};

export default function AssessmentForm({
  defaultFirstName,
  defaultLastName,
  defaultPhone,
  defaultRedirectTo,
  previewOutcome,
  previewStep,
}: AssessmentFormProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(() => {
    if (!previewStep) return 1;
    return Math.max(1, Math.min(TOTAL_STEPS, Math.round(previewStep)));
  });
  const [step, setStep] = useState<'form' | 'confirm'>(previewOutcome ? 'confirm' : 'form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [outcome, setOutcome] = useState<AssessmentOutcome | null>(previewOutcome ?? null);
  const [continueHref, setContinueHref] = useState('/dashboard');
  const [direction, setDirection] = useState<'next' | 'prev'>('next');

  const [firstName, setFirstName] = useState(defaultFirstName);
  const [lastName, setLastName] = useState(defaultLastName);
  const [phone, setPhone] = useState(defaultPhone);
  const [programInterest, setProgramInterest] = useState('');
  const [answers, setAnswers] = useState<Record<number, QuestionChoice>>({});
  // Ops (10/9/26): each attempt shuffles question order within a section and
  // the answer order on each question. Answers are still kept by their
  // original letter, so scoring and staff answer sheets are unchanged.
  const [seed, setSeed] = useState<string>('preview');
  const layout = useMemo(() => layoutAssessment(ASSESSMENT_QUESTIONS, seed), [seed]);
  // Answers save as you go (ops 10/9/26): the prompt and emails promise it,
  // and losing 20 answers to a refresh is how people end up rushing. Kept in
  // this browser only (no answer key involved), cleared on submit.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (previewOutcome || previewStep) return;
    const saved = readAssessmentProgress();
    // Keep the attempt's layout across refreshes; a new attempt gets a new one.
    setSeed(saved?.seed || newAttemptSeed());
    if (saved) {
      setAnswers(saved.answers);
      if (saved.programInterest) setProgramInterest(saved.programInterest);
      setCurrentStep(Math.max(1, Math.min(TOTAL_STEPS, saved.step)));
      setRestored(Object.keys(saved.answers).length > 0);
    }
    // Restore once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (previewOutcome || previewStep || step !== 'form') return;
    if (seed === 'preview') return;
    writeAssessmentProgress({ answers, programInterest, step: currentStep, seed });
  }, [answers, programInterest, currentStep, step, previewOutcome, previewStep, seed]);
  const confirmHeadingRef = useRef<HTMLHeadingElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const isFirstStepRender = useRef(true);

  // Move focus to the confirmation heading so keyboard/screen-reader users
  // land on the new content instead of staying on the (now-removed) submit
  // button — this view fully replaces the wizard, so nothing else signals
  // the change to assistive tech.
  useEffect(() => {
    if (step === 'confirm' && !previewOutcome) confirmHeadingRef.current?.focus();
  }, [step, previewOutcome]);

  // Move focus to each step's heading on Next/Back so keyboard and
  // screen-reader users get a clear signal the section changed, instead of
  // silently staying on a button that scrolled out of view. Skipped on the
  // initial mount so load focus stays with the browser default.
  useEffect(() => {
    if (isFirstStepRender.current) {
      isFirstStepRender.current = false;
      return;
    }
    stepHeadingRef.current?.focus();
  }, [currentStep]);

  const config = STEP_CONFIG[currentStep - 1];
  const questionsInStep = config?.questionRange
    ? layout.filter((q) => q.displayNumber >= config.questionRange![0] && q.displayNumber <= config.questionRange![1])
    : [];
  const answeredInStep = questionsInStep.filter((q) => answers[q.id] != null).length;
  const stepComplete = config?.questionRange
    ? answeredInStep === questionsInStep.length
    : !!(firstName.trim() && lastName.trim() && phone.trim() && programInterest);

  const setAnswer = (qId: number, choice: QuestionChoice) => {
    setAnswers((prev) => ({ ...prev, [qId]: choice }));
    setSameAnswerWarnedStep(null);
  };
  // Ops (10/9/26): five identical letters in a section usually means clicking
  // through. Warn once; a second Next continues (an honest pattern is allowed).
  const [sameAnswerWarnedStep, setSameAnswerWarnedStep] = useState<number | null>(null);

  const validateStep1 = (): string | null => {
    if (!firstName.trim()) return 'First name is required.';
    if (!lastName.trim()) return 'Last name is required.';
    if (!phone.trim()) return 'Phone number is required.';
    if (!programInterest) return 'Please select a program of interest.';
    return null;
  };

  const handleNext = () => {
    setError('');
    setRestored(false);
    setDirection('next');

    if (currentStep === 1) {
      const err = validateStep1();
      if (err) {
        setError(err);
        return;
      }
    } else if (!stepComplete) {
      setError(`Please answer all questions in this section before continuing.`);
      return;
    } else if (
      sectionAllSame(questionsInStep.map((q) => q.choices.find((c) => c.value === answers[q.id])?.displayLetter)) &&
      sameAnswerWarnedStep !== currentStep
    ) {
      setSameAnswerWarnedStep(currentStep);
      setError(SECTION_SAME_ANSWER_WARNING);
      return;
    }

    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    setError('');
    setDirection('prev');
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const err = validateStep1();
    if (err) {
      setError(err);
      return;
    }

    const totalQuestions = ASSESSMENT_QUESTIONS.length;
    const answeredCount = Object.keys(answers).length;
    if (answeredCount < totalQuestions) {
      setError(`Please answer all ${totalQuestions} questions. You have answered ${answeredCount}.`);
      return;
    }

    setLoading(true);
    try {
      const answersForDb = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, v]));

      const res = await fetch('/api/member/assessment/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          programInterest,
          answers: answersForDb,
        }),
      });

      const data = (await res.json()) as {
        error?: string;
        scorePct?: number;
        adminEmailSent?: boolean;
      };
      if (!res.ok) {
        setError(data.error ?? 'Submission failed. Please try again.');
        setLoading(false);
        return;
      }

      // The server is the source of truth for the score — it re-derives
      // raw/pct from answers and ignores any client-supplied score.
      const pct: number = typeof data.scorePct === 'number' ? data.scorePct : 0;
      setOutcome({
        message: assessmentConfirmMessage(pct),
        pct,
        staffNotificationSent: data.adminEmailSent === true,
      });
      setStep('confirm');
      clearAssessmentProgress();

      const intended =
        (typeof window !== 'undefined' ? sessionStorage.getItem(ASSESSMENT_REDIRECT_KEY) : null) || defaultRedirectTo || null;
      if (typeof window !== 'undefined') sessionStorage.removeItem(ASSESSMENT_REDIRECT_KEY);
      setContinueHref(
        intended && intended.startsWith('/') && !intended.startsWith('//') ? intended : '/dashboard',
      );
    } catch {
      setError('Submission failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'confirm' && outcome) {
    return (
      <div className={`wa-kit-card ${styles.confirm}`}>
        <p className={styles.score}>
          {outcome.pct}
          <span className={styles.scoreUnit}>%</span>
        </p>
        <h2 ref={confirmHeadingRef} tabIndex={-1} className={styles.confirmTitle}>
          Preassessment complete
        </h2>
        <p className={styles.confirmCopy}>{outcome.message}</p>
        {outcome.staffNotificationSent === true ? (
          <p role="status" className={styles.notificationSent}>
            Your results were saved and the WorkforceAP team was notified.
          </p>
        ) : outcome.staffNotificationSent === false ? (
          <p role="alert" className={styles.notificationWarning}>
            Your results were saved, but staff email delivery could not be confirmed. The team can still review them in the admin portal.
          </p>
        ) : null}
        <button type="button" className={`wa-kit-focus ${styles.primaryBtn}`} onClick={() => router.push(continueHref)}>
          {continueHref === '/dashboard' ? 'Open home' : 'Continue'}
        </button>
      </div>
    );
  }

  return (
    <div className={`wa-kit-card ${styles.wizard} ${direction === 'prev' ? styles.slidePrev : styles.slideNext}`}>
        <div className={styles.progress}>
          <p className={styles.progressLabel} aria-live="polite">
            Step {currentStep} of {TOTAL_STEPS}
            {config?.title ? ` · ${config.title}` : ''}
          </p>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${(currentStep / TOTAL_STEPS) * 100}%` }}
            />
          </div>
        </div>

        <div>
          {currentStep > 1 && (
            <button type="button" className={`wa-kit-focus ${styles.back}`} onClick={handleBack}>
              Back
            </button>
          )}

          {currentStep === 1 ? (
            <section>
              <h2 ref={stepHeadingRef} tabIndex={-1} className={styles.heading}>
                About you
              </h2>
              <div className={styles.fields}>
                <div className={styles.field}>
                  <label htmlFor="firstName">First name *</label>
                  <input
                    id="firstName"
                    className={styles.control}
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    autoComplete="given-name"
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="lastName">Last name *</label>
                  <input
                    id="lastName"
                    className={styles.control}
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    autoComplete="family-name"
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="phone">Phone *</label>
                  <input
                    id="phone"
                    className={styles.control}
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    autoComplete="tel"
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="programInterest">Program of interest *</label>
                  <select
                    id="programInterest"
                    className={styles.control}
                    value={programInterest}
                    onChange={(e) => setProgramInterest(e.target.value)}
                    required
                  >
                    <option value="">Select a program</option>
                    {PROGRAM_TITLES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>
          ) : (
            <section>
              <h2 ref={stepHeadingRef} tabIndex={-1} className={`${styles.heading} ${styles.headingWithMeta}`}>
                {config?.title}
              </h2>
              <p className={styles.meta}>
                Questions {config?.questionRange?.[0]}–{config?.questionRange?.[1]} of {ASSESSMENT_QUESTIONS.length}
              </p>
              <div className={styles.questions}>
                {questionsInStep.map((q) => (
                  <fieldset key={q.id} className={styles.question}>
                    <legend className={styles.legend}>
                      Q{q.displayNumber}. {q.question}
                    </legend>
                    <div className={styles.answers}>
                      {q.choices.map((c) => (
                        <label
                          key={`${q.id}-${c.value}`}
                          className={`${styles.answer} ${answers[q.id] === c.value ? styles.answerSelected : ''}`}
                        >
                          <input
                            type="radio"
                            name={`q${q.id}`}
                            value={c.value}
                            checked={answers[q.id] === c.value}
                            onChange={() => setAnswer(q.id, c.value)}
                          />
                          <span className={styles.dot} aria-hidden="true" />
                          <span>
                            {c.displayLetter}) {c.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
            </section>
          )}

          {currentStep === TOTAL_STEPS && stepComplete && (
            <div className={styles.review}>
              <p className={styles.reviewTitle}>Review</p>
              <p className={styles.reviewBody}>
                {firstName} {lastName} • {programInterest} • All {ASSESSMENT_QUESTIONS.length} questions answered
              </p>
            </div>
          )}

          {restored && !error && (
            <p className={styles.reviewBody} role="status" data-testid="assessment-progress-restored">
              Welcome back. We kept the answers you already gave on this device.
            </p>
          )}

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <div className={styles.actions}>
            {currentStep < TOTAL_STEPS ? (
              <button type="button" className={`wa-kit-focus ${styles.primaryBtn}`} onClick={handleNext}>
                Next
              </button>
            ) : (
              <button
                type="button"
                className={`wa-kit-focus ${styles.primaryBtn}`}
                onClick={handleSubmit}
                disabled={loading || !stepComplete}
              >
                {loading ? 'Submitting…' : 'Submit assessment'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
}

