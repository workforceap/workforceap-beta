import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { buildPageMetadata } from '@/app/seo';
import PageHeader from '@/components/portal/PageHeader';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import {
  countUnmatchedXapiEventsByExternalEmail,
  loadUnmatchedXapiEventsByExternalEmailPaginated,
  type UnmatchedXapiEventRow,
} from '@/lib/coursera/progressQueries';
import DataTable from '@/components/portal/ui/DataTable';

export const metadata: Metadata = buildPageMetadata({
  title: 'Coursera unmatched xAPI events',
  description: 'Paginated list of all unresolved xAPI events for a Coursera-only learner.',
  path: '/admin/coursera/learners/unmatched/events',
});

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

function formatDateTime(value: Date | null | undefined): string {
  if (!value) return '—';
  return value.toLocaleString();
}

function shortVerb(verbId: string | null): string {
  if (!verbId) return '—';
  const tail = verbId.split('/').pop() ?? verbId;
  return tail;
}

function clampPage(raw: string | string[] | undefined, totalPages: number): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number.parseInt(value ?? '1', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, Math.max(totalPages, 1));
}

export default async function AdminCourseraUnmatchedEventsPage({
  params,
  searchParams,
}: {
  params: Promise<{ externalEmail: string }>;
  searchParams?: Promise<{ page?: string | string[] }>;
}) {
  const viewer = await getUser();
  if (!viewer) redirect('/login?redirectTo=/admin/coursera');
  const scope = await resolveAdminPageTenant(viewer.id);
  if (!scope.ok) redirect('/dashboard');
  const organizationId = await getActorOrganizationId(viewer.id);

  const { externalEmail } = await params;
  const decoded = decodeURIComponent(externalEmail);
  const sp = (await searchParams) ?? {};

  // Get the total first so we can clamp the page param.
  const total = await countUnmatchedXapiEventsByExternalEmail(decoded, organizationId);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = clampPage(sp.page, totalPages);

  const events = await loadUnmatchedXapiEventsByExternalEmailPaginated(decoded, organizationId, page, PAGE_SIZE);

  const startIdx = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(page * PAGE_SIZE, total);

  const detailHref = `/admin/coursera/learners/unmatched/${encodeURIComponent(decoded)}`;
  const pageHref = (n: number) => `?page=${n}`;

  return (
    <PortalPageFrame>
      <PageHeader
        title="Unmatched xAPI events"
        subtitle={decoded}
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Coursera', href: '/admin/coursera' },
          { label: 'Unmatched', href: detailHref },
          { label: 'Events' },
        ]}
      />

      <div style={{ display: 'grid', gap: '1rem' }}>
        <section className="content-card" style={{ padding: '1rem 1.1rem', display: 'grid', gap: '0.5rem' }}>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-on-surface-variant)' }}>
            Real-time activity Coursera sent for this email that we couldn&rsquo;t link to a member.
            Mapping the learner from the{' '}
            <Link href={detailHref}>detail page</Link> will reprocess these.
          </p>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
            {total === 0
              ? 'No events found.'
              : `Showing ${startIdx}–${endIdx} of ${total} events · page ${page} of ${totalPages}`}
          </p>
        </section>

        {events.length > 0 ? (
          <section className="content-card" style={{ padding: '1rem 1.1rem' }}>
            <div style={{ overflowX: 'auto' }}>
              <DataTable<UnmatchedXapiEventRow>
                density="compact"
                scrollX={false}
                rows={events}
                rowKey={(evt) => evt.id}
                columns={[
                  {
                    key: 'received',
                    header: 'Received',
                    cell: (evt) => (
                      <span style={{ whiteSpace: 'nowrap' }}>{formatDateTime(evt.receivedAt)}</span>
                    ),
                  },
                  {
                    key: 'course',
                    header: 'Course',
                    cell: (evt) => (
                      <>
                        <strong>{evt.courseName ?? evt.courseSlug ?? '—'}</strong>
                        {evt.courseSlug && evt.courseName ? (
                          <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                            {evt.courseSlug}
                          </div>
                        ) : null}
                      </>
                    ),
                  },
                  {
                    key: 'verb',
                    header: 'Verb',
                    cell: (evt) => <code style={{ fontSize: '0.8125rem' }}>{shortVerb(evt.verbId)}</code>,
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    cell: (evt) => (
                      <>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.1rem 0.45rem',
                            borderRadius: 999,
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            background:
                              evt.completionStatus === 'unmatched'
                                ? 'rgba(251, 191, 36, 0.18)'
                                : 'rgba(176, 0, 32, 0.12)',
                            color:
                              evt.completionStatus === 'unmatched'
                                ? 'rgb(180, 130, 0)'
                                : 'var(--color-error, #b00020)',
                          }}
                        >
                          {evt.completionStatus}
                        </span>
                        {evt.error ? (
                          <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginTop: '0.2rem' }}>
                            {evt.error}
                          </div>
                        ) : null}
                      </>
                    ),
                  },
                  {
                    key: 'statement',
                    header: 'Statement ID',
                    cell: (evt) =>
                      evt.statementId ? (
                        <code style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', wordBreak: 'break-all' }}>
                          {evt.statementId}
                        </code>
                      ) : (
                        '—'
                      ),
                  },
                ]}
              />
            </div>

            {/* Pagination footer. Hidden when there's only one page. */}
            {totalPages > 1 ? (
              <nav
                aria-label="Events pagination"
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  marginTop: '1rem',
                  paddingTop: '0.75rem',
                  borderTop: '1px solid var(--outline-variant)',
                }}
              >
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
                  Page {page} of {totalPages}
                </p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {page > 1 ? (
                    <Link href={pageHref(page - 1)} className="btn btn-muted" style={{ fontSize: '0.85rem' }}>
                      ← Previous
                    </Link>
                  ) : (
                    <span
                      aria-disabled
                      className="btn btn-muted"
                      style={{ fontSize: '0.85rem', opacity: 0.4, pointerEvents: 'none' }}
                    >
                      ← Previous
                    </span>
                  )}
                  {page < totalPages ? (
                    <Link href={pageHref(page + 1)} className="btn btn-muted" style={{ fontSize: '0.85rem' }}>
                      Next →
                    </Link>
                  ) : (
                    <span
                      aria-disabled
                      className="btn btn-muted"
                      style={{ fontSize: '0.85rem', opacity: 0.4, pointerEvents: 'none' }}
                    >
                      Next →
                    </span>
                  )}
                </div>
              </nav>
            ) : null}
          </section>
        ) : (
          <section className="content-card" style={{ padding: '1rem 1.1rem' }}>
            <p style={{ margin: 0, color: 'var(--color-on-surface-variant)' }}>
              No unmatched events on this page.{' '}
              <Link href={detailHref}>Back to learner detail →</Link>
            </p>
          </section>
        )}

        <p style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
          <Link href={detailHref}>← Back to learner detail</Link>
        </p>
      </div>
    </PortalPageFrame>
  );
}
