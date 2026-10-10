'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { DataTable } from '@/components/portal/kit/DataTable';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import type { EnrollmentAgreementCoverage, EnrollmentAgreementCoverageStatus } from '@/lib/enrollmentAgreements/types';
import { AgreementStatus } from './EnrollmentAgreementCard';
import { agreementRequestError, requireAgreementResponse } from './request';
import styles from './enrollment.module.css';

const LABELS = { missing: 'Missing', pending: 'Awaiting review', verified: 'Verified', needs_correction: 'Needs correction' } as const;
type Filter = EnrollmentAgreementCoverageStatus | 'all';
type CoverageRow = EnrollmentAgreementCoverage['rows'][number];

export default function EnrollmentAgreementCoverageClient() {
  const [filter, setFilter] = useState<Filter>('missing');
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [data, setData] = useState<EnrollmentAgreementCoverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setData(null); setError('');
    void (async () => {
      try {
        const response = await fetchWithTimeout(`/api/enrollment-agreements/coverage?status=${filter}&page=${page}`, {
          cache: 'no-store', signal: controller.signal,
        });
        await requireAgreementResponse(response);
        const result: EnrollmentAgreementCoverage = await response.json();
        if (controller.signal.aborted) return;
        // A review/removal can empty the last page between reads.
        if (page > 1 && result.rows.length === 0) { setPage(page - 1); return; }
        setData(result);
      } catch (err) {
        if (!controller.signal.aborted) setError(agreementRequestError(err));
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [filter, page, retry]);
  const memberLink = (row: CoverageRow) => (
    <Link className={`wa-kit-focus ${styles.link}`} href={`/admin/members/${encodeURIComponent(row.memberId)}?tab=program`}>{row.fullName || 'Student record'}</Link>
  );
  return <div className={styles.coverage}>
    <p>Active students in your organization. “Verified” means staff reviewed the current uploaded agreement—not funding approval, enrollment activation, or an electronic signature.</p>
    {data && <dl className={styles.counts}>
      {Object.entries(LABELS).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{data.counts[key as EnrollmentAgreementCoverageStatus]}</dd></div>)}
    </dl>}
    <Selector label="Agreement status" value={filter} onChange={(value) => { setFilter(value as Filter); setPage(1); }}
      options={[{ value: 'all', label: 'All statuses' }, ...Object.entries(LABELS).map(([value, label]) => ({ value, label }))]} />
    {error ? <div role="alert" className={styles.error}><p>{error}</p><Button label="Retry coverage" onClick={() => setRetry((n) => n + 1)} /></div>
      : <DataTable
        rows={data?.rows ?? []} rowKey={(row) => row.memberId} loading={loading} mobile="cards"
        columns={[
          { key: 'fullName', header: 'Student', render: memberLink },
          { key: 'status', header: 'Agreement', render: (row) => <AgreementStatus status={row.status} /> },
          { key: 'uploadedAt', header: 'Latest upload', render: (row) => row.uploadedAt ? new Date(row.uploadedAt).toLocaleDateString() : 'Not uploaded' },
        ]}
        cardRender={(row) => <div className={styles.mobileRow}>{memberLink(row)}<AgreementStatus status={row.status} /><span>{row.uploadedAt ? new Date(row.uploadedAt).toLocaleDateString() : 'Not uploaded'}</span></div>}
        empty={{ title: loading ? 'Loading agreements…' : 'No students match this status', description: 'Change the status filter to see other students.' }}
      />}
    {data && <div className={styles.row}>
      <span>Page {data.page} · {data.total} matching students</span>
      <div className={styles.row}>
        <Button label="Previous page" onClick={() => setPage((n) => Math.max(1, n - 1))} isDisabled={loading || page <= 1} />
        <Button label="Next page" onClick={() => setPage((n) => n + 1)} isDisabled={loading || !data.hasMore} />
      </div>
    </div>}
  </div>;
}
