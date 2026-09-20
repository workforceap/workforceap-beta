'use client';

import { useState } from 'react';
import type { MouseEvent as ReactMouseEvent, KeyboardEvent as ReactKeyboardEvent, TouchEvent as ReactTouchEvent } from 'react';
import Link from 'next/link';
import { safeParseResponseJson } from '@/lib/http/safeFetchJson';
import { trackFunnelEvent } from '@/lib/analytics/events';
import { getProgramBySlug } from '@/lib/content/programs';
import {
  QUIZ_QUESTIONS,
  SCALE_LABELS,
  areasToTypeSlug,
  buildCareerPlanApplyHref,
  buildCareerPlanSteps,
  buildCommitmentShareText,
} from '@/lib/career/careerQuizRules';

const ACCENT = '#8c0f37';

// Spotify-Wrapped-style gradient per slide.
const SLIDE_BG = [
  'linear-gradient(160deg,#7a5cff,#ff5d8f)', // intro
  'linear-gradient(160deg,#06d6a0,#1b9aaa)', // type
  'linear-gradient(160deg,#ff9e00,#e63946)', // careers
  'linear-gradient(160deg,#284b8c,#06d6a0)', // plan
  'linear-gradient(160deg,#a01142,#5e0a26)', // finale
];

type ScoreResponse = {
  careers: { code: string; title: string; fit?: string }[];
  careersTotal: number;
  // O*NET RIASEC scores keyed by lowercase area name, e.g. { realistic: 10, investigative: 7, ... }
  riasec: Record<string, number>;
  programSlugs: string[];
};

