'use client';

import { useState, useCallback } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  ArrowLeft,
  ChevronRight,
  ClipboardList,
  XCircle,
  RotateCcw,
  ArrowRight,
} from 'lucide-react';
import type { ProgramCheckpointPack, CourseCheckpointSet, SkillCheckpoint } from '@/lib/content/checkpoints';
import { ALL_CHECKPOINT_PACKS } from '@/lib/content/checkpoints';
import { ShareButton } from '@/components/ui/ShareButton';
import { buildSkillCheckpointShare, getBrowserShareOrigin } from '@/lib/og/shareAchievementLinks';
import { StatusTag, SegmentedProgress } from '@/components/portal/kit';

type Step =
  | { kind: 'program' }
  | { kind: 'course'; pack: ProgramCheckpointPack }
  | { kind: 'quiz'; pack: ProgramCheckpointPack; course: CourseCheckpointSet; index: number; answers: Record<string, string>; revealed: boolean }
  | { kind: 'done'; pack: ProgramCheckpointPack; course: CourseCheckpointSet; correct: number; total: number };

const backLinkStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: '0.82rem',
  fontWeight: 700,
  color: 'var(--wa-accent)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '0 0 0.75rem',
  minHeight: 44,
} as const;

const primaryPillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '10px 20px',
  background: 'var(--wa-accent)',
  color: 'var(--wa-on-accent-control)',
  borderRadius: 999,
  border: 'none',
  fontWeight: 700,
  fontSize: '0.85rem',
  cursor: 'pointer',
  minHeight: 44,
} as const;

const outlinePillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '10px 18px',
  background: 'var(--wa-surface)',
  color: 'var(--wa-text)',
  borderRadius: 999,
  border: '1px solid var(--wa-border)',
  fontWeight: 700,
  fontSize: '0.85rem',
  cursor: 'pointer',
  minHeight: 44,
} as const;

/**
 * Records the answer without blocking the quiz. A failed save is retried once
 * and then reported to the caller, so the member is told when a checkpoint
 * did not reach their record instead of discovering it missing later.
 */
