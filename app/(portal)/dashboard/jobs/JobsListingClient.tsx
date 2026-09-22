'use client';

import { useEffect, useState, useCallback, useRef, type CSSProperties, type ReactNode } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Search, SlidersHorizontal, X, Bookmark } from 'lucide-react';
import { PROGRAMS } from '@/lib/content/programs';
import { formatJobSalaryRange } from '@/lib/jobs/formatSalary';
import { JobListingRow, JobListingRowSkeleton, KitEmptyState, FormField } from '@/components/portal/kit';

const DEBOUNCE_MS = 400;

type Job = {
  id: string;
  title: string;
  location: string | null;
  locationType: string;
  jobType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  employer: { companyName: string; logoUrl: string | null };
};

type MatchedJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  locationType: string;
  matchPct: number;
};

function getLocationLabels(t: (k: string) => string): Record<string, string> {
  return {
    remote: t('remote'),
    hybrid: t('hybrid'),
    onsite: t('onsite'),
  };
}
function getJobTypeLabels(t: (k: string) => string): Record<string, string> {
  return {
    fulltime: t('fulltime'),
    parttime: t('parttime'),
    contract: t('contract'),
  };
}
function getSortOptions(t: (k: string) => string): { value: string; label: string }[] {
  return [
    { value: 'newest', label: t('newestFirst') },
    { value: 'title', label: t('titleAZ') },
    { value: 'salary-desc', label: t('salaryHighToLow') },
    { value: 'salary-asc', label: t('salaryLowToHigh') },
  ];
}

function formatSalary(min: number | null, max: number | null): string {
  return formatJobSalaryRange(min, max) ?? '';
}

function KitCta({
  href,
  onClick,
  children,
  variant = 'outline',
}: {
  href?: string;
  onClick?: () => void;
  children: ReactNode;
  variant?: 'solid' | 'outline' | 'ghost';
}) {
  const className = [
    'wa-kit-cta',
    'wa-kit-focus',
    'hover:wa-opacity-90',
    'active:wa-scale-[0.98]',
    'motion-reduce:active:wa-scale-100',
    'wa-transition-[opacity,transform]',
    'wa-duration-150',
    'motion-reduce:wa-transition-none',
    variant === 'solid' ? '' : 'wa-kit-cta--ghost',
  ]
    .filter(Boolean)
    .join(' ');
  const style: CSSProperties | undefined =
    variant === 'ghost' ? { color: 'var(--wa-muted)', borderColor: 'transparent' } : undefined;
  if (href) {
    return (
      <Link href={href} className={className} style={style}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} style={style}>
      {children}
    </button>
  );
}

const FILTER_CONTROL: CSSProperties = {
  marginTop: 4,
  width: '100%',
  minHeight: 44,
  fontSize: 'var(--wa-type-body)',
  border: '1px solid var(--wa-border)',
  borderRadius: 'var(--wa-radius-sm)',
  padding: '10px 12px',
  outline: 'none',
  background: 'var(--wa-surface)',
  color: 'var(--wa-text)',
};

const FILTER_FIELD_WRAP: CSSProperties = {
  minWidth: 160,
  flex: '1 1 160px',
};

