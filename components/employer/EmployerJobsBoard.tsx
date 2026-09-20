'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { flushSync } from 'react-dom';
import { useState, useMemo, useEffect, useId, useCallback, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';
import { Briefcase, ListFilter, Users, TriangleAlert, Info, CheckCircle2 } from 'lucide-react';
import { trackEmployerJobAction, trackEmployerBulkDelete } from '@/lib/analytics/events';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { readinessLabel, type JobReadinessIssue, type JobReadinessLevel } from '@/lib/employer/jobReadiness';
import { EMPLOYER_JOB_BULK_MAX_IDS_PER_REQUEST } from '@/lib/employer/employerJobsBulk';
import {
  employerJobsListHref,
  type EmployerJobListFilter,
  type EmployerJobLocationType,
} from '@/lib/employer/employerJobsListQuery';
import { EMPLOYER_JOB_SUBMIT_REVIEW_DRAFT_FLASH } from '@/lib/employer/employerJobFormFlash';
import { employerJobPortalBadgeVariant, employerJobPortalStatusLabel } from '@/lib/employer/jobStatusDisplay';
import { DesignSurface, StatusTag, StatSparkTile, type KitTone } from '@/components/portal/kit';
import { KitEmptyState } from '@/components/portal/kit/KitEmptyState';

/**
 * Employer "My Jobs" board — Command Center visual language.
 * Reskin only: every handler, request shape, sessionStorage flash key, modal
 * flow and prop contract below is unchanged from the legacy CSS-class version.
 */

function chunkIds<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export type EmployerJobBoardItem = {
  id: string;
  title: string;
  location: string;
  salaryMin: number | null;
  salaryMax: number | null;
  locationType: string;
  jobType: string;
  descriptionPreview: string;
  descriptionLength: number;
  requirementsCount: number;
  suggestedProgramsCount: number;
  status: string;
  statusLabel: string;
  applicationsCount: number;
  updatedAt: string;
  readinessLevel: JobReadinessLevel;
  readinessIssues: JobReadinessIssue[];
};

const FILTERS: { value: EmployerJobListFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'review', label: 'In review' },
  { value: 'live', label: 'Live' },
  { value: 'filled', label: 'Filled' },
  { value: 'expired', label: 'Expired' },
];

/** Badge-variant → KitTone bridge, sharing the one source of truth in jobStatusDisplay.ts. */
const BADGE_VARIANT_TONE: Record<string, KitTone> = {
  success: 'ok',
  warning: 'warn',
  neutral: 'muted',
  error: 'alert',
  info: 'info',
};

function statusTone(status: string): KitTone {
  return BADGE_VARIANT_TONE[employerJobPortalBadgeVariant(status)] ?? 'muted';
}

function formatCompensation(min: number | null, max: number | null): string {
  if (min != null && max != null) {
    return `$${Math.round(min / 1000)}K–$${Math.round(max / 1000)}K`;
  }
  if (min != null) return `From $${Math.round(min / 1000)}K`;
  if (max != null) return `Up to $${Math.round(max / 1000)}K`;
  return 'Not set';
}

function formatWorkStyle(locationType: string, jobType: string): string {
  const loc =
    locationType === 'remote' ? 'Remote' : locationType === 'hybrid' ? 'Hybrid' : 'On-site';
  const jt =
    jobType === 'fulltime' ? 'Full-time' : jobType === 'parttime' ? 'Part-time' : 'Contract';
  return `${jt} · ${loc}`;
}

function nextStepHint(j: EmployerJobBoardItem): string {
  if (j.status === 'draft') {
    if (j.readinessLevel === 'thin') return 'Next: fill gaps, then send for review';
    if (j.readinessLevel === 'usable') return 'Next: submit for WorkforceAP review';
    return 'Next: submit for WorkforceAP review';
  }
  if (j.status === 'pending') return 'Next: WorkforceAP review — stays private';
  if (j.status === 'approved') return 'Next: go live when ready';
  if (j.status === 'live') return 'Next: mark filled when someone starts';
  if (j.status === 'expired') return 'Expired — edit to extend or close';
  if (j.status === 'filled' || j.status === 'closed') return 'Role closed — duplicate if hiring again';
  return '';
}

function canBulkDelete(status: string): boolean {
  return status === 'draft' || status === 'pending' || status === 'filled' || status === 'closed';
}

function canBulkClose(status: string): boolean {
  return status === 'live' || status === 'approved';
}

const BULK_DELETE_FLASH_KEY = 'wfap_employer_bulk_delete_ok';
const BULK_CLOSE_FLASH_KEY = 'wfap_employer_bulk_close_ok';

type BulkRow = { id: string; title: string; status: string };

/* ---------------------------------------------------------------------- */
/* Small presentational helpers (local — not shared kit)                   */
/* ---------------------------------------------------------------------- */

