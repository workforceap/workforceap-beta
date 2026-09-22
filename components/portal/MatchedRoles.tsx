'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { KitEmptyState } from '@/components/portal/kit';

type MatchedJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  locationType: string;
  matchPct: number;
};

export default function MatchedRoles() {
  const t = useTranslations('empty');
  const [jobs, setJobs] = useState<MatchedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Bumped by "Try again" on the failed-load state; the effect re-runs the fetch.
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    fetch('/api/member/matched-jobs', { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data.jobs)) setJobs(data.jobs);
      })
      .catch(() => setLoadError(true))
      .finally(() => {
        clearTimeout(timeout);
        setLoading(false);
      });

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);

  if (loading) {
    return (
      <section className="dashboard-matched-roles" aria-busy="true" aria-label="Finding jobs that match your skills" style={{ marginTop: '1.5rem' }}>
        <h2 className="dashboard-today-label">Roles that match you</h2>
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                padding: '1rem 1.25rem',
                background: 'var(--surface-container)',
                borderRadius: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
              }}
            >
              <div style={{ flex: 1 }}>
                <div className="portal-skeleton portal-skeleton--line" style={{ width: '60%', height: '1rem', marginBottom: '0.5rem' }} />
                <div className="portal-skeleton portal-skeleton--line" style={{ width: '40%', height: '0.75rem' }} />
              </div>
              <div className="portal-skeleton" style={{ width: '4.5rem', height: '1.5rem', borderRadius: '999px', flexShrink: 0 }} />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (loadError) {
    // A failed load is never a confirmed empty result (KIT_GUIDE §4): danger
    // tone, role="alert" from the kit, and a real retry.
    return (
      <section className="dashboard-matched-roles" style={{ marginTop: '1.5rem' }}>
        <h2 className="dashboard-today-label">Roles that match you</h2>
        <KitEmptyState
          kind="unavailable"
          tone="danger"
          framed
          title={t('matchesUnavailable.title')}
          description={t('matchesUnavailable.body')}
          primaryAction={{ label: t('matchesUnavailable.action'), onClick: retry }}
          secondaryAction={{ label: t('matchesUnavailable.secondary'), href: '/dashboard/jobs' }}
        />
      </section>
    );
  }

  if (jobs.length === 0) {
    return (
      <section className="dashboard-matched-roles" style={{ marginTop: '1.5rem' }}>
        <h2 className="dashboard-today-label">Roles that match you</h2>
        <KitEmptyState
          kind="first"
          framed
          title={t('matches.title')}
          description={t('matches.body')}
          icon={<span className="material-symbols-outlined" style={{ fontSize: '2.5rem', fontVariationSettings: "'FILL' 1" }} aria-hidden="true">work_outline</span>}
          primaryAction={{ label: t('matches.browse'), href: '/dashboard/jobs' }}
          secondaryAction={{ label: t('matches.profile'), href: '/dashboard/profile' }}
        />
      </section>
    );
  }

  return (
    <section className="dashboard-matched-roles" style={{ marginTop: '1.5rem' }}>
      <h2 className="dashboard-today-label">Roles that match you</h2>
      <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.9rem', marginBottom: '1rem' }}>
        Ranked by fit to your skills and program. Apply when you're ready.
      </p>
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {jobs.map((job) => {
          const matchColor =
            job.matchPct >= 70
              ? 'var(--color-green)'
              : job.matchPct >= 40
                ? 'var(--color-amber)'
                : 'var(--color-on-surface-variant)';
          return (
            <Link
              key={job.id}
              href={`/dashboard/jobs/${job.id}`}
              style={{
                display: 'block',
                padding: '1rem 1.25rem',
                background: 'var(--surface-container)',
                borderRadius: '8px',
                textDecoration: 'none',
                color: 'inherit',
                transition: 'border-color 0.15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.25rem' }}>{job.title}</div>
                  <div style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.9rem' }}>
                    {job.company} &middot; {job.location}
                  </div>
                </div>
                <span
                  style={{
                    flexShrink: 0,
                    padding: '0.2rem 0.6rem',
                    borderRadius: '50px',
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    color: matchColor,
                    background: `color-mix(in srgb, ${matchColor} 15%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${matchColor} 30%, transparent)`,
                  }}
                >
                  {job.matchPct}% match
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
