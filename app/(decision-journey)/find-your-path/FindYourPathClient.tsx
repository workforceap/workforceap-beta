'use client';

import { useState, useEffect } from 'react';
import LocalizedLink from '@/components/LocalizedLink';
import { trackFunnelEvent } from '@/lib/analytics/events';
import { PROGRAMS, getProgramBySlug } from '@/lib/content/programs';
import { programDisplayTitle } from '@/lib/content/programTitle';
import type { Program } from '@/lib/content/programs';
import { ProgramIcon } from '@/components/ProgramIcon';
import { mergeQuizShortAnswers, scoreQuiz, type QuizAnswers } from '@/lib/content/quizScoring';
import { getFitReasoning, getTopFitSummary } from '@/lib/content/quizReasoning';
import { getTopProgramsFromQuiz } from '@/lib/content/quizProgramRecommendations';
import type { CareerMatchResult } from '@/lib/onet/types';
import { resolveOccupationTitle, ONET_CODE_PATTERN } from '@/lib/onet/occupationTitles';
import {
  INTEREST_PROFILER_STORAGE_KEY,
  type InterestProfilerRiasec,
  type StoredInterestProfilerV1,
} from '@/lib/content/quizIpMerge';
import { getProgramExtra } from '@/lib/content/programExtras';
import { useTranslations } from 'next-intl';

const QUIZ_STORAGE_KEY = 'find_your_path_results';
const QUIZ_STORAGE_VERSION = 1;

type StoredQuizPayloadV1 = {
  version: typeof QUIZ_STORAGE_VERSION;
  programSlugs: string[];
  careerMatch: CareerMatchResult | null;
};

function isRawOnetCodeTitle(title?: string | null): boolean {
  return !!title && ONET_CODE_PATTERN.test(title.trim());
}

/** Fallback substring when we don't have a friendly role title to surface. */
const GENERIC_ROLE_LABEL = 'this role';

/** Sanitize a description in case the server inlined a raw SOC code into copy. */
function sanitizeOccupationDescription(
  description: string | null | undefined,
  friendlyTitle: string | null | undefined
): string {
  if (!description) return '';
  // Replace any inlined raw SOC code (e.g. "15-1252.00") with a human label.
  const replacement = friendlyTitle && !isRawOnetCodeTitle(friendlyTitle)
    ? friendlyTitle.toLowerCase()
    : GENERIC_ROLE_LABEL;
  return description.replace(/\b\d{2}-\d{4}\.\d{2}\b/g, replacement);
}

const INTEREST_ICONS: Record<string, string> = {
  computers: 'computer',
  health: 'health_and_safety',
  building: 'construction',
  managing: 'groups',
  data: 'query_stats',
  not_sure: 'explore',
};

const QUESTIONS = [
  {
    id: 'q1' as const,
    question: "What interests you most?",
    answers: [
      { value: 'computers' as const, label: 'Working with computers and technology' },
      { value: 'health' as const, label: 'Helping people with their health' },
      { value: 'building' as const, label: 'Building and making things with your hands' },
      { value: 'managing' as const, label: 'Managing projects and teams' },
      { value: 'data' as const, label: 'Working with data and numbers' },
      { value: 'not_sure' as const, label: "I'm not sure yet — show me everything" },
    ],
  },
  {
    id: 'q2' as const,
    question: "What's your experience level?",
    answers: [
      { value: 'brand_new' as const, label: "I'm brand new — no experience in this field" },
      { value: 'some_knowledge' as const, label: 'I have some basic knowledge but no credentials' },
      { value: 'work_experience' as const, label: 'I have work experience but no formal certification' },
      { value: 'certifications' as const, label: 'I have certifications but want to level up' },
    ],
  },
  {
    id: 'q3' as const,
    question: 'How quickly do you want to start working?',
    answers: [
      { value: 'as_fast' as const, label: 'As fast as possible — I need a job soon' },
      { value: '3_5_months' as const, label: 'I can invest 3–5 months in training' },
      { value: 'planning_ahead' as const, label: "I'm planning ahead — no rush" },
      { value: 'employed_switch' as const, label: "I'm currently employed but want to switch careers" },
    ],
  },
];

