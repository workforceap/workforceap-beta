'use client';

import { useEffect, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { DataTable } from '@/components/portal/kit/DataTable';
import { KitTableToolbar } from '@/components/portal/kit/KitTableToolbar';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import type { EnrollmentAgreementArchive } from '@/lib/enrollmentAgreements/types';
import { AgreementStatus } from './EnrollmentAgreementCard';
import { agreementRequestError, requireAgreementResponse } from './request';
import styles from './enrollment.module.css';

type ArchiveRow = EnrollmentAgreementArchive['rows'][number];

export default function EnrollmentAgreementArchiveClient() {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [data, setData] = useState<EnrollmentAgreementArchive | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setData(null); setError('');
    void (async () => {
      try {
        const params = new URLSearchParams({ page: String(page), query: query.trim() });
        const response = await fetchWithTimeout(`/api/enrollment-agreements/archive?${params}`, {
          cache: 'no-store', signal: controller.signal,
        });
        await requireAgreementResponse(response);
        const result: EnrollmentAgreementArchive = await response.json();
        if (controller.signal.aborted) return;
        if (page > 1 && result.rows.length === 0) { setPage(page - 1); return; }
        setData(result);
      } catch (err) {
        if (!controller.signal.aborted) setError(agreementRequestError(err));
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [query, page, retry]);

  const subject = (row: ArchiveRow) => <div>
    <strong>{row.subjectName || 'Student name unavailable'}</strong>
    <p className={`${styles.muted} wa-break-all`}>{row.subjectMemberId}</p>
  </div>;
  const revision = (row: ArchiveRow) => <span>{row.isCurrent ? 'Current revision' : 'Historical revision'} · {row.templateVersion}</span>;
  const retained = (row: ArchiveRow) => row.retainedAfterAccountDeletion ? 'Retained after account deletion' : 'Account linked';
  const download = (row: ArchiveRow) => <a
    className={`wa-kit-focus ${styles.link}`} href={row.downloadUrl}
    aria-label={`Download PDF for ${row.subjectName || row.subjectMemberId}, revision ${row.id}`}
  >Download PDF</a>;
  const review = (row: ArchiveRow) => <details>
    <summary className={`wa-kit-focus ${styles.disclosure}`}>Review details</summary>
    <p>{row.reviewedAt ? `Reviewed ${new Date(row.reviewedAt).toLocaleDateString()}` : 'This revision has not been reviewed.'}</p>
    {row.reviewNote && <p className={styles.note}>{row.reviewNote}</p>}
  </details>;

  return <div className={styles.coverage}>
    <p>All saved agreement revisions in your organization, including records retained after account deletion. Downloads are audited.</p>
    <p className={styles.muted}>Awaiting review and Needs correction remain unverified. “Verified” means staff reviewed that revision; it does not authenticate signatures. No automatic expiry is configured.</p>
    <KitTableToolbar
      searchLabel="Search agreement archive by student name or original account ID"
      searchPlaceholder="Student name or original account ID"
      searchValue={query} pending={loading}
      onSearchChange={(value) => { setQuery(value); setPage(1); }}
    />
    {error ? <div role="alert" className={styles.error}><p>{error}</p><Button label="Retry archive" onClick={() => setRetry((n) => n + 1)} /></div>
      : <DataTable
        rows={data?.rows ?? []} rowKey={(row) => row.id} loading={loading} mobile="cards" scrollCue
        columns={[
          { key: 'subjectName', header: 'Student', stickyLeft: true, render: subject },
          { key: 'status', header: 'Review', render: (row) => <AgreementStatus status={row.status} /> },
          { key: 'templateVersion', header: 'Revision', render: revision },
          { key: 'uploadedAt', header: 'Uploaded', render: (row) => new Date(row.uploadedAt).toLocaleDateString() },
          { key: 'retainedAfterAccountDeletion', header: 'Account', render: retained },
          { key: 'downloadUrl', header: 'Document', render: (row) => <>{download(row)}{review(row)}</> },
        ]}
        cardRender={(row) => <div className={styles.mobileRow}>
          {subject(row)}<AgreementStatus status={row.status} />{revision(row)}
          <span>Uploaded {new Date(row.uploadedAt).toLocaleDateString()}</span>
          <span>{retained(row)}</span>{download(row)}{review(row)}
        </div>}
        empty={{
          kind: query ? 'filtered' : 'first',
          title: loading ? 'Loading agreement archive…' : query ? 'No agreements match this search' : 'No saved agreements',
          description: query ? 'Search another student name or original account ID.' : 'Saved agreement revisions will appear here.',
          ...(query ? { primaryAction: { label: 'Clear search', onClick: () => { setQuery(''); setPage(1); } } } : {}),
        }}
      />}
    {data && <div className={styles.row}>
      <span>Page {data.page} · {data.total} matching revisions</span>
      <div className={styles.row}>
        <Button label="Previous page" onClick={() => setPage((n) => Math.max(1, n - 1))} isDisabled={loading || page <= 1} />
        <Button label="Next page" onClick={() => setPage((n) => n + 1)} isDisabled={loading || !data.hasMore} />
      </div>
    </div>}
  </div>;
}