function Banner({
  tone,
  icon,
  children,
  onDismiss,
  dismissLabel = 'Dismiss',
  role = 'status',
}: {
  tone: 'success' | 'danger' | 'info' | 'gold';
  icon: React.ReactNode;
  children: React.ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
  role?: 'status' | 'alert';
}) {
  const color =
    tone === 'success'
      ? 'var(--wa-success)'
      : tone === 'danger'
        ? 'var(--wa-danger)'
        : tone === 'gold'
          ? 'var(--wa-gold)'
          : 'var(--wa-info)';
  return (
    <div
      role={role}
      className="wa-flex wa-items-start wa-gap-3"
      style={{
        padding: '12px 14px',
        borderRadius: 'var(--wa-radius-sm)',
        background: `color-mix(in srgb, ${color} 10%, var(--wa-surface))`,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      }}
    >
      <span aria-hidden style={{ color, flexShrink: 0, marginTop: 1 }}>
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--wa-text)', lineHeight: 1.5 }}>{children}</div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className="wa-kit-focus"
          style={{
            flexShrink: 0,
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--wa-muted)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '2px 6px',
          }}
        >
          {dismissLabel}
        </button>
      ) : null}
    </div>
  );
}

const pillBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 14px',
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 700,
  textDecoration: 'none',
  border: '1px solid var(--wa-border)',
  background: 'var(--wa-surface)',
  color: 'var(--wa-text)',
  whiteSpace: 'nowrap',
};

function FilterPill({ active, href, children }: { active: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      style={{
        ...pillBase,
        background: active ? 'var(--wa-accent)' : 'var(--wa-surface)',
        borderColor: active ? 'var(--wa-accent)' : 'var(--wa-border)',
        color: active ? 'var(--wa-on-accent)' : 'var(--wa-muted)',
      }}
    >
      {children}
    </Link>
  );
}

