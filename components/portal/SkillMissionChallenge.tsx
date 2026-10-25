'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';
import { cx, useAnnounce, useFocusTrap } from '@/components/portal/kit';
import {
  X,
  Copy,
  Check,
  Clock,
  ClipboardList,
  CheckCircle2,
  Lightbulb,
  Target,
  BookOpenCheck,
  RotateCcw,
} from 'lucide-react';
import styles from './SkillMissionChallenge.module.css';

// ── Local type copies (server-only lib not importable here) ──────────────────

type MissionStatus = 'locked' | 'ready' | 'passed' | 'needs_retry';

type MissionResult = {
  verdict: 'passed' | 'needs_retry';
  coachingNote: string;
  starStory: string;
  resumeBullet: string;
  skillsUnlocked: string[];
};

/* Answers never ship to the client — the quiz-check endpoint grades each
   answer and returns the explanation after the student commits. */
type QuizQuestion = {
  text: string;
  options: [string, string, string, string];
};

type QuizCheckResponse = {
  correct: boolean;
  correctIndex: number;
  explanation: string;
};

type SkillMissionSummaryItem = {
  key: string;
  courseSlug: string;
  programSlug: string;
  programTitle: string;
  courseTitle: string;
  missionName: string;
  missionTagline: string;
  primaryAxis: string;
  skillLabels: string[];
  scenarioPrompt: string;
  evidenceHint: string;
  quizQuestions: QuizQuestion[];
  estimatedMinutes: number;
  status: MissionStatus;
  completedAt: Date | null;
  latestResult: MissionResult | null;
  aiToolResultId: string | null;
};

type MissionEvalResponse =
  | {
      ok: true;
      verdict: 'passed' | 'needs_retry';
      coachingNote: string;
      starStory: string;
      resumeBullet: string;
      skillsUnlocked: string[];
      quizCorrectCount: number;
      aiToolResultId: string | null;
      /** The mission was already passed; the stored pass came back unchanged. */
      alreadyPassed?: boolean;
    }
  | { ok: false; error: string; code?: string };

/* `correct` is local display state derived from the server's quiz-check
   response — only questionIndex/selectedIndex are sent to evaluate. */
type QuizAnswer = {
  questionIndex: number;
  selectedIndex: number;
  correct: boolean;
};

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  mission: SkillMissionSummaryItem;
  onClose: () => void;
  onComplete: (result: MissionEvalResponse & { ok: true }) => void;
  /** Proofs: skip quiz-check / evaluate POSTs and stay local. */
  preview?: boolean;
  /** Proofs: open a later phase without walking the quiz. */
  initialPhase?: 0 | 1 | 2 | 3 | 4;
  initialResult?: (MissionEvalResponse & { ok: true }) | null;
};

/** Mirrors the evaluate route: the response is trimmed, then 20 to 4000 characters. */
const MIN_RESPONSE_CHARS = 20;
const MAX_RESPONSE_CHARS = 4000;

/**
 * Every phase heading can take focus. When a phase or question changes, the
 * control the member just used unmounts and focus would drop to <body>, outside
 * the modal; the dialog moves it to the new heading instead, so a screen reader
 * announces the new step and the next Tab starts inside it.
 */
const phaseHeading = { tabIndex: -1, 'data-phase-heading': '' } as const;

const ctaClass = 'wa-kit-cta wa-kit-focus';
const ghostCtaClass = 'wa-kit-cta wa-kit-cta--ghost wa-kit-focus';

function previewPassResult(
  mission: SkillMissionSummaryItem,
): MissionEvalResponse & { ok: true } {
  const prior = mission.latestResult;
  return {
    ok: true,
    verdict: 'passed',
    coachingNote:
      prior?.coachingNote ?? 'This is a local proof overlay. Nothing was submitted.',
    starStory: prior?.starStory ?? mission.scenarioPrompt,
    resumeBullet:
      prior?.resumeBullet ?? `${mission.missionName}: completed the skill challenge.`,
    skillsUnlocked: prior?.skillsUnlocked.length
      ? prior.skillsUnlocked
      : mission.skillLabels,
    quizCorrectCount: mission.quizQuestions.length,
    aiToolResultId: mission.aiToolResultId,
  };
}

function CloseButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations('skillMissions');
  return (
    <button
      type="button"
      className={cx('wa-kit-focus', styles.close)}
      aria-label={t('challenge.close')}
      onClick={onClick}
    >
      <X size={18} aria-hidden="true" />
    </button>
  );
}

function SkillChip({ label, green }: { label: string; green?: boolean }) {
  return <span className={cx('wa-kit-chip', green ? 'wa-kit-chip--green' : 'wa-kit-chip--neutral')}>{label}</span>;
}

function CopyButton({ text }: { text: string }) {
  const t = useTranslations('skillMissions');
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);
  return (
    <button
      type="button"
      className={cx('wa-kit-cta', 'wa-kit-cta--ghost', 'wa-kit-focus')}
      onClick={() => {
        // A blocked or missing clipboard leaves the label as "Copy": nothing was copied.
        navigator.clipboard?.writeText(text).then(
          () => {
            setCopied(true);
            if (timer.current !== null) window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => setCopied(false), 1800);
          },
          () => undefined,
        );
      }}
      style={{ marginTop: 8 }}
    >
      <span aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        {copied ? t('challenge.copied') : t('challenge.copy')}
      </span>
    </button>
  );
}

// ── Phase 0: Mission Intro ────────────────────────────────────────────────────

function PhaseIntro({ mission, onAccept, onClose }: { mission: SkillMissionSummaryItem; onAccept: () => void; onClose: () => void }) {
  const t = useTranslations('skillMissions');
  const scenarioPreview = mission.scenarioPrompt.length > 100
    ? mission.scenarioPrompt.slice(0, 100) + '…'
    : mission.scenarioPrompt;

  return (
    <div className={styles.dialog}>
      <CloseButton onClick={onClose} />

      <p className={styles.kicker}>{t('challenge.kicker')}</p>
      <h2 {...phaseHeading} className={cx('wa-kit-focus', styles.title)}>{mission.missionName}</h2>
      <p className={styles.lede}>{mission.missionTagline}</p>

      <div className={cx(styles.chipRow, styles.block)}>
        <span className="wa-kit-chip wa-kit-chip--neutral">
          <Clock aria-hidden="true" /> {t('panel.minutes', { minutes: mission.estimatedMinutes })}
        </span>
        <span className="wa-kit-chip wa-kit-chip--neutral">
          <ClipboardList aria-hidden="true" /> {t('challenge.quizSummary')}
        </span>
      </div>

      {mission.skillLabels.length > 0 && (
        <div className={styles.block}>
          <p className={styles.label}>{t('challenge.skillsToProve')}</p>
          <div className={styles.chipRow}>
            {mission.skillLabels.slice(0, 4).map((s) => (
              <SkillChip key={s} label={s} />
            ))}
          </div>
        </div>
      )}

      <div className={cx(styles.box, styles.block)}>
        <p className={styles.label}>{t('challenge.whatToProve')}</p>
        <p className={styles.boxItalic} style={{ margin: 0 }}>
          &ldquo;{scenarioPreview}&rdquo;
        </p>
      </div>

      <button type="button" className={ctaClass} onClick={onAccept}>
        {t('challenge.accept')}
      </button>
    </div>
  );
}

// ── Phase 1: Quiz ─────────────────────────────────────────────────────────────