function JobCard({
  job,
  isAuthenticated,
  matchPct,
  isApplied,
  isSaved,
  onToggleSave,
  t,
  first = false,
}: {
  job: Job;
  isAuthenticated: boolean;
  matchPct?: number;
  isApplied?: boolean;
  isSaved?: boolean;
  onToggleSave?: (jobId: string) => void;
  t: (k: string) => string;
  first?: boolean;
}) {
  const locationDisplay = job.location ?? getLocationLabels(t)[job.locationType] ?? job.locationType;
  const salaryStr = formatSalary(job.salaryMin, job.salaryMax);
  const jobTypeLabel = getJobTypeLabels(t)[job.jobType] ?? job.jobType;
  const meta = [job.employer.companyName, locationDisplay, jobTypeLabel, salaryStr]
    .filter(Boolean)
    .join(' · ');

  return (
    <JobListingRow
      href={
        isAuthenticated
          ? `/dashboard/jobs/${job.id}`
          : `/login?redirectTo=${encodeURIComponent(`/dashboard/jobs/${job.id}`)}`
      }
      title={job.title}
      meta={meta}
      match={matchPct !== undefined && matchPct > 0 ? `${matchPct}% ${t('match')}` : undefined}
      applied={isApplied}
      first={first}
      icon={
        job.employer.logoUrl ? (
          <Image
            src={job.employer.logoUrl}
            alt=""
            width={40}
            height={40}
            unoptimized
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : undefined
      }
      trailing={
        isAuthenticated && onToggleSave ? (
          <button
            type="button"
            className="wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none"
            aria-pressed={!!isSaved}
            aria-label={isSaved ? 'Saved' : 'Save job'}
            title={isSaved ? 'Saved' : 'Save job'}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleSave(job.id);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 44,
              height: 44,
              borderRadius: 999,
              border: '1px solid var(--wa-border)',
              background: 'var(--wa-surface-2)',
              color: isSaved ? 'var(--wa-accent)' : 'var(--wa-muted)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <Bookmark size={16} fill={isSaved ? 'currentColor' : 'none'} aria-hidden />
          </button>
        ) : undefined
      }
    />
  );
}

export default function JobsListingClient({
  isAuthenticated = true,
  ageGroup = 'adult18plus' as 'under14' | 'youth14to17' | 'adult18plus',
  initialJobs = [] as Job[],
  initialTotal = 0,
  appliedJobIds = [] as string[],
  initialMatchedJobs = [] as MatchedJob[],
  initialSavedJobIds = [] as string[],
  preview = false,
}: {
  isAuthenticated?: boolean;
  ageGroup?: 'under14' | 'youth14to17' | 'adult18plus';
  initialJobs?: Job[];
  initialTotal?: number;
  appliedJobIds?: string[];
  initialMatchedJobs?: MatchedJob[];
  initialSavedJobIds?: string[];
  /** Skip network fetches — /dev/member proofs and Storybook-lite. */
  preview?: boolean;
}) {
  const t = useTranslations('jobs');
  const te = useTranslations('empty');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Use SSR data as initial state; skip loading state if we have initial data
  const hasInitialData = initialJobs.length > 0;
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [matchedJobs, setMatchedJobs] = useState<MatchedJob[]>(initialMatchedJobs);
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set(initialSavedJobIds));
  const appliedSet = new Set(appliedJobIds);
  const [loading, setLoading] = useState(!hasInitialData);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const qParam = (searchParams?.get('q') ?? '') ?? '';
  const [qLocal, setQLocal] = useState(qParam);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQLocal(qParam);
  }, [qParam]);

  const locationType = searchParams?.get('locationType') ?? '';
  const jobType = searchParams?.get('jobType') ?? '';
  const program = searchParams?.get('program') ?? '';
  const salaryMin = searchParams?.get('salaryMin') ?? '';
  const salaryMax = searchParams?.get('salaryMax') ?? '';
  const sort = searchParams?.get('sort') ?? 'newest';
  const q = qParam;

  const updateUrl = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === '') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      const qs = params.toString();
      if (pathname) router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams]
  );

  const handleKeywordChange = (value: string) => {
    setQLocal(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateUrl({ q: value.trim() || undefined });
      debounceRef.current = null;
    }, DEBOUNCE_MS);
  };

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const hasActiveFilters =
    q || locationType || jobType || program || salaryMin || salaryMax || sort !== 'newest';

  const clearFilters = () => {
    if (pathname) router.push(pathname);
    setFiltersOpen(false);
  };

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (locationType) params.set('locationType', locationType);
    if (jobType) params.set('jobType', jobType);
    if (program) params.set('program', program);
    if (salaryMin) params.set('salaryMin', salaryMin);
    if (salaryMax) params.set('salaryMax', salaryMax);
    if (sort && sort !== 'newest') params.set('sort', sort);

    if (ageGroup) params.set('ageGroup', ageGroup);

    if (preview) return;
    
    // Skip the first fetch if we have SSR data and no filters are active
    if (initialJobs.length > 0 && !hasActiveFilters) {
      return;
    }
    
    setLoading(true);
    fetch(`/api/dashboard/jobs?${params}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setJobs(data); })
      .finally(() => setLoading(false));
  }, [q, locationType, jobType, program, salaryMin, salaryMax, sort, ageGroup, hasActiveFilters, preview, initialJobs.length]);

  useEffect(() => {
    if (preview || !isAuthenticated) return;
    setLoadingMatches(true);
    fetch('/api/member/matched-jobs')
      .then((r) => (r.ok ? r.json() : { jobs: [] }))
      .then((d) => setMatchedJobs(d.jobs ?? []))
      .catch(() => setMatchedJobs([]))
      .finally(() => setLoadingMatches(false));
  }, [isAuthenticated, preview]);

  useEffect(() => {
    if (preview || !isAuthenticated) return;
    fetch('/api/member/saved-jobs')
      .then((r) => (r.ok ? r.json() : { jobIds: [] }))
      .then((d) => setSavedJobIds(new Set(Array.isArray(d.jobIds) ? d.jobIds : [])))
      .catch(() => setSavedJobIds(new Set()));
  }, [isAuthenticated, preview]);

  const handleToggleSave = useCallback((jobId: string) => {
    setSavedJobIds((prev) => {
      const next = new Set(prev);
      const wasSaved = next.has(jobId);
      if (wasSaved) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      if (preview) return next;
      // Optimistic — revert on failure below.
      const request = wasSaved
        ? fetch(`/api/member/saved-jobs?jobId=${encodeURIComponent(jobId)}`, { method: 'DELETE' })
        : fetch('/api/member/saved-jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId }),
          });
      request.then((r) => {
        if (!r.ok) {
          setSavedJobIds((cur) => {
            const reverted = new Set(cur);
            if (wasSaved) reverted.add(jobId); else reverted.delete(jobId);
            return reverted;
          });
        }
      }).catch(() => {
        setSavedJobIds((cur) => {
          const reverted = new Set(cur);
          if (wasSaved) reverted.add(jobId); else reverted.delete(jobId);
          return reverted;
        });
      });
      return next;
    });
  }, [preview]);

  const filterPanel = (
    <div className="job-filters-panel wa-kit-card">
      <div style={{ ...FILTER_FIELD_WRAP, minWidth: 200, flex: '2 1 220px' }}>
        <label htmlFor="job-search-q" className="wa-kit-field-label">
          {t('searchJobs')}
        </label>
        <div style={{ position: 'relative' }}>
          <Search
            size={16}
            aria-hidden
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--wa-muted)',
              pointerEvents: 'none',
            }}
          />
          <input
            id="job-search-q"
            type="search"
            placeholder="Titles, companies, keywords…"
            value={qLocal}
            onChange={(e) => handleKeywordChange(e.target.value)}
            className="wa-kit-focus"
            autoComplete="off"
            style={{ ...FILTER_CONTROL, paddingLeft: 36 }}
          />
        </div>
      </div>

      <div style={FILTER_FIELD_WRAP}>
        <FormField label="Program" id="job-filter-program">
          <select
            value={program}
            onChange={(e) => updateUrl({ program: e.target.value || undefined })}
            style={FILTER_CONTROL}
          >
            <option value="">All programs</option>
            {PROGRAMS.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.title}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <div style={FILTER_FIELD_WRAP}>
        <FormField label="Location type" id="job-filter-location">
          <select
            value={locationType}
            onChange={(e) => updateUrl({ locationType: e.target.value || undefined })}
            aria-label="Filter by location type"
            style={FILTER_CONTROL}
          >
            <option value="">All locations</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">On-site</option>
          </select>
        </FormField>
      </div>

      <div style={FILTER_FIELD_WRAP}>
        <FormField label="Job type" id="job-filter-type">
          <select
            value={jobType}
            onChange={(e) => updateUrl({ jobType: e.target.value || undefined })}
            aria-label="Filter by job type"
            style={FILTER_CONTROL}
          >
            <option value="">All types</option>
            <option value="fulltime">Full-time</option>
            <option value="parttime">Part-time</option>
            <option value="contract">Contract</option>
          </select>
        </FormField>
      </div>

      <div style={FILTER_FIELD_WRAP}>
        <FormField label="Sort by" id="job-filter-sort">
          <select
            value={sort}
            onChange={(e) => updateUrl({ sort: e.target.value })}
            style={FILTER_CONTROL}
          >
            {getSortOptions(t).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <div className="job-filter-row" style={{ flex: '1 1 100%', gap: 12 }}>
        <div style={FILTER_FIELD_WRAP}>
          <FormField label="Min salary ($/yr)" id="job-filter-salary-min">
            <input
              type="number"
              min={0}
              step={5000}
              placeholder="e.g. 50000 (annual USD)"
              title="Annual salary in USD, no commas"
              value={salaryMin}
              onChange={(e) => updateUrl({ salaryMin: e.target.value || undefined })}
              style={FILTER_CONTROL}
            />
          </FormField>
        </div>
        <div style={FILTER_FIELD_WRAP}>
          <FormField label="Max salary ($/yr)" id="job-filter-salary-max">
            <input
              type="number"
              min={0}
              step={5000}
              placeholder="Optional max (annual USD)"
              title="Leave blank for no upper limit"
              value={salaryMax}
              onChange={(e) => updateUrl({ salaryMax: e.target.value || undefined })}
              style={FILTER_CONTROL}
            />
          </FormField>
        </div>
      </div>

      {hasActiveFilters && (
        <KitCta onClick={clearFilters}>{t('clearAllFilters')}</KitCta>
      )}
    </div>
  );

  return (
    <div className="job-board jobs-listing">
      {isAuthenticated && (loadingMatches || matchedJobs.length > 0) && (
        <section className="wa-kit-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
          <div
            className="wa-flex wa-flex-wrap wa-items-center"
            style={{
              gap: 12,
              justifyContent: 'space-between',
              padding: '16px 18px 12px',
            }}
          >
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0, color: 'var(--wa-text)' }}>
                Best matches for you
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--wa-muted)' }}>
                Ranked from your program, readiness, certifications, and activity.
              </p>
            </div>
            <KitCta href="/dashboard/readiness">Improve readiness</KitCta>
          </div>
          {loadingMatches ? (
            <p style={{ margin: 0, padding: '8px 18px 16px', fontSize: 13, color: 'var(--wa-muted)' }}>
              Loading matches…
            </p>
          ) : (
            matchedJobs.slice(0, 3).map((job) => (
              <JobListingRow
                key={job.id}
                href={`/dashboard/jobs/${job.id}`}
                title={job.title}
                meta={`${job.company} · ${job.location}`}
                match={`${job.matchPct}% match`}
              />
            ))
          )}
        </section>
      )}
      <div className="job-board-header">
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          className="job-filters-toggle wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none"
          aria-expanded={filtersOpen}
          aria-controls="job-filters-drawer"
          style={{
            alignItems: 'center',
            gap: 8,
            minHeight: 44,
            padding: '10px 16px',
            background: 'var(--wa-surface)',
            border: '1px solid var(--wa-border)',
            color: 'var(--wa-text)',
            borderRadius: 999,
            fontWeight: 600,
            fontSize: 'var(--wa-type-body)',
            cursor: 'pointer',
          }}
        >
          <SlidersHorizontal size={16} aria-hidden />
          Filters{hasActiveFilters ? ` (${[q && 'search', locationType && 'location', jobType && 'type', program && 'program', (salaryMin || salaryMax) && 'salary', sort !== 'newest' && 'sort'].filter(Boolean).length})` : ''}
        </button>
      </div>

      {/* Single filter panel — CSS in main.css promotes .job-filters-drawer
          to a static sidebar at md+ (always visible, drawer behavior
          ignored) and keeps it as a fixed drawer below md (controlled by
          .is-open). Closes audit #34: previously rendered twice in the
          DOM with duplicate input ids breaking <label htmlFor> a11y. */}
      <aside
        id="job-filters-drawer"
        className={`job-filters-drawer ${filtersOpen ? 'is-open' : ''}`}
        data-kit-filters="true"
      >
        <div className="job-filters-drawer-inner">
          <div className="job-filters-drawer-header">
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}>
              Filters
            </h3>
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className="job-filters-drawer-close wa-kit-focus"
              aria-label="Close filters"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 44,
                height: 44,
                borderRadius: 999,
                border: '1px solid var(--wa-border)',
                background: 'var(--wa-surface-2)',
                color: 'var(--wa-muted)',
                cursor: 'pointer',
              }}
            >
              <X size={18} />
            </button>
          </div>
          {filterPanel}
        </div>
        <button
          type="button"
          className="job-filters-drawer-backdrop"
          onClick={() => setFiltersOpen(false)}
          aria-label="Close filters"
        />
      </aside>

      {loading ? (
        <div className="wa-kit-card" style={{ padding: 0, overflow: 'hidden' }} aria-busy="true" aria-live="polite">
          {Array.from({ length: 6 }).map((_, i) => (
            <JobListingRowSkeleton key={i} first={i === 0} />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="wa-kit-card">
          {hasActiveFilters ? (
            <KitEmptyState
              kind="filtered"
              title={te('jobsFiltered.title')}
              description={te('jobsFiltered.body')}
              primaryAction={{ label: te('jobsFiltered.action'), onClick: clearFilters }}
            />
          ) : isAuthenticated ? (
            <KitEmptyState
              kind="unavailable"
              title={te('openings.title')}
              description={te('openings.body')}
              primaryAction={{ label: te('openings.action'), href: '/dashboard/profile' }}
              secondaryAction={{ label: te('openings.secondary'), href: '/dashboard/messages' }}
            />
          ) : (
            <KitEmptyState
              kind="unavailable"
              title={te('openingsPublic.title')}
              description={te('openingsPublic.body')}
              primaryAction={{ label: te('openingsPublic.action'), href: '/programs' }}
              secondaryAction={{ label: te('openingsPublic.secondary'), href: '/apply' }}
            />
          )}
        </div>
      ) : (
        <>
          <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: '0 0 8px' }}>
            {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'} found
          </p>
          <div className="wa-kit-card" style={{ padding: 0, overflow: 'hidden' }}>
            {jobs.map((j, i) => {
              const matched = matchedJobs.find((m) => m.id === j.id);
              return (
                <JobCard
                  key={j.id}
                  job={j}
                  isAuthenticated={isAuthenticated}
                  matchPct={matched?.matchPct}
                  isApplied={appliedSet.has(j.id)}
                  isSaved={savedJobIds.has(j.id)}
                  onToggleSave={isAuthenticated ? handleToggleSave : undefined}
                  t={t}
                  first={i === 0}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
