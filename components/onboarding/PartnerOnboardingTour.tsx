'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Slide data                                                        */
/* ------------------------------------------------------------------ */

type Slide = {
  accent: string;
  emoji: string;
  eyebrow: string;
  title: string;
  body: string;
};

const SLIDES: Slide[] = [
  {
    accent: '#6366f1',
    emoji: '👋',
    eyebrow: 'Welcome',
    title: 'Your partner dashboard',
    body: 'Track referrals, monitor member progress, and measure outcomes — all from a single command center designed for workforce partners.',
  },
  {
    accent: '#0ea5e9',
    emoji: '🚀',
    eyebrow: 'Pipeline',
    title: 'Member pipeline at a glance',
    body: 'See every referred member flow through enrollment, training, and placement stages in real time. No more spreadsheets.',
  },
  {
    accent: '#10b981',
    emoji: '🏆',
    eyebrow: 'Outcomes',
    title: 'Milestones & outcomes',
    body: 'Celebrate completions, certifications, and job placements. Surface the metrics that matter to your funders and stakeholders.',
  },
  {
    accent: '#f59e0b',
    emoji: '🔗',
    eyebrow: 'Referrals',
    title: 'Share your referral link',
    body: 'Every partner gets a unique referral link. Share it with prospective members and watch your pipeline grow automatically.',
  },
];

/** ~7.5s × 4 slides ≈ 30s intro before the last slide stays for “Get started” */
const SLIDE_DURATION = 7500; // ms

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export type PartnerOnboardingTourProps = {
  onComplete: () => void;
};

export default function PartnerOnboardingTour({ onComplete }: PartnerOnboardingTourProps) {
  const [current, setCurrent] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [progress, setProgress] = useState(0); // 0-1 for current slide
  const startTimeRef = useRef(Date.now());
  const rafRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  /* ---- close & complete ---- */
  const close = useCallback(() => {
    if (exiting) return;
    setExiting(true);
    fetch('/api/onboarding/tour-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portal: 'partner' }),
    }).catch(() => {});
    setTimeout(() => onComplete(), 350);
  }, [exiting, onComplete]);

  /* ---- go to slide ---- */
  const goTo = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= SLIDES.length) return;
      setCurrent(idx);
      setProgress(0);
      startTimeRef.current = Date.now();
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (idx < SLIDES.length - 1) {
          goTo(idx + 1);
        }
        // last slide stays until user clicks Get started
      }, SLIDE_DURATION);
    },
    []  
  );

  /* ---- auto-advance timer on mount ---- */
  useEffect(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setTimeout(() => goTo(1), SLIDE_DURATION);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [goTo]);

  /* ---- progress bar animation (rAF) ---- */
  useEffect(() => {
    const tick = () => {
      const elapsed = Date.now() - startTimeRef.current;
      setProgress(Math.min(elapsed / SLIDE_DURATION, 1));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [current]);

  /* ---- keyboard ---- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        if (current < SLIDES.length - 1) goTo(current + 1);
        else close();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (current > 0) goTo(current - 1);
      } else if (e.key === 'Escape') {
        close();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [current, goTo, close]);

  const slide = SLIDES[current];
  const isLast = current === SLIDES.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Partner onboarding tour"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(6px)',
        opacity: exiting ? 0 : 1,
        transition: 'opacity 0.35s ease',
      }}
    >
      {/* Card */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 520,
          margin: '0 16px',
          background: 'var(--surface-container-low, #1e1e2e)',
          borderRadius: 'var(--radius-md, 12px)',
          boxShadow: 'var(--shadow-lg, 0 8px 32px rgba(0,0,0,.4))',
          overflow: 'hidden',
          color: 'var(--color-on-surface, #e0e0e0)',
        }}
      >
        {/* Progress bars */}
        <div style={{ display: 'flex', gap: 4, padding: '12px 16px 0' }}>
          {SLIDES.map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                background: 'rgba(255,255,255,0.15)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  borderRadius: 2,
                  background: slide.accent,
                  width:
                    i < current
                      ? '100%'
                      : i === current
                        ? `${progress * 100}%`
                        : '0%',
                  transition: i < current ? 'none' : undefined,
                }}
              />
            </div>
          ))}
        </div>

        {/* Skip */}
        <button type="button"
          onClick={close}
          style={{
            position: 'absolute',
            top: 12,
            right: 16,
            background: 'none',
            border: 'none',
            color: 'var(--color-on-surface, #e0e0e0)',
            opacity: 0.6,
            cursor: 'pointer',
            fontSize: 13,
            fontFamily: 'inherit',
          }}
        >
          Skip
        </button>

        {/* Slide content */}
        <div
          key={current}
          style={{
            padding: '36px 32px 24px',
            textAlign: 'center',
            animation: 'partnerTourFadeIn 0.4s ease',
          }}
        >
          <div style={{ fontSize: 48, lineHeight: 1, marginBottom: 12 }}>{slide.emoji}</div>
          <p
            style={{
              fontSize: 13,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: slide.accent,
              marginBottom: 6,
            }}
          >
            {slide.eyebrow}
          </p>
          <h2
            style={{
              fontSize: 22,
              fontWeight: 700,
              margin: '0 0 10px',
              color: 'var(--color-white, #fff)',
            }}
          >
            {slide.title}
          </h2>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.55,
              opacity: 0.82,
              maxWidth: 400,
              margin: '0 auto',
            }}
          >
            {slide.body}
          </p>
        </div>

        {/* Bottom bar: dots + CTA */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 32px 24px',
          }}
        >
          {/* Dots */}
          <div style={{ display: 'flex', gap: 8 }}>
            {SLIDES.map((_, i) => (
              <button type="button"
                key={i}
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => goTo(i)}
                style={{
                  width: i === current ? 20 : 8,
                  height: 8,
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  background: i === current ? slide.accent : 'rgba(255,255,255,0.25)',
                  transition: 'width 0.25s ease, background 0.25s ease',
                  padding: 0,
                }}
              />
            ))}
          </div>

          {/* CTA */}
          {isLast ? (
            <button type="button"
              onClick={close}
              style={{
                background: slide.accent,
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-md, 8px)',
                padding: '10px 24px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Get started
            </button>
          ) : (
            <button type="button"
              onClick={() => goTo(current + 1)}
              style={{
                background: 'transparent',
                color: slide.accent,
                border: `1px solid ${slide.accent}`,
                borderRadius: 'var(--radius-md, 8px)',
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Next →
            </button>
          )}
        </div>
      </div>

      {/* Keyframe animation */}
      <style>{`
        @keyframes partnerTourFadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
