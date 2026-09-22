import { Briefcase } from 'lucide-react';
import NextLink from 'next/link';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { DesignSurface, JobListingRow, KitEmptyState, PageOpener } from '@/components/portal/kit';
import LogExternalApplicationButton from '@/components/portal/jobs/LogExternalApplicationButton';
import { JOBS_BOARD_EMPTY } from '@/lib/member/jobPipelineDisplay';

/**
 * Member Portal — JOB BOARD listing (open roles, not the tracked pipeline).
 * Same PageOpener chrome as the live anonymous / `?ui=legacy` jobs listing
 * so /dev/member/jobs?state=board and /dashboard/jobs share JobListingRow.
 *
 * Defaults are empty. Proofs pass sample rows; live listing uses JobsListingClient.
 *
 * Target route: app/(portal)/dashboard/jobs (listing branch)
 * Surface: warm (member-facing).
 */

export interface BoardJob {
  id: string;
  title: string;
  company: string;
  location: string;
  meta: string;
  match?: string;
  applied?: boolean;
  href?: string;
}

export interface MemberJobsBoardProps {
  title?: string;
  lede?: string;
  pipelineHref?: string;
  jobs?: BoardJob[];
  profileHref?: string;
  messagesHref?: string;
}

function BoardCta({
  href,
  children,
  variant = 'page',
}: {
  href: string;
  children: ReactNode;
  variant?: 'page' | 'kit';
}) {
  const className =
    variant === 'kit'
      ? 'wa-kit-cta wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none'
      : 'wa-page-action wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none';
  return (
    <NextLink href={href} className={className}>
      {children}
    </NextLink>
  );
}

export function MemberJobsBoard({
  title = 'Open roles',
  lede = 'Hiring-partner openings. Track applications from the pipeline.',
  pipelineHref = '/dev/member/jobs',
  jobs = [],
  profileHref = JOBS_BOARD_EMPTY.primaryHref,
  messagesHref = JOBS_BOARD_EMPTY.secondaryHref,
}: MemberJobsBoardProps) {
  const t = useTranslations('empty');
  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--wa-pad-sm)' }} className="wa-space-y-6">
        <PageOpener
          kicker="Job search"
          title={title}
          lede={lede}
          icon={<Briefcase size={13} aria-hidden="true" />}
          action={<BoardCta href={pipelineHref}>View pipeline</BoardCta>}
        />
        <div className="wa-kit-card" style={{ padding: jobs.length === 0 ? undefined : 0, overflow: 'hidden' }}>
          {jobs.length === 0 ? (
            <KitEmptyState
              kind={JOBS_BOARD_EMPTY.kind}
              title={t('openings.title')}
              description={t('openings.body')}
              primaryAction={{ label: t('openings.action'), href: profileHref }}
              secondaryAction={{ label: t('openings.secondary'), href: messagesHref }}
            />
          ) : (
            jobs.map((job, i) => (
              <JobListingRow
                key={job.id}
                href={job.href ?? '#'}
                title={job.title}
                meta={`${job.company} · ${job.location} · ${job.meta}`}
                match={job.match}
                applied={job.applied}
                first={i === 0}
              />
            ))
          )}
        </div>
        <div
          className="wa-kit-card wa-flex wa-flex-col sm:wa-flex-row sm:wa-items-center"
          style={{ gap: 16 }}
        >
          <div style={{ flex: 1, minWidth: '14rem' }}>
            <p style={{ fontSize: 'var(--wa-type-body)', fontWeight: 800, color: 'var(--wa-text)', margin: '0 0 4px' }}>
              Applied somewhere else?
            </p>
            <p className="wa-kit-lede" style={{ margin: 0 }}>
              Add it to your tracker so your counselor can follow up.
            </p>
          </div>
          <LogExternalApplicationButton preview variant="primary" />
        </div>
        <div className="wa-kit-card">
          <p style={{ fontSize: 'var(--wa-type-body)', fontWeight: 700, color: 'var(--wa-text)', margin: '0 0 4px' }}>
            Search beyond this board
          </p>
          <p className="wa-kit-lede" style={{ margin: 0 }}>
            Partner openings are listed above. Other boards cover roles that are not posted here.
          </p>
          <ul style={{ listStyle: 'none', margin: '16px 0 0', padding: 0 }}>
            {[
              { label: 'Indeed', note: 'Largest public job feed.' },
              { label: 'LinkedIn', note: 'Recruiter traffic and warm intros.' },
              { label: 'WorkInTexas', note: 'Texas workforce listings.' },
            ].map((engine, i) => (
              <li
                key={engine.label}
                className="wa-flex wa-items-baseline wa-justify-between wa-gap-3"
                style={{
                  padding: '12px 0',
                  borderTop: i === 0 ? '1px solid var(--wa-border)' : undefined,
                  borderBottom: '1px solid var(--wa-border)',
                }}
              >
                <span style={{ fontSize: 'var(--wa-type-body)', fontWeight: 700, color: 'var(--wa-text)' }}>
                  {engine.label}
                </span>
                <span className="wa-kit-meta">{engine.note}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </DesignSurface>
  );
}
