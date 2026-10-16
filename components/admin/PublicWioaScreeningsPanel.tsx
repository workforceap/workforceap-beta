import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Fragment } from 'react';
import DataTable from '@/components/portal/ui/DataTable';
import { formatPortalDateTime } from '@/lib/formatDate';
import { publicScreeningEvidence, type PublicScreeningRecord } from '@/lib/admin/publicWioaScreenings';

/** Public contacts have no member/caseload identity or saved staff decision. */
export default function PublicWioaScreeningsPanel({ rows, total, failed = false }: {
  rows: PublicScreeningRecord[];
  total: number;
  failed?: boolean;
}) {
  return (
    <section id="public-wioa-screenings" aria-labelledby="public-wioa-screenings-title" className="wa-mt-6">
      <h2 id="public-wioa-screenings-title" className="wa-text-lg wa-font-bold wa-mb-2">Public screening contacts</h2>
      <p className="wa-kit-meta">Saved public-page and no-account questionnaire submissions for staff follow-up. Answers are self-reported; these contacts have no member review status or verified eligibility decision.</p>
      {failed ? <p role="status">Public screenings could not be loaded. Refresh to try again.</p> : <>
        <DataTable
          rows={rows} rowKey={(row) => row.id} density="compact"
          emptyState="No public screenings saved yet."
          columns={[
            { key: 'name', header: 'Contact', rowHeader: true, cell: (row) => row.fullName },
            { key: 'email', header: 'Email', cell: (row) => row.email || 'Not provided' },
            { key: 'phone', header: 'Phone', cell: (row) => row.phone || 'Not provided' },
            { key: 'received', header: 'Received', cell: (row) => formatPortalDateTime(row.createdAt) },
            { key: 'source', header: 'Source', cell: (row) => publicScreeningEvidence(row.snapshot).source },
            { key: 'answers', header: 'Saved answers', cell: (row) => {
              const evidence = publicScreeningEvidence(row.snapshot);
              return evidence.answers.length ? <Collapsible trigger={`View answers for ${row.fullName}`} defaultIsOpen={false}>
                <dl className="wa-kit-meta">{evidence.answers.map((item) => <Fragment key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></Fragment>)}</dl>
              </Collapsible> : 'Saved format could not be read. No answers inferred.';
            } },
          ]}
        />
        <p className="wa-kit-meta">Showing {rows.length} of {total} saved public screenings, newest first. No staff review status is stored for these contacts.</p>
      </>}
    </section>
  );
}
