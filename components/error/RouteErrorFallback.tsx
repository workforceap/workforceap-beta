'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';

export type ErrorContext =
  | 'public'
  | 'portal'
  | 'dashboard'
  | 'counselor'
  | 'employer'
  | 'partner'
  | 'admin'
  | 'auth'
  | 'decision-journey';

const CONTEXT_CONFIG: Record<
  ErrorContext,
  {
    homeHref: string;
    homeLabel: string;
    altHref?: string;
    altLabel?: string;
    title: string;
    subtitle: string;
  }
> = {
  public: {
    homeHref: '/',
    homeLabel: 'Back to home',
    title: 'Something went wrong',
    subtitle: 'We couldn\'t load this page',
  },
  portal: {
    homeHref: '/dashboard',
    homeLabel: 'Member dashboard',
    altHref: '/',
    altLabel: 'WorkforceAP home',
    title: 'Something went wrong',
    subtitle: 'The portal hit an unexpected error',
  },
  dashboard: {
    homeHref: '/dashboard',
    homeLabel: 'Back to dashboard',
    altHref: '/',
    altLabel: 'WorkforceAP home',
    title: 'Something went wrong',
    subtitle: 'The member dashboard hit an unexpected error',
  },
  counselor: {
    homeHref: '/counselor',
    homeLabel: 'Back to counselor overview',
    altHref: '/dashboard',
    altLabel: 'Member dashboard',
    title: 'Something went wrong',
    subtitle: 'The counselor portal hit an unexpected error',
  },
  employer: {
    homeHref: '/employer',
    homeLabel: 'Back to employer overview',
    altHref: '/employers',
    altLabel: 'Employer marketing page',
    title: 'Something went wrong',
    subtitle: 'The employer portal hit an unexpected error',
  },
  partner: {
    homeHref: '/partner',
    homeLabel: 'Back to partner overview',
    altHref: '/',
    altLabel: 'WorkforceAP home',
    title: 'Something went wrong',
    subtitle: 'The partner portal hit an unexpected error',
  },
  admin: {
    homeHref: '/admin',
    homeLabel: 'Back to admin',
    altHref: '/dashboard',
    altLabel: 'Member dashboard',
    title: 'Admin — something went wrong',
    subtitle: 'The admin panel hit an unexpected error',
  },
  auth: {
    homeHref: '/login',
    homeLabel: 'Back to login',
    altHref: '/',
    altLabel: 'WorkforceAP home',
    title: 'Something went wrong',
    subtitle: 'The sign-in page hit an unexpected error',
  },
  'decision-journey': {
    homeHref: '/',
    homeLabel: 'Back to home',
    altHref: '/programs',
    altLabel: 'Browse programs',
    title: 'Something went wrong',
    subtitle: 'This page hit an unexpected error',
  },
};

interface RouteErrorFallbackProps {
  error: Error & { digest?: string };
  reset: () => void;
  context: ErrorContext;
}

/**
 * Consistent, responsive error fallback for Next.js App Router error.tsx.
 * Logs to Sentry, shows friendly message, reload + home buttons.
 * Uses design system tokens for mobile-first styling.
 */
export default function RouteErrorFallback({
  error,
  reset,
  context,
}: RouteErrorFallbackProps) {
  const config = CONTEXT_CONFIG[context];

  useEffect(() => {
    // Log to Sentry if available; fallback to console in dev
    try {
      Sentry.captureException(error);
    } catch {
      /* Sentry may not be initialized in edge cases */
    }
    if (process.env.NODE_ENV === 'development') {
      console.error(error);
    }
  }, [error]);

  const handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <div
      className="route-error-fallback"
      data-portal-error-state="route-boundary"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        background: 'var(--surface-container-lowest, #ffffff)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '28rem',
          textAlign: 'center',
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: '3.5rem',
            height: '3.5rem',
            borderRadius: '999px',
            background:
              'color-mix(in srgb, var(--color-accent, #2563eb) 10%, transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1rem',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: '1.75rem',
              color: 'var(--color-accent, #2563eb)',
              fontVariationSettings: "'FILL' 1",
            }}
            aria-hidden="true"
          >
            error
          </span>
        </div>

        {/* Text */}
        <p
          style={{
            fontSize: '0.8125rem',
            fontWeight: 800,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--color-accent, #2563eb)',
            margin: '0 0 0.5rem',
          }}
        >
          {config.title}
        </p>
        <h1
          style={{
            fontSize: 'clamp(1.125rem, 4vw, 1.5rem)',
            fontWeight: 800,
            color: 'var(--color-on-surface, #1a1a1a)',
            margin: '0 0 0.75rem',
            lineHeight: 1.2,
          }}
        >
          {config.subtitle}
        </h1>
        <p
          style={{
            fontSize: '0.9375rem',
            color: 'var(--color-on-surface-variant, #525252)',
            lineHeight: 1.6,
            margin: '0 0 1.5rem',
          }}
        >
          Please try again. If it keeps happening, contact{' '}
          <a
            href="mailto:info@workforceap.org"
            style={{
              color: 'var(--color-accent, #2563eb)',
              fontWeight: 700,
              textDecoration: 'underline',
            }}
          >
            info@workforceap.org
          </a>
          {error.digest ? (
            <>
              {' '}
              and mention reference{' '}
              <strong
                style={{
                  fontFamily: 'monospace',
                  fontSize: '0.8125rem',
                  color: 'var(--color-on-surface, #1a1a1a)',
                }}
              >
                {error.digest}
              </strong>
            </>
          ) : (
            '.'
          )}
        </p>

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            justifyContent: 'center',
          }}
        >
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => reset()}
            style={{ minHeight: 44, flex: '1 1 auto', maxWidth: '12rem' }}
          >
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: '1rem',
                fontVariationSettings: "'FILL' 1",
                verticalAlign: 'middle',
                marginRight: '0.25rem',
              }}
              aria-hidden="true"
            >
              refresh
            </span>
            Try again
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={handleReload}
            style={{ minHeight: 44, flex: '1 1 auto', maxWidth: '12rem' }}
          >
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: '1rem',
                fontVariationSettings: "'FILL' 1",
                verticalAlign: 'middle',
                marginRight: '0.25rem',
              }}
              aria-hidden="true"
            >
              restart_alt
            </span>
            Reload page
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            justifyContent: 'center',
            marginTop: '1.25rem',
          }}
        >
          <Link
            href={config.homeHref}
            className="btn btn-ghost btn-sm"
            style={{ minHeight: 36 }}
          >
            {config.homeLabel}
          </Link>
          {config.altHref && (
            <Link
              href={config.altHref}
              className="btn btn-ghost btn-sm"
              style={{ minHeight: 36 }}
            >
              {config.altLabel}
            </Link>
          )}
          <a
            href="mailto:info@workforceap.org"
            className="btn btn-ghost btn-sm"
            style={{ minHeight: 36 }}
          >
            Email support
          </a>
        </div>
      </div>
    </div>
  );
}
