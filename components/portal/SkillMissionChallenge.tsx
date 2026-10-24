'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';
import { useAnnounce, useFocusTrap } from '@/components/portal/kit';
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
    }
  | { ok: false; error: string };

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

// ── Shared style tokens ───────────────────────────────────────────────────────

const CARD_STYLE: React.CSSProperties = {
  position: 'relative',
  background: 'var(--wa-surface)',
  borderRadius: 'var(--wa-radius-sm)',
  padding: '2rem',
  width: '100%',
  maxWidth: '600px',
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: 'var(--wa-shadow-lg)',
};

const OVERLAY_STYLE: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1100,
  background: 'color-mix(in srgb, var(--wa-text) 55%, transparent)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
};


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
  return (
    <button
      type="button"
      className="wa-kit-focus hover:wa-opacity-90"
      aria-label="Close mission"
      onClick={onClick}
      style={{
        position: 'absolute',
        top: '1rem',
        right: '1rem',
        width: '2.75rem',
        height: '2.75rem',
        minWidth: 44,
        minHeight: 44,
        background: 'none',
        border: '1px solid var(--wa-border)',
        borderRadius: 999,
        cursor: 'pointer',
        color: 'var(--wa-muted)',
        lineHeight: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <X size={18} aria-hidden="true" />
    </button>
  );
}

function SkillChip({ label, green }: { label: string; green?: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0.2rem 0.55rem',
        borderRadius: '9999px',
        background: green ? 'var(--wa-success-soft)' : 'var(--wa-surface-2)',
        border: green
          ? '1px solid color-mix(in srgb, var(--wa-success) 22%, transparent)'
          : '1px solid var(--wa-border)',
        fontSize: 'var(--wa-type-meta)',
        fontWeight: 600,
        color: green ? 'var(--wa-success)' : 'var(--wa-muted)',
      }}
    >
      {label}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        });
      }}
      style={{
        marginTop: '0.4rem',
        background: 'none',
        border: '1px solid var(--wa-border)',
        borderRadius: 'var(--wa-radius-sm)',
        cursor: 'pointer',
        fontSize: 'var(--wa-type-meta)',
        fontWeight: 600,
        color: copied ? 'var(--wa-success)' : 'var(--wa-muted)',
        padding: '0.3rem 0.65rem',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        minHeight: 44,
      }}
    >
      <span aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
        {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        {copied ? 'Copied!' : 'Copy'}
      </span>
    </button>
  );
}

// ── Phase 0: Mission Intro ────────────────────────────────────────────────────