export default function PublicCareerQuizClient({ friendType }: { friendType?: string | null }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<(string | null)[]>(Array(QUIZ_QUESTIONS.length).fill(null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<ScoreResponse | null>(null);
  const [shared, setShared] = useState(false);
  const [slide, setSlide] = useState(0);
  const [touchX, setTouchX] = useState<number | null>(null);

  async function submit(finalAnswers: (string | null)[]) {
    setLoading(true);
    setError(null);
    trackFunnelEvent('career_quiz', 'submitted', { surface: 'portal_public' });
    try {
      const res = await fetch('/api/public/career-quiz/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: finalAnswers.join('') }),
      });
      const parsed = await safeParseResponseJson<ScoreResponse | { error: string }>(res);
      if (!res.ok || !parsed.ok || !parsed.data || 'error' in parsed.data) {
        const msg = parsed.data && 'error' in parsed.data ? parsed.data.error : 'Something went wrong.';
        trackFunnelEvent('career_quiz', 'errored', { surface: 'portal_public' });
        setError(msg);
      } else {
        const riasec = parsed.data.riasec ?? {};
        const topAreas = Object.entries(riasec)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map(([area]) => area);
        trackFunnelEvent('career_quiz', 'completed', {
          surface: 'portal_public',
          quiz_result: areasToTypeSlug(topAreas),
        });
        setScore(parsed.data);
        setSlide(0);
      }
    } catch {
      trackFunnelEvent('career_quiz', 'errored', { surface: 'portal_public' });
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }

  function answer(value: number) {
    if (step === 0) trackFunnelEvent('career_quiz', 'started', { surface: 'portal_public' });
    const next = [...answers];
    next[step] = String(value);
    setAnswers(next);
    if (step + 1 < QUIZ_QUESTIONS.length) {
      setStep(step + 1);
    } else {
      submit(next);
    }
  }

  function restart() {
    setAnswers(Array(QUIZ_QUESTIONS.length).fill(null));
    setStep(0);
    setScore(null);
    setError(null);
    setSlide(0);
  }

  // ── Results: Spotify-Wrapped-style swipeable story ─────────────────────────
  if (score) {
    const topAreas = Object.entries(score.riasec ?? {})
      .filter(([, v]) => typeof v === 'number')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([area]) => area.charAt(0).toUpperCase() + area.slice(1));

    const typeLabel = topAreas.join(' & ');
    const typeSlug = areasToTypeSlug(topAreas);
    const topCareerMatch = score.careers[0] ?? null;
    const topCareer = topCareerMatch?.title ?? '';
    const selectedProgramSlug = score.programSlugs.find((slug) => getProgramBySlug(slug)) ?? null;
    const selectedProgram = selectedProgramSlug ? getProgramBySlug(selectedProgramSlug) : null;
    const selectedProgramTitle = selectedProgram?.title ?? null;
    const applyHref = buildCareerPlanApplyHref({
      typeSlug,
      topCareer: topCareerMatch,
      programSlug: selectedProgramSlug,
    });
    const planSteps = buildCareerPlanSteps({ topCareerTitle: topCareer, selectedProgramTitle, applyHref });
    const shownCareers = score.careers.slice(0, 3);
    const moreCount = Math.max(0, (score.careersTotal || score.careers.length) - shownCareers.length);

    const shareUrl =
      typeof window !== 'undefined' && typeSlug
        ? `${window.location.origin}/career-quiz?type=${typeSlug}${topCareer ? `&c=${encodeURIComponent(topCareer)}` : ''}`
        : typeof window !== 'undefined'
          ? `${window.location.origin}/career-quiz`
          : '';
    const shareText = buildCommitmentShareText({
      typeLabel,
      topCareerTitle: topCareer,
      shareUrl,
    });

    async function shareResult() {
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({ title: 'WorkforceAP Career Quiz', text: shareText, url: shareUrl });
          return;
        } catch {
          /* user cancelled or unsupported — fall through to copy */
        }
      }
      try {
        await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      } catch {
        /* clipboard blocked */
      }
    }

    const last = SLIDE_BG.length - 1;
    const next = () => setSlide((s) => Math.min(s + 1, last));
    const prev = () => setSlide((s) => Math.max(s - 1, 0));

    // Tap left third = back, rest = forward — but never hijack a real link/button tap.
    function onTap(e: ReactMouseEvent<HTMLDivElement>) {
      if ((e.target as HTMLElement).closest('a,button')) return;
      const r = e.currentTarget.getBoundingClientRect();
      if (e.clientX - r.left < r.width * 0.3) prev();
      else next();
    }
    function onKey(e: ReactKeyboardEvent<HTMLDivElement>) {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    }
    function onTouchEnd(e: ReactTouchEvent<HTMLDivElement>) {
      if (touchX === null) return;
      const dx = e.changedTouches[0].clientX - touchX;
      if (dx < -40) next();
      else if (dx > 40) prev();
      setTouchX(null);
    }

    const eyebrow = (t: string) => (
      <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 2, opacity: 0.82, textTransform: 'uppercase' }}>{t}</div>
    );
    const hint = (t: string) => (
      <div style={{ fontSize: 15, opacity: 0.85, fontWeight: 600 }}>{t}</div>
    );
    const spacer = <div style={{ flex: 1 }} />;

    const slides = [
      // 0 — intro
      <>
        {eyebrow('WorkforceAP · Career Quiz')}
        {spacer}
        <div style={{ fontSize: 'clamp(2.4rem,9vw,3.4rem)', fontWeight: 900, lineHeight: 1.05 }}>Your results<br />are in 🎉</div>
        <div style={{ fontSize: 19, opacity: 0.9, fontWeight: 600, marginTop: 16 }}>6 questions. Here&apos;s what fits you.</div>
        {spacer}
        {hint('Tap to reveal →')}
      </>,
      // 1 — type
      <>
        {eyebrow('Your career type')}
        {spacer}
        <div style={{ fontSize: 26, fontWeight: 700, opacity: 0.9 }}>You lean</div>
        <div style={{ fontSize: 'clamp(2rem,8.5vw,3.1rem)', fontWeight: 900, lineHeight: 1.04, marginTop: 6, overflowWrap: 'anywhere' }}>
          {topAreas[0]}
          {topAreas[1] ? <><br /><span style={{ color: '#ffd166' }}>&amp; {topAreas[1]}</span></> : null}
        </div>
        {topCareer ? (
          <div style={{ alignSelf: 'flex-start', marginTop: 22, background: 'rgba(255,255,255,0.2)', padding: '10px 20px', borderRadius: 999, fontSize: 17, fontWeight: 700 }}>
            Top match: {topCareer}
          </div>
        ) : null}
        {spacer}
        {hint('Tap to see your careers →')}
      </>,
      // 2 — careers
      <>
        {eyebrow('Careers that fit you')}
        {spacer}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {shownCareers.map((c, i) => (
            <div key={c.code} style={{ fontSize: 'clamp(1.6rem,6vw,2.2rem)', fontWeight: 900, lineHeight: 1.15 }}>
              {i + 1} · {c.title}
            </div>
          ))}
        </div>
        {moreCount > 0 ? <div style={{ fontSize: 18, opacity: 0.9, fontWeight: 600, marginTop: 22 }}>+ {moreCount} more matched to your type</div> : null}
        {spacer}
        {hint('Tap for your free path →')}
      </>,
      // 3 — career plan
      <>
        {eyebrow('Your career plan')}
        {spacer}
        <div style={{ fontSize: 'clamp(1.7rem,7vw,2.45rem)', fontWeight: 900, lineHeight: 1.12, marginBottom: 18 }}>
          Your {typeLabel || 'WorkforceAP'} career plan
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          {planSteps.map((planStep, i) => (
            <div key={planStep.key} style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.28)', borderRadius: 16, padding: '12px 14px' }}>
              <div style={{ fontSize: 13, opacity: 0.82, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>Step {i + 1}</div>
              <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.35, marginTop: 3 }}>{planStep.label}</div>
            </div>
          ))}
        </div>
        {spacer}
        {hint('Tap to save or share →')}
      </>,
      // 4 — finale / share
      <>
        {eyebrow(typeLabel || 'Your match')}
        {spacer}
        <div style={{ fontSize: 'clamp(1.9rem,7vw,2.6rem)', fontWeight: 900, lineHeight: 1.12 }}>
          {topCareer ? <>You could train toward <span style={{ color: '#ffd166' }}>{topCareer}</span> — at no cost. 🎓</> : <>You could train for a great-fit career <span style={{ color: '#ffd166' }}>at no cost</span>. 🎓</>}
        </div>
        {selectedProgramTitle ? (
          <div style={{ alignSelf: 'flex-start', marginTop: 18, background: 'rgba(255,255,255,0.2)', padding: '10px 18px', borderRadius: 999, fontSize: 16, fontWeight: 800 }}>
            Recommended next step: {selectedProgramTitle}
          </div>
        ) : null}
        {spacer}
        <Link href={applyHref} style={{ display: 'block', textAlign: 'center', background: '#fff', color: ACCENT, fontWeight: 800, fontSize: 19, padding: 16, borderRadius: 14, textDecoration: 'none' }}>
          Save my free career plan
        </Link>
        <button type="button" onClick={shareResult} style={{ marginTop: 12, width: '100%', background: 'rgba(255,255,255,0.18)', color: '#fff', fontWeight: 800, fontSize: 19, padding: 16, borderRadius: 14, border: 'none', cursor: 'pointer' }}>
          {shared ? 'Commitment copied! ✅' : '📤 Share my commitment'}
        </button>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 16, fontSize: 13, opacity: 0.85 }}>
          <button type="button" onClick={restart} style={{ background: 'none', border: 'none', color: '#fff', textDecoration: 'underline', cursor: 'pointer', fontSize: 13 }}>Retake</button>
          <Link href="/interest-profiler" style={{ color: '#fff', textDecoration: 'underline' }}>Full 30-q version</Link>
        </div>
      </>,
    ];

    return (
      <div>
        <style dangerouslySetInnerHTML={{ __html: '@keyframes wrappedIn{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}' }} />
        <div
          tabIndex={0}
          role="group"
          aria-label="Your career quiz results — tap or swipe to advance"
          onClick={onTap}
          onKeyDown={onKey}
          onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
          onTouchEnd={onTouchEnd}
          style={{ position: 'relative', width: '100%', maxWidth: 440, margin: '0 auto', height: 'min(82vh, 860px)', borderRadius: 20, overflow: 'hidden', outline: 'none', cursor: 'pointer', userSelect: 'none', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
        >
          {/* story progress segments */}
          <div style={{ position: 'absolute', top: 16, left: 18, right: 18, zIndex: 2, display: 'flex', gap: 6 }}>
            {SLIDE_BG.map((_, i) => (
              <div key={i} style={{ flex: 1, height: 4, borderRadius: 9, background: i <= slide ? '#fff' : 'rgba(255,255,255,0.32)' }} />
            ))}
          </div>
          {/* active slide */}
          <div
            key={slide}
            style={{ position: 'absolute', inset: 0, background: SLIDE_BG[slide], color: '#fff', display: 'flex', flexDirection: 'column', padding: '54px 28px 36px', animation: 'wrappedIn .45s ease both' }}
          >
            {slides[slide]}
          </div>
        </div>
      </div>
    );
  }

  // ── Quiz ─────────────────────────────────────────────────────────────────
  const q = QUIZ_QUESTIONS[step];
  const progress = Math.round((step / QUIZ_QUESTIONS.length) * 100);

  return (
    <div>
      {friendType && step === 0 && (
        <div className="portal-card portal-card--flat" style={{ padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
          A friend’s career type is <strong>{friendType}</strong>. Find yours below 👇
        </div>
      )}
      <h1 style={{ fontSize: '1.6rem', marginBottom: '0.35rem' }}>Quick career quiz</h1>
      <p style={{ color: 'var(--color-on-surface-variant)', marginBottom: '1.25rem' }}>
        6 quick questions. No account needed.
      </p>

      <div style={{ height: 6, background: 'var(--color-outline)', borderRadius: 999, marginBottom: '1.5rem' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: ACCENT, borderRadius: 999, transition: 'width 0.2s' }} />
      </div>

      {error && (
        <p role="alert" style={{ color: ACCENT, marginBottom: '1rem' }}>
          {error}{' '}
          <button type="button" onClick={() => submit(answers)} style={{ textDecoration: 'underline', background: 'none', border: 0, color: ACCENT, cursor: 'pointer' }}>
            Retry
          </button>
        </p>
      )}

      <p style={{ fontSize: '0.8125rem', fontWeight: 700, color: ACCENT, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
        Question {step + 1} of {QUIZ_QUESTIONS.length}
      </p>
      <p style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1.25rem', lineHeight: 1.45 }}>
        How much would you enjoy this? <br />“{q.prompt}”
      </p>

      <div style={{ display: 'grid', gap: '0.5rem' }} aria-busy={loading}>
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            disabled={loading}
            onClick={() => answer(v)}
            className="btn"
            style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '0.7rem 1rem', opacity: loading ? 0.6 : 1 }}
          >
            {SCALE_LABELS[v]}
          </button>
        ))}
      </div>

      {loading && (
        <p style={{ marginTop: '1rem', color: 'var(--color-on-surface-variant)' }}>Scoring your answers…</p>
      )}
    </div>
  );
}
