'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';
import styles from './InterestProfilerClient.module.css';
import { getProgramBySlug } from '@/lib/content/programs';
import {
  INTEREST_PROFILER_STORAGE_KEY,
  MINI_IP_MAX_PER_DIMENSION,
  riasecToRadarAxes,
  type StoredInterestProfilerV1,
  type InterestProfilerRiasec,
} from '@/lib/content/quizIpMerge';

type QuestionRow = { id: string; text: string; area?: string };

type ScoreResponse = {
  result: { code: string; title: string; description?: string; score: number }[];
  careers: { code: string; title: string; fit?: string }[];
  careersTotal: number;
  riasec: InterestProfilerRiasec | null;
  programSlugs: string[];
};

const LIKERT = [
  { v: 1, label: 'Strongly dislike' },
  { v: 2, label: 'Dislike' },
  { v: 3, label: 'Unsure' },
  { v: 4, label: 'Like' },
  { v: 5, label: 'Strongly like' },
] as const;

export default function InterestProfilerClient() {
  const tCommon = useTranslations('common');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [step, setStep] = useState(0);
  const [digits, setDigits] = useState<number[]>(() => Array(30).fill(3));
  const [submitting, setSubmitting] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [score, setScore] = useState<ScoreResponse | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const exportResultsPdf = useCallback(async (payload: ScoreResponse) => {
    if (!payload.riasec) return;
    setExportingPdf(true);
    setExportError(null);
    try {
      const radarValues = riasecToRadarAxes(payload.riasec);
      const riasecLines = payload.result.map((r) => `${r.title}: ${r.score} of ${MINI_IP_MAX_PER_DIMENSION}`);
      const careerLines = payload.careers.slice(0, 15).map((c) => {
        const fit = c.fit ? ` — ${c.fit}` : '';
        return `${c.title} (${c.code})${fit}`;
      });
      const programLines = payload.programSlugs
        .map((slug) => {
          const program = getProgramBySlug(slug);
          return program ? `${program.title} — ${program.categoryLabel}` : null;
        })
        .filter((line): line is string => Boolean(line));

      const text = [
        'Mini O*NET Interest Profiler — 30 questions',
        '',
        '## Your RIASEC interest scores',
        ...riasecLines,
        '',
        ...(careerLines.length
          ? ['## Sample career matches (from O*NET)', ...careerLines, '']
          : []),
        ...(programLines.length
          ? ['## Mapped WorkforceAP programs', ...programLines, '']
          : []),
        '## How to use this',
        'These results are saved to your Skill Profile and blended into the Skill Mapper radar so you can compare against any O*NET occupation.',
      ].join('\n');

      const response = await fetch('/api/ai/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Interest Profiler Results',
          toolName: 'Interest Profiler',
          text,
          chartData: {
            type: 'radar',
            axes: radarValues.map((a) => a.axis),
            series: [
              {
                label: 'Your interest profile',
                values: radarValues.map((a) => ({ axis: a.axis, value: a.value })),
              },
            ],
          },
        }),
      });
      if (!response.ok) throw new Error(`Export failed (${response.status})`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `workforceap-interest-profiler-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(requestFailureMessage(err, { connection: tCommon('connectionError'), fallback: 'Could not generate PDF' }, 'interest-profiler-export'));
    } finally {
      setExportingPdf(false);
    }
  }, [tCommon]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/member/interest-profiler/questions');
        const data = (await res.json()) as { questions?: QuestionRow[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? 'Failed to load');
        if (!data.questions?.length) throw new Error('No questions available');
        if (!cancelled) {
          setQuestions(data.questions);
          setDigits((d) => {
            const next = [...d];
            while (next.length < data.questions!.length) next.push(3);
            return next.slice(0, data.questions!.length);
          });
        }
      } catch (e) {
        if (!cancelled) setLoadError(requestFailureMessage(e, { connection: tCommon('connectionError'), fallback: 'Failed to load' }, 'interest-profiler-questions'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tCommon]);

  const total = questions.length || 30;
  const answerString = digits.slice(0, total).join('');

  const persistRiasec = useCallback((payload: ScoreResponse, answers: string) => {
    if (!payload.riasec) return;
    try {
      const row: StoredInterestProfilerV1 = {
        version: 1,
        answers,
        riasec: payload.riasec,
        completedAt: new Date().toISOString(),
      };
      localStorage.setItem(INTEREST_PROFILER_STORAGE_KEY, JSON.stringify(row));
    } catch {
      // ignore quota / privacy mode
    }
  }, []);

  const handleSubmit = async () => {
    if (answerString.length !== 30) return;
    setSubmitting(true);
    setScoreError(null);
    try {
      const res = await fetch('/api/member/interest-profiler/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: answerString }),
      });
      const data = (await res.json()) as ScoreResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not score answers');
      setScore(data);
      persistRiasec(data, answerString);
    } catch (e) {
      setScoreError(requestFailureMessage(e, { connection: tCommon('connectionError'), fallback: 'Scoring failed' }, 'interest-profiler-score'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div aria-busy="true" aria-label="Loading Interest Profiler questions">
        <span className="skeleton skeleton-text" style={{ display: 'block', width: '60%', height: '1.75rem', marginBottom: '0.75rem' }} />
        <span className="skeleton skeleton-text" style={{ display: 'block', width: '95%', height: '1rem', marginBottom: '0.4rem' }} />
        <span className="skeleton skeleton-text" style={{ display: 'block', width: '80%', height: '1rem', marginBottom: '1.5rem' }} />
        <span className="skeleton skeleton-rounded" style={{ display: 'block', height: '6px', marginBottom: '1.25rem' }} />
        <span className="skeleton skeleton-rounded" style={{ display: 'block', height: '5.5rem', marginBottom: '1.25rem' }} />
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="skeleton skeleton-rounded" style={{ display: 'block', height: '3.25rem', marginBottom: '0.5rem' }} />
        ))}
      </div>
    );
  }

  if (!loadError && questions.length > 0 && questions.length !== 30) {
    return (
      <div>
        <h2 className="portal-page-title" style={{ marginBottom: '0.5rem' }}>
          O*NET Interest Profiler
        </h2>
        <p style={{ lineHeight: 1.65 }}>
          The Mini Interest Profiler should load exactly 30 questions; this session received {questions.length}. Please
          refresh the page or try again later.
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        <h2 className="portal-page-title" style={{ marginBottom: '0.5rem' }}>
          O*NET Interest Profiler
        </h2>
        <p style={{ color: 'var(--color-error)' }}>{loadError}</p>
        <p style={{ marginTop: '1rem', fontSize: '0.95rem', lineHeight: 1.6 }}>
          The Interest Profiler is provided by the U.S. Department of Labor through O*NET Web Services. Your site needs a
          valid <code>ONET_API_KEY</code> to load questions.
        </p>
      </div>
    );
  }

  if (score) {
    const maxRiasec = Math.max(
      1,
      ...score.result.map((r) => r.score)
    );
    return (
      <div>
        <h2 className="portal-page-title" style={{ marginBottom: '0.5rem' }}>
          Your interest profile
        </h2>
        <p style={{ color: 'var(--color-on-surface-variant)', marginBottom: '1rem', lineHeight: 1.65 }}>
          Here are your RIASEC interest scores from the Mini Interest Profiler (30 questions). Results are also saved in
          this browser for when you use <Link href="/find-your-path">Find Your Path</Link> — we blend them gently with that
          quiz so recommendations stay aligned with both your interests and your situation.
        </p>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            alignItems: 'center',
            marginBottom: '1.5rem',
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void exportResultsPdf(score)}
            disabled={exportingPdf || !score.riasec}
            aria-label="Download results as PDF"
            aria-busy={exportingPdf}
          >
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '1.1rem', marginRight: '0.4rem', verticalAlign: '-3px' }}>
              file_download
            </span>
            <span aria-live="polite">
              {exportingPdf ? 'Preparing PDF…' : 'Download PDF'}
            </span>
          </button>
          {exportError && (
            <span role="alert" style={{ color: 'var(--color-error)', fontSize: '0.85rem' }}>
              {exportError}
            </span>
          )}
        </div>

        <section style={{ marginBottom: '2rem' }}>
          <h2 className="wa-text-lg wa-font-semibold" style={{ marginBottom: '1rem' }}>
            Interest areas
          </h2>
          <ul className="wa-space-y-3" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {score.result.map((r) => (
              <li key={r.code}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{r.title}</span>
                  <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.9rem' }}>{r.score}</span>
                </div>
                <div
                  style={{
                    height: 8,
                    borderRadius: 4,
                    background: 'var(--outline-variant)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${(r.score / maxRiasec) * 100}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, var(--color-accent-dark), var(--color-accent))',
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>

        {score.careers.length > 0 && (
          <section style={{ marginBottom: '2rem' }}>
            <h2 className="wa-text-lg wa-font-semibold" style={{ marginBottom: '0.5rem' }}>
              Sample career matches ({score.careers.length}
              {score.careersTotal > score.careers.length ? ` of ${score.careersTotal}` : ''})
            </h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.75rem' }}>
              From O*NET — not an employer list. Use them as exploration anchors.
            </p>
            <ul style={{ paddingLeft: '1.25rem', lineHeight: 1.7 }}>
              {score.careers.slice(0, 12).map((c) => (
                <li key={c.code}>
                  {c.title} <span style={{ color: 'var(--color-on-surface-variant)' }}>({c.code})</span>
                  {c.fit ? ` — ${c.fit}` : ''}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section style={{ marginBottom: '2rem' }}>
          <h2 className="wa-text-lg wa-font-semibold" style={{ marginBottom: '0.75rem' }}>
            WorkforceAP programs
          </h2>
          {score.programSlugs.length === 0 ? (
            <p style={{ lineHeight: 1.65 }}>
              No mapped programs yet for these career codes — your counselor can still help you choose a track. Try{' '}
              <Link href="/find-your-path" style={{ fontWeight: 600 }}>
                Find Your Path
              </Link>{' '}
              for a quick program match.
            </p>
          ) : (
            <ul className="wa-space-y-2" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {score.programSlugs.map((slug) => {
                const p = getProgramBySlug(slug);
                if (!p) return null;
                return (
                  <li key={slug}>
                    <Link href={`/programs/${slug}`} style={{ fontWeight: 600, color: 'var(--color-accent)' }}>
                      {p.title}
                    </Link>
                    <span style={{ color: 'var(--color-on-surface-variant)', marginLeft: 8 }}>{p.categoryLabel}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Skill profile connection */}
        <div style={{ padding: '1rem 1.125rem', background: 'rgba(173,44,77,0.07)', border: '1px solid rgba(173,44,77,0.15)', borderRadius: '0.875rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--color-accent)', fontSize: '1.375rem', flexShrink: 0, marginTop: '0.125rem', fontVariationSettings: "'FILL' 1" }}>radar</span>
          <div>
            <p style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-on-surface)', margin: '0 0 0.25rem' }}>
              Your answers are feeding your Skill Profile
            </p>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: 0, lineHeight: 1.5 }}>
              These results have been saved and blended into your radar chart in the{' '}
              <Link href="/dashboard/ai-tools/skill-mapper" style={{ color: 'var(--color-accent)', fontWeight: 700 }}>
                Skill Mapper
              </Link>
              . Go there to compare your profile against any O*NET occupation.
            </p>
          </div>
        </div>

        <p style={{ fontSize: '0.8rem', lineHeight: 1.6, color: 'var(--color-on-surface-variant)' }}>
          O*NET Interest Profiler™ is a trademark of the U.S. Department of Labor. This site uses O*NET Web Services under
          the terms described at{' '}
          <a href="https://services.onetcenter.org/help/license" target="_blank" rel="noopener noreferrer">
            services.onetcenter.org
          </a>
          .
        </p>
      </div>
    );
  }

  const q = questions[step];
  const progress = total ? ((step + 1) / total) * 100 : 0;

  return (
    <div>
      <h2 className="portal-page-title" style={{ marginBottom: '0.5rem' }}>
        O*NET Interest Profiler (Mini)
      </h2>
      <p style={{ color: 'var(--color-on-surface-variant)', marginBottom: '1.25rem', lineHeight: 1.65 }}>
        Rate how much you would enjoy each activity. There are {total} questions; allow about 10 minutes. Your answers
        stay in your browser until you submit; after scoring, we save a summary so Find Your Path can use it.
      </p>

      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: 'var(--outline-variant)',
          marginBottom: '1.5rem',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: '100%',
            background: 'var(--color-accent-dark)',
            transition: 'width 0.2s ease',
          }}
        />
      </div>

      {q && (
        <div
          style={{
            padding: '1.25rem 1rem',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--outline-variant)',
            background: 'var(--surface-container-low)',
            marginBottom: '1.25rem',
          }}
        >
          {q.area && (
            <p style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--color-accent-dark)', margin: '0 0 0.5rem' }}>
              {q.area}
            </p>
          )}
          <p style={{ margin: 0, fontSize: '1.05rem', lineHeight: 1.55, fontWeight: 500 }}>{q.text}</p>
        </div>
      )}

      <fieldset style={{ border: 'none', padding: 0, margin: '0 0 1.25rem' }}>
        <legend style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem' }}>
          How would you feel about this kind of work?
        </legend>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          {LIKERT.map(({ v, label }) => {
            const selected = digits[step] === v;
            return (
              <label
                key={v}
                className={styles.likertOption}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.875rem 1rem',
                  borderRadius: '0.75rem',
                  border: selected ? '2px solid var(--color-accent-dark)' : '1px solid var(--outline-variant)',
                  background: selected ? 'rgba(140, 15, 55, 0.06)' : 'var(--surface-container-lowest)',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  transition: 'border-color 0.15s, background 0.15s',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <input
                  type="radio"
                  name={`ip-q-${step}`}
                  checked={selected}
                  onChange={() => {
                    setDigits((prev) => {
                      const next = [...prev];
                      next[step] = v;
                      return next;
                    });
                  }}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  style={{
                    width: '28px', height: '28px', borderRadius: '9999px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                    background: selected ? 'var(--color-accent-dark)' : 'var(--surface-container-highest, #e5e2e1)',
                    color: selected ? '#fff' : 'var(--color-on-surface-variant)',
                    fontSize: '0.75rem', fontWeight: 700,
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  {v}
                </span>
                <span style={{ fontWeight: selected ? 600 : 400, color: selected ? 'var(--color-accent-dark)' : 'var(--color-on-surface)' }}>
                  {label}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {scoreError && (
        <p style={{ color: 'var(--color-error)', marginBottom: '1rem' }} role="alert">
          {scoreError}
        </p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          Back
        </button>
        {step < total - 1 ? (
          <button type="button" className="btn btn-primary" onClick={() => setStep((s) => s + 1)}>
            Next
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={submitting || answerString.length !== 30}
            onClick={() => void handleSubmit()}
          >
            {submitting ? 'Scoring…' : 'See results'}
          </button>
        )}
        <span style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', fontVariantNumeric: 'tabular-nums' }} aria-live="polite">
          Question {step + 1} of {total}
        </span>
      </div>
    </div>
  );
}