async function persistCheckpoint(payload: {
  checkpointId: string;
  programSlug: string;
  courseSlug: string;
  passed: boolean;
}): Promise<boolean> {
  const attempt = async () => {
    const res = await fetch('/api/member/skill-checkpoints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  };
  try {
    if (await attempt()) return true;
  } catch {
    // dropped connection — retried below
  }
  try {
    return await attempt();
  } catch {
    return false;
  }
}

const SAVE_WARNING_COPY =
  "We couldn't save your latest answer to your record. You can keep going here; if it does not show in your progress later, retake this course's checkpoints.";

function SaveWarning() {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="checkpoint-save-warning"
      style={{
        padding: '0.7rem 0.9rem',
        borderRadius: 'var(--wa-radius-sm)',
        background: 'var(--wa-gold-soft)',
        border: '1px solid var(--wa-gold)',
        color: 'var(--wa-gold-dark)',
        fontSize: '0.82rem',
        lineHeight: 1.5,
        marginBottom: '1rem',
      }}
    >
      {SAVE_WARNING_COPY}
    </div>
  );
}

function ProofCard({
  course,
  pack,
  correct,
  total,
}: {
  course: CourseCheckpointSet;
  pack: ProgramCheckpointPack;
  correct: number;
  total: number;
}) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const demonstrated = course.checkpoints.map((cp) => cp.demonstratedSkill);
  const shareSkill = demonstrated[0] ?? course.courseName;
  const share = buildSkillCheckpointShare({
    origin: getBrowserShareOrigin(),
    skillName: shareSkill,
    programTitle: pack.programTitle,
    courseName: course.courseName,
    correct,
    total,
  });

  return (
    <div
      className="wa-kit-card"
      style={{
        border: '2px solid var(--wa-accent)',
        marginBottom: '1.25rem',
      }}
    >
      {/* Header */}
      <div className="wa-flex wa-items-center" style={{ gap: '0.6rem', marginBottom: '0.75rem' }}>
        <ShieldCheck size={28} aria-hidden="true" style={{ color: 'var(--wa-accent)', flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--wa-accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Skill Demonstrated
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--wa-text)', lineHeight: 1.25 }}>
            {course.courseName}
          </div>
        </div>
      </div>

      {/* Score */}
      <div style={{ fontSize: '0.82rem', color: 'var(--wa-muted)', marginBottom: '0.75rem', fontVariantNumeric: 'tabular-nums' }}>
        {correct} of {total} correct · {pack.programTitle}
      </div>

      {/* Skills chips */}
      <div className="wa-flex wa-flex-wrap" style={{ gap: '0.4rem', marginBottom: '1rem' }}>
        {demonstrated.map((skill) => (
          <StatusTag key={skill} tone="ok">
            <CheckCircle2 size={12} aria-hidden="true" />
            {skill}
          </StatusTag>
        ))}
      </div>

      {/* Footer */}
      <div style={{ fontSize: '0.8125rem', color: 'var(--wa-muted)', borderTop: '1px solid var(--wa-border)', paddingTop: '0.75rem' }}>
        Verified by WorkforceAP · {today}
      </div>

      <div style={{ marginTop: '1rem' }}>
        <ShareButton url={share.url} title={share.title} text={share.text} />
      </div>
    </div>
  );
}

export default function SkillCheckpointsClient({ userId: _userId }: { userId: string }) {
  const [step, setStep] = useState<Step>({ kind: 'program' });
  const [saveFailed, setSaveFailed] = useState(false);

  // ─── Step 0: Program picker ───────────────────────────────────────────────
  const renderProgramPicker = () => (
    <div>
      <p style={{ fontSize: '0.9rem', color: 'var(--wa-muted)', marginBottom: '1.25rem' }}>
        Pick a program track. You&rsquo;ll choose a specific course next, then answer a few short workplace scenarios.
      </p>
      <div className="wa-grid wa-grid-cols-1 sm:wa-grid-cols-2 wa-gap-4">
        {ALL_CHECKPOINT_PACKS.map((pack) => (
          <button
            key={pack.programSlug}
            className="wa-kit-card wa-kit-card--hover wa-kit-focus"
            onClick={() => setStep({ kind: 'course', pack })}
            aria-label={`Select ${pack.programTitle}`}
            style={{ textAlign: 'left', cursor: 'pointer', minHeight: 44 }}
          >
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--wa-text)', marginBottom: '0.4rem' }}>
              {pack.programTitle}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--wa-muted)', lineHeight: 1.5 }}>
              {pack.whyItMatters}
            </div>
            <div className="wa-flex wa-items-center" style={{ gap: 4, marginTop: '0.6rem', fontSize: '0.8125rem', color: 'var(--wa-accent)', fontWeight: 700 }}>
              {pack.courses.length} course{pack.courses.length !== 1 ? 's' : ''}
              <ChevronRight size={14} aria-hidden="true" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  // ─── Step 1: Course picker ────────────────────────────────────────────────
  const renderCoursePicker = (pack: ProgramCheckpointPack) => (
    <div>
      <button onClick={() => setStep({ kind: 'program' })} aria-label="Back to programs" style={backLinkStyle}>
        <ArrowLeft size={16} aria-hidden="true" />
        Back to programs
      </button>

      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--wa-text)' }}>{pack.programTitle}</div>
        <div style={{ fontSize: '0.82rem', color: 'var(--wa-muted)' }}>{pack.whyItMatters}</div>
      </div>

      <p style={{ fontSize: '0.85rem', color: 'var(--wa-muted)', marginBottom: '1rem' }}>
        Pick a course to verify. You&rsquo;ll answer a few short scenarios — takes about 3–5 minutes.
      </p>

      <div className="wa-space-y-2">
        {pack.courses.map((course) => (
          <button
            key={course.courseSlug}
            className="wa-kit-card wa-kit-card--sm wa-kit-card--hover wa-kit-focus"
            onClick={() => {
              setSaveFailed(false);
              setStep({ kind: 'quiz', pack, course, index: 0, answers: {}, revealed: false });
            }
            }
            aria-label={`Select ${course.courseName}`}
            style={{
              textAlign: 'left',
              cursor: 'pointer',
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              width: '100%',
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--wa-text)' }}>
                {course.courseName}
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--wa-muted)', marginTop: '0.15rem' }}>
                {course.checkpoints.length} checkpoint{course.checkpoints.length !== 1 ? 's' : ''}
              </div>
            </div>
            <ChevronRight size={20} aria-hidden="true" style={{ color: 'var(--wa-muted)', flexShrink: 0 }} />
          </button>
        ))}
      </div>
    </div>
  );

  // ─── Step 2: Quiz ─────────────────────────────────────────────────────────
  const renderQuiz = useCallback(
    (state: Extract<Step, { kind: 'quiz' }>) => {
      const { pack, course, index, answers, revealed } = state;
      const cp: SkillCheckpoint = course.checkpoints[index];
      const selected = answers[cp.id];
      const isCorrect = selected === cp.correctOptionId;

      const handleSelect = (optId: string) => {
        if (revealed) return;
        const newAnswers = { ...answers, [cp.id]: optId };
        setStep({ ...state, answers: newAnswers, revealed: true });
        // Persist immediately on answer; the quiz does not wait, but a save
        // that fails twice is surfaced so the member knows.
        void persistCheckpoint({
          checkpointId: cp.id,
          programSlug: pack.programSlug,
          courseSlug: course.courseSlug,
          passed: optId === cp.correctOptionId,
        }).then((saved) => {
          if (!saved) setSaveFailed(true);
        });
      };

      const handleNext = () => {
        if (index + 1 >= course.checkpoints.length) {
          // Calculate score
          const allAnswers = { ...answers, [cp.id]: selected ?? '' };
          const correct = course.checkpoints.filter(
            (c) => allAnswers[c.id] === c.correctOptionId
          ).length;
          setStep({ kind: 'done', pack, course, correct, total: course.checkpoints.length });
        } else {
          setStep({ kind: 'quiz', pack, course, index: index + 1, answers, revealed: false });
        }
      };

      const progressPct = Math.round(((index) / course.checkpoints.length) * 100);

      return (
        <div>
          {/* Back */}
          <button onClick={() => setStep({ kind: 'course', pack })} aria-label={`Back to ${course.courseName}`} style={backLinkStyle}>
            <ArrowLeft size={16} aria-hidden="true" />
            {course.courseName}
          </button>

          {/* Progress bar */}
          <div style={{ marginBottom: '0.6rem' }}>
            <SegmentedProgress
              pct={progressPct}
              segments={course.checkpoints.length}
              label={`Checkpoint ${index + 1} of ${course.checkpoints.length}`}
            />
          </div>

          <div style={{ fontSize: '0.8125rem', color: 'var(--wa-muted)', marginBottom: '1rem', fontVariantNumeric: 'tabular-nums' }}>
            Checkpoint {index + 1} of {course.checkpoints.length}
          </div>

          {saveFailed && <SaveWarning />}

          {/* Scenario card */}
          <div
            className="wa-kit-card wa-kit-card--sm"
            style={{ marginBottom: '1rem', display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}
          >
            <ClipboardList size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: '0.1rem', color: 'var(--wa-muted)' }} />
            <div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--wa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>
                Scenario
              </div>
              <div style={{ fontSize: '0.88rem', color: 'var(--wa-text)', lineHeight: 1.6 }}>
                {cp.scenario}
              </div>
            </div>
          </div>

          {/* Question */}
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--wa-text)', marginBottom: '0.75rem', lineHeight: 1.45 }}>
            {cp.question}
          </div>

          {/* Options */}
          <div className="wa-space-y-2" style={{ marginBottom: '1rem' }}>
            {cp.options.map((opt) => {
              const isSelected = selected === opt.id;
              const isRight = opt.id === cp.correctOptionId;
              let bgColor = 'var(--wa-surface)';
              let borderColor = 'var(--wa-border)';
              let textColor = 'var(--wa-text)';

              if (revealed) {
                if (isRight) {
                  bgColor = 'color-mix(in srgb, var(--wa-success) 12%, transparent)';
                  borderColor = 'var(--wa-success)';
                  textColor = 'var(--wa-success)';
                } else if (isSelected && !isRight) {
                  bgColor = 'var(--wa-danger-soft)';
                  borderColor = 'var(--wa-danger)';
                  textColor = 'var(--wa-danger)';
                }
              } else if (isSelected) {
                borderColor = 'var(--wa-accent)';
              }

              return (
                <button
                  key={opt.id}
                  onClick={() => handleSelect(opt.id)}
                  disabled={revealed}
                  aria-label={opt.text}
                  className="wa-kit-focus"
                  style={{
                    textAlign: 'left',
                    padding: '0.75rem 1rem',
                    borderRadius: 'var(--wa-radius-sm)',
                    border: `2px solid ${borderColor}`,
                    background: bgColor,
                    color: textColor,
                    cursor: revealed ? 'default' : 'pointer',
                    fontSize: '0.88rem',
                    lineHeight: 1.5,
                    minHeight: 44,
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: isSelected || (revealed && isRight) ? borderColor : 'var(--wa-surface-2)',
                      color: isSelected || (revealed && isRight) ? 'var(--wa-on-accent)' : 'var(--wa-muted)',
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {opt.id.toUpperCase()}
                  </span>
                  {opt.text}
                  {revealed && isRight && (
                    <CheckCircle2 size={18} aria-hidden="true" style={{ marginLeft: 'auto', color: 'var(--wa-success)', flexShrink: 0 }} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Feedback */}
          {revealed && (
            <div
              role="status"
              aria-live="polite"
              style={{
                padding: '0.85rem 1rem',
                borderRadius: 'var(--wa-radius-sm)',
                background: isCorrect ? 'color-mix(in srgb, var(--wa-success) 12%, transparent)' : 'var(--wa-danger-soft)',
                border: `1px solid ${isCorrect ? 'var(--wa-success)' : 'var(--wa-danger)'}`,
                marginBottom: '1rem',
              }}
            >
              <div
                className="wa-flex wa-items-center"
                style={{
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  color: isCorrect ? 'var(--wa-success)' : 'var(--wa-danger)',
                  marginBottom: '0.3rem',
                  gap: '0.3rem',
                }}
              >
                {isCorrect ? <CheckCircle2 size={16} aria-hidden="true" /> : <XCircle size={16} aria-hidden="true" />}
                {isCorrect ? 'Correct' : 'Not quite'}
              </div>
              <div style={{ fontSize: '0.83rem', lineHeight: 1.55, color: 'var(--wa-text)' }}>
                {cp.explanation}
              </div>
            </div>
          )}

          {/* Next button */}
          {revealed && (
            <button
              onClick={handleNext}
              aria-label={index + 1 >= course.checkpoints.length ? 'See my results' : 'Next checkpoint'}
              className="wa-kit-focus"
              style={primaryPillStyle}
            >
              {index + 1 >= course.checkpoints.length ? 'See my results' : 'Next checkpoint'}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      );
    },
    [saveFailed]
  );

  // ─── Step 3: Done / completion card ───────────────────────────────────────
  const renderDone = (state: Extract<Step, { kind: 'done' }>) => {
    const { pack, course, correct, total } = state;

    return (
      <div>
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--wa-text)' }}>
            Skills demonstrated
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--wa-muted)', fontVariantNumeric: 'tabular-nums' }}>
            You answered {correct} of {total} correctly.
          </div>
        </div>

        {saveFailed && <SaveWarning />}

        <ProofCard course={course} pack={pack} correct={correct} total={total} />

        <button onClick={() => setStep({ kind: 'course', pack })} aria-label="Try another course" className="wa-kit-focus" style={outlinePillStyle}>
          <RotateCcw size={16} aria-hidden="true" />
          Try another course
        </button>
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  switch (step.kind) {
    case 'program':
      return renderProgramPicker();
    case 'course':
      return renderCoursePicker(step.pack);
    case 'quiz':
      return renderQuiz(step);
    case 'done':
      return renderDone(step);
  }
}
