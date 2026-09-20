'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { trackFunnelEvent } from '@/lib/analytics/events';
import { getProgramBySlug } from '@/lib/content/programs';
import {
  INTEREST_PROFILER_STORAGE_KEY,
  MINI_IP_MAX_PER_DIMENSION,
  riasecToRadarAxes,
  type StoredInterestProfilerV1,
  type InterestProfilerRiasec,
} from '@/lib/content/quizIpMerge';

const PUBLIC_IP_STORAGE_KEY = 'workforceap_public_interest_profiler_v1';

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

export default function PublicInterestProfilerClient() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [step, setStep] = useState(0);
  const [digits, setDigits] = useState<number[]>(() => Array(30).fill(3));
  const [submitting, setSubmitting] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [score, setScore] = useState<ScoreResponse | null>(null);

  const persistRiasec = useCallback((payload: ScoreResponse, answers: string) => {
    if (!payload.riasec) return;
    try {
      const row: StoredInterestProfilerV1 = {
        version: 1,
        answers,
        riasec: payload.riasec,
        completedAt: new Date().toISOString(),
      };
      localStorage.setItem(PUBLIC_IP_STORAGE_KEY, JSON.stringify(row));
    } catch {
      // ignore quota / privacy mode
    }
  }, []);

  const handleSubmit = async () => {
    const answerString = digits.slice(0, questions.length).join('');
    if (answerString.length !== 30) return;
    setSubmitting(true);
    setScoreError(null);
    trackFunnelEvent('interest_profiler', 'submitted', { surface: 'portal_public' });
    try {
      const res = await fetch('/api/public/interest-profiler/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: answerString }),
      });
      const data = (await res.json()) as ScoreResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not score answers');
      trackFunnelEvent('interest_profiler', 'completed', {
        surface: 'portal_public',
        quiz_result: data.result?.[0]?.code ?? 'unknown',
      });
      setScore(data);
      persistRiasec(data, answerString);
    } catch (e) {
      trackFunnelEvent('interest_profiler', 'errored', { surface: 'portal_public' });
      setScoreError(e instanceof Error ? e.message : 'Scoring failed');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/public/interest-profiler/questions');
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
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <p style={{ color: 'var(--color-on-surface-variant)' }} role="status">
        Loading Interest Profiler questions…
      </p>
    );
  }

  if (!loadError && questions.length > 0 && questions.length !== 30) {
    return (
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          O*NET Interest Profiler
        </h1>
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
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          O*NET Interest Profiler
        </h1>
        <p style={{ color: '#b91c1c' }}>{loadError}</p>
        <p style={{ marginTop: '1rem', fontSize: '0.95rem', lineHeight: 1.6 }}>
          The Interest Profiler is provided by the U.S. Department of Labor through O*NET Web Services. Your site needs a
          valid <code>ONET_API_KEY</code> to load questions.
        </p>
      </div>
    );
  }

  if (score) {
    const maxRiasec = Math.max(1, ...score.result.map((r) => r.score));
    return (
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          Your interest profile
        </h1>
        <p style={{ color: 'var(--color-on-surface-variant)', marginBottom: '1rem', lineHeight: 1.65 }}>
          Here are your RIASEC interest scores from the Mini Interest Profiler (30 questions). Want to save them and use them to find training programs? Join WorkforceAP — it is free and takes about 2 minutes.
        </p>

        <div style={{ marginBottom: '1.5rem' }}>
          <Link
            href="/apply"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.25rem',
              borderRadius: '0.75rem',
              background: '#8c0f37',
              color: '#fff',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Join WorkforceAP — free
          </Link>
          <span style={{ marginLeft: '0.75rem', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
            or <Link href="/programs" style={{ fontWeight: 600, color: '#8c0f37' }}>browse programs</Link>
          </span>
        </div>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>Interest areas</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {score.result.map((r) => (
              <li key={r.code} style={{ marginBottom: '0.75rem' }}>
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
                      background: 'linear-gradient(90deg, #8c0f37, #ad2c4d)',
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>

        {score.careers.length > 0 && (
          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem' }}>
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
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem' }}>WorkforceAP programs</h2>
          {score.programSlugs.length === 0 ? (
            <p style={{ lineHeight: 1.65 }}>
              No mapped programs yet for these career codes — your counselor can still help you choose a track. Try{' '}
              <Link href="/find-your-path" style={{ fontWeight: 600, color: '#8c0f37' }}>
                Find Your Path
              </Link>{' '}
              for a quick program match.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {score.programSlugs.map((slug) => {
                const p = getProgramBySlug(slug);
                if (!p) return null;
                return (
                  <li key={slug} style={{ marginBottom: '0.5rem' }}>
                    <Link href={`/programs/${slug}`} style={{ fontWeight: 600, color: '#8c0f37' }}>
                      {p.title}
                    </Link>
                    <span style={{ color: 'var(--color-on-surface-variant)', marginLeft: 8 }}>{p.categoryLabel}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div style={{ padding: '1rem 1.125rem', background: 'rgba(173,44,77,0.07)', border: '1px solid rgba(173,44,77,0.15)', borderRadius: '0.875rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}>
          <span className="material-symbols-outlined" style={{ color: '#8c0f37', fontSize: '1.375rem', flexShrink: 0, marginTop: '0.125rem', fontVariationSettings: "'FILL' 1" }}>radar</span>
          <div>
            <p style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-on-surface)', margin: '0 0 0.25rem' }}>
              Save your results
            </p>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: 0, lineHeight: 1.5 }}>
              Create a free WorkforceAP account to save your profile, compare it against any occupation, and get a personalized training plan.
            </p>
          </div>
        </div>

        <p style={{ fontSize: '0.8125rem', lineHeight: 1.6, color: 'var(--color-on-surface-variant)' }}>
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
  const total = questions.length || 30;
  const progress = total ? ((step + 1) / total) * 100 : 0;

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
        O*NET Interest Profiler (Mini)
      </h1>
      <p style={{ color: 'var(--color-on-surface-variant)', marginBottom: '1.25rem', lineHeight: 1.65 }}>
        Rate how much you would enjoy each activity. There are {total} questions; allow about 10 minutes. Your answers stay in this browser until you submit.
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
            background: '#8c0f37',
            transition: 'width 0.2s ease',
          }}
        />
      </div>

      {q && (
        <div
          style={{
            padding: '1.25rem 1rem',
            borderRadius: '0.75rem',
            border: '1px solid var(--outline-variant)',
            background: 'var(--surface-container-low)',
            marginBottom: '1.25rem',
          }}
        >
          {q.area && (
            <p style={{ fontSize: '0.8125rem', fontWeight: 700, letterSpacing: '0.06em', color: '#8c0f37', margin: '0 0 0.5rem' }}>
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
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.875rem 1rem',
                  borderRadius: '0.75rem',
                  border: selected ? '2px solid #8c0f37' : '1px solid var(--outline-variant)',
                  background: selected ? 'rgba(140, 15, 55, 0.06)' : 'var(--surface)',
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
                  style={{ display: 'none' }}
                />
                <span
                  style={{
                    width: '28px', height: '28px', borderRadius: '9999px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                    background: selected ? '#8c0f37' : 'var(--surface-container-highest, #e5e2e1)',
                    color: selected ? '#fff' : 'var(--color-on-surface-variant)',
                    fontSize: '0.8125rem', fontWeight: 700,
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  {v}
                </span>
                <span style={{ fontWeight: selected ? 600 : 400, color: selected ? '#8c0f37' : 'var(--color-on-surface)' }}>
                  {label}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {scoreError && (
        <p style={{ color: '#b91c1c', marginBottom: '1rem' }} role="alert">
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
            disabled={submitting}
            onClick={() => void handleSubmit()}
          >
            {submitting ? 'Scoring…' : 'See results'}
          </button>
        )}
        <span style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
          Question {step + 1} of {total}
        </span>
      </div>
    </div>
  );
}