const CATEGORY_BORDER: Record<string, string> = {
  'it-cyber': '#2b7bb9',
  'it-cyber-entry': '#2b7bb9',
  'ai-software': '#8b4a9b',
  'cloud-data': '#0d9488',
  business: '#4a9b4f',
  healthcare: '#e11d48',
  manufacturing: '#ea580c',
  'digital-literacy': '#6b7280',
};

function programsFromSlugs(slugs: string[]): Program[] {
  return slugs.map((s) => getProgramBySlug(s)).filter(Boolean) as Program[];
}

function getApplyHref(slug: string) {
  return `/apply?program=${encodeURIComponent(slug)}`;
}

function readStoredIpRiasec(): InterestProfilerRiasec | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(INTEREST_PROFILER_STORAGE_KEY);
    if (!raw) return undefined;
    const p = JSON.parse(raw) as StoredInterestProfilerV1;
    if (p?.version === 1 && p.riasec) return p.riasec;
  } catch {
    return undefined;
  }
  return undefined;
}

function QuizResultsView({
  programs,
  answers,
  isPrevious,
  onRetake,
  careerMatch,
}: {
  programs: Program[];
  answers?: QuizAnswers;
  isPrevious?: boolean;
  onRetake?: () => void;
  careerMatch?: CareerMatchResult | null;
}) {
  const t = useTranslations('findYourPath');
  const topProgram = programs[0];
  const topOcc = careerMatch?.topOccupations[0];
  const topApplyHref = topProgram ? getApplyHref(topProgram.slug) : '/apply';
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const shareTitle = topProgram
    ? `My WorkforceAP career match is ${topProgram.title}`
    : 'My WorkforceAP career match results';
  const shareDescription = topProgram
    ? `I matched with ${topProgram.title} through the WorkforceAP career quiz.`
    : 'I found my best-fit training paths through the WorkforceAP career quiz.';
  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}${topProgram ? `?match=${encodeURIComponent(topProgram.slug)}` : ''}`
    : '/find-your-path';
  const shareCardSrc = `/api/og?title=${encodeURIComponent(shareTitle)}&description=${encodeURIComponent(shareDescription)}`;
  const handleShareResults = async () => {
    try {
      const nav = typeof navigator !== 'undefined'
        ? (navigator as Navigator & {
            share?: (data: ShareData) => Promise<void>;
            clipboard?: { writeText: (text: string) => Promise<void> };
          })
        : null;
      if (nav?.share) {
        await nav.share({ title: shareTitle, text: shareDescription, url: shareUrl });
        setShareStatus('Share sheet opened.');
      } else if (nav?.clipboard) {
        await nav.clipboard.writeText(shareUrl);
        setShareStatus('Share link copied.');
      } else {
        setShareStatus('Copy this link to share your results.');
      }
      trackFunnelEvent('find_your_path', 'shared_results', { program_slug: topProgram?.slug ?? 'none' });
    } catch {
      setShareStatus('Sharing was cancelled — your results are still saved on this device.');
    }
  };
  return (
    <div className="quiz-results">
      {/* Sticky retake strip — stays visible while scrolling (feedback: button was easy to miss at bottom) */}
      {isPrevious && onRetake && (
        <div
          className="fyp-retake-sticky"
          style={{
            position: 'sticky',
            top: 'calc(var(--main-nav-layout-height, 72px) + 0.5rem)',
            zIndex: 20,
            background: 'var(--surface-container-high, var(--color-light))',
            border: '2px solid var(--color-accent)',
            borderRadius: '0.75rem',
            padding: '1rem 1.25rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          }}
        >
          <div>
            <p style={{ fontWeight: 700, margin: 0, fontSize: '1.05rem' }}>Assessment on file</p>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.9rem', color: 'var(--color-on-surface-variant)' }}>
              Your results are below — retake anytime to refresh your matches.
            </p>
          </div>
          <button type="button" onClick={onRetake} className="btn btn-primary" style={{ flexShrink: 0, fontWeight: 700 }}>
            Retake assessment
          </button>
        </div>
      )}
      <style>{`
        @media (max-width: 480px) {
          .fyp-retake-sticky {
            padding: 0.625rem 0.875rem !important;
            gap: 0.5rem !important;
            margin-bottom: 1rem !important;
          }
          .fyp-retake-sticky p:first-child {
            font-size: 0.95rem !important;
          }
          .fyp-retake-sticky p:last-child {
            font-size: 0.8rem !important;
          }
          .fyp-retake-sticky button {
            padding: 0.5rem 0.75rem !important;
            font-size: 0.85rem !important;
          }
        }
      `}</style>
      <h2 className="quiz-results-title" style={{ scrollMarginTop: 'calc(var(--main-nav-layout-height, 72px) + 6rem)' }}>
        {isPrevious ? 'Your Previous Results' : 'Your career match results'}
      </h2>
      <p className="quiz-results-subtitle">
        {isPrevious
          ? 'Here are the programs we recommended last time:'
          : (answers ? getTopFitSummary(answers) : 'Based on your answers, here are the programs we recommend:')}
      </p>

      {topOcc && (() => {
        // Resolve a human-readable title, falling back to a static SOC→title
        // map so we never render a raw code like "15-1252.00" as the headline.
        const friendlyTitle = resolveOccupationTitle(topOcc.onetCode, topOcc.title);
        const headlineTitle = friendlyTitle ?? null;
        const cleanDescription = sanitizeOccupationDescription(topOcc.description, friendlyTitle);
        return (
        <div
          style={{
            marginBottom: '1.5rem',
            padding: '1.25rem 1.5rem',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--outline-variant)',
            background: 'var(--surface-container-low)',
          }}
        >
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--color-accent)' }}>
            YOUR STRONGEST ROLE MATCH
          </p>
          {headlineTitle ? (
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem' }}>{headlineTitle}</h3>
          ) : (
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem' }}>Your top career match</h3>
          )}
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', fontStyle: 'italic' }}>
            This is a starting point for the conversation with your advisor — not a final decision.
          </p>
          {cleanDescription && (
            <p style={{ margin: 0, lineHeight: 1.65, color: 'var(--color-on-surface)' }}>{cleanDescription}</p>
          )}
          {topOcc.whyFit.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <p style={{ margin: '0 0 0.35rem', fontWeight: 600, fontSize: '0.9rem' }}>Why this fits you</p>
              <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                {topOcc.whyFit.map((line, i) => (
                  <li key={i} style={{ marginBottom: '0.35rem' }}>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        );
      })()}

      {careerMatch && careerMatch.recommendedPrograms.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>Recommended path</p>
          <ol style={{ margin: 0, paddingLeft: '1.25rem', lineHeight: 1.7 }}>
            {careerMatch.recommendedPrograms.slice(0, 5).map((r) => {
              const p = getProgramBySlug(r.programSlug);
              return (
                <li key={`${r.programSlug}-${r.priority}`}>
                  {p?.title ?? programDisplayTitle(r.programSlug)}
                  {r.recommendationType === 'bridge' ? ' (foundation step)' : ''}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {topProgram && (
        <section
          aria-label="Career Wrapped story and share card"
          style={{
            margin: '0 0 2rem',
            padding: '1.25rem',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--outline-variant)',
            background: 'linear-gradient(135deg, var(--surface-container-low), rgba(173, 44, 77, 0.08))',
          }}
        >
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--color-accent)' }}>
            YOUR CAREER WRAPPED
          </p>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.35rem' }}>
            Three story slides you can share
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ padding: '1rem', borderRadius: '0.9rem', background: 'var(--surface-container)', border: '1px solid var(--outline-variant)' }}>
              <strong>1 · Your fit</strong>
              <p style={{ margin: '0.5rem 0 0', color: 'var(--color-on-surface-variant)', lineHeight: 1.5 }}>
                Your answers point toward <strong>{topProgram.categoryLabel}</strong> work.
              </p>
            </div>
            <div style={{ padding: '1rem', borderRadius: '0.9rem', background: 'var(--surface-container)', border: '1px solid var(--outline-variant)' }}>
              <strong>2 · Your match</strong>
              <p style={{ margin: '0.5rem 0 0', color: 'var(--color-on-surface-variant)', lineHeight: 1.5 }}>
                Your strongest WorkforceAP path is <strong>{topProgram.title}</strong>.
              </p>
            </div>
            <div style={{ padding: '1rem', borderRadius: '0.9rem', background: 'var(--surface-container)', border: '1px solid var(--outline-variant)' }}>
              <strong>3 · Your next step</strong>
              <p style={{ margin: '0.5rem 0 0', color: 'var(--color-on-surface-variant)', lineHeight: 1.5 }}>
                Apply in about 10 minutes, then an advisor follows up within 1–2 business days.
              </p>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', alignItems: 'center' }}>
            <div>
              <p style={{ margin: '0 0 0.75rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.6 }}>
                Share your career match or copy the link. The preview card below is rendered by the same OG image endpoint social platforms use.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
                <button type="button" className="btn btn-primary" onClick={handleShareResults}>
                  Share my career match
                </button>
                <LocalizedLink href={topApplyHref} className="btn btn-outline">
                  Get matched / apply
                </LocalizedLink>
                {shareStatus && <span role="status" style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.9rem' }}>{shareStatus}</span>}
              </div>
            </div>
            <img
              src={shareCardSrc}
              alt={`Share card preview for ${topProgram.title}`}
              style={{ width: '100%', borderRadius: '0.85rem', border: '1px solid var(--outline-variant)', boxShadow: '0 12px 30px rgba(0,0,0,0.12)' }}
            />
          </div>
        </section>
      )}

      <h3 className="quiz-results-title" style={{ fontSize: '1.1rem', marginTop: '0.5rem' }}>
        Your Top 3 WorkforceAP programs
      </h3>

      {answers && (answers.q6 === 'no_computer' || answers.q6 === 'needs_device') && (
        <div
          role="region"
          aria-label="Computer access support"
          style={{
            marginBottom: '1.5rem',
            padding: '1rem 1.25rem',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--outline-variant)',
            background: 'var(--surface-container-low)',
          }}
        >
          <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.6, color: 'var(--color-on-surface)' }}>
            <strong>Need a reliable computer for training?</strong> Ask your advisor about{' '}
            <strong>loaner or device support</strong> options — we can help you get set up for online coursework.{' '}
            <LocalizedLink href="/contact" style={{ color: 'var(--color-accent)', fontWeight: 600 }}>
              Contact us
            </LocalizedLink>{' '}
            or call <a href="tel:+15127771808">(512) 777-1808</a>.
          </p>
        </div>
      )}

      <div className="quiz-results-grid">
        {programs.map((program, idx) => {
          const rank = idx === 0 ? 'Best Match' : idx === 1 ? 'Strong Fit' : 'Also Consider';
          const borderColor = CATEGORY_BORDER[program.category] ?? program.categoryColor;
          const reasoning = answers ? getFitReasoning(program, answers) : null;
          const extra = getProgramExtra(program.slug);
          return (
            <div
              key={program.slug}
              className="quiz-result-card"
              style={{ borderLeft: `4px solid ${borderColor}` }}
            >
              <span className="quiz-result-rank">#{idx + 1} {rank}</span>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <span
                  style={{
                    background: program.categoryColor,
                    color: 'white',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '50px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}
                >
                  {program.categoryLabel}
                </span>
                <span style={{ display: 'flex', alignItems: 'center' }}>
                  <ProgramIcon program={program} size={24} />
                </span>
              </div>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>{program.title}</h3>
              {reasoning && (
                <p className="quiz-result-reasoning">{reasoning}</p>
              )}
              {extra?.rampNote && (
                <p className="quiz-result-ramp-note">{extra.rampNote}</p>
              )}
              <div style={{ fontSize: '0.9rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }} aria-hidden="true">schedule</span>
                {program.duration}
              </div>
              <div style={{ fontSize: '0.9rem', color: 'var(--color-accent)', fontWeight: 600, marginBottom: '0.5rem' }}>
                <a href="/salary-guide">Research pay and job requirements</a>
              </div>
              {extra?.jobOutcomes && extra.jobOutcomes.length > 0 && (
                <p className="quiz-result-roles">
                  <strong>Roles:</strong> {extra.jobOutcomes.join(' · ')}
                </p>
              )}
              <div style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', marginBottom: '1rem' }}>
                Partner: {program.partner}
              </div>
              <LocalizedLink
                href={getApplyHref(program.slug)}
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.75rem', fontSize: '0.9rem' }}
              >
                Apply for this path →
              </LocalizedLink>
              <LocalizedLink
                href={`/programs/${program.slug}`}
                className="quiz-result-detail-link"
              >
                View full program details →
              </LocalizedLink>
            </div>
          );
        })}
      </div>

      {/* Conversion section — confidence + clear next step */}
      {topProgram && (
        <div className="quiz-results-cta">
          <p className="quiz-results-cta-lead">
            Your strongest match is <strong>{topProgram.title}</strong>. Review the curriculum and occupational requirements, then discuss your next step with an advisor.
          </p>
          <p className="quiz-results-cta-sub">
            Choose the track that fits you best, then we’ll follow up within 1–2 business days.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
            <LocalizedLink href={topApplyHref} className="btn btn-primary btn-large">
              Start {topProgram.title} Application →
            </LocalizedLink>
            <LocalizedLink href="/contact" className="btn btn-outline btn-large">
              Talk to an advisor first
            </LocalizedLink>
          </div>
          {programs.length > 1 && (
            <div style={{ marginTop: '1rem' }}>
              <p className="quiz-results-cta-sub" style={{ marginBottom: '0.75rem' }}>
                Or apply to a different matched program:
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
                {programs.slice(0, 3).map((program) => (
                  <LocalizedLink
                    key={program.slug}
                    href={getApplyHref(program.slug)}
                    className="quiz-result-detail-link"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '0.55rem 0.85rem',
                      borderRadius: '999px',
                      border: '1px solid var(--outline-variant)',
                      textDecoration: 'none',
                    }}
                  >
                    Apply for {program.title}
                  </LocalizedLink>
                ))}
              </div>
            </div>
          )}
          <p className="quiz-results-cta-phone">
            <a href="tel:+15127771808">Prefer to talk first? Call (512) 777-1808</a>
          </p>
        </div>
      )}

      <div className="quiz-results-next-steps">
        <p>
          Use the comparison page to review tracks side-by-side — time, difficulty, and best-for notes.
          Then use the salary guide to research occupational pay and job requirements.
        </p>
        <div className="quiz-results-next-links">
          <LocalizedLink href="/program-comparison">Compare programs</LocalizedLink>
          <LocalizedLink href="/salary-guide">Salary guide</LocalizedLink>
        </div>
      </div>

      <div className="quiz-results-footer">
        {isPrevious && onRetake ? (
          <>
            <p>Want to retake the quiz?</p>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ color: 'var(--color-primary)', borderColor: 'var(--outline-variant)' }}
              onClick={onRetake}
            >
              Retake Quiz
            </button>
          </>
        ) : (
          <>
            <p>Not seeing what you expected?</p>
            <LocalizedLink href="/programs" className="btn btn-outline">
              Browse All 20 Programs →
            </LocalizedLink>
          </>
        )}
      </div>
      <p className="quiz-results-note">{t('programsFootnote')}</p>
    </div>
  );
}

export default function FindYourPathClient({ idPrefix = 'fyp' }: { idPrefix?: string }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    trackFunnelEvent('find_your_path', 'viewed', { id_prefix: idPrefix });
  }, [idPrefix]);
  const [answers, setAnswers] = useState<Partial<QuizAnswers>>({});
  const [storedResults, setStoredResults] = useState<Program[] | null>(null);
  const [careerMatchResult, setCareerMatchResult] = useState<CareerMatchResult | null>(null);
  const [finishingQuiz, setFinishingQuiz] = useState(false);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  /** Selected option for current question — confirmed with Continue (not auto-advanced). */
  const [pendingChoice, setPendingChoice] = useState<QuizAnswers[keyof QuizAnswers] | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(QUIZ_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (
          parsed &&
          typeof parsed === 'object' &&
          'version' in parsed &&
          (parsed as StoredQuizPayloadV1).version === QUIZ_STORAGE_VERSION &&
          Array.isArray((parsed as StoredQuizPayloadV1).programSlugs)
        ) {
          const v1 = parsed as StoredQuizPayloadV1;
          const programs = programsFromSlugs(v1.programSlugs);
          if (programs.length > 0) {
            setStoredResults(programs);
            setCareerMatchResult(v1.careerMatch ?? null);
          }
        } else if (Array.isArray(parsed) && parsed.length >= 3) {
          const programs = parsed.map((slug: string) => getProgramBySlug(slug)).filter(Boolean) as Program[];
          if (programs.length >= 3) {
            setStoredResults(programs);
          }
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const topOcc = careerMatchResult?.topOccupations?.[0];
    if (!topOcc?.onetCode || !isRawOnetCodeTitle(topOcc.title)) return;

    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(`/api/careers/occupation/${encodeURIComponent(topOcc.onetCode)}`);
        if (!res.ok) return;
        const fresh = (await res.json()) as { title?: string; description?: string };
        if (!fresh?.title || isRawOnetCodeTitle(fresh.title) || cancelled) return;

        setCareerMatchResult((prev) => {
          if (!prev?.topOccupations?.length) return prev;
          const next: CareerMatchResult = {
            ...prev,
            topOccupations: prev.topOccupations.map((occ, idx) =>
              idx === 0 && occ.onetCode === topOcc.onetCode
                ? {
                    ...occ,
                    title: fresh.title ?? occ.title,
                    description: fresh.description ?? occ.description,
                  }
                : occ
            ),
          };
          try {
            const current = localStorage.getItem(QUIZ_STORAGE_KEY);
            if (current) {
              const parsed = JSON.parse(current) as StoredQuizPayloadV1;
              if (parsed?.version === QUIZ_STORAGE_VERSION) {
                localStorage.setItem(
                  QUIZ_STORAGE_KEY,
                  JSON.stringify({
                    ...parsed,
                    careerMatch: next,
                  })
                );
              }
            }
          } catch {
            // ignore storage update issues
          }
          return next;
        });
      } catch {
        // ignore friendly-title refresh failures
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [careerMatchResult]);

  const currentQ = QUESTIONS[step];
  const currentAnswer = currentQ ? answers[currentQ.id] : undefined;

  useEffect(() => {
    setPendingChoice(null);
  }, [step]);

  const advanceFromAnswer = (value: QuizAnswers[keyof QuizAnswers]) => {
    if (!currentQ) return;
    const newAnswers = { ...answers, [currentQ.id]: value };
    setAnswers(newAnswers);
    setDirection('next');

    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
    } else {
      const fullAnswers = mergeQuizShortAnswers(newAnswers as Pick<QuizAnswers, 'q1' | 'q2' | 'q3'>);
      const weights = scoreQuiz(fullAnswers);
      trackFunnelEvent('find_your_path', 'quiz_completed', {
        answer_count: Object.keys(fullAnswers).length,
        id_prefix: idPrefix,
      });
      setFinishingQuiz(true);
      void (async () => {
        let careerMatch: CareerMatchResult | null = null;
        try {
          const ipRiasec = readStoredIpRiasec();
          const res = await fetch('/api/careers/recommend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...fullAnswers,
              ...(ipRiasec ? { ipRiasec } : {}),
            }),
          });
          if (res.ok) {
            careerMatch = (await res.json()) as CareerMatchResult;
          }
        } catch {
          careerMatch = null;
        }

        const slugsFromApi = careerMatch?.recommendedPrograms.map((r) => r.programSlug) ?? [];
        let programs =
          slugsFromApi.length > 0
            ? programsFromSlugs(slugsFromApi.slice(0, 3))
            : getTopProgramsFromQuiz(weights, fullAnswers);

        if (programs.length < 3) {
          const fallback = getTopProgramsFromQuiz(weights, fullAnswers);
          for (const p of fallback) {
            if (programs.length >= 3) break;
            if (!programs.find((x) => x.slug === p.slug)) programs.push(p);
          }
          programs = programs.slice(0, 3);
        }

        trackFunnelEvent('find_your_path', 'results_ready', {
          recommended_program_slugs: programs.map((p) => p.slug),
          used_career_match_api: slugsFromApi.length > 0,
          id_prefix: idPrefix,
        });
        setCareerMatchResult(careerMatch);
        setStoredResults(programs);
        try {
          const payload: StoredQuizPayloadV1 = {
            version: QUIZ_STORAGE_VERSION,
            programSlugs: programs.map((p) => p.slug),
            careerMatch,
          };
          localStorage.setItem(QUIZ_STORAGE_KEY, JSON.stringify(payload));
        } catch {
          // ignore
        }
        setFinishingQuiz(false);
      })();
    }
  };

  const handleSelect = (value: QuizAnswers[keyof QuizAnswers]) => {
    setPendingChoice(value);
  };

  const handleConfirmStep = () => {
    if (pendingChoice === null) return;
    advanceFromAnswer(pendingChoice);
    setPendingChoice(null);
  };

  const handleBack = () => {
    setDirection('prev');
    setPendingChoice(null);
    if (step > 0) {
      setStep(step - 1);
    }
  };

  if (finishingQuiz) {
    return (
      <>
        <div className="quiz-flow" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Building your career match…</p>
          <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.95rem' }}>
            We&rsquo;re aligning your answers with real roles and WorkforceAP programs.
          </p>
        </div>
      </>
    );
  }

  if (storedResults && step === QUESTIONS.length - 1 && currentAnswer) {
    return (
      <>
        <QuizResultsView
          programs={storedResults}
          answers={answers as QuizAnswers}
          careerMatch={careerMatchResult}
        />
      </>
    );
  }

  if (storedResults && step === 0 && Object.keys(answers).length === 0) {
    return (
      <>
        <QuizResultsView
          programs={storedResults}
          isPrevious
          careerMatch={careerMatchResult}
          onRetake={() => {
            setStoredResults(null);
            setCareerMatchResult(null);
            setAnswers({});
            setStep(0);
            try {
              localStorage.removeItem(QUIZ_STORAGE_KEY);
            } catch {}
          }}
        />
      </>
    );
  }

  const progressPct = ((step + 1) / QUESTIONS.length) * 100;
  const stepLabel = String(step + 1).padStart(2, '0');

  return (
    <>

      <div className={`quiz-flow ${direction === 'prev' ? 'quiz-slide-prev' : 'quiz-slide-next'}`}>
        {/* Step + progress indicator */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem',
        }}>
          <span style={{
            fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-accent)',
            whiteSpace: 'nowrap', letterSpacing: '0.04em',
          }}>
            Step {stepLabel}/{String(QUESTIONS.length).padStart(2, '0')}
          </span>
          <div style={{
            flex: 1, height: '4px', background: 'var(--surface-container-highest)',
            borderRadius: '2px', overflow: 'hidden',
          }}>
            <div style={{
              width: `${progressPct}%`, height: '100%',
              background: 'var(--color-accent)',
              borderRadius: '2px',
              transition: 'width 0.35s ease',
            }} />
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>
            {Math.round(progressPct)}%
          </span>
        </div>

        {/* Quiz card */}
        <div style={{
          background: 'var(--surface-container)', borderRadius: 'var(--radius-xl)',
          padding: '2rem', border: '1px solid var(--surface-container-highest)',
        }}>
          <h2 id={`${idPrefix}-question-heading`} className="quiz-question" style={{ marginBottom: '1.5rem' }}>{currentQ?.question}</h2>
          <div
            className="quiz-answers"
            role="radiogroup"
            aria-labelledby={`${idPrefix}-question-heading`}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
          >
            {currentQ?.answers.map((a) => {
              const inputId = `${idPrefix}-${currentQ.id}-${a.value}`;
              const icon = currentQ.id === 'q1' ? INTEREST_ICONS[a.value] : null;
              const isSelected = pendingChoice === a.value;
              return (
                <label
                  key={a.value}
                  htmlFor={inputId}
                  className={`quiz-answer-card ${isSelected ? 'selected' : ''}`}
                  role="radio"
                  aria-checked={isSelected}
                  onClick={(e) => {
                    e.preventDefault();
                    handleSelect(a.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelect(a.value);
                    }
                  }}
                  tabIndex={0}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.875rem 1rem',
                    background: isSelected ? 'rgba(173,44,77,0.15)' : 'var(--surface-container-low)',
                    border: isSelected ? '1px solid var(--color-accent)' : '1px solid var(--surface-container-highest)',
                    borderRadius: 'var(--radius-lg)',
                    cursor: 'pointer', transition: 'all 0.15s ease',
                  }}
                >
                  <input
                    id={inputId}
                    type="radio"
                    name={currentQ.id}
                    value={a.value}
                    checked={isSelected}
                    readOnly
                    tabIndex={-1}
                    aria-hidden="true"
                    style={{ display: 'none' }}
                  />
                  {icon && (
                    <span className="material-symbols-outlined" style={{
                      fontSize: '1.25rem',
                      color: isSelected ? 'var(--color-accent)' : 'var(--color-on-surface-variant)',
                    }} aria-hidden="true">{icon}</span>
                  )}
                  <span className="radio-dot" aria-hidden style={{ display: 'none' }} />
                  <span style={{ fontSize: '0.9rem' }}>{a.label}</span>
                </label>
              );
            })}
          </div>

          {pendingChoice !== null && currentQ && (
            <div
              style={{
                marginTop: '1.25rem',
                padding: '1rem 1.25rem',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--surface-container-low)',
                border: '1px solid var(--outline-variant)',
              }}
            >
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: 'var(--color-on-surface-variant)' }}>
                Your answer for this step:
              </p>
              <p style={{ margin: '0 0 1rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>
                {currentQ.answers.find((x) => x.value === pendingChoice)?.label ?? ''}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
                <button type="button" className="btn btn-primary btn-small" onClick={handleConfirmStep}>
                  {step < QUESTIONS.length - 1 ? 'Continue to next question' : 'See my results'}
                </button>
                <button type="button" className="btn btn-ghost btn-small" onClick={() => setPendingChoice(null)}>
                  Choose a different answer
                </button>
              </div>
            </div>
          )}

          {/* Back / Continue buttons */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: '1.5rem', paddingTop: '1rem',
            borderTop: '1px solid var(--surface-container-highest)',
          }}>
            {step > 0 ? (
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={handleBack}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">arrow_back</span>
                Back
              </button>
            ) : <span />}
            <span style={{ fontSize: '0.8rem', color: 'var(--color-on-surface-variant)' }}>
              {pendingChoice === null ? 'Select an option, then confirm below' : 'Confirm your answer to continue'}
            </span>
          </div>
        </div>

        {/* Vertical side progress (desktop) — rendered below on mobile, could be positioned via CSS */}
        <div style={{
          display: 'flex', gap: '2rem', marginTop: '2rem',
          flexWrap: 'wrap',
        }}>
          {['Interest', 'Experience', 'Timeline'].map((label, i) => (
            <div key={label} style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
            }}>
              <div style={{
                width: '1.5rem', height: '1.5rem', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.7rem', fontWeight: 700,
                background: i <= step ? 'var(--color-accent)' : 'var(--surface-container-highest)',
                color: i <= step ? 'white' : 'var(--color-on-surface-variant)',
                transition: 'all 0.2s ease',
              }}>{i + 1}</div>
              <span style={{
                fontSize: '0.75rem',
                color: i === step ? 'var(--color-on-surface)' : 'var(--color-on-surface-variant)',
                fontWeight: i === step ? 700 : 400,
              }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
