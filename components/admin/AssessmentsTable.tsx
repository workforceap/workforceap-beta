'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
// AUDIT-2026-05-16 §C-B3: client never imports the answer key. The
// `correctnessByUserId` prop carries pre-computed pass/fail booleans so
// the admin browser never receives the answer string for each question.
import { ASSESSMENT_QUESTIONS_PUBLIC as ASSESSMENT_QUESTIONS } from '@/lib/assessment/questions';
import { formatPhone } from '@/lib/formatPhone';
import DataTable from '@/components/portal/ui/DataTable';
import PortalPagination from '@/components/portal/PortalPagination';

type AssessmentUser = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  programInterest: string | null;
  assessmentScore: number | null;
  assessmentScorePct: number | null;
  assessmentCompletedAt: Date | null;
  assessmentAnswers: unknown;
};

type AssessmentsTableProps = {
  users: AssessmentUser[];
  /**
   * Server-computed correctness map: `{ [userId]: { [questionId]: boolean } }`.
   * The server reads the answer key and member's answers and emits only the
   * pass/fail boolean per question so the client doesn't need the answer key.
   */
  correctnessByUserId: Record<string, Record<number, boolean>>;
  highlightUserId?: string;
  programFilter?: string;
  minScore?: number;
  maxScore?: number;
  totalCount: number;
  currentPage: number;
  pageSize: number;
};

