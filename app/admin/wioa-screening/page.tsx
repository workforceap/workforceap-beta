import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { Prisma } from '@prisma/client';
import { resolveAdminPageTenant, withAdminPageScope } from '@/lib/tenant/adminPageScope';
import { ADMIN_SSR_LIST_CAP, isListTruncated, showingFirstLabel } from '@/lib/db/queryCaps';
import { parseWioaQualificationSnapshot } from '@/lib/wioa/wioaQualification';
import { wioaReviewLabel, WIOA_REVIEW_STATUSES } from '@/lib/wioa/wioaReview';
import { isWioaAwaitingReview, sortWioaQueueOldestFirst, wioaDaysWaiting } from '@/lib/wioa/wioaQueueAge';
import PageHeader from '@/components/portal/PageHeader';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import PortalRouteFallback from '@/components/portal/PortalRouteFallback';
import DataTable from '@/components/portal/ui/DataTable';
import WioaReviewFilterBar from '@/components/admin/WioaReviewFilterBar';
import ApplicantTriageChip from '@/components/admin/ApplicantTriageChip';
import { APPLICANT_TRIAGE_BUCKET_TEXT } from '@/lib/admin/applicantTriage';
import { loadApplicantTriageByUserIds, type ApplicantTriageLoaded } from '@/lib/admin/applicantTriageLoad';
import {
  WioaScreeningKit,
  type WioaScreeningRow,
  type WioaDetermination,
} from '@/components/portal/kit/pages/admin-subviews/WioaScreeningKit';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
  title: 'Admin – WIOA screening queue',
  description: 'Members who submitted the WIOA self-screening questionnaire.',
  path: '/admin/wioa-screening',
});
}

type PageProps = {
  searchParams?: Promise<{ review?: string | string[]; ui?: string | string[] }>;
};

type WioaQueueRow = {
  id: string;
  fullName: string;
  email: string;
  wioaQualificationJson: Prisma.JsonValue;
  wioaReviewStatus: string | null;
  wioaReviewedAt: Date | null;
  updatedAt: Date;
};

function normalizeReviewParam(raw: string | string[] | undefined): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || typeof v !== 'string') return null;
  return (WIOA_REVIEW_STATUSES as readonly string[]).includes(v) ? v : null;
}

/** Initials from a full name (e.g. "Mike Brown" → "MB"). */
function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** WIOA category caption from the self-screening answers. */
function categoryFrom(snap: ReturnType<typeof parseWioaQualificationSnapshot>): string {
  if (!snap) return 'Adult';
  if (snap.answers.dislocatedWorker) return 'Dislocated Worker';
  if (snap.answers.ageBracket === 'under18') return 'Youth';
  if (snap.answers.ageBracket === '18_24') return 'Youth';
  return 'Adult';
}

/** Map staff review status → determination tag + doc status. */
function determinationFrom(reviewStatus: string | null): {
  determination: WioaDetermination;
  docs: string;
  docsComplete: boolean;
} {
  switch (reviewStatus) {
    case 'verified':
      return { determination: 'Eligible', docs: 'Complete', docsComplete: true };
    case 'not_eligible':
      return { determination: 'Not eligible', docs: 'Reviewed', docsComplete: true };
    case 'needs_info':
      return { determination: 'Needs docs', docs: 'Missing docs', docsComplete: false };
    case 'in_review':
    case 'pending':
      return { determination: 'Pending', docs: 'In review', docsComplete: true };
    default:
      return { determination: 'Unreviewed', docs: 'Not started', docsComplete: false };
  }
}

