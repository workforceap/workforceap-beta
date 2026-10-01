'use client';

import LocalizedLink from '@/components/LocalizedLink';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import LegacyGlyph from '@/components/icons/LegacyGlyph';

export type ProgramsJourneyStep = 'quiz' | 'programs' | 'detail' | 'compare' | 'salary';

function pathToStep(pathname: string | null): ProgramsJourneyStep {
  if (!pathname) return 'programs';
  // Strip the next-intl locale prefix so /en/salary-guide matches the same
  // step as /salary-guide. Without this, the production URLs (always locale-
  // prefixed) never match any case and fall through to the 'programs' default
  // — making "Browse Programs" appear active on every page.
  const path = pathname.replace(/^\/(en|es|fr|pt)(?=\/|$)/, '');
  // Canonical pathfinder is /find-your-path (Next decision-journey). Keep
  // /career-quiz as an alias highlight so secondary quiz deep-links still mark Path.
  if (path === '/find-your-path' || path === '/career-quiz') return 'quiz';
  if (path === '/programs') return 'programs';
  if (path.startsWith('/programs/')) return 'detail';
  if (path === '/program-comparison') return 'compare';
  if (path === '/salary-guide') return 'salary';
  return 'programs';
}

/**
 * Persistent tab switcher across the decision-journey route group.
 * Lives in the shared layout so it never unmounts during soft navigation.
 * Auto-detects the active tab from the URL via usePathname().
 */
export default function ProgramsDecisionJourneyNav({
  current,
  quizPhase,
}: {
  current?: ProgramsJourneyStep;
  quizPhase?: 'in_progress' | 'results';
} = {}) {
  const pathname = usePathname();
  const resolved = current ?? pathToStep(pathname);

  /* Hide on scroll-down, show on scroll-up */
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setHidden(y > 120 && y > lastY.current);
      lastY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const steps: { id: ProgramsJourneyStep; label: string; mobileLabel: string; icon: string; href: string }[] = [
    { id: 'quiz', label: 'Find Your Path', mobileLabel: 'Path', icon: 'explore', href: '/find-your-path' },
    { id: 'programs', label: 'Browse Programs', mobileLabel: 'Programs', icon: 'school', href: '/programs' },
    { id: 'compare', label: 'Compare Tracks', mobileLabel: 'Compare', icon: 'compare_arrows', href: '/program-comparison' },
    { id: 'salary', label: 'Salary Context', mobileLabel: 'Salary', icon: 'payments', href: '/salary-guide' },
  ];

  return (
    <nav className={`pdj-nav${hidden ? ' pdj-nav--hidden' : ''}`} aria-label="Steps to choose a program">
      <ol className="pdj-nav__list">
        {steps.map((s) => {
          const isQuizInProgress = resolved === 'quiz' && quizPhase === 'in_progress';
          const isHere =
            (resolved === 'detail' && s.id === 'programs') ||
            (isQuizInProgress ? s.id === 'quiz' : resolved === s.id);
          return (
            <li key={s.id}>
              <LocalizedLink
                href={s.href}
                prefetch={s.id === 'quiz' || s.id === 'programs'}
                scroll={false}
                className={`pdj-nav__tab${isHere ? ' pdj-nav__tab--active' : ''}`}
                aria-current={
                  resolved !== 'detail' && (isQuizInProgress ? s.id === 'quiz' : resolved === s.id) ? 'step' : undefined
                }
              >
                <LegacyGlyph name={s.icon} size={20} strokeWidth={isHere ? 2.5 : 2} className="pdj-nav__icon" />
                <span className="pdj-nav__label pdj-nav__label--desktop">{s.label}</span>
                <span className="pdj-nav__label pdj-nav__label--mobile">{s.mobileLabel}</span>
              </LocalizedLink>
            </li>
          );
        })}
      </ol>
      {resolved === 'detail' && (
        <p className="pdj-nav__hint">You are viewing a single program — compare below when you want tradeoffs.</p>
      )}

      <style>{`
        .pdj-nav {
          position: sticky;
          top: calc(var(--main-nav-layout-height) + 0.5rem);
          z-index: 40;
          background: color-mix(in srgb, var(--surface-container-high) 92%, transparent);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(222, 191, 194, 0.35);
          border-radius: var(--radius-xl);
          padding: 0.5rem;
          margin: 0 auto 1.5rem;
          max-width: 720px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.06);
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
        }

        .pdj-nav--hidden {
          transform: translateY(-120%);
          opacity: 0;
          pointer-events: none;
        }

        html.dark .pdj-nav {
          border-color: rgba(255, 255, 255, 0.08);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
        }

        .pdj-nav__list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          align-items: stretch;
          gap: 0.25rem;
        }

        .pdj-nav__tab {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.625rem 1rem;
          border-radius: var(--radius-lg);
          text-decoration: none;
          font-weight: 600;
          font-size: 0.8125rem;
          color: var(--color-on-surface-variant);
          background: transparent;
          transition: background var(--transition-fast), color var(--transition-fast), box-shadow var(--transition-fast);
          white-space: nowrap;
          min-height: 44px;
          flex: 1;
          justify-content: center;
        }

        .pdj-nav__tab:hover {
          background: var(--surface-container-highest);
          color: var(--color-on-surface);
        }

        .pdj-nav__tab--active {
          background: rgba(173, 44, 77, 0.15);
          color: var(--wa-accent-text);
          font-weight: 700;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
        }

        .pdj-nav__tab--active:hover {
          background: rgba(173, 44, 77, 0.2);
          color: var(--wa-accent-text);
        }

        .pdj-nav__icon {
          width: 1.25rem;
          height: 1.25rem;
          flex-shrink: 0;
        }

        .pdj-nav__label--mobile {
          display: none;
        }

        .pdj-nav__tab--active .pdj-nav__icon {
          color: var(--wa-accent-text);
        }

        .pdj-nav__hint {
          margin: 0.5rem 0.5rem 0;
          font-size: 0.8125rem;
          color: var(--color-on-surface-variant);
          line-height: 1.4;
          text-align: center;
        }

        @media (max-width: 639px) {
          .pdj-nav {
            /* Keep the sticky + hide-on-scroll-down / show-on-scroll-up
               behavior on mobile too. Previously this block set
               position: relative which put the nav in document flow,
               so the translateY(-120%) hide animation looked broken
               (the nav would scroll out with the page and then jitter
               on scroll-up). Now matches desktop: stick below the
               main header and slide cleanly. */
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            border-radius: var(--radius-lg);
            margin: 0.75rem 0.5rem 1rem;
            max-width: none;
            padding: 0.5rem 0.375rem;
          }
          .pdj-nav::-webkit-scrollbar { display: none; }

          .pdj-nav__list {
            flex-wrap: nowrap;
            min-width: 100%;
          }

          .pdj-nav__label {
            font-size: 0.8125rem;
            letter-spacing: 0;
          }

          .pdj-nav__label--desktop {
            display: none;
          }

          .pdj-nav__label--mobile {
            display: inline;
          }

          .pdj-nav__tab {
            flex: 1 1 0;
            padding: 0.5rem 0.25rem;
            min-width: auto;
            flex-direction: column;
            gap: 0.2rem;
            font-size: 0.8125rem;
          }

          .pdj-nav__icon {
            width: 1.125rem;
            height: 1.125rem;
          }
        }
      `}</style>
    </nav>
  );
}