export default function AssessmentsTable({
  users,
  correctnessByUserId,
  highlightUserId,
  programFilter,
  minScore,
  maxScore,
  totalCount,
  currentPage,
  pageSize,
}: AssessmentsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [expandedId, setExpandedId] = useState<string | null>(highlightUserId ?? null);
  const [sortBy, setSortBy] = useState<'date' | 'score' | 'name'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = [...users].sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'date') {
      const da = a.assessmentCompletedAt?.getTime() ?? 0;
      const db = b.assessmentCompletedAt?.getTime() ?? 0;
      cmp = da - db;
    } else if (sortBy === 'score') {
      cmp = (a.assessmentScorePct ?? 0) - (b.assessmentScorePct ?? 0);
    } else {
      cmp = (a.fullName ?? '').localeCompare(b.fullName ?? '');
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const updateFilters = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    for (const [k, v] of Object.entries(updates)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    // Reset to page 1 when filters change
    params.delete('page');
    router.push(`/admin/assessments?${params.toString()}`);
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  const goToPage = (page: number) => {
    if (page < 1 || page > totalPages) return;
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('page', page.toString());
    router.push(`/admin/assessments?${params.toString()}`, { scroll: false });
  };

  const exportCsv = () => {
    const headers = ['Name', 'Email', 'Phone', 'Program Interest', 'Score %', 'Date Completed'];
    const rows = sorted.map((u) => [
      u.fullName,
      u.email,
      u.phone ?? '',
      u.programInterest ?? '',
      String(u.assessmentScorePct ?? ''),
      u.assessmentCompletedAt?.toISOString() ?? '',
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `assessments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const answers = (u: AssessmentUser): Record<number, string> => {
    const a = u.assessmentAnswers;
    if (!a || typeof a !== 'object') return {};
    return a as Record<number, string>;
  };

  const scoreColor = (pct: number | null) => {
    if (pct === null) return 'var(--color-on-surface-variant)';
    if (pct >= 80) return 'var(--color-green, #4a9b4f)';
    if (pct >= 60) return 'var(--color-gold)';
    return 'var(--color-accent)';
  };

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const program = (form.querySelector('#program-filter') as HTMLInputElement)?.value?.trim();
          const min = (form.querySelector('#min-score') as HTMLInputElement)?.value;
          const max = (form.querySelector('#max-score') as HTMLInputElement)?.value;
          updateFilters({ program: program || undefined, minScore: min || undefined, maxScore: max || undefined });
        }}
        style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center' }}
      >
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <label htmlFor="program-filter" style={{ fontSize: '0.9rem' }}>Program:</label>
          <input
            id="program-filter"
            type="text"
            placeholder="Filter by program"
            defaultValue={programFilter ?? ''}
            style={{ padding: '0.4rem 0.6rem', width: '200px' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <label htmlFor="min-score" style={{ fontSize: '0.9rem' }}>Score %:</label>
          <input
            id="min-score"
            type="number"
            min={0}
            max={100}
            placeholder="Min"
            defaultValue={minScore ?? ''}
            style={{ padding: '0.4rem 0.6rem', width: '70px' }}
          />
          <span>–</span>
          <input
            id="max-score"
            type="number"
            min={0}
            max={100}
            placeholder="Max"
            defaultValue={maxScore ?? ''}
            style={{ padding: '0.4rem 0.6rem', width: '70px' }}
          />
        </div>
        <button type="submit" className="btn btn-outline">
          Apply filters
        </button>
        <button type="button" className="btn btn-outline" onClick={exportCsv}>
          Export CSV
        </button>
      </form>

      {/* Mobile cards (≤768px) */}
      <div className="md:wa-hidden wa-flex wa-flex-col" style={{ gap: '0.75rem', marginBottom: '1rem' }}>
        {sorted.length === 0 ? (
          <p style={{ color: 'var(--color-on-surface-variant)', textAlign: 'center', padding: '2rem' }}>No assessments match your filters.</p>
        ) : sorted.map((u) => {
          const isExpanded = expandedId === u.id;
          const userAnswers = answers(u);
          const initials = (u.fullName ?? '?').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
          return (
            <div key={u.id} className="portal-card portal-card--flat" style={{ overflow: 'hidden', background: highlightUserId === u.id ? 'rgba(74,155,79,0.07)' : undefined }}>
              <button
                type="button"
                style={{ width: '100%', textAlign: 'left', padding: '1rem', display: 'flex', gap: '0.875rem', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer' }}
                aria-expanded={isExpanded} aria-controls={`assessment-details-${u.id}`} aria-label={isExpanded ? "Collapse details for " + u.fullName : "Expand details for " + u.fullName} onClick={() => setExpandedId(isExpanded ? null : u.id)}
              >
                <div style={{ width: '2.75rem', height: '2.75rem', borderRadius: '9999px', background: 'linear-gradient(135deg, var(--color-accent-dark), var(--color-accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.875rem', flexShrink: 0 }}>
                  {initials}
                </div>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <p style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-on-surface)', margin: 0 }}>{u.fullName}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', margin: '0.125rem 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.programInterest ?? 'No program'} · {u.assessmentCompletedAt?.toLocaleDateString() ?? '—'}
                  </p>
                </div>
                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.03em', color: scoreColor(u.assessmentScorePct) }}>
                    {u.assessmentScorePct !== null ? `${u.assessmentScorePct}%` : '—'}
                  </span>
                  <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '1rem', color: 'var(--color-on-surface-variant)', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>expand_more</span>
                </div>
              </button>
              {isExpanded && (
                <div id={`assessment-details-${u.id}`} style={{ padding: '0 1rem 1rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem', margin: '0.875rem 0' }}>
                    <div>
                      <p style={{ fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.2rem' }}>Email</p>
                      <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface)', margin: 0, wordBreak: 'break-all' }}>{u.email}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.2rem' }}>Phone</p>
                      <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface)', margin: 0 }}>{formatPhone(u.phone) || '—'}</p>
                    </div>
                  </div>
                  <p style={{ fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-on-surface-variant)', margin: '0.75rem 0 0.5rem' }}>Answer Breakdown</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                    {ASSESSMENT_QUESTIONS.map((q) => {
                      const ans = userAnswers[q.id];
                      const correct = correctnessByUserId[u.id]?.[q.id] === true;
                      return (
                        <div key={q.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.375rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: correct ? 'var(--color-green, #4a9b4f)' : 'var(--color-accent)', flexShrink: 0, minWidth: '1.5rem' }}>Q{q.id}</span>
                          <span className="material-symbols-outlined" style={{ fontSize: '0.875rem', color: correct ? 'var(--color-green, #4a9b4f)' : 'var(--color-accent)', flexShrink: 0, fontVariationSettings: "'FILL' 1" }}>{correct ? 'check_circle' : 'cancel'}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.4 }}>{ans ?? '—'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop table (≥768px) */}
      <div className="wa-hidden md:wa-block" style={{ overflowX: 'auto' }}>
        <DataTable
          variant="admin"
          tableClassName="admin-table employer-applications-table"
          scrollX={false}
          rows={sorted}
          rowKey={(u) => u.id}
          getRowProps={(u) => ({
            onClick: () => setExpandedId(expandedId === u.id ? null : u.id),
            style: {
              cursor: 'pointer',
              background:
                highlightUserId === u.id
                  ? 'rgba(74, 155, 79, 0.08)'
                  : expandedId === u.id
                    ? 'rgba(173,44,77,0.05)'
                    : undefined,
            },
          })}
          renderSubRow={(u) =>
            expandedId === u.id ? (
              <>
                <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>Answer breakdown</h4>
                <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.9rem' }}>
                  {ASSESSMENT_QUESTIONS.map((q) => {
                    const ans = answers(u)[q.id];
                    const correct = correctnessByUserId[u.id]?.[q.id] === true;
                    return (
                      <div key={q.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
                        <span style={{ fontWeight: 600, minWidth: '2rem' }}>Q{q.id}:</span>
                        <span>{q.question}</span>
                        <span style={{ color: correct ? 'var(--color-success, green)' : 'var(--color-error, red)' }}>
                          {ans ? `Answer: ${ans}` : '—'} {correct ? '✓' : '✗'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null
          }
          subRowTdStyle={{ padding: '1rem', background: 'var(--color-light)', borderBottom: '1px solid #ddd' }}
          columns={[
            {
              key: 'name',
              cellDataLabel: 'Name',
              header: (
                <span
                  role="button"
                  tabIndex={0}
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSortBy('name');
                    setSortDir(sortBy === 'name' && sortDir === 'desc' ? 'asc' : 'desc');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      setSortBy('name');
                      setSortDir(sortBy === 'name' && sortDir === 'desc' ? 'asc' : 'desc');
                    }
                  }}
                >
                  Name {sortBy === 'name' && (sortDir === 'asc' ? '↑' : '↓')}
                </span>
              ),
              cell: (u) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div
                    style={{
                      width: '2rem',
                      height: '2rem',
                      borderRadius: '9999px',
                      background: 'linear-gradient(135deg, var(--color-accent-dark), var(--color-accent))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      flexShrink: 0,
                    }}
                  >
                    {(u.fullName ?? '?')
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <span style={{ fontWeight: 600 }}>{u.fullName}</span>
                </div>
              ),
            },
            { key: 'email', header: 'Email', cell: (u) => u.email },
            { key: 'phone', header: 'Phone', cell: (u) => formatPhone(u.phone) },
            { key: 'program', header: 'Program Interest', cell: (u) => u.programInterest ?? '—' },
            {
              key: 'score',
              cellDataLabel: 'Score %',
              header: (
                <span
                  role="button"
                  tabIndex={0}
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSortBy('score');
                    setSortDir(sortBy === 'score' && sortDir === 'desc' ? 'asc' : 'desc');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      setSortBy('score');
                      setSortDir(sortBy === 'score' && sortDir === 'desc' ? 'asc' : 'desc');
                    }
                  }}
                >
                  Score % {sortBy === 'score' && (sortDir === 'asc' ? '↑' : '↓')}
                </span>
              ),
              cell: (u) => (
                <span style={{ fontWeight: 700, color: scoreColor(u.assessmentScorePct) }}>
                  {u.assessmentScorePct ?? '—'}
                  {u.assessmentScorePct !== null ? '%' : ''}
                </span>
              ),
            },
            {
              key: 'date',
              cellDataLabel: 'Date completed',
              header: (
                <span
                  role="button"
                  tabIndex={0}
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSortBy('date');
                    setSortDir(sortBy === 'date' && sortDir === 'desc' ? 'asc' : 'desc');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      setSortBy('date');
                      setSortDir(sortBy === 'date' && sortDir === 'desc' ? 'asc' : 'desc');
                    }
                  }}
                >
                  Date Completed {sortBy === 'date' && (sortDir === 'asc' ? '↑' : '↓')}
                </span>
              ),
              cell: (u) => u.assessmentCompletedAt?.toLocaleDateString() ?? '—',
            },
          ]}
        />
      </div>

      {users.length === 0 && (
        <p style={{ color: 'var(--color-on-surface-variant)', marginTop: '1rem' }}>No assessments match your filters.</p>
      )}

      <PortalPagination
        page={currentPage}
        totalPages={totalPages}
        onChange={goToPage}
        label="Assessments pagination"
      />

    </div>
  );
}
