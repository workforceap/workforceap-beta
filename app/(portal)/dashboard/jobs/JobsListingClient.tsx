'use client';

import { useEffect, useState, useCallback, useRef, type CSSProperties, type ReactNode } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Search, SlidersHorizontal, Bookmark } from 'lucide-react';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { useFocusTrap } from '@/components/portal/kit/hooks/useFocusTrap';
import { PROGRAMS } from '@/lib/content/programs';
import { formatJobSalaryRange } from '@/lib/jobs/formatSalary';
import { JobListingRow, JobListingRowSkeleton, KitEmptyState, FormField } from '@/components/portal/kit';
import styles from './JobsListing.module.css';

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
  /** Synthetic fixtures supply explicit program associations for local filters. */
  programSlugs?: string[];
};

type MatchedJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  locationType: string;
  matchPct: number;
};

const EMPTY_JOBS: Job[] = [];

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
  border: '1px solid var(--wa-control-border)',
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
  preview = false,
}: {
  job: Job;
  isAuthenticated: boolean;
  matchPct?: number;
  isApplied?: boolean;
  isSaved?: boolean;
  onToggleSave?: (jobId: string) => void;
  t: (k: string) => string;
  first?: boolean;
  preview?: boolean;
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
        preview
          ? `/dev/member/jobs?state=detail&job=${encodeURIComponent(job.id)}`
          : isAuthenticated
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
              border: '1px solid var(--wa-control-border)',
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
  initialJobs = EMPTY_JOBS,
  initialTotal = 0,
  allOpeningsHref,
  appliedJobIds = [] as string[],
  initialMatchedJobs = [] as MatchedJob[],
  initialSavedJobIds = [] as string[],
  preview = false,
}: {
  isAuthenticated?: boolean;
  ageGroup?: 'under14' | 'youth14to17' | 'adult18plus';
  initialJobs?: Job[];
  initialTotal?: number;
  /** Owning member route supplies its existing paginated inventory; public callers omit it. */
  allOpeningsHref?: string;
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
  const searchQuery = searchParams?.toString() ?? '';
  const [previewQuery, setPreviewQuery] = useState(searchQuery);
  const filters = new URLSearchParams(preview ? previewQuery : searchQuery);

  useEffect(() => { setPreviewQuery(searchQuery); }, [searchQuery]);
  useEffect(() => {
    if (!preview) return;
    const syncHistory = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setPreviewQuery(window.location.search.slice(1));
      setQLocal(new URLSearchParams(window.location.search).get('q') ?? '');
    };
    window.addEventListener('popstate', syncHistory);
    return () => window.removeEventListener('popstate', syncHistory);
  }, [preview]);

  // Use SSR data as initial state; skip loading state if we have initial data
  const hasInitialData = initialJobs.length > 0;
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [matchedJobs, setMatchedJobs] = useState<MatchedJob[]>(initialMatchedJobs);
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set(initialSavedJobIds));
  const appliedSet = new Set(appliedJobIds);
  const [loading, setLoading] = useState(!hasInitialData && !preview);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // CSS keeps the SSR inline panel hidden on phones until the media query hydrates.
  const desktopFilters = useMediaQuery('(min-width: 768px)', true);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const filterDialogRef = useFocusTrap<HTMLDialogElement>(filtersOpen && !desktopFilters, {
    onEscape: () => setFiltersOpen(false),
    skipInitialFocus: true, // Astryx focuses the first refinement after native showModal().
  });
  const filterFieldWrap = desktopFilters ? FILTER_FIELD_WRAP : { minWidth: 0, flex: '0 0 auto' };

  useEffect(() => {
    if (desktopFilters && filtersOpen) {
      setFiltersOpen(false);
      document.getElementById('job-search-q')?.focus();
    }
  }, [desktopFilters, filtersOpen]);

  const qParam = filters.get('q') ?? '';
  const [qLocal, setQLocal] = useState(qParam);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQLocal(qParam);
  }, [qParam]);

  const locationType = filters.get('locationType') ?? '';
  const jobType = filters.get('jobType') ?? '';
  const program = filters.get('program') ?? '';
  const salaryMin = filters.get('salaryMin') ?? '';
  const salaryMax = filters.get('salaryMax') ?? '';
  const sort = filters.get('sort') ?? 'newest';
  const q = qParam;

  const updateUrl = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(preview ? window.location.search : searchQuery);
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === '') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      const qs = params.toString();
      if (!pathname) return;
      const href = `${qs ? `${pathname}?${qs}` : pathname}${window.location.hash}`;
      if (preview) {
        // Fixture filters are entirely local. Keep Next's history subscribers
        // and Back/Forward in sync without requesting another server render.
        window.history.pushState(null, '', href);
        setPreviewQuery(qs);
      } else {
        router.push(href);
      }
    },
    [pathname, preview, router, searchQuery]
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
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQLocal('');
    // Clearing refinements must retain the canonical view, legacy entry and
    // caller context. A bare pathname switches a member back to the overview.
    updateUrl(Object.fromEntries(['q', 'locationType', 'jobType', 'program', 'salaryMin', 'salaryMax', 'sort'].map((key) => [key, undefined])));
    setFiltersOpen(false);
  };

  // Mirrors the visible filter controls over the declared synthetic inventory.
  // Saves are session-only; no provider or member APIs run in preview mode.
  const visibleJobs = preview ? initialJobs.filter((job) => {
    const searchable = `${job.title} ${job.employer.companyName} ${job.location ?? ''}`.toLowerCase();
    return (!q || searchable.includes(q.toLowerCase()))
      && (!locationType || job.locationType === locationType)
      && (!jobType || job.jobType === jobType)
      && (!program || job.programSlugs?.includes(program))
      && (!salaryMin || (job.salaryMax ?? job.salaryMin ?? 0) >= Number(salaryMin))
      && (!salaryMax || (job.salaryMin ?? job.salaryMax ?? Number.POSITIVE_INFINITY) <= Number(salaryMax));
  }).sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title);
    if (sort === 'salary-desc') return (b.salaryMax ?? b.salaryMin ?? 0) - (a.salaryMax ?? a.salaryMin ?? 0);
    if (sort === 'salary-asc') return (a.salaryMin ?? a.salaryMax ?? Number.POSITIVE_INFINITY) - (b.salaryMin ?? b.salaryMax ?? Number.POSITIVE_INFINITY);
    return 0;
  }) : jobs;

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
      setJobs(initialJobs);
      setLoading(false);
      return;
    }

    let current = true;
    setLoading(true);
    fetch(`/api/dashboard/jobs?${params}`)
      .then((r) => r.json())
      .then((data) => { if (current && Array.isArray(data)) setJobs(data); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [q, locationType, jobType, program, salaryMin, salaryMax, sort, ageGroup, hasActiveFilters, preview, initialJobs]);

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
    <div className={`job-filters-panel${desktopFilters ? ' wa-kit-card' : ''}`}>
      <div style={filterFieldWrap}>
        <FormField label="Program" id="job-filter-program">
          <select
            data-autofocus={!desktopFilters || undefined}
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

      <div style={filterFieldWrap}>
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

      <div style={filterFieldWrap}>
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

      <div style={filterFieldWrap}>
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

      <div className="job-filter-row" style={{ flex: desktopFilters ? '1 1 100%' : '0 0 auto', gap: desktopFilters ? 12 : 'var(--wa-pad-sm)' }}>
        <div style={filterFieldWrap}>
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
        <div style={filterFieldWrap}>
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
    <div className={`job-board jobs-listing ${styles.listing}`}>
      <div className={styles.searchBar}>
        <div className={styles.search}>
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
        <button
          type="button"
          ref={filterTriggerRef}
          onClick={() => {
            // Safari does not consistently focus buttons on pointer activation.
            filterTriggerRef.current?.focus();
            setFiltersOpen((open) => !open);
          }}
          className="job-filters-toggle wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none"
          aria-expanded={filtersOpen}
          aria-controls={desktopFilters ? undefined : "job-filters-dialog"}
          aria-haspopup="dialog"
          style={{
            alignItems: 'center',
            gap: 8,
            minHeight: 44,
            padding: '10px 16px',
            background: 'var(--wa-surface)',
            border: '1px solid var(--wa-control-border)',
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

      {/* Search stays available without opening a phone overlay. Refinements
          share one control set: desktop inline or native modal on phones.
          The dialog provides inert background, focus/scroll containment, Escape
          (with the kit IME/top-layer guards), backdrop close and trigger restore. */}
      {desktopFilters ? (
        <aside className="job-filters-inline" aria-label="Job filters">
          {filterPanel}
        </aside>
      ) : (
        <Dialog
          id="job-filters-dialog"
          ref={filterDialogRef}
          className="job-filters-dialog"
          isOpen={filtersOpen}
          onOpenChange={setFiltersOpen}
          purpose="info"
          aria-label="Job filters"
          width="calc(100vw - 2 * var(--wa-pad-sm))"
          maxHeight="calc(100dvh - 2 * var(--wa-pad-sm))"
          padding={4}
        >
          <Layout
            header={<DialogHeader title="Filters" onOpenChange={setFiltersOpen} />}
            content={<LayoutContent className="job-filters-dialog-content">{filterPanel}</LayoutContent>}
          />
        </Dialog>
      )}

      {loading ? (
        <div className="wa-kit-card" style={{ padding: 0, overflow: 'hidden' }} aria-busy="true" aria-live="polite">
          {Array.from({ length: 6 }).map((_, i) => (
            <JobListingRowSkeleton key={i} first={i === 0} />
          ))}
        </div>
      ) : visibleJobs.length === 0 ? (
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
              primaryAction={{ label: te('openings.action'), href: preview ? '/dev/member/profile' : '/dashboard/profile' }}
              secondaryAction={{ label: te('openings.secondary'), href: preview ? '/dev/member/messages' : '/dashboard/messages' }}
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
          <div className={styles.resultsHeading}>
            <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: 0 }}>
              {!hasActiveFilters && initialTotal > visibleJobs.length
                ? `Showing ${visibleJobs.length} of ${initialTotal} openings`
                : `${visibleJobs.length} ${visibleJobs.length === 1 ? 'job' : 'jobs'} found`}
            </p>
            {!hasActiveFilters && initialTotal > visibleJobs.length && isAuthenticated && allOpeningsHref ? (
              <KitCta href={allOpeningsHref}>See all {initialTotal} openings</KitCta>
            ) : null}
          </div>
          <div className="wa-kit-card" style={{ padding: 0, overflow: 'hidden' }}>
            {visibleJobs.map((j, i) => {
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
                  preview={preview}
                />
              );
            })}
          </div>
        </>
      )}
      {isAuthenticated && (loadingMatches || matchedJobs.length > 0) && (
        <details className={styles.matches}>
          <summary className="wa-kit-focus">Best matches for you <span>{loadingMatches ? 'Loading…' : `${Math.min(matchedJobs.length, 3)} matches`}</span></summary>
          <div
            className="wa-flex wa-flex-wrap wa-items-center"
            style={{
              gap: 12,
              justifyContent: 'space-between',
              padding: '16px 18px 12px',
            }}
          >
            <div>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--wa-muted)' }}>
                Ranked from your program, readiness, certifications, and activity.
              </p>
            </div>
            <KitCta href={preview ? '/dev/member/progress' : '/dashboard/readiness'}>Improve readiness</KitCta>
          </div>
          {loadingMatches ? (
            <p style={{ margin: 0, padding: '8px 18px 16px', fontSize: 13, color: 'var(--wa-muted)' }}>
              Loading matches…
            </p>
          ) : (
            matchedJobs.slice(0, 3).map((job) => (
              <JobListingRow
                key={job.id}
                href={preview ? `/dev/member/jobs?state=detail&job=${encodeURIComponent(job.id)}` : `/dashboard/jobs/${job.id}`}
                title={job.title}
                meta={`${job.company} · ${job.location}`}
                match={`${job.matchPct}% match`}
              />
            ))
          )}
        </details>
      )}
    </div>
  );
}