export default function EmployerJobsBoard({
  jobs,
  filter,
  page,
  pageSize,
  totalInFilter,
  totalInDb,
  deletableInFilter,
  closableInFilter,
  titleByIdInFilter,
  locationType,
}: {
  jobs: EmployerJobBoardItem[];
  filter: EmployerJobListFilter;
  page: number;
  pageSize: number;
  totalInFilter: number;
  totalInDb: number;
  deletableInFilter: BulkRow[];
  closableInFilter: BulkRow[];
  titleByIdInFilter: Record<string, string>;
  locationType?: EmployerJobLocationType;
}) {
  const router = useRouter();
  const tCommon = useTranslations('common');
  const modalTitleId = useId();
  const modalDescId = useId();
  const modalPendingNoteId = useId();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [pausingId, setPausingId] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMode, setConfirmMode] = useState<'delete' | 'close'>('delete');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkOutcomeError, setBulkOutcomeError] = useState<string | null>(null);
  const [flashBanner, setFlashBanner] = useState<{ type: 'delete' | 'close'; count: number } | null>(null);
  const [submitReviewDraftNotice, setSubmitReviewDraftNotice] = useState<{
    title: string;
    reasons: string[];
  } | null>(null);
  const [reviewActionError, setReviewActionError] = useState<string | null>(null);
  const [closeModal, setCloseModal] = useState<{ id: string; title: string; status: string } | null>(null);
  const closeModalTitleId = useId();
  const closeModalDescId = useId();

  const deletableIdsInFilter = useMemo(() => deletableInFilter.map((r) => r.id), [deletableInFilter]);
  const closableIdsInFilter = useMemo(() => closableInFilter.map((r) => r.id), [closableInFilter]);

  const deletableIdsOnPage = useMemo(
    () => jobs.filter((j) => canBulkDelete(j.status)).map((j) => j.id),
    [jobs]
  );
  const closableIdsOnPage = useMemo(
    () => jobs.filter((j) => canBulkClose(j.status)).map((j) => j.id),
    [jobs]
  );

  const selectedDeletable = useMemo(
    () => [...selected].filter((id) => deletableIdsInFilter.includes(id)),
    [selected, deletableIdsInFilter]
  );

  const selectedClosable = useMemo(
    () => [...selected].filter((id) => closableIdsInFilter.includes(id)),
    [selected, closableIdsInFilter]
  );

  const bulkDeleteIncludesPendingReview = useMemo(
    () =>
      selectedDeletable.some((id) => deletableInFilter.find((d) => d.id === id)?.status === 'pending'),
    [selectedDeletable, deletableInFilter]
  );

  const totalPages = Math.max(1, Math.ceil(totalInFilter / pageSize));

  // Sum applicants across the CURRENT page only (kept as a "this page" KPI —
  // no new query was added to derive a true cross-page total).
  const applicantsOnPage = useMemo(() => jobs.reduce((sum, j) => sum + j.applicationsCount, 0), [jobs]);

  useEffect(() => {
    setSelected(new Set());
    setBulkOutcomeError(null);
  }, [filter, page]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(BULK_DELETE_FLASH_KEY);
      if (raw) {
        sessionStorage.removeItem(BULK_DELETE_FLASH_KEY);
        const parsed = JSON.parse(raw) as { count?: unknown };
        const count = typeof parsed.count === 'number' && parsed.count > 0 ? parsed.count : null;
        if (count != null) setFlashBanner({ type: 'delete', count });
      }
    } catch {
      try {
        sessionStorage.removeItem(BULK_DELETE_FLASH_KEY);
      } catch {
        /* ignore */
      }
    }

    try {
      const raw = sessionStorage.getItem(BULK_CLOSE_FLASH_KEY);
      if (raw) {
        sessionStorage.removeItem(BULK_CLOSE_FLASH_KEY);
        const parsed = JSON.parse(raw) as { count?: unknown };
        const count = typeof parsed.count === 'number' && parsed.count > 0 ? parsed.count : null;
        if (count != null) setFlashBanner({ type: 'close', count });
      }
    } catch {
      try {
        sessionStorage.removeItem(BULK_CLOSE_FLASH_KEY);
      } catch {
        /* ignore */
      }
    }

    try {
      const rawDraft = sessionStorage.getItem(EMPLOYER_JOB_SUBMIT_REVIEW_DRAFT_FLASH);
      if (rawDraft) {
        sessionStorage.removeItem(EMPLOYER_JOB_SUBMIT_REVIEW_DRAFT_FLASH);
        const parsed = JSON.parse(rawDraft) as { title?: unknown; reasons?: unknown };
        const reasons = Array.isArray(parsed.reasons)
          ? parsed.reasons.filter((r): r is string => typeof r === 'string' && r.length > 0)
          : [];
        if (reasons.length > 0) {
          setSubmitReviewDraftNotice({
            title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : 'Your posting',
            reasons,
          });
        }
      }
    } catch {
      try {
        sessionStorage.removeItem(EMPLOYER_JOB_SUBMIT_REVIEW_DRAFT_FLASH);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const modalTrapRef = useFocusTrap(confirmOpen, () => setConfirmOpen(false));
  const closeModalTrapRef = useFocusTrap(!!closeModal, () => setCloseModal(null));

  const toggleOne = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const selectAllDeletable = useCallback(() => {
    setSelected(new Set(deletableIdsInFilter));
  }, [deletableIdsInFilter]);

  const selectAllClosable = useCallback(() => {
    setSelected(new Set(closableIdsInFilter));
  }, [closableIdsInFilter]);

  const selectAllDeletableOnPage = useCallback(() => {
    setSelected(new Set(deletableIdsOnPage));
  }, [deletableIdsOnPage]);

  const selectAllClosableOnPage = useCallback(() => {
    setSelected(new Set(closableIdsOnPage));
  }, [closableIdsOnPage]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const resolveTitle = useCallback(
    (id: string) => titleByIdInFilter[id] ?? jobs.find((j) => j.id === id)?.title ?? id,
    [titleByIdInFilter, jobs]
  );

  const handleMassDelete = useCallback(() => {
    if (deletableIdsInFilter.length === 0) {
      setReviewActionError(
        'Nothing in this view can be bulk-removed. Live postings must be marked filled before removal.'
      );
      return;
    }
    flushSync(() => {
      setSelected(new Set(deletableIdsInFilter));
    });
    setConfirmMode('delete');
    setBulkError(null);
    setConfirmOpen(true);
  }, [deletableIdsInFilter]);

  async function submitForReview(id: string, jobStatus: string) {
    setBusyId(id);
    setReviewActionError(null);
    trackEmployerJobAction('submit_review', id, { status: jobStatus });
    try {
      const res = await fetch(`/api/employer/jobs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'pending' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setReviewActionError(typeof data.error === 'string' ? data.error : 'Could not submit for review.');
        return;
      }
      router.refresh();
    } catch (err) {
      setReviewActionError(
        requestFailureMessage(err, { connection: tCommon('connectionError'), fallback: 'Could not submit for review.' }, 'employer-job-submit-review'),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function publishJob(id: string, jobStatus: string) {
    setPublishingId(id);
    setReviewActionError(null);
    trackEmployerJobAction('publish', id, { status: jobStatus });
    try {
      const res = await fetch(`/api/employer/jobs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'live' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setReviewActionError(typeof data.error === 'string' ? data.error : 'Could not publish job.');
        return;
      }
      router.refresh();
    } catch (err) {
      setReviewActionError(
        requestFailureMessage(err, { connection: tCommon('connectionError'), fallback: 'Could not publish job.' }, 'employer-job-publish'),
      );
    } finally {
      setPublishingId(null);
    }
  }

  async function pauseJob(id: string, jobStatus: string) {
    setPausingId(id);
    setReviewActionError(null);
    trackEmployerJobAction('pause_job', id, { status: jobStatus });
    try {
      const res = await fetch(`/api/employer/jobs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setReviewActionError(typeof data.error === 'string' ? data.error : 'Could not pause job.');
        return;
      }
      router.refresh();
    } catch (err) {
      setReviewActionError(
        requestFailureMessage(err, { connection: tCommon('connectionError'), fallback: 'Could not pause job.' }, 'employer-job-pause'),
      );
    } finally {
      setPausingId(null);
    }
  }

  const confirmCloseJob = async () => {
    if (!closeModal) return;
    const { id, status } = closeModal;
    setClosingId(id);
    setReviewActionError(null);
    trackEmployerJobAction('close_job', id, { status });
    try {
      const res = await fetch(`/api/employer/jobs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'closed' }),
      });
      if (res.ok) {
        setCloseModal(null);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setReviewActionError(typeof data.error === 'string' ? data.error : 'Could not close this posting. Try again.');
      }
    } catch (err) {
      setReviewActionError(
        requestFailureMessage(err, { connection: tCommon('connectionError'), fallback: 'Could not close this posting. Try again.' }, 'employer-job-close'),
      );
    } finally {
      setClosingId(null);
    }
  };

  const openConfirm = (mode: 'delete' | 'close') => {
    if (mode === 'delete' && selectedDeletable.length === 0) return;
    if (mode === 'close' && selectedClosable.length === 0) return;
    setConfirmMode(mode);
    setBulkError(null);
    setBulkOutcomeError(null);
    setConfirmOpen(true);
  };

  const runBulkAction = async () => {
    if (confirmMode === 'delete') {
      await runBulkDelete();
    } else {
      await runBulkClose();
    }
  };

  const runBulkDelete = async () => {
    if (selectedDeletable.length === 0) return;
    setBulkBusy(true);
    setBulkError(null);
    setBulkOutcomeError(null);
    try {
      const batches = chunkIds(selectedDeletable, EMPLOYER_JOB_BULK_MAX_IDS_PER_REQUEST);
      let deletedCount = 0;
      for (const ids of batches) {
        const res = await fetch('/api/employer/jobs/bulk-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids, action: 'delete' }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const base =
            typeof data.error === 'string' ? data.error : 'Could not delete selected jobs.';
          const msg =
            deletedCount > 0
              ? `${base} (${deletedCount} posting${deletedCount === 1 ? '' : 's'} were removed before this error.)`
              : base;
          if (deletedCount > 0) {
            setBulkOutcomeError(msg);
            setConfirmOpen(false);
            clearSelection();
          } else {
            setBulkError(msg);
          }
          router.refresh();
          return;
        }
        deletedCount += typeof data.deleted === 'number' ? data.deleted : ids.length;
      }
      trackEmployerBulkDelete(deletedCount, { filter, batches: batches.length });
      try {
        sessionStorage.setItem(BULK_DELETE_FLASH_KEY, JSON.stringify({ count: deletedCount }));
      } catch {
        /* ignore */
      }
      setConfirmOpen(false);
      clearSelection();
      router.refresh();
      queueMicrotask(() => {
        try {
          const raw = sessionStorage.getItem(BULK_DELETE_FLASH_KEY);
          if (!raw) return;
          sessionStorage.removeItem(BULK_DELETE_FLASH_KEY);
          const parsed = JSON.parse(raw) as { count?: unknown };
          const count = typeof parsed.count === 'number' && parsed.count > 0 ? parsed.count : null;
          if (count != null) setFlashBanner({ type: 'delete', count });
        } catch {
          try {
            sessionStorage.removeItem(BULK_DELETE_FLASH_KEY);
          } catch {
            /* ignore */
          }
        }
      });
    } catch {
      setBulkError('Network error. Check your connection and try again.');
    } finally {
      setBulkBusy(false);
    }
  };

  const runBulkClose = async () => {
    if (selectedClosable.length === 0) return;
    setBulkBusy(true);
    setBulkError(null);
    setBulkOutcomeError(null);
    try {
      const batches = chunkIds(selectedClosable, EMPLOYER_JOB_BULK_MAX_IDS_PER_REQUEST);
      let closedCount = 0;
      for (const ids of batches) {
        const res = await fetch('/api/employer/jobs/bulk-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids, action: 'close' }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const base =
            typeof data.error === 'string' ? data.error : 'Could not close selected jobs.';
          const msg =
            closedCount > 0
              ? `${base} (${closedCount} posting${closedCount === 1 ? '' : 's'} were updated before this error.)`
              : base;
          if (closedCount > 0) {
            setBulkOutcomeError(msg);
            setConfirmOpen(false);
            clearSelection();
          } else {
            setBulkError(msg);
          }
          router.refresh();
          return;
        }
        closedCount += typeof data.closed === 'number' ? data.closed : ids.length;
      }
      try {
        sessionStorage.setItem(BULK_CLOSE_FLASH_KEY, JSON.stringify({ count: closedCount }));
      } catch {
        /* ignore */
      }
      setConfirmOpen(false);
      clearSelection();
      router.refresh();
      queueMicrotask(() => {
        try {
          const raw = sessionStorage.getItem(BULK_CLOSE_FLASH_KEY);
          if (!raw) return;
          sessionStorage.removeItem(BULK_CLOSE_FLASH_KEY);
          const parsed = JSON.parse(raw) as { count?: unknown };
          const count = typeof parsed.count === 'number' && parsed.count > 0 ? parsed.count : null;
          if (count != null) setFlashBanner({ type: 'close', count });
        } catch {
          try {
            sessionStorage.removeItem(BULK_CLOSE_FLASH_KEY);
          } catch {
            /* ignore */
          }
        }
      });
    } catch {
      setBulkError('Network error. Check your connection and try again.');
    } finally {
      setBulkBusy(false);
    }
  };

  const allDeletableSelected =
    deletableIdsInFilter.length > 0 && deletableIdsInFilter.every((id) => selected.has(id));

  const allClosableSelected =
    closableIdsInFilter.length > 0 && closableIdsInFilter.every((id) => selected.has(id));

  const allDeletableOnPageSelected =
    deletableIdsOnPage.length > 0 && deletableIdsOnPage.every((id) => selected.has(id));
  const allClosableOnPageSelected =
    closableIdsOnPage.length > 0 && closableIdsOnPage.every((id) => selected.has(id));

  const showBulkDelete = deletableIdsInFilter.length > 0;
  const showBulkClose = closableIdsInFilter.length > 0;

  if (totalInDb === 0) {
    return (
      <DesignSurface surface="dense">
        <div className="wa-kit-card" role="status">
          <KitEmptyState
            headingAs="h2"
            title="No postings yet"
            description="Create a posting to start hiring. Everything stays private until you submit for WorkforceAP review — nothing goes live by surprise."
            action={
              <Link href="/employer/jobs/new" className="wa-kit-cta">
                Create your first posting
              </Link>
            }
          />
        </div>
      </DesignSurface>
    );
  }

  return (
    <DesignSurface surface="dense" className="wa-space-y-5">
      {reviewActionError && (
        <Banner tone="danger" icon={<TriangleAlert size={16} aria-hidden />} role="alert" onDismiss={() => setReviewActionError(null)}>
          {reviewActionError}
        </Banner>
      )}
      {bulkOutcomeError && (
        <Banner tone="danger" icon={<TriangleAlert size={16} aria-hidden />} role="alert" onDismiss={() => setBulkOutcomeError(null)}>
          {bulkOutcomeError}
        </Banner>
      )}
      {flashBanner && (
        <Banner tone="success" icon={<CheckCircle2 size={16} aria-hidden />} onDismiss={() => setFlashBanner(null)} dismissLabel="Dismiss confirmation">
          {flashBanner.type === 'delete' ? (
            <>
              <strong>{flashBanner.count}</strong> posting{flashBanner.count === 1 ? '' : 's'} removed.
            </>
          ) : (
            <>
              <strong>{flashBanner.count}</strong> posting{flashBanner.count === 1 ? '' : 's'} marked as filled.
            </>
          )}
        </Banner>
      )}
      {submitReviewDraftNotice && (
        <Banner tone="gold" icon={<Info size={16} aria-hidden />} onDismiss={() => setSubmitReviewDraftNotice(null)} dismissLabel="Dismiss notice">
          <strong>{submitReviewDraftNotice.title}</strong> was saved as a <strong>draft</strong> instead of being sent for
          review. Complete the following, then use &quot;Send for review&quot; from My Jobs:{' '}
          {submitReviewDraftNotice.reasons.join('; ')}.
        </Banner>
      )}

      {/* KPI strip — accurate, prop-derived counts only (no new queries). */}
      <div className="wa-grid wa-grid-cols-2 lg:wa-grid-cols-3 wa-gap-3">
        <StatSparkTile icon={<Briefcase size={16} />} label="All postings" value={totalInDb} color="accent" />
        <StatSparkTile icon={<ListFilter size={16} />} label="In this view" value={totalInFilter} color="info" />
        <StatSparkTile icon={<Users size={16} />} label="Applicants (this page)" value={applicantsOnPage} color="gold" />
      </div>

      <div className="wa-flex wa-flex-wrap wa-gap-2" role="toolbar" aria-label="Filter by hiring stage">
        {FILTERS.map((f) => (
          <FilterPill key={f.value} active={filter === f.value} href={employerJobsListHref(f.value, 1, locationType)}>
            {f.label}
          </FilterPill>
        ))}
      </div>

      {showBulkDelete && (
        <div className="wa-flex wa-flex-wrap wa-items-center wa-gap-3">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={handleMassDelete}
            disabled={bulkBusy}
          >
            Mass delete…
          </button>
          <span style={{ fontSize: 13, color: 'var(--wa-muted)' }}>
            Selects every removable posting in this view ({deletableIdsInFilter.length}) and asks for confirmation.
            Live jobs cannot be removed here.
          </span>
        </div>
      )}

      {(showBulkDelete || showBulkClose) && (
        <div
          className="wa-kit-card wa-kit-card--sm wa-flex wa-flex-wrap wa-items-center wa-justify-between wa-gap-3"
          role="region"
          aria-label="Bulk actions for selected postings"
        >
          <p style={{ margin: 0, fontSize: 13 }} aria-live="polite">
            {selected.size === 0 ? (
              <span style={{ color: 'var(--wa-muted)' }}>Select postings below for bulk actions.</span>
            ) : (
              <>
                <strong>{selected.size}</strong> selected
              </>
            )}
          </p>
          <div className="wa-flex wa-flex-wrap wa-items-center wa-gap-2">
            {showBulkDelete && (
              <>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={selectAllDeletableOnPage}
                  disabled={deletableIdsOnPage.length === 0 || allDeletableOnPageSelected}
                >
                  All deletable (this page)
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={selectAllDeletable}
                  disabled={allDeletableSelected}
                >
                  All deletable (entire filter)
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={selectedDeletable.length === 0 || bulkBusy}
                  onClick={() => openConfirm('delete')}
                >
                  Remove ({selectedDeletable.length})
                </button>
              </>
            )}
            {showBulkClose && (
              <>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={selectAllClosableOnPage}
                  disabled={closableIdsOnPage.length === 0 || allClosableOnPageSelected}
                >
                  All closable (this page)
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={selectAllClosable}
                  disabled={allClosableSelected}
                >
                  All closable (entire filter)
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={selectedClosable.length === 0 || bulkBusy}
                  onClick={() => openConfirm('close')}
                >
                  Mark filled ({selectedClosable.length})
                </button>
              </>
            )}
            {selected.size > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={clearSelection}>
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {totalInFilter === 0 ? (
        <div className="wa-kit-card" style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--wa-muted)', margin: '0 0 12px' }}>Nothing in this stage right now.</p>
          <Link href={employerJobsListHref('all', 1, locationType)} className="btn btn-muted btn-sm">
            Show all postings
          </Link>
        </div>
      ) : (
        <>
          <ul className="wa-grid wa-grid-cols-1 md:wa-grid-cols-2 xl:wa-grid-cols-3 wa-gap-4" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {jobs.map((j) => {
              const deletable = canBulkDelete(j.status);
              const closable = canBulkClose(j.status);
              const selectable = deletable || closable;
              const checked = selected.has(j.id);
              const pay = formatCompensation(j.salaryMin, j.salaryMax);
              const workStyle = formatWorkStyle(j.locationType, j.jobType);
              const next = nextStepHint(j);
              const showReadiness = j.status === 'draft' && j.readinessIssues.length > 0;
              const showPendingNote = j.status === 'pending';

              return (
                <li key={j.id}>
                  <article
                    className="wa-kit-card wa-kit-card--hover"
                    style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}
                  >
                    <div className="wa-flex wa-items-start wa-justify-between wa-gap-2">
                      <div className="wa-flex wa-items-center wa-gap-2" style={{ minWidth: 0 }}>
                        {selectable && (
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => toggleOne(j.id, e.target.checked)}
                            aria-label={`Select ${j.title}`}
                            style={{ width: 16, height: 16, accentColor: 'var(--wa-accent)', flexShrink: 0 }}
                          />
                        )}
                        <StatusTag tone={statusTone(j.status)}>{employerJobPortalStatusLabel(j.status)}</StatusTag>
                      </div>
                      <time
                        dateTime={j.updatedAt}
                        style={{ fontSize: 13, color: 'var(--wa-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}
                      >
                        Updated {new Date(j.updatedAt).toLocaleDateString()}
                      </time>
                    </div>

                    {next && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--wa-muted)' }}>{next}</div>}

                    {showPendingNote && (
                      <Banner tone="info" icon={<Info size={14} aria-hidden />}>
                        With WorkforceAP for review — candidates do not see this posting yet.
                      </Banner>
                    )}

                    {showReadiness && (
                      <Banner
                        tone={j.readinessLevel === 'thin' ? 'danger' : 'gold'}
                        icon={<TriangleAlert size={14} aria-hidden />}
                      >
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>{readinessLabel(j.readinessLevel)}</div>
                        <ul style={{ margin: 0, paddingLeft: 16 }}>
                          {j.readinessIssues.map((issue) => (
                            <li key={issue.key}>{issue.message}</li>
                          ))}
                        </ul>
                      </Banner>
                    )}

                    <h2 style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.01em', margin: 0, textWrap: 'balance' }}>
                      {j.title}
                    </h2>

                    <dl className="wa-grid wa-grid-cols-3 wa-gap-2" style={{ margin: 0 }}>
                      <div>
                        <dt className="wa-kit-stat-label" style={{ fontSize: 13 }}>Where</dt>
                        <dd style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 600 }}>{j.location}</dd>
                      </div>
                      <div>
                        <dt className="wa-kit-stat-label" style={{ fontSize: 13 }}>Pay</dt>
                        <dd style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{pay}</dd>
                      </div>
                      <div>
                        <dt className="wa-kit-stat-label" style={{ fontSize: 13 }}>How</dt>
                        <dd style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 600 }}>{workStyle}</dd>
                      </div>
                    </dl>

                    <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: 0, lineHeight: 1.5, flex: 1 }}>
                      {j.descriptionPreview}
                    </p>

                    <p className="wa-flex wa-items-center wa-gap-1" style={{ fontSize: 13, margin: 0, color: 'var(--wa-text)' }}>
                      <Users size={13} aria-hidden style={{ color: 'var(--wa-muted)' }} />
                      <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{j.applicationsCount}</strong> application
                      {j.applicationsCount === 1 ? '' : 's'}
                    </p>

                    <div className="wa-flex wa-flex-wrap wa-gap-2" style={{ borderTop: '1px solid var(--wa-border)', paddingTop: 12 }}>
                      <Link
                        href={`/employer/jobs/${j.id}`}
                        className="btn btn-primary btn-sm"
                        onClick={() => trackEmployerJobAction('edit', j.id, { status: j.status })}
                      >
                        {j.status === 'draft' ? 'Edit draft' : 'View & edit'}
                      </Link>
                      {j.status === 'draft' && (
                        <button
                          type="button"
                          className="btn btn-accent btn-sm"
                          disabled={busyId === j.id}
                          onClick={() => submitForReview(j.id, j.status)}
                        >
                          {busyId === j.id ? 'Sending…' : 'Send for review'}
                        </button>
                      )}
                      {j.status === 'approved' && (
                        <button
                          type="button"
                          className="btn btn-accent btn-sm"
                          disabled={publishingId === j.id}
                          onClick={() => publishJob(j.id, j.status)}
                        >
                          {publishingId === j.id ? 'Publishing…' : 'Go live'}
                        </button>
                      )}
                      {j.status === 'live' && (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          disabled={!!pausingId || !!closingId}
                          onClick={() => pauseJob(j.id, j.status)}
                        >
                          {pausingId === j.id ? 'Pausing…' : 'Pause'}
                        </button>
                      )}
                      {(j.status === 'live' || j.status === 'approved') && (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          disabled={!!closingId}
                          onClick={() => setCloseModal({ id: j.id, title: j.title, status: j.status })}
                        >
                          {closingId === j.id ? 'Updating…' : 'Close'}
                        </button>
                      )}
                      {j.status !== 'draft' && (
                        <Link
                          href={`/employer/jobs/${encodeURIComponent(j.id)}/applicants`}
                          className="btn btn-ghost btn-sm"
                          onClick={() => trackEmployerJobAction('view_applications', j.id, { status: j.status })}
                        >
                          View applicants
                        </Link>
                      )}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>

          {totalPages > 1 && (
            <nav
              className="wa-flex wa-items-center wa-justify-between wa-flex-wrap wa-gap-3"
              aria-label="Job list pages"
            >
              {page <= 1 ? (
                <span className="btn btn-outline btn-sm" aria-disabled="true" style={{ opacity: 0.5, pointerEvents: 'none' }}>
                  Previous
                </span>
              ) : (
                <Link href={employerJobsListHref(filter, page - 1, locationType)} className="btn btn-outline btn-sm">
                  Previous
                </Link>
              )}
              <span style={{ fontSize: 13, color: 'var(--wa-muted)' }}>
                Page <strong style={{ color: 'var(--wa-text)' }}>{page}</strong> of{' '}
                <strong style={{ color: 'var(--wa-text)' }}>{totalPages}</strong>
                <span> ({totalInFilter} in this view)</span>
              </span>
              {page >= totalPages ? (
                <span className="btn btn-outline btn-sm" aria-disabled="true" style={{ opacity: 0.5, pointerEvents: 'none' }}>
                  Next
                </span>
              ) : (
                <Link href={employerJobsListHref(filter, page + 1, locationType)} className="btn btn-outline btn-sm">
                  Next
                </Link>
              )}
            </nav>
          )}
        </>
      )}

      {closeModal && (
        <div
          role="presentation"
          onClick={() => !closingId && setCloseModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: 16,
          }}
        >
          <div
            ref={closeModalTrapRef as RefObject<HTMLDivElement>}
            className="wa-kit-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby={closeModalTitleId}
            aria-describedby={closeModalDescId}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 460, width: '100%', boxShadow: 'var(--wa-shadow-lg)' }}
          >
            <h2 id={closeModalTitleId} style={{ fontWeight: 800, fontSize: 17, margin: '0 0 10px' }}>
              Close posting?
            </h2>
            <p id={closeModalDescId} style={{ fontSize: 13, color: 'var(--wa-muted)', margin: '0 0 20px', lineHeight: 1.5 }}>
              This closes <strong style={{ color: 'var(--wa-text)' }}>{closeModal.title}</strong>. Candidates will no
              longer see it. You can still view past applicants from the applicants list.
            </p>
            <div className="wa-flex wa-justify-end wa-gap-2">
              <button type="button" className="btn btn-ghost" disabled={!!closingId} onClick={() => setCloseModal(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" disabled={!!closingId} onClick={() => void confirmCloseJob()}>
                {closingId ? 'Updating…' : 'Yes, close posting'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div
          role="presentation"
          onClick={() => !bulkBusy && setConfirmOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: 16,
          }}
        >
          <div
            ref={modalTrapRef as RefObject<HTMLDivElement>}
            className="wa-kit-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby={modalTitleId}
            aria-describedby={
              bulkDeleteIncludesPendingReview && confirmMode === 'delete'
                ? `${modalDescId} ${modalPendingNoteId}`
                : modalDescId
            }
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 520, width: '100%', boxShadow: 'var(--wa-shadow-lg)', maxHeight: '85vh', overflowY: 'auto' }}
          >
            <h2 id={modalTitleId} style={{ fontWeight: 800, fontSize: 17, margin: '0 0 10px' }}>
              {confirmMode === 'delete' ? (
                <>
                  Remove {selectedDeletable.length} posting{selectedDeletable.length === 1 ? '' : 's'}?
                </>
              ) : (
                <>
                  Mark {selectedClosable.length} posting{selectedClosable.length === 1 ? '' : 's'} as filled?
                </>
              )}
            </h2>
            {confirmMode === 'delete' && (
              <p role="alert" style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-danger)', margin: '0 0 8px' }}>
                This cannot be undone. Postings are permanently removed from WorkforceAP and linked applicant records
                in your portal are deleted.
              </p>
            )}
            <p id={modalDescId} style={{ fontSize: 13, color: 'var(--wa-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
              {confirmMode === 'delete' ? (
                <>
                  These postings leave WorkforceAP. Applicant records tied to them are removed too. Live and
                  board-approved roles cannot be bulk-removed — mark filled first.
                </>
              ) : (
                <>
                  These postings will move out of active hiring and into your filled/closed list. You can still view
                  past applicants from the applicants list.
                </>
              )}
            </p>
            <ul style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: 13, color: 'var(--wa-text)' }}>
              {(confirmMode === 'delete' ? selectedDeletable : selectedClosable).slice(0, 6).map((id) => (
                <li key={id}>{resolveTitle(id)}</li>
              ))}
              {(confirmMode === 'delete' ? selectedDeletable : selectedClosable).length > 6 && (
                <li style={{ color: 'var(--wa-muted)' }}>
                  +{(confirmMode === 'delete' ? selectedDeletable : selectedClosable).length - 6} more
                </li>
              )}
            </ul>
            {confirmMode === 'delete' && bulkDeleteIncludesPendingReview && (
              <p id={modalPendingNoteId} role="note" style={{ margin: '0 0 12px' }}>
                <Banner tone="gold" icon={<Info size={14} aria-hidden />}>
                  <strong>In review:</strong> at least one selected posting is waiting on WorkforceAP. Removing it
                  pulls it from our review queue. You can still continue.
                </Banner>
              </p>
            )}
            {bulkError && (
              <p role="alert" style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-danger)', margin: '0 0 12px' }}>
                {bulkError}
              </p>
            )}
            <div className="wa-flex wa-justify-end wa-gap-2">
              <button type="button" className="btn btn-ghost" disabled={bulkBusy} onClick={() => setConfirmOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" disabled={bulkBusy} onClick={runBulkAction}>
                {bulkBusy
                  ? confirmMode === 'delete'
                    ? 'Removing…'
                    : 'Marking filled…'
                  : confirmMode === 'delete'
                    ? 'Yes, remove'
                    : 'Yes, mark filled'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DesignSurface>
  );
}
