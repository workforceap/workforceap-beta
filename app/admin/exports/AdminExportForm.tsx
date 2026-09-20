'use client';

import { useState } from 'react';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC','PR','GU','VI',
] as const;

const WIOA_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_review', label: 'In Review' },
  { value: 'verified', label: 'Verified' },
  { value: 'not_eligible', label: 'Not Eligible' },
  { value: 'needs_info', label: 'Needs Info' },
];

const COURSERA_STATUSES = [
  { value: 'NONE', label: 'No Request' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'NEEDS_ATTENTION', label: 'Needs Attention' },
];

type Props = {
  programs: { slug: string; title: string }[];
  stages: { value: string; label: string }[];
};

export default function AdminExportForm({ programs, stages }: Props) {
  const [state, setState] = useState('');
  const [stage, setStage] = useState('');
  const [program, setProgram] = useState('');
  const [wioaStatus, setWioaStatus] = useState('');
  const [courseraStatus, setCourseraStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectStyle: React.CSSProperties = {
    padding: '0.625rem 0.75rem',
    borderRadius: '0.5rem',
    border: '1px solid var(--outline-variant)',
    background: 'var(--surface-container)',
    color: 'var(--color-on-surface)',
    fontSize: '0.875rem',
    fontFamily: 'inherit',
    width: '100%',
    appearance: 'auto' as const,
  };

  const inputStyle: React.CSSProperties = {
    ...selectStyle,
    colorScheme: 'dark',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--color-on-surface-variant)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: '0.375rem',
  };

  function buildUrl() {
    const params = new URLSearchParams();
    if (state) params.set('state', state);
    if (stage) params.set('stage', stage);
    if (program) params.set('program', program);
    if (wioaStatus) params.set('wioaStatus', wioaStatus);
    if (courseraStatus) params.set('courseraStatus', courseraStatus);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    const qs = params.toString();
    return `/api/admin/export/members${qs ? `?${qs}` : ''}`;
  }

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    try {
      const url = buildUrl();
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        setError('Export failed. Please try again.');
        return;
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const disposition = res.headers.get('Content-Disposition');
      const match = disposition?.match(/filename="(.+?)"/);
      a.download = match?.[1] ?? 'workforceap-members-export.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch {
      setError('Network error during export. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  const hasFilters = !!(state || stage || program || wioaStatus || courseraStatus || dateFrom || dateTo);

  return (
    <div>
      {/* Filter grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '1.25rem',
      }}>
        <div>
          <label htmlFor="adminexportform-state-field" style={labelStyle}>State</label>
          <select id="adminexportform-state-field" value={state} onChange={(e) => setState(e.target.value)} style={selectStyle}>
            <option value="">All states</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="adminexportform-pipeline-stage-field" style={labelStyle}>Pipeline Stage</label>
          <select id="adminexportform-pipeline-stage-field" value={stage} onChange={(e) => setStage(e.target.value)} style={selectStyle}>
            <option value="">All stages</option>
            {stages.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="adminexportform-program-field" style={labelStyle}>Program</label>
          <select id="adminexportform-program-field" value={program} onChange={(e) => setProgram(e.target.value)} style={selectStyle}>
            <option value="">All programs</option>
            {programs.map((p) => (
              <option key={p.slug} value={p.slug}>{p.title}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="adminexportform-funding-eligibility-field" style={labelStyle}>Funding Eligibility</label>
          <select id="adminexportform-funding-eligibility-field" value={wioaStatus} onChange={(e) => setWioaStatus(e.target.value)} style={selectStyle}>
            <option value="">Any status</option>
            {WIOA_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="adminexportform-coursera-access-field" style={labelStyle}>Coursera Access</label>
          <select id="adminexportform-coursera-access-field" value={courseraStatus} onChange={(e) => setCourseraStatus(e.target.value)} style={selectStyle}>
            <option value="">Any status</option>
            {COURSERA_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="adminexportform-signed-up-after-field" style={labelStyle}>Signed Up After</label>
          <input id="adminexportform-signed-up-after-field" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} />
        </div>

        <div>
          <label htmlFor="adminexportform-signed-up-before-field" style={labelStyle}>Signed Up Before</label>
          <input id="adminexportform-signed-up-before-field" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} />
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">
            {downloading ? 'hourglass_top' : 'download'}
          </span>
          {downloading ? 'Preparing...' : 'Download CSV'}
        </button>

        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setState('');
              setStage('');
              setProgram('');
              setWioaStatus('');
              setCourseraStatus('');
              setDateFrom('');
              setDateTo('');
            }}
            className="btn btn-outline"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">filter_alt_off</span>
            Clear Filters
          </button>
        )}
        {error ? (
          <p role="alert" style={{ margin: 0, fontSize: '0.85rem', color: 'rgb(153,27,27)' }}>
            {error}
          </p>
        ) : null}

        {hasFilters && (
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
            Filtered export — only matching members will be included.
          </span>
        )}
      </div>
    </div>
  );
}