function PhaseQuiz({
  mission,
  onFinish,
  onClose,
  preview = false,
  onDirty,
}: {
  mission: SkillMissionSummaryItem;
  onFinish: (answers: QuizAnswer[]) => void;
  onClose: () => void;
  preview?: boolean;
  onDirty: () => void;
}) {
  const t = useTranslations('skillMissions');
  const questions = mission.quizQuestions.slice(0, 3);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [selectedThisQ, setSelectedThisQ] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<QuizCheckResponse | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  const question = questions[currentQ];
  const questionMounted = useRef(false);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // The first question is announced by the phase change itself.
    if (!questionMounted.current) { questionMounted.current = true; return; }
    questionRef.current?.focus({ preventScroll: true });
  }, [currentQ]);
  const isAnswered = feedback !== null;
  const isLast = currentQ === questions.length - 1;

  async function handleSelect(idx: number) {
    if (selectedThisQ !== null || checking) return;
    onDirty();
    setSelectedThisQ(idx);
    setChecking(true);
    setCheckError(null);
    if (preview) {
      const fake: QuizCheckResponse = {
        correct: idx === 1,
        correctIndex: 1,
        explanation:
          idx === 1
            ? 'Cost Optimization is the pillar that covers spend, rightsizing, and unused resources.'
            : 'The well-architected Cost Optimization pillar is the one hiring managers want to hear.',
      };
      setFeedback(fake);
      setAnswers((prev) => [
        ...prev,
        { questionIndex: currentQ, selectedIndex: idx, correct: fake.correct },
      ]);
      setChecking(false);
      return;
    }
    try {
      const res = await fetch(
        `/api/skill-missions/${encodeURIComponent(mission.courseSlug)}/quiz-check`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            missionKey: mission.key,
            questionIndex: currentQ,
            selectedIndex: idx,
          }),
        },
      );
      if (!res.ok) throw new Error('check failed');
      const data = (await res.json()) as QuizCheckResponse;
      setFeedback(data);
      setAnswers((prev) => [
        ...prev,
        { questionIndex: currentQ, selectedIndex: idx, correct: data.correct },
      ]);
    } catch {
      setSelectedThisQ(null);
      setCheckError(t('challenge.checkError'));
    } finally {
      setChecking(false);
    }
  }

  function handleNext() {
    if (isLast) {
      onFinish(answers);
    } else {
      setCurrentQ((q) => q + 1);
      setSelectedThisQ(null);
      setFeedback(null);
    }
  }

  // The option the member just chose is disabled while it is checked, which drops focus to
  // <body>. Land on the explanation when it arrives (the next Tab reaches "Next"), or back on
  // the options when the check failed, so the keyboard never ends up behind the dialog.
  useEffect(() => {
    if (feedback) feedbackRef.current?.focus();
  }, [feedback]);
  useEffect(() => {
    if (checkError) optionsRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [checkError]);

  return (
    <div className={styles.dialog}>
      <CloseButton onClick={onClose} />

      {/* Progress */}
      <div className={styles.quizTop}>
        <p className={styles.counter}>
          {t('challenge.questionCounter', { current: currentQ + 1, total: questions.length })}
        </p>
        <div className={styles.track} aria-hidden="true">
          <div
            className={styles.trackFill}
            style={{ width: `${((currentQ + (isAnswered ? 1 : 0)) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      <h2 ref={questionRef} {...phaseHeading} className={cx('wa-kit-focus', styles.question)}>{question.text}</h2>

      {/* Options */}
      <div ref={optionsRef} className={styles.options}>
        {question.options.map((opt, idx) => {
          const isCorrect = feedback !== null && idx === feedback.correctIndex;
          const isSelected = selectedThisQ === idx;
          const state = isAnswered
            ? isCorrect
              ? 'correct'
              : isSelected
                ? 'wrong'
                : 'idle'
            : isSelected
              ? 'selected'
              : 'idle';

          return (
            <button
              key={idx}
              type="button"
              onClick={() => void handleSelect(idx)}
              disabled={isAnswered || checking}
              data-state={state}
              className={cx('wa-kit-focus', styles.option)}
            >
              <span className={styles.optionKey} aria-hidden="true">
                {state === 'correct' ? (
                  <Check size={14} />
                ) : state === 'wrong' ? (
                  <X size={14} />
                ) : (
                  String.fromCharCode(65 + idx)
                )}
              </span>
              <span>
                {opt}
                {state === 'correct' ? <span className="sr-only"> {t('challenge.correctAnswerSr')}</span> : null}
                {state === 'wrong' ? <span className="sr-only"> {t('challenge.wrongAnswerSr')}</span> : null}
              </span>
            </button>
          );
        })}
      </div>

      {/* Checking / error states */}
      {checking && <p className={styles.status}>{t('challenge.checking')}</p>}
      {checkError && (
        <p role="alert" className={cx(styles.error)}>
          {checkError}
        </p>
      )}

      {/* Explanation */}
      {feedback && (
        <div
          ref={feedbackRef}
          tabIndex={-1}
          role="status"
          aria-live="polite"
          className={cx('wa-kit-focus', styles.feedback)}
          data-tone={feedback.correct ? 'correct' : 'review'}
        >
          {feedback.correct ? <CheckCircle2 size={16} aria-hidden="true" /> : <Lightbulb size={16} aria-hidden="true" />}
          <p>
            <strong>{feedback.correct ? t('challenge.correct') : t('challenge.explainWhy')}</strong> {feedback.explanation}
          </p>
        </div>
      )}

      {isAnswered && (
        <button type="button" className={ctaClass} onClick={handleNext}>
          {isLast ? t('challenge.seeResult') : t('challenge.next')}
        </button>
      )}
    </div>
  );
}

// ── Phase 2: Scenario Response ────────────────────────────────────────────────

function PhaseScenario({
  mission,
  quizAnswers,
  onSubmit,
  onBack,
  onClose,
  onDirty,
  initialResponse,
  onResponseChange,
}: {
  mission: SkillMissionSummaryItem;
  quizAnswers: QuizAnswer[];
  onSubmit: (response: string) => Promise<void>;
  onBack: () => void;
  onClose: () => void;
  onDirty: () => void;
  initialResponse: string;
  onResponseChange: (response: string) => void;
}) {
  const [response, setResponse] = useState(initialResponse);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const t = useTranslations('skillMissions');
  const tCommon = useTranslations('common');
  const hintId = `${mission.key}-scenario-hint`;

  // The server trims before it counts, so whitespace never counts as an answer.
  const trimmed = response.trim();
  const charCount = trimmed.length;
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  const correctCount = quizAnswers.filter((a) => a.correct).length;
  const canSubmit = charCount >= MIN_RESPONSE_CHARS;

  async function handleSubmit() {
    // A ref, not state: a second click in the same tick must not send a second request.
    if (!canSubmit || submitting.current) return;
    submitting.current = true;
    setLoading(true);
    setError(null);
    try {
      await onSubmit(response);
    } catch (err) {
      setError(
        requestFailureMessage(
          err,
          { connection: tCommon('connectionError'), fallback: t('challenge.fallbackError') },
          'skill-mission',
        ),
      );
      setLoading(false);
      submitting.current = false;
    }
  }

  // The submit button is disabled while the request runs, which drops focus to <body>.
  // After a failure, move it to the message so the next Tab reaches Submit again.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  // Parts are joined with a middle dot so each phrase stays one translatable unit.
  const countText = [
    t('challenge.wordCount', { count: wordCount }),
    wordCount >= 150 ? t('challenge.enoughForStar') : wordCount >= 50 ? t('challenge.addResult') : null,
    trimmed && !canSubmit ? t('challenge.minChars', { min: MIN_RESPONSE_CHARS }) : null,
    response.length >= MAX_RESPONSE_CHARS - 200
      ? t('challenge.charCount', { count: response.length, max: MAX_RESPONSE_CHARS })
      : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');

  return (
    <div className={styles.dialog}>
      <CloseButton onClick={onClose} />

      {/* Quiz score recap */}
      <div
        className={cx('wa-kit-chip', correctCount === 3 ? 'wa-kit-chip--green' : 'wa-kit-chip--neutral', styles.recap)}
      >
        {correctCount === 3 ? <Target aria-hidden="true" /> : <BookOpenCheck aria-hidden="true" />}
        {t('challenge.recap', { correct: correctCount, total: 3 })}
      </div>

      <h2 {...phaseHeading} className={cx('wa-kit-focus', styles.title)}>{t('challenge.scenarioTitle')}</h2>
      <p className={styles.lede}>{t('challenge.scenarioLede')}</p>

      {/* Scenario blockquote */}
      <blockquote className={styles.quote}>{mission.scenarioPrompt}</blockquote>

      {/* Textarea */}
      <textarea
        aria-label={t('challenge.responseLabel')}
        aria-describedby={hintId}
        className={cx('wa-kit-focus', styles.textarea)}
        disabled={loading}
        value={response}
        maxLength={MAX_RESPONSE_CHARS}
        onChange={(e) => { setResponse(e.target.value); onResponseChange(e.target.value); onDirty(); }}
        rows={8}
        placeholder={t('challenge.responsePlaceholder')}
      />

      {/* Word count */}
      <p id={hintId} className={styles.count} data-ready={wordCount >= 150 ? 'true' : 'false'}>
        {countText}
      </p>

      {/* Evidence hint */}
      <div className={styles.tip}>
        <strong>{t('challenge.tip')}</strong> {mission.evidenceHint}
      </div>

      {error && (
        <div ref={errorRef} tabIndex={-1} role="alert" className={cx('wa-kit-focus', styles.error)}>
          {error}
        </div>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={ctaClass}
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
          aria-busy={loading}
          style={{ opacity: canSubmit ? 1 : 0.5 }}
        >
          {loading ? (
            <>
              <span className={styles.spinner} aria-hidden="true" />
              {t('challenge.coaching')}
            </>
          ) : (
            t('challenge.submit')
          )}
        </button>
        <button type="button" onClick={onBack} disabled={loading} className={cx('wa-kit-focus', styles.textButton)}>
          {t('challenge.back')}
        </button>
      </div>
    </div>
  );
}

// ── Phase 3: AI Coaching Result ───────────────────────────────────────────────

function PhaseResult({
  result,
  onContinue,
  onClose,
}: {
  result: MissionEvalResponse & { ok: true };
  onContinue: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('skillMissions');
  const passed = result.verdict === 'passed';
  const tone = passed ? 'passed' : 'review';
  // The mission was passed before: this attempt was practice, and the saved pass stands.
  const practice = result.alreadyPassed === true;

  return (
    <div className={styles.dialog}>
      <CloseButton onClick={onClose} />

      <h2 {...phaseHeading} className={cx('wa-kit-focus', styles.resultHead)} data-verdict={tone}>
        {passed ? <CheckCircle2 size={22} aria-hidden="true" /> : <RotateCcw size={22} aria-hidden="true" />}
        {passed ? (practice ? t('challenge.practiceComplete') : t('challenge.passedTitle')) : t('challenge.tryAgain')}
      </h2>

      {practice ? (
        <p className={styles.lede}>{t('challenge.practiceNote')}</p>
      ) : null}

      {/* Coaching note */}
      <p className={styles.coaching} data-verdict={tone}>
        {result.coachingNote}
      </p>

      {passed && (
        <>
          {/* Skills unlocked */}
          {result.skillsUnlocked.length > 0 && (
            <div className={styles.block}>
              <p className={styles.label}>{t('challenge.skillsDemonstrated')}</p>
              <div className={styles.chipRow}>
                {result.skillsUnlocked.map((s) => (
                  <SkillChip key={s} label={s} green />
                ))}
              </div>
            </div>
          )}

          {/* Resume bullet */}
          <div className={styles.block}>
            <p className={styles.label}>{t('challenge.resumeBullet')}</p>
            <div className={cx(styles.box, styles.boxItalic)}>{result.resumeBullet}</div>
            <CopyButton text={result.resumeBullet} />
          </div>

          {/* STAR story */}
          <div className={styles.block}>
            <p className={styles.label}>{t('challenge.starStory')}</p>
            <div className={cx(styles.box, styles.boxPre)}>{result.starStory}</div>
            <CopyButton text={result.starStory} />
          </div>

          <button
            type="button"
            className={ctaClass}
            onClick={onContinue}
            aria-label={practice ? t('challenge.done') : t('challenge.continueLabel')}
          >
            {practice ? t('challenge.done') : t('challenge.continue')}
          </button>
        </>
      )}

      {!passed && (
        <>
          <div className={cx(styles.box, styles.block)}>
            <p className={styles.label}>{t('challenge.reviewTitle')}</p>
            <p style={{ margin: 0 }}>{t('challenge.reviewBody')}</p>
          </div>

          <button type="button" className={ghostCtaClass} onClick={onClose}>
            {t('challenge.closeReview')}
          </button>
        </>
      )}
    </div>
  );
}

// ── Phase 4: Celebration ──────────────────────────────────────────────────────

function PhaseCelebration({
  result,
  onComplete,
}: {
  result: MissionEvalResponse & { ok: true };
  onComplete: () => void;
}) {
  const t = useTranslations('skillMissions');
  return (
    <div className={cx(styles.dialog, styles.dialogCenter)}>
      <CheckCircle2 size={28} aria-hidden="true" className={styles.celebrateIcon} />
      <h2 {...phaseHeading} className={cx('wa-kit-focus', styles.title)} style={{ paddingRight: 0, fontSize: 20 }}>
        {t('challenge.passedTitle')}
      </h2>
      <p className={styles.lede}>{t('challenge.celebrateLede')}</p>

      {/* Resume bullet spotlight */}
      <div className={styles.spotlight}>
        <p className={styles.label}>{t('challenge.newBullet')}</p>
        <p>{result.resumeBullet}</p>
      </div>

      {result.skillsUnlocked.length > 0 && (
        <div className={styles.block} style={{ textAlign: 'left' }}>
          <p className={styles.label}>{t('challenge.skillsAdded')}</p>
          <div className={styles.chipRow}>
            {result.skillsUnlocked.map((s) => (
              <SkillChip key={s} label={s} green />
            ))}
          </div>
        </div>
      )}

      <div className={cx(styles.actions, styles.actionsCenter)}>
        <a href="/dashboard/ai-tools/resume-studio" className={ghostCtaClass}>
          {t('challenge.openStudio')}
        </a>
        <button type="button" className={ctaClass} onClick={onComplete}>
          {t('challenge.doneCheck')}
        </button>
      </div>
    </div>
  );
}

// ── Root component ────────────────────────────────────────────────────────────

function ChallengeDialog({
  mission,
  onClose,
  onComplete,
  preview = false,
  initialPhase = 0,
  initialResult = null,
}: Props) {
  const [phase, setPhase] = useState<0 | 1 | 2 | 3 | 4>(initialPhase);
  const [quizAnswers, setQuizAnswers] = useState<QuizAnswer[]>([]);
  const [evalResult, setEvalResult] = useState<(MissionEvalResponse & { ok: true }) | null>(initialResult);
  const [scenarioDraft, setScenarioDraft] = useState('');
  const [closeNotice, setCloseNotice] = useState('');
  const t = useTranslations('skillMissions');
  const dirty = useRef(false);
  const evaluating = useRef(false);
  const announce = useAnnounce();
  const markDirty = () => { dirty.current = true; };
  const requestClose = () => {
    if (!preview && evaluating.current) {
      const notice = t('challenge.closeNotice');
      setCloseNotice(notice); announce(notice, 'assertive');
      return;
    }
    if (!preview && dirty.current && !window.confirm(t('challenge.leaveConfirm'))) return;
    onClose();
  };
  const dialogRef = useFocusTrap<HTMLDivElement>(true, { onEscape: requestClose });
  const phaseMounted = useRef(false);
  useEffect(() => {
    // The first phase keeps the trap's initial focus (Close); later phases take the heading.
    if (!phaseMounted.current) { phaseMounted.current = true; return; }
    dialogRef.current?.querySelector<HTMLElement>('[data-phase-heading]')?.focus({ preventScroll: true });
  }, [phase, dialogRef]);
  useEffect(() => {
    // Lock both scroll roots: portal pages set overflow on the document element.
    // Preserve existing inline values so closing cannot undo another surface's lock.
    const roots = [document.documentElement, document.body];
    const previous = roots.map((root) => root.style.overflowY);
    roots.forEach((root) => { root.style.overflowY = 'hidden'; });
    return () => roots.forEach((root, index) => { root.style.overflowY = previous[index]; });
  }, []);
  useEffect(() => {
    const protectPractice = (event: BeforeUnloadEvent) => {
      if (!preview && (dirty.current || evaluating.current)) event.preventDefault();
    };
    window.addEventListener('beforeunload', protectPractice);
    return () => window.removeEventListener('beforeunload', protectPractice);
  }, [preview]);

  const submitScenario = useCallback(
    async (scenarioResponse: string) => {
      if (preview) {
        setEvalResult(previewPassResult(mission));
        setPhase(3);
        return;
      }
      // One evaluation at a time: the server also replays a stored pass, but
      // a second request should never leave the browser.
      if (evaluating.current) return;
      evaluating.current = true;
      setCloseNotice('');
      try {
        const res = await fetch(
          `/api/skill-missions/${encodeURIComponent(mission.courseSlug)}/evaluate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              missionKey: mission.key,
              // Server re-grades from the catalog — only the selections go up.
              quizAnswers: quizAnswers.map(({ questionIndex, selectedIndex }) => ({
                questionIndex,
                selectedIndex,
              })),
              scenarioResponse,
            }),
          },
        );

        const data: MissionEvalResponse = await res.json();

        if (!data.ok) {
          // A known reason code reads in the member's language; anything else
          // falls back to the server's own sentence.
          const key = data.code ? `challenge.errors.${data.code}` : null;
          throw new Error(key && t.has(key) ? t(key) : data.error || 'Evaluation failed');
        }

        setEvalResult(data as MissionEvalResponse & { ok: true });
        dirty.current = false;
        setPhase(3);
      } finally {
        evaluating.current = false;
        setCloseNotice('');
      }
    },
    [mission, quizAnswers, preview, t],
  );

  function handleQuizFinish(answers: QuizAnswer[]) {
    setQuizAnswers(answers);
    setPhase(2);
  }

  function handleComplete() {
    if (evalResult) {
      onComplete(evalResult);
    }
  }

  function handleResultContinue() {
    if (evalResult?.verdict !== 'passed') return;
    // A practice pass has nothing new to celebrate: the first pass is saved.
    if (evalResult.alreadyPassed) handleComplete();
    else setPhase(4);
  }

  const overlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) requestClose();
  };

  return (
    <div
      ref={dialogRef}
      className={styles.overlay}
      data-surface="warm"
      onClick={overlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={mission.missionName}
    >
      {closeNotice ? <p role="status" className={styles.notice}>{closeNotice}</p> : null}
      {phase === 0 && (
        <PhaseIntro mission={mission} onAccept={() => setPhase(1)} onClose={requestClose} />
      )}
      {phase === 1 && (
        <PhaseQuiz mission={mission} onFinish={handleQuizFinish} onClose={requestClose} preview={preview} onDirty={markDirty} />
      )}
      {phase === 2 && (
        <PhaseScenario
          mission={mission}
          quizAnswers={quizAnswers}
          onSubmit={submitScenario}
          onBack={() => setPhase(1)}
          onClose={requestClose}
          onDirty={markDirty}
          initialResponse={scenarioDraft}
          onResponseChange={setScenarioDraft}
        />
      )}
      {phase === 3 && evalResult && (
        <PhaseResult result={evalResult} onContinue={handleResultContinue} onClose={requestClose} />
      )}
      {phase === 4 && evalResult && (
        <PhaseCelebration result={evalResult} onComplete={handleComplete} />
      )}
    </div>
  );
}

/**
 * The overlay renders in a portal on <body>. Rendered in place it inherited
 * its parent's layout: inside `.wa-space-y-6` its `margin-top` pushed the
 * fixed scrim 24px down and left the top of the page (header and menu)
 * uncovered and clickable behind the open dialog.
 */
export default function SkillMissionChallenge(props: Props) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => { setHost(document.body); }, []);
  if (!host) return null;
  return createPortal(<ChallengeDialog {...props} />, host);
}

/** Proof-only: overlay intro without POSTing quiz-check / evaluate. */
export function SkillMissionChallengePreview({
  mission,
  state,
}: {
  mission: SkillMissionSummaryItem;
  /** `passed` opens the quiet pass overlay without walking the quiz. */
  state?: 'challenge' | 'passed';
}) {
  const canned = previewPassResult(mission);
  return (
    <SkillMissionChallenge
      mission={mission}
      preview
      initialPhase={state === 'passed' ? 4 : 0}
      initialResult={state === 'passed' ? canned : null}
      onClose={() => undefined}
      onComplete={() => undefined}
    />
  );
}