function PhaseIntro({ mission, onAccept, onClose }: { mission: SkillMissionSummaryItem; onAccept: () => void; onClose: () => void }) {
  const scenarioPreview = mission.scenarioPrompt.length > 100
    ? mission.scenarioPrompt.slice(0, 100) + '…'
    : mission.scenarioPrompt;

  return (
    <div style={CARD_STYLE}>
      <CloseButton onClick={onClose} />

      <p
        style={{
          fontSize: 'var(--wa-type-meta)',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--wa-accent)',
          margin: '0 0 0.5rem',
        }}
      >
        Skill Mission
      </p>
      <h2 style={{ margin: '0 0 0.4rem', fontSize: '1.5rem', fontWeight: 900, lineHeight: 1.2, paddingRight: '2rem', color: 'var(--wa-text)' }}>
        {mission.missionName}
      </h2>
      <p style={{ margin: '0 0 1rem', fontSize: 'var(--wa-type-body)', color: 'var(--wa-muted)', lineHeight: 1.55 }}>
        {mission.missionTagline}
      </p>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1.25rem' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.3rem 0.65rem',
            borderRadius: '9999px',
            background: 'var(--wa-surface-2)',
            border: '1px solid var(--wa-border)',
            fontSize: 'var(--wa-type-meta)',
            fontWeight: 600,
            color: 'var(--wa-muted)',
          }}
        >
          <Clock size={14} aria-hidden="true" /> ~{mission.estimatedMinutes} min
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.3rem 0.65rem',
            borderRadius: '9999px',
            background: 'var(--wa-surface-2)',
            border: '1px solid var(--wa-border)',
            fontSize: 'var(--wa-type-meta)',
            fontWeight: 600,
            color: 'var(--wa-muted)',
          }}
        >
          <ClipboardList size={14} aria-hidden="true" /> 3 quiz questions + scenario
        </span>
      </div>

      {mission.skillLabels.length > 0 && (
        <div style={{ marginBottom: '1.1rem' }}>
          <p
            style={{
              margin: '0 0 0.4rem',
              fontSize: 'var(--wa-type-meta)',
              fontWeight: 700,
              color: 'var(--wa-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Skills you&apos;ll prove:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {mission.skillLabels.slice(0, 4).map((s) => (
              <SkillChip key={s} label={s} />
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          padding: '0.85rem 1rem',
          borderRadius: 'var(--wa-radius-sm)',
          background: 'var(--wa-surface-2)',
          border: '1px solid var(--wa-border)',
          marginBottom: '1.5rem',
        }}
      >
        <p
          style={{
            margin: '0 0 0.3rem',
            fontSize: 'var(--wa-type-meta)',
            fontWeight: 700,
            color: 'var(--wa-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          What you&apos;ll prove:
        </p>
        <p style={{ margin: 0, fontSize: 'var(--wa-type-body)', color: 'var(--wa-text)', lineHeight: 1.55, fontStyle: 'italic' }}>
          &ldquo;{scenarioPreview}&rdquo;
        </p>
      </div>

      <button
        type="button"
        className="wa-kit-cta wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100"
        onClick={onAccept}
      >
        Accept mission
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
  const questions = mission.quizQuestions.slice(0, 3);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [selectedThisQ, setSelectedThisQ] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<QuizCheckResponse | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  const question = questions[currentQ];
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
      setCheckError('Could not check your answer — tap to try again.');
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

  return (
    <div style={CARD_STYLE}>
      <CloseButton onClick={onClose} />

      {/* Progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <p style={{ margin: 0, fontSize: 'var(--wa-type-meta)', fontWeight: 700, color: 'var(--wa-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Question {currentQ + 1}/{questions.length}
        </p>
        <div style={{ flex: 1, height: '4px', borderRadius: '9999px', background: 'var(--wa-track)' }}>
          <div
            style={{
              height: '100%',
              borderRadius: '9999px',
              background: 'var(--wa-accent-fill)',
              width: `${((currentQ + (isAnswered ? 1 : 0)) / questions.length) * 100}%`,
              transition: 'width var(--wa-dur-slow) var(--wa-ease)',
            }}
          />
        </div>
      </div>

      <h3 style={{ margin: '0 0 1.1rem', fontSize: 'var(--wa-type-body)', fontWeight: 700, lineHeight: 1.4, paddingRight: '1.5rem' }}>
        {question.text}
      </h3>

      {/* Options */}
      <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '1rem' }}>
        {question.options.map((opt, idx) => {
          const isCorrect = feedback !== null && idx === feedback.correctIndex;
          const isSelected = selectedThisQ === idx;

          let bg = 'var(--wa-surface-2)';
          let border = '1px solid var(--wa-border)';
          let color = 'var(--wa-text)';

          if (isAnswered) {
            if (isCorrect) {
              bg = 'var(--wa-success-soft)';
              border = '1.5px solid color-mix(in srgb, var(--wa-success) 50%, transparent)';
              color = 'var(--wa-success)';
            } else if (isSelected && !isCorrect) {
              bg = 'var(--wa-danger-soft)';
              border = '1.5px solid color-mix(in srgb, var(--wa-danger) 40%, transparent)';
              color = 'var(--wa-danger)';
            }
          } else if (isSelected) {
            bg = 'color-mix(in srgb, var(--wa-accent) 10%, var(--wa-surface))';
            border = '1.5px solid var(--wa-accent)';
          }

          return (
            <button
              key={idx}
              type="button"
              onClick={() => void handleSelect(idx)}
              disabled={isAnswered || checking}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                minHeight: 44,
                padding: '0.75rem 1rem',
                borderRadius: 'var(--wa-radius-sm)',
                background: bg,
                border,
                color,
                fontSize: 'var(--wa-type-body)',
                fontWeight: 500,
                textAlign: 'left',
                cursor: isAnswered ? 'default' : 'pointer',
                transition: 'background var(--wa-dur-fast), border-color var(--wa-dur-fast)',
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: '1.5rem',
                  height: '1.5rem',
                  borderRadius: '50%',
                  background:
                    isAnswered && isCorrect
                      ? 'color-mix(in srgb, var(--wa-success) 25%, transparent)'
                      : isAnswered && isSelected && !isCorrect
                        ? 'color-mix(in srgb, var(--wa-danger) 20%, transparent)'
                        : 'var(--wa-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 'var(--wa-type-meta)',
                  fontWeight: 800,
                  color:
                    isAnswered && isCorrect
                      ? 'var(--wa-success)'
                      : isAnswered && isSelected && !isCorrect
                        ? 'var(--wa-danger)'
                        : 'var(--wa-muted)',
                }}
              >
                {isAnswered && isCorrect ? (
                  <Check size={14} aria-hidden="true" />
                ) : isAnswered && isSelected && !isCorrect ? (
                  <X size={14} aria-hidden="true" />
                ) : (
                  String.fromCharCode(65 + idx)
                )}
              </span>
              {opt}
            </button>
          );
        })}
      </div>

      {/* Checking / error states */}
      {checking && (
        <p style={{ margin: '0 0 1rem', fontSize: 'var(--wa-type-body)', color: 'var(--wa-muted)' }}>
          Checking…
        </p>
      )}
      {checkError && (
        <p role="alert" style={{ margin: '0 0 1rem', fontSize: 'var(--wa-type-body)', color: 'var(--wa-danger)' }}>
          {checkError}
        </p>
      )}

      {/* Explanation */}
      {feedback && (
        <div
          role="status"
          aria-live="polite"
          style={{
            padding: '0.75rem 1rem',
            borderRadius: 'var(--wa-radius-sm)',
            background: feedback.correct ? 'var(--wa-success-soft)' : 'var(--wa-gold-soft)',
            border: feedback.correct
              ? '1px solid color-mix(in srgb, var(--wa-success) 20%, transparent)'
              : '1px solid color-mix(in srgb, var(--wa-gold) 20%, transparent)',
            marginBottom: '1rem',
          }}
        >
          <p style={{ margin: 0, fontSize: 'var(--wa-type-body)', lineHeight: 1.55, color: 'var(--wa-text)', display: 'flex', gap: '0.4rem' }}>
            <span style={{ flexShrink: 0, marginTop: '0.15rem', color: feedback.correct ? 'var(--wa-success)' : 'var(--wa-gold)' }}>
              {feedback.correct ? <CheckCircle2 size={16} aria-hidden="true" /> : <Lightbulb size={16} aria-hidden="true" />}
            </span>
            <span>
              <strong>{feedback.correct ? 'Correct.' : "Here's why:"}</strong> {feedback.explanation}
            </span>
          </p>
        </div>
      )}

      {isAnswered && (
        <button
          type="button"
          className="wa-kit-cta wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100"
          onClick={handleNext}
        >
          {isLast ? 'See how you did →' : 'Next →'}
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
  const tCommon = useTranslations('common');

  const wordCount = response.trim() ? response.trim().split(/\s+/).length : 0;
  const charCount = response.length;
  const correctCount = quizAnswers.filter((a) => a.correct).length;

  async function handleSubmit() {
    if (charCount < 20) return;
    setLoading(true);
    setError(null);
    try {
      await onSubmit(response);
    } catch (err) {
      setError(
        requestFailureMessage(
          err,
          { connection: tCommon('connectionError'), fallback: 'Something went wrong. Please try again.' },
          'skill-mission',
        ),
      );
      setLoading(false);
    }
  }

  return (
    <div style={CARD_STYLE}>
      <CloseButton onClick={onClose} />

      {/* Quiz score recap */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.3rem 0.7rem',
          borderRadius: '9999px',
          background: correctCount === 3 ? 'var(--wa-success-soft)' : 'var(--wa-gold-soft)',
          border:
            correctCount === 3
              ? '1px solid color-mix(in srgb, var(--wa-success) 22%, transparent)'
              : '1px solid color-mix(in srgb, var(--wa-gold) 22%, transparent)',
          fontSize: 'var(--wa-type-meta)',
          fontWeight: 700,
          color: correctCount === 3 ? 'var(--wa-success)' : 'var(--wa-gold)',
          marginBottom: '1rem',
        }}
      >
        {correctCount === 3 ? <Target size={14} aria-hidden="true" /> : <BookOpenCheck size={14} aria-hidden="true" />}
        {correctCount}/3 quiz questions correct
      </div>

      <h3 style={{ margin: '0 0 0.35rem', fontSize: 'var(--wa-type-body)', fontWeight: 800, paddingRight: '1.5rem' }}>
        Now show it in action
      </h3>
      <p style={{ margin: '0 0 1rem', fontSize: 'var(--wa-type-body)', color: 'var(--wa-muted)', lineHeight: 1.5 }}>
        Describe a real or realistic situation where you&apos;d apply these skills.
      </p>

      {/* Scenario blockquote */}
      <blockquote
        style={{
          margin: '0 0 1rem',
          padding: '0.85rem 1rem 0.85rem 1.25rem',
          borderLeft: '3px solid var(--wa-accent)',
          background: 'color-mix(in srgb, var(--wa-accent) 5%, var(--wa-surface))',
          borderRadius: '0 var(--wa-radius-sm) var(--wa-radius-sm) 0',
          fontSize: 'var(--wa-type-body)',
          lineHeight: 1.65,
          color: 'var(--wa-text)',
          fontStyle: 'italic',
        }}
      >
        {mission.scenarioPrompt}
      </blockquote>

      {/* Textarea */}
      <div style={{ position: 'relative', marginBottom: '0.4rem' }}>
        <textarea
          aria-label="Your scenario response"
          disabled={loading}
          value={response}
          onChange={(e) => { setResponse(e.target.value); onResponseChange(e.target.value); onDirty(); }}
          rows={8}
          placeholder="Walk me through how you'd handle this... (aim for 150+ words)"
          style={{
            width: '100%',
            padding: '0.85rem 1rem',
            borderRadius: 'var(--wa-radius-sm)',
            border: '1.5px solid var(--wa-border)',
            background: 'var(--wa-surface-2)',
            fontSize: 'var(--wa-type-body)',
            lineHeight: 1.6,
            color: 'var(--wa-text)',
            resize: 'vertical',
            boxSizing: 'border-box',
            outline: 'none',
            fontFamily: 'inherit',
            transition: 'border-color var(--wa-dur-fast)',
          }}
          onFocus={(e) => { e.target.style.borderColor = 'var(--wa-accent)'; }}
          onBlur={(e) => { e.target.style.borderColor = 'var(--wa-border)'; }}
        />
      </div>

      {/* Word count */}
      <p
        style={{
          margin: '0 0 0.6rem',
          fontSize: 'var(--wa-type-meta)',
          color: wordCount >= 150 ? 'var(--wa-success)' : 'var(--wa-muted)',
          fontWeight: wordCount >= 150 ? 700 : 400,
        }}
      >
        {wordCount} words{wordCount >= 150 ? ' · enough for STAR' : wordCount >= 50 ? ' · add a result' : ''}
      </p>

      {/* Evidence hint */}
      <div
        style={{
          padding: '0.6rem 0.85rem',
          borderRadius: 'var(--wa-radius-sm)',
          background: 'var(--wa-surface-2)',
          fontSize: 'var(--wa-type-body)',
          color: 'var(--wa-muted)',
          marginBottom: '1.25rem',
          lineHeight: 1.5,
        }}
      >
        <strong>Tip:</strong> {mission.evidenceHint}
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: '0.65rem 0.85rem',
            borderRadius: 'var(--wa-radius-sm)',
            background: 'var(--wa-danger-soft)',
            border: '1px solid color-mix(in srgb, var(--wa-danger) 25%, transparent)',
            fontSize: 'var(--wa-type-body)',
            color: 'var(--wa-danger)',
            marginBottom: '1rem',
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="wa-kit-cta wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100"
          onClick={handleSubmit}
          disabled={charCount < 20 || loading}
          style={{
            opacity: charCount < 20 ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {loading ? (
            <>
              <span
                style={{
                  display: 'inline-block',
                  width: '0.85rem',
                  height: '0.85rem',
                  borderRadius: '50%',
                  border: '2px solid color-mix(in srgb, var(--wa-on-accent) 30%, transparent)',
                  borderTopColor: 'var(--wa-on-accent)',
                  animation: 'spin 0.7s linear infinite',
                }}
              />
              Coaching…
            </>
          ) : (
            'Submit for coaching'
          )}
        </button>
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="wa-kit-focus"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 'var(--wa-type-body)',
            color: 'var(--wa-muted)',
            padding: '0.5rem',
            minHeight: 44,
            textDecoration: 'underline',
          }}
        >
          ← Back to quiz
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
  const passed = result.verdict === 'passed';

  return (
    <div style={CARD_STYLE}>
      <CloseButton onClick={onClose} />

      <h2
        style={{
          margin: '0 0 0.75rem',
          fontSize: 'var(--wa-type-body)',
          fontWeight: 900,
          color: passed ? 'var(--wa-success)' : 'var(--wa-gold)',
          paddingRight: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        {passed ? <CheckCircle2 size={22} aria-hidden="true" /> : <RotateCcw size={22} aria-hidden="true" />}
        {passed ? 'Mission passed' : 'Try again'}
      </h2>

      {/* Coaching note */}
      <div
        style={{
          padding: '1rem',
          borderRadius: 'var(--wa-radius-sm)',
          background: passed ? 'var(--wa-success-soft)' : 'var(--wa-gold-soft)',
          border: passed
            ? '1px solid color-mix(in srgb, var(--wa-success) 20%, transparent)'
            : '1px solid color-mix(in srgb, var(--wa-gold) 22%, transparent)',
          marginBottom: '1.1rem',
        }}
      >
        <p style={{ margin: 0, fontSize: 'var(--wa-type-body)', lineHeight: 1.65, color: 'var(--wa-text)' }}>
          {result.coachingNote}
        </p>
      </div>

      {passed && (
        <>
          {/* Skills unlocked */}
          {result.skillsUnlocked.length > 0 && (
            <div style={{ marginBottom: '1.1rem' }}>
              <p style={{ margin: '0 0 0.45rem', fontSize: 'var(--wa-type-meta)', fontWeight: 700, color: 'var(--wa-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Skills you demonstrated:
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {result.skillsUnlocked.map((s) => (
                  <SkillChip key={s} label={s} green />
                ))}
              </div>
            </div>
          )}

          {/* Resume bullet */}
          <div style={{ marginBottom: '1rem' }}>
            <p style={{ margin: '0 0 0.4rem', fontSize: 'var(--wa-type-meta)', fontWeight: 700, color: 'var(--wa-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Your resume bullet:
            </p>
            <div
              style={{
                padding: '0.85rem 1rem',
                borderRadius: 'var(--wa-radius-sm)',
                background: 'var(--wa-surface-2)',
                border: '1px solid var(--wa-border)',
                fontSize: 'var(--wa-type-body)',
                lineHeight: 1.6,
                color: 'var(--wa-text)',
                fontStyle: 'italic',
              }}
            >
              {result.resumeBullet}
            </div>
            <CopyButton text={result.resumeBullet} />
          </div>

          {/* STAR story */}
          <div style={{ marginBottom: '1.25rem' }}>
            <p style={{ margin: '0 0 0.4rem', fontSize: 'var(--wa-type-meta)', fontWeight: 700, color: 'var(--wa-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Your STAR story:
            </p>
            <div
              style={{
                padding: '0.85rem 1rem',
                borderRadius: 'var(--wa-radius-sm)',
                background: 'var(--wa-surface-2)',
                border: '1px solid var(--wa-border)',
                fontSize: 'var(--wa-type-body)',
                lineHeight: 1.7,
                color: 'var(--wa-text)',
                whiteSpace: 'pre-wrap',
              }}
            >
              {result.starStory}
            </div>
            <CopyButton text={result.starStory} />
          </div>

          <button
            type="button"
            className="wa-kit-cta wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100"
            onClick={onContinue}
            aria-label="Continue"
          >
            Continue →
          </button>
        </>
      )}

      {!passed && (
        <>
          <div
            style={{
              padding: '0.85rem 1rem',
              borderRadius: 'var(--wa-radius-sm)',
              background: 'var(--wa-surface-2)',
              border: '1px solid var(--wa-border)',
              marginBottom: '1.25rem',
            }}
          >
            <p style={{ margin: '0 0 0.4rem', fontSize: 'var(--wa-type-body)', fontWeight: 700, color: 'var(--wa-muted)' }}>
              What to review before retrying:
            </p>
            <p style={{ margin: 0, fontSize: 'var(--wa-type-body)', lineHeight: 1.6, color: 'var(--wa-text)' }}>
              Re-read your course materials, focusing on the core concepts tested in the quiz.
              When you write your scenario response, use the STAR method: Situation, Task, Action, Result.
              Aim for 150+ words with specific, concrete details.
            </p>
          </div>

          <button
            type="button"
            className="wa-kit-cta wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100"
            onClick={onClose}
            style={{ background: 'var(--wa-gold)' }}
          >
            Close &amp; review
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
  return (
    <div
      style={{
        ...CARD_STYLE,
        textAlign: 'center',
      }}
    >
      <CheckCircle2
        size={28}
        aria-hidden="true"
        style={{ color: 'var(--wa-success)', marginBottom: '0.5rem', display: 'inline-block' }}
      />
      <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.15rem', fontWeight: 800, color: 'var(--wa-text)' }}>
        Mission passed
      </h2>
      <p style={{ margin: '0 0 1.5rem', fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', lineHeight: 1.55 }}>
        The STAR story and resume bullet stay here. Open Resume Studio when you want them in a draft.
      </p>

      {/* Resume bullet spotlight */}
      <div
        style={{
          padding: '1rem 1.25rem',
          borderRadius: 'var(--wa-radius-sm)',
          background:
            'linear-gradient(135deg, color-mix(in srgb, var(--wa-accent) 8%, var(--wa-surface)), color-mix(in srgb, var(--wa-accent) 4%, var(--wa-surface)))',
          border: '1.5px solid color-mix(in srgb, var(--wa-accent) 22%, transparent)',
          marginBottom: '1.25rem',
          textAlign: 'left',
        }}
      >
        <p style={{ margin: '0 0 0.35rem', fontSize: 'var(--wa-type-meta)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--wa-accent)' }}>
          Your new resume bullet
        </p>
        <p style={{ margin: 0, fontSize: 'var(--wa-type-body)', fontStyle: 'italic', fontWeight: 500, lineHeight: 1.6, color: 'var(--wa-text)' }}>
          {result.resumeBullet}
        </p>
      </div>

      {result.skillsUnlocked.length > 0 && (
        <div style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
          <p style={{ margin: '0 0 0.45rem', fontSize: 'var(--wa-type-meta)', fontWeight: 700, color: 'var(--wa-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Skills added to your profile:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {result.skillsUnlocked.map((s) => (
              <SkillChip key={s} label={s} green />
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <a
          href="/dashboard/ai-tools/resume-studio"
          className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus hover:wa-opacity-90"
        >
          Open Resume Studio →
        </a>
        <button
          type="button"
          className="wa-kit-cta wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100"
          onClick={onComplete}
        >
          Done ✓
        </button>
      </div>
    </div>
  );
}

// ── Root component ────────────────────────────────────────────────────────────

export default function SkillMissionChallenge({
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
  const dirty = useRef(false);
  const evaluating = useRef(false);
  const announce = useAnnounce();
  const markDirty = () => { dirty.current = true; };
  const requestClose = () => {
    if (!preview && evaluating.current) {
      const notice = 'Your practice is still being reviewed. Please wait for the result before closing.';
      setCloseNotice(notice); announce(notice, 'assertive');
      return;
    }
    if (!preview && dirty.current && !window.confirm('Leave this practice? Your unsaved answers and response will be lost.')) return;
    onClose();
  };
  const dialogRef = useFocusTrap<HTMLDivElement>(true, { onEscape: requestClose });
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
          throw new Error((data as { ok: false; error: string }).error || 'Evaluation failed');
        }

        setEvalResult(data as MissionEvalResponse & { ok: true });
        dirty.current = false;
        setPhase(3);
      } finally {
        evaluating.current = false;
        setCloseNotice('');
      }
    },
    [mission, quizAnswers, preview],
  );

  function handleQuizFinish(answers: QuizAnswer[]) {
    setQuizAnswers(answers);
    setPhase(2);
  }

  function handleResultContinue() {
    if (evalResult?.verdict === 'passed') {
      setPhase(4);
    }
  }

  function handleComplete() {
    if (evalResult) {
      onComplete(evalResult);
    }
  }

  const overlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) requestClose();
  };

  return (
    <div ref={dialogRef} style={OVERLAY_STYLE} onClick={overlayClick} role="dialog" aria-modal="true" aria-label={mission.missionName}>
      {closeNotice ? <p role="status" style={{ position: 'absolute', bottom: 'var(--wa-pad-sm)', margin: 0, padding: 'var(--wa-pad-sm)', background: 'var(--wa-surface)', color: 'var(--wa-text)', borderRadius: 'var(--wa-radius-sm)' }}>{closeNotice}</p> : null}
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
