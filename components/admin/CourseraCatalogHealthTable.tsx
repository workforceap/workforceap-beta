import type { ReactNode } from 'react';
import { DataTable, type Column } from '@/components/portal/kit/DataTable';
import { StatusTag } from '@/components/portal/kit/StatusTag';
import type { ValidatedProgramCatalogEntry } from '@/lib/coursera/programCourseList';

/**
 * Coursera catalog health (admin `/admin/coursera`). Server-rendered on the
 * kit table: Program, Mapped, Provider and one Issues count; the unmapped,
 * stale, wrong-type and off-syllabus lists open in a sub-row (KIT_GUIDE §6a).
 */

type IssueGroup = { key: string; label: string; items: string[] };

function catalogIssueGroups(row: ValidatedProgramCatalogEntry): IssueGroup[] {
  const health = row.catalogHealth;
  return [
    { key: 'unmapped', label: 'Unmapped', items: row.unmappedSlugs },
    { key: 'stale', label: 'Stale IDs', items: row.staleCourseraIds },
    {
      key: 'invalid',
      label: 'Wrong type',
      items: health.invalidContentTypeIds.map((item) => `${item.id} (${item.contentType})`),
    },
    {
      key: 'additional',
      label: 'Additional Coursera activity',
      items: health.additionalCourseraContents.map(
        (item) => `${item.name ?? item.slug ?? item.id} · ${item.contentType} · ${item.id}`,
      ),
    },
  ].filter((group) => group.items.length > 0);
}

function issueCount(groups: IssueGroup[]): number {
  return groups.reduce((sum, group) => sum + group.items.length, 0);
}

function ProviderCell({ row }: { row: ValidatedProgramCatalogEntry }) {
  const health = row.catalogHealth;
  if (health.providerStatus === 'unavailable') return <StatusTag tone="alert">Unavailable</StatusTag>;
  if (health.providerStatus === 'not_checked') return <StatusTag tone="muted">Not checked</StatusTag>;
  if (health.providerCourseCount === 0) return <StatusTag tone="ok">Available · healthy empty</StatusTag>;
  return <StatusTag tone="ok">Available · {health.providerCourseCount} courses</StatusTag>;
}

function IssuesCell({ row }: { row: ValidatedProgramCatalogEntry }) {
  const groups = catalogIssueGroups(row);
  const count = issueCount(groups);
  if (count === 0) return <StatusTag tone="ok">No issues</StatusTag>;
  const summary = groups.map((group) => `${group.items.length} ${group.label.toLowerCase()}`).join(' · ');
  return (
    <span className="wa-kit-table-cell--nowrap">
      <StatusTag tone="warn">{count} {count === 1 ? 'issue' : 'issues'}</StatusTag>{' '}
      <span className="wa-kit-meta">{summary}</span>
    </span>
  );
}

function IssuesSubRow({ row }: { row: ValidatedProgramCatalogEntry }): ReactNode {
  const groups = catalogIssueGroups(row);
  if (groups.length === 0) return null;
  return (
    <div className="wa-kit-table-subrow__groups" data-testid="catalog-issues">
      {groups.map((group) => (
        <section key={group.key} className="wa-kit-table-subrow__group" aria-label={group.label}>
          <h4 className="wa-kit-table-subrow__group-title">
            {group.label} · {group.items.length}
          </h4>
          <ul className="wa-kit-table-subrow__list">
            {group.items.map((item) => (
              <li key={item} className="wa-kit-table-subrow__code">
                {item}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

const COLUMNS: Column<ValidatedProgramCatalogEntry>[] = [
  {
    key: 'program',
    header: 'Program',
    stickyLeft: true,
    minWidth: 240,
    render: (row) => (
      <>
        <strong className="wa-kit-table-cell--truncate" title={row.programTitle}>{row.programTitle}</strong>
        <span className="wa-kit-meta wa-kit-table-cell--truncate" title={row.programSlug}>{row.programSlug}</span>
      </>
    ),
  },
  {
    key: 'mapped',
    header: 'Coursera mapped',
    align: 'right',
    render: (row) => {
      const health = row.catalogHealth;
      const extras: string[] = [];
      if (health.validProviderCourseCount != null) extras.push(`${health.validProviderCourseCount} provider-valid`);
      if (health.localCourseCount > 0) {
        extras.push(`+ ${health.localCourseCount} WorkforceAP ${health.localCourseCount === 1 ? 'lab' : 'labs'}`);
      }
      return (
        <span className="wa-kit-table-cell--num">
          <strong>
            {health.mappedCount} / {health.syllabusCount}
          </strong>
          {extras.length > 0 ? <span className="wa-kit-meta wa-kit-table-cell--truncate">{extras.join(' · ')}</span> : null}
        </span>
      );
    },
  },
  { key: 'provider', header: 'Provider', render: (row) => <ProviderCell row={row} /> },
  { key: 'issues', header: 'Issues', render: (row) => <IssuesCell row={row} /> },
];

export function CourseraCatalogHealthTable({ rows }: { rows: ValidatedProgramCatalogEntry[] }) {
  return (
    <DataTable<ValidatedProgramCatalogEntry>
      columns={COLUMNS}
      rows={rows}
      rowKey={(row) => row.programSlug}
      rowLabel={(row) => row.programTitle}
      renderSubRow={(row) => (catalogIssueGroups(row).length > 0 ? <IssuesSubRow row={row} /> : null)}
      density="compact"
      minWidth={720}
      scrollCue
      emptyTitle="No programs in the tenant catalog"
      emptyDescription="Programs appear here once the board syllabus is published for this organization."
      data-testid="coursera-catalog-health"
    />
  );
}

export function CourseraCatalogHealthSection({
  rows,
  loadFailed,
}: {
  rows: ValidatedProgramCatalogEntry[];
  loadFailed: boolean;
}) {
  return (
    <section className="content-card" style={{ padding: '1rem 1.1rem', margin: '1rem 0' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '0.75rem',
          flexWrap: 'wrap',
          marginBottom: '0.75rem',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Catalog health</h2>
          <p className="wa-kit-meta" style={{ margin: '0.25rem 0 0' }}>
            Board syllabus courses define Y. Coursera confirms bound IDs and reports off-syllabus activity without
            changing the denominator. Open a row&apos;s details for the unmapped, stale and off-syllabus lists.
          </p>
        </div>
        {loadFailed ? <StatusTag tone="alert">Unavailable</StatusTag> : null}
      </div>

      {loadFailed ? (
        <p role="alert" className="wa-kit-lede" style={{ margin: 0 }}>
          The tenant catalog audit could not be loaded. Enrollment and progress data remain unchanged.
        </p>
      ) : (
        <CourseraCatalogHealthTable rows={rows} />
      )}
    </section>
  );
}
