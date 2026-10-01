'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { Brain, Check, Code, Copy, Download, Heart, Lightbulb, Puzzle, Users } from 'lucide-react';
import { useRetryableFetch } from '@/hooks/useRetryableFetch';
import AiToolError from './AiToolError';
import ToolFollowThrough from './ToolFollowThrough';
import { PortalInlineSpinner } from '@/components/portal/PortalInlineSpinner';
import { trackToolLaunch } from '@/lib/analytics/events';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { useHydrateMemberResumePlainText } from '@/hooks/useHydrateMemberResumePlainText';
import ExportPdfButton from './ExportPdfButton';
import AiToolLanguageSelector, { type AiToolLanguage } from './AiToolLanguageSelector';
import { FormField, StatusTag, type KitTone } from '@/components/portal/kit';

type Question = {
  question: string;
  type: string;
  tip: string;
  starHint?: string;
  exampleAnswer?: string;
};

type StarWorksheet = { situation: string; task: string; action: string; result: string };

const emptyStar = (): StarWorksheet => ({ situation: '', task: '', action: '', result: '' });

const KIT_BTN =
  'wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none';

const kitBtnSolid: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  minHeight: 44,
  padding: '10px 16px',
  background: 'var(--wa-accent)',
  color: 'var(--wa-on-accent-control)',
  border: '1px solid var(--wa-accent)',
  fontWeight: 600,
  fontSize: 'var(--wa-type-body)',
  borderRadius: 999,
  cursor: 'pointer',
};

const kitBtnOutline: CSSProperties = {
  ...kitBtnSolid,
  background: 'transparent',
  color: 'var(--wa-accent)',
  border: '1px solid var(--wa-border)',
};

const FIELD_CONTROL: CSSProperties = {
  marginTop: 4,
  width: '100%',
  fontSize: 'var(--wa-type-body)',
  border: '1px solid var(--wa-border)',
  borderRadius: 'var(--wa-radius-sm)',
  padding: '10px 12px',
  outline: 'none',
  background: 'var(--wa-surface)',
  color: 'var(--wa-text)',
  fontFamily: 'inherit',
};

const FOCUS_OPTIONS: Array<{ id: string; icon: ReactNode; label: string }> = [
  { id: 'behavioral', icon: <Brain size={16} aria-hidden="true" />, label: 'Behavioral' },
  { id: 'technical', icon: <Code size={16} aria-hidden="true" />, label: 'Technical' },
  { id: 'situational', icon: <Lightbulb size={16} aria-hidden="true" />, label: 'Situational' },
  { id: 'leadership', icon: <Users size={16} aria-hidden="true" />, label: 'Leadership' },
  { id: 'problem-solving', icon: <Puzzle size={16} aria-hidden="true" />, label: 'Problem solving' },
  { id: 'culture-fit', icon: <Heart size={16} aria-hidden="true" />, label: 'Culture fit' },
];

const TYPE_TONE: Record<string, KitTone> = {
  behavioral: 'info',
  technical: 'ok',
  situational: 'warn',
  leadership: 'alert',
  'problem-solving': 'info',
  'culture-fit': 'muted',
};