export default async function AdminWioaScreeningQueuePage({ searchParams }: PageProps) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/wioa-screening');

  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const sp = (await searchParams) ?? {};
  const requestedUi = Array.isArray(sp.ui) ? sp.ui[0] : sp.ui;

  // ---------- LEGACY: original review-filtered queue (escape hatch) ----------
  if (requestedUi === 'legacy') {
    const reviewFilter = normalizeReviewParam(sp.review);

    let rows: WioaQueueRow[] = [];
    let totalRows = 0;
    try {
      const where = {
        deletedAt: null,
        wioaQualificationJson: { not: Prisma.DbNull },
        ...(reviewFilter ? { wioaReviewStatus: reviewFilter } : {}),
      } satisfies Prisma.UserWhereInput;
      [rows, totalRows] = await withAdminPageScope(scope, (db) =>
        Promise.all([
          db.user.findMany({
            take: ADMIN_SSR_LIST_CAP,
            where,
            orderBy: { updatedAt: 'desc' },
            select: {
              id: true,
              fullName: true,
              email: true,
              wioaQualificationJson: true,
              wioaReviewStatus: true,
              wioaReviewedAt: true,
              updatedAt: true,
            },
          }),
          db.user.count({ where }),
        ]),
      );
    } catch (error) {
      console.error('[admin/wioa-screening] failed to load queue', error);
      const message = error instanceof Error ? error.message : String(error ?? '');
      const looksLikeSchemaDrift =
        error instanceof Prisma.PrismaClientKnownRequestError ||
        error instanceof Prisma.PrismaClientUnknownRequestError ||
        /wioa_qualification_json|wioa_review_status|wioa_reviewed_at/i.test(message);

      if (looksLikeSchemaDrift) {
        return (
          <PortalRouteFallback
            title="WIOA screening queue is temporarily unavailable"
            description="The WIOA review data could not be loaded right now. Other admin views are still available while we reconnect this queue."
          />
        );
      }
      throw error;
    }

    // Read-only applicant intake triage for members with an open application (degrades to no chip).
    const triageById = await withAdminPageScope(scope, (db) => loadApplicantTriageByUserIds(db, rows.map((r) => r.id))).catch(
      (error: unknown) => {
        console.error('[admin/wioa-screening] applicant triage load failed', error);
        return new Map<string, ApplicantTriageLoaded>();
      },
    );

    const enriched = rows
      .map((r) => {
        const snap = parseWioaQualificationSnapshot(r.wioaQualificationJson);
        const triage = triageById.get(r.id) ?? null;
        const submittedAt = snap?.submittedAt ? new Date(snap.submittedAt).getTime() : 0;
        return {
          ...r,
          snap,
          submittedAt,
          signal: snap?.signal ?? '—',
          triage,
        };
      })
      .sort((a, b) => b.submittedAt - a.submittedAt);

    return (
      <PortalPageFrame>
        <PageHeader
          title="WIOA screening queue"
          subtitle={
            isListTruncated(enriched.length, ADMIN_SSR_LIST_CAP, totalRows)
              ? showingFirstLabel(
                  enriched.length,
                  totalRows,
                  reviewFilter ? 'screenings matching this filter' : 'screenings',
                )
              : 'Members who completed the portal self-screening. Review status is for internal workflow only.'
          }
          action={
            <Link href="/admin/members" className="btn btn-outline">
              ← All members
            </Link>
          }
        />

        <WioaReviewFilterBar active={reviewFilter} />

        {enriched.length === 0 ? (
          <p style={{ color: 'var(--color-on-surface-variant)' }}>
            {reviewFilter ? 'No rows match this filter.' : 'No self-screenings submitted yet.'}
          </p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="wa-hidden md:wa-block" style={{ overflowX: 'auto' }}>
              <DataTable
                variant="admin"
                tableClassName="admin-table admin-table--sticky-first"
                scrollX={false}
                rows={enriched}
                rowKey={(r) => r.id}
                columns={[
                  {
                    key: 'member',
                    header: 'Member',
                    stickyLeft: true,
                    cell: (r) => (
                      <>
                        <strong>{r.fullName}</strong>
                        <br />
                        <span style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>{r.email}</span>
                      </>
                    ),
                  },
                  {
                    key: 'submitted',
                    header: 'Submitted',
                    cell: (r) => (r.snap ? new Date(r.snap.submittedAt).toLocaleString() : '—'),
                  },
                  { key: 'signal', header: 'Signal', cell: (r) => r.signal },
                  { key: 'review', header: 'Review', cell: (r) => wioaReviewLabel(r.wioaReviewStatus) },
                  {
                    key: 'triage',
                    header: 'Intake triage',
                    cell: (r) =>
                      r.triage ? (
                        <ApplicantTriageChip bucket={r.triage.bucket} label={APPLICANT_TRIAGE_BUCKET_TEXT[r.triage.bucket]} reasons={r.triage.reasons} />
                      ) : (
                        '—'
                      ),
                  },
                  {
                    key: 'open',
                    header: '',
                    cell: (r) => (
                      <Link href={`/admin/members/${r.id}`} className="btn btn-outline btn-sm">
                        Open
                      </Link>
                    ),
                  },
                ]}
              />
            </div>

            {/* Mobile cards */}
            <div className="md:wa-hidden wa-flex wa-flex-col" style={{ gap: '0.625rem' }}>
              {enriched.map((r) => (
                <div
                  key={r.id}
                  style={{
                    background: 'var(--surface-container)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '0.875rem 1rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                    <div style={{ fontWeight: 600 }}>{r.fullName}</div>
                    <Link href={`/admin/members/${r.id}`} className="btn btn-outline btn-sm">
                      Open
                    </Link>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.25rem' }}>{r.email}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                    <span>Signal: <strong style={{ color: 'var(--color-on-surface)' }}>{r.signal}</strong></span>
                    <span>Review: <strong style={{ color: 'var(--color-on-surface)' }}>{wioaReviewLabel(r.wioaReviewStatus)}</strong></span>
                  </div>
                  <div style={{ marginTop: '0.25rem', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                    Submitted: <strong style={{ color: 'var(--color-on-surface)' }}>{r.snap ? new Date(r.snap.submittedAt).toLocaleString() : '—'}</strong>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </PortalPageFrame>
    );
  }

  // ---------- DEFAULT: design-kit funding eligibility view (lean data) ----------

  // KPI counts straight off the indexed review-status column (one groupBy), and
  // a capped table page (one findMany w/ the reviewer relation). Both run in
  // parallel; a failed core query degrades to the proven legacy view.
  const [countsResult, rowsResult] = await withAdminPageScope(scope, (db) =>
    Promise.allSettled([
      db.user.groupBy({
        by: ['wioaReviewStatus'],
        where: {
          deletedAt: null,
          wioaQualificationJson: { not: Prisma.DbNull },
        },
        _count: { _all: true },
      }),
      db.user.findMany({
        take: 200,
        where: {
          deletedAt: null,
          wioaQualificationJson: { not: Prisma.DbNull },
        },
        // Unreviewed rows first so the capped page always carries the whole
        // pending queue; `sortWioaQueueOldestFirst` below orders that block by
        // wait (WAP-166 item 2) once the JSON `submittedAt` has been parsed.
        orderBy: { wioaReviewedAt: { sort: 'asc', nulls: 'first' } },
        select: {
          id: true,
          fullName: true,
          wioaQualificationJson: true,
          wioaReviewStatus: true,
          wioaReviewedAt: true,
          updatedAt: true,
          wioaReviewer: { select: { fullName: true } },
        },
      }),
    ]),
  );

  if (rowsResult.status === 'rejected' || countsResult.status === 'rejected') {
    console.error(
      '[admin/wioa-screening] kit load failed',
      rowsResult.status === 'rejected'
        ? rowsResult.reason
        : countsResult.status === 'rejected'
          ? countsResult.reason
          : null,
    );
    redirect('/admin/wioa-screening?ui=legacy');
  }

  // KPI counts from the status groupBy.
  let eligible = 0;
  let pendingReview = 0;
  let needDocs = 0;
  let notEligible = 0;
  let total = 0;
  for (const g of countsResult.value) {
    const n = g._count._all;
    total += n;
    switch (g.wioaReviewStatus) {
      case 'verified':
        eligible += n;
        break;
      case 'pending':
      case 'in_review':
        pendingReview += n;
        break;
      case 'needs_info':
        needDocs += n;
        break;
      case 'not_eligible':
        notEligible += n;
        break;
      default:
        break;
    }
  }

  const now = new Date();
  const rows: WioaScreeningRow[] = sortWioaQueueOldestFirst(
    rowsResult.value.map((r) => {
      const snap = parseWioaQualificationSnapshot(r.wioaQualificationJson);
      const name = r.fullName?.trim() || 'Unnamed member';
      const { determination, docs, docsComplete } = determinationFrom(r.wioaReviewStatus);
      const awaitingReview = isWioaAwaitingReview(r.wioaReviewStatus);
      return {
        id: r.id,
        name,
        initials: initialsFrom(name),
        category: categoryFrom(snap),
        docs,
        docsComplete,
        determination,
        reviewer: r.wioaReviewer?.fullName?.trim() || '—',
        awaitingReview,
        // Only a screening still waiting on staff has a "days waiting".
        daysWaiting: awaitingReview
          ? wioaDaysWaiting({ wioaQualificationJson: r.wioaQualificationJson, updatedAt: r.updatedAt }, now)
          : null,
        reviewedAt: r.wioaReviewedAt,
      };
    }),
  );

  return (
    <WioaScreeningKit
      rows={rows}
      total={total}
      eligible={eligible}
      pendingReview={pendingReview}
      needDocs={needDocs}
      notEligible={notEligible}
    />
  );
}