export default function InterviewPracticeForm({
  memberId,
  initialData,
  preview = false,
  previewQuestions,
}: {
  memberId?: string;
  initialData?: { role: string; experienceLevel: 'entry' | 'mid' | 'senior'; resumeContext: string } | null;
  /** Skip resume hydrate / generate POST — /dev/member proofs. */
  preview?: boolean;
  previewQuestions?: Question[];
}) {
  const [role, setRole] = useState(initialData?.role ?? '');
  const [resumeContext, setResumeContext] = useState(initialData?.resumeContext ?? '');
  const [experienceLevel, setExperienceLevel] = useState<'entry' | 'mid' | 'senior'>(initialData?.experienceLevel ?? 'mid');
  const [language, setLanguage] = useState<AiToolLanguage>('en');
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState(5);
  const [questions, setQuestions] = useState<Question[]>(previewQuestions ?? []);
  const [starByIndex, setStarByIndex] = useState<Record<number, StarWorksheet>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { copy, copied } = useCopyToClipboard();
  const { execute, clearRetry, retryState } = useRetryableFetch();

  const toggleFocus = (id: string) =>
    setFocusAreas((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));

  useHydrateMemberResumePlainText(setResumeContext, memberId, !preview);

  const doSubmit = async () => {
    if (preview) return;
    setError('');
    setQuestions([]);
    setStarByIndex({});
    setLoading(true);
    trackToolLaunch('interview-practice', 'Interview Practice Generator');

    await execute(
      async () => {
        const res = await fetch('/api/ai/interview-practice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role,
            experienceLevel,
            focusAreas: focusAreas.length ? focusAreas : undefined,
            difficulty,
            count: 8,
            resumeContext: resumeContext.trim() || undefined,
            language,
            ...(memberId ? { subjectMemberId: memberId } : {})})});
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Something went wrong');
        return data;
      },
      (data) => setQuestions(data.questions ?? []),
      (err) => setError(err),
    );

    setLoading(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    clearRetry();
    void doSubmit();
  };

  const buildSessionTranscript = () => {
    const header = [
      'WorkforceAP — Interview practice session',
      `Target role: ${role || '(not set)'}`,
      `Experience: ${experienceLevel}`,
      `Focus: ${focusAreas.length ? focusAreas.join(', ') : 'any'}`,
      `Generated: ${new Date().toLocaleString()}`,
      '',
      '---',
      '',
    ].join('\n');

    const body = questions
      .map((q, i) => {
        const star = starByIndex[i] ?? emptyStar();
        const starBlock = [star.situation, star.task, star.action, star.result].some((s) => s.trim())
          ? [
              'STAR worksheet (your notes):',
              star.situation.trim() ? `  Situation: ${star.situation.trim()}` : '  Situation: —',
              star.task.trim() ? `  Task: ${star.task.trim()}` : '  Task: —',
              star.action.trim() ? `  Action: ${star.action.trim()}` : '  Action: —',
              star.result.trim() ? `  Result: ${star.result.trim()}` : '  Result: —',
            ].join('\n')
          : 'STAR worksheet: (not filled yet)';
        return [
          `Question ${i + 1}`,
          q.question,
          `Type: ${q.type}`,
          `Tip: ${q.tip}`,
          q.starHint ? `STAR hint: ${q.starHint}` : '',
          q.exampleAnswer ? `Example answer: ${q.exampleAnswer}` : '',
          starBlock,
          '',
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n');

    return `${header}${body}`;
  };

  const handleCopy = () => {
    void copy(buildSessionTranscript());
  };

  const handleDownloadTxt = () => {
    const blob = new Blob([buildSessionTranscript()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-practice-${(role || 'session').replace(/[^a-zA-Z0-9-_ ]/g, '').slice(0, 40) || 'session'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const updateStar = (index: number, field: keyof StarWorksheet, value: string) => {
    setStarByIndex((prev) => ({
      ...prev,
      [index]: { ...(prev[index] ?? emptyStar()), [field]: value }}));
  };

  const pdfExportText = buildSessionTranscript();

  return (
    <form onSubmit={handleSubmit} className="interview-practice-form" style={{ marginTop: 0 }}>
      <AiToolLanguageSelector value={language} onChange={setLanguage} />
      <div className="wa-space-y-4">
        <FormField
          id="role"
          label="Target role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="e.g. Cloud support specialist"
          required
          disabled={loading}
        />
        <FormField label="Resume context (optional)" id="interview-resume-context" full>
          <textarea
            id="interview-resume-context"
            value={resumeContext}
            onChange={(e) => setResumeContext(e.target.value)}
            placeholder="Paste key bullets so practice questions match your background."
            rows={5}
            disabled={loading}
            style={{ ...FIELD_CONTROL, minHeight: 120, resize: 'vertical' }}
          />
        </FormField>
        <p style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', margin: '-8px 0 0', lineHeight: 1.45 }}>
          Prefills from a resume on file. Used to tailor questions — not shown to employers.
        </p>
        <FormField label="Experience level" id="experience">
          <select
            value={experienceLevel}
            onChange={(e) => setExperienceLevel(e.target.value as 'entry' | 'mid' | 'senior')}
            disabled={loading}
            style={FIELD_CONTROL}
          >
            <option value="entry">Entry-level (0-2 years)</option>
            <option value="mid">Mid-level (3-7 years)</option>
            <option value="senior">Senior (8+ years)</option>
          </select>
        </FormField>
      </div>

      <div style={{ margin: '16px 0' }}>
        <p className="wa-kit-field-label" style={{ marginBottom: 8 }}>
          Focus areas <span style={{ fontWeight: 400, color: 'var(--wa-muted)' }}>(optional)</span>
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {FOCUS_OPTIONS.map((opt) => {
            const selected = focusAreas.includes(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => toggleFocus(opt.id)}
                disabled={loading}
                aria-pressed={selected}
                className={KIT_BTN}
                style={{
                  ...(selected ? kitBtnSolid : kitBtnOutline),
                  opacity: loading ? 0.55 : 1,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {opt.icon}
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label
          htmlFor="difficulty"
          className="wa-kit-field-label"
          style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}
        >
          <span>Difficulty</span>
          <span style={{ fontWeight: 400, color: 'var(--wa-muted)' }}>
            {difficulty <= 3 ? 'Easy' : difficulty <= 6 ? 'Medium' : difficulty <= 8 ? 'Hard' : 'Expert'}
          </span>
        </label>
        <input
          id="difficulty"
          type="range"
          min={1}
          max={10}
          value={difficulty}
          onChange={(e) => setDifficulty(Number(e.target.value))}
          disabled={loading}
          style={{ width: '100%', accentColor: 'var(--wa-accent)' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)' }}>
          <span>Warm-up</span>
          <span>Expert</span>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 16 }}>
          <AiToolError
            error={error}
            onRetry={retryState.isRetrying ? undefined : doSubmit}
            isRetrying={retryState.isRetrying}
            nextRetryIn={retryState.nextRetryIn}
            retryCount={retryState.retryCount}
          />
        </div>
      )}
      <button
        type="submit"
        className={KIT_BTN}
        disabled={loading}
        aria-busy={loading}
        style={{
          ...kitBtnSolid,
          opacity: loading ? 0.55 : 1,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? (
          <>
            <PortalInlineSpinner size={18} />
            Generating questions…
          </>
        ) : (
          'Generate questions'
        )}
      </button>

      {questions.length > 0 && (
        <div
          className="interview-practice-output"
          style={{
            marginTop: 24,
            padding: 20,
            background: 'var(--wa-surface-2)',
            borderRadius: 'var(--wa-radius)',
            border: '1px solid var(--wa-border)',
          }}
        >
          <div
            className="interview-practice-output-header"
            style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}
          >
            <h3 style={{ flex: '1 1 100%', margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--wa-text)' }}>
              Interview questions
            </h3>
            <button type="button" className={KIT_BTN} onClick={handleCopy} style={kitBtnOutline}>
              <span aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy'}
              </span>
            </button>
            <button type="button" className={KIT_BTN} onClick={handleDownloadTxt} style={kitBtnOutline}>
              <Download size={16} aria-hidden="true" />
              Download .txt
            </button>
            <ExportPdfButton
              kit
              text={pdfExportText}
              title="Interview Practice Session"
              toolName="Interview Practice"
            />
          </div>
          <p style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', margin: '0 0 16px', lineHeight: 1.45 }}>
            STAR worksheet under each question. Included in copy, PDF, and .txt.
          </p>
          <ol className="interview-practice-list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 16 }}>
            {questions.map((q, i) => {
              const star = starByIndex[i] ?? emptyStar();
              const tone = TYPE_TONE[q.type] ?? 'muted';
              return (
                <li
                  key={i}
                  className="interview-practice-item"
                  style={{
                    margin: 0,
                    padding: 16,
                    border: '1px solid var(--wa-border)',
                    borderRadius: 'var(--wa-radius-sm)',
                    background: 'var(--wa-surface)',
                  }}
                >
                  <div
                    className="interview-practice-question"
                    style={{ fontWeight: 700, fontSize: 15, color: 'var(--wa-text)', marginBottom: 8 }}
                  >
                    {i + 1}. {q.question}
                  </div>
                  <StatusTag tone={tone}>{q.type}</StatusTag>
                  <p className="interview-practice-tip" style={{ fontSize: 'var(--wa-type-body)', color: 'var(--wa-muted)', margin: '8px 0 0', lineHeight: 1.5 }}>
                    {q.tip}
                  </p>
                  {q.starHint ? (
                    <p className="interview-practice-star" style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-accent)', margin: '8px 0 0' }}>
                      STAR hint: {q.starHint}
                    </p>
                  ) : null}
                  <details style={{ marginTop: 12 }}>
                    <summary
                      className={KIT_BTN}
                      style={{
                        ...kitBtnOutline,
                        cursor: 'pointer',
                        listStyle: 'none',
                        width: 'fit-content',
                      }}
                    >
                      STAR worksheet
                    </summary>
                    <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                      {(
                        [
                          ['situation', 'Situation — context and stakes'] as const,
                          ['task', 'Task — what you needed to achieve'] as const,
                          ['action', 'Action — what you did'] as const,
                          ['result', 'Result — outcome and metrics'] as const,
                        ] as const
                      ).map(([key, label]) => (
                        <FormField key={key} label={label} id={`star-${i}-${key}`} full>
                          <textarea
                            id={`star-${i}-${key}`}
                            value={star[key]}
                            onChange={(e) => updateStar(i, key, e.target.value)}
                            rows={key === 'action' ? 3 : 2}
                            placeholder={`Draft your ${key}`}
                            disabled={loading}
                            style={{ ...FIELD_CONTROL, minHeight: key === 'action' ? 72 : 56, resize: 'vertical' }}
                          />
                        </FormField>
                      ))}
                    </div>
                  </details>
                  {q.exampleAnswer ? (
                    <div
                      className="interview-practice-example"
                      style={{
                        marginTop: 12,
                        padding: 12,
                        background: 'var(--wa-surface-2)',
                        borderRadius: 'var(--wa-radius-sm)',
                        border: '1px solid var(--wa-border)',
                        fontSize: 'var(--wa-type-body)',
                        color: 'var(--wa-text)',
                        lineHeight: 1.5,
                      }}
                    >
                      <strong style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        Example
                      </strong>
                      <p style={{ margin: '6px 0 0' }}>{q.exampleAnswer}</p>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {!preview ? <ToolFollowThrough toolType="interview_practice" /> : null}
          {!preview ? (
            <p className="ai-result-saved" style={{ marginTop: 16, fontSize: 'var(--wa-type-body)', color: 'var(--wa-muted)' }}>
              Saved to history.{' '}
              <Link href="/dashboard/ai-tools/history" style={{ color: 'var(--wa-accent)', fontWeight: 600 }}>
                View all results
              </Link>
            </p>
          ) : null}
        </div>
      )}
    </form>
  );
}
