'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pagination } from '@astryxdesign/core/Pagination';

const FEEDBACK_TYPES = [
  { value: '', label: 'All types' },
  { value: 'training', label: 'Training' },
  { value: 'counselor', label: 'Counselor' },
  { value: 'platform', label: 'Platform' },
  { value: 'program', label: 'Program' },
  { value: 'general', label: 'General' },
] as const;

const RATING_OPTIONS = [
  { value: '', label: 'All ratings' },
  { value: '5', label: '5 stars' },
  { value: '4', label: '4 stars' },
  { value: '3', label: '3 stars' },
  { value: '2', label: '2 stars' },
  { value: '1', label: '1 star' },
] as const;

type FeedbackItem = {
  id: string;
  userId: string;
  memberName: string;
  memberEmail: string;
  type: string;
  rating: number;
  comment: string | null;
  metadata: unknown;
  createdAt: string;
};

type SummaryRow = {
  type: string;
  averageRating: number;
  count: number;
};

type RecentItem = {
  id: string;
  type: string;
  rating: number;
  comment: string | null;
  memberName: string;
  createdAt: string;
};

export default function AdminFeedbackClient() {
  const [rows, setRows] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const take = 50;

  const [typeFilter, setTypeFilter] = useState('');
  const [ratingFilter, setRatingFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [recentTrend, setRecentTrend] = useState<RecentItem[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    params.set('take', String(take));
    params.set('skip', String(skip));
    if (typeFilter) params.set('type', typeFilter);
    if (ratingFilter) params.set('rating', ratingFilter);
    if (fromDate) params.set('from', new Date(fromDate).toISOString());
    if (toDate) params.set('to', new Date(toDate + 'T23:59:59').toISOString());
    return params.toString();
  }, [typeFilter, ratingFilter, fromDate, toDate, skip]);

  const buildSummaryQuery = useCallback(() => {
    const params = new URLSearchParams();
    if (fromDate) params.set('from', new Date(fromDate).toISOString());
    if (toDate) params.set('to', new Date(toDate + 'T23:59:59').toISOString());
    return params.toString();
  }, [fromDate, toDate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/feedback?${buildQuery()}`, { credentials: 'include' });
      const d = await r.json();
      if (r.ok && d.feedback) {
        setRows(d.feedback);
        setTotal(d.total ?? 0);
      } else {
        setRows([]);
        setTotal(0);
      }
    } catch {
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const r = await fetch(`/api/admin/feedback/summary?${buildSummaryQuery()}`, { credentials: 'include' });
      const d = await r.json();
      if (r.ok) {
        setSummary(d.summary ?? []);
        setRecentTrend(d.recentTrend ?? []);
      }
    } catch {
      setSummary([]);
      setRecentTrend([]);
    } finally {
      setSummaryLoading(false);
    }
  }, [buildSummaryQuery]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadSummary(); }, [loadSummary]);

  const ratingColor = (r: number) => {
    if (r >= 4) return 'var(--wa-success-dark)';
    if (r === 3) return '#f5a623';
    return 'var(--color-accent)';
  };

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div className="portal-card portal-card--flat" style={{ padding: '1rem' }}>
          <p style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.25rem' }}>Total Responses</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: 'var(--color-on-surface)' }}>{summaryLoading ? '…' : total}</p>
        </div>
        {summary.map((s) => (
          <div key={s.type} className="portal-card portal-card--flat" style={{ padding: '1rem' }}>
            <p style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.25rem' }}>{s.type}</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: ratingColor(s.averageRating) }}>{summaryLoading ? '…' : s.averageRating}</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', margin: '0.125rem 0 0' }}>{s.count} responses</p>
          </div>
        ))}
      </div>

      {/* Recent trend */}
      {recentTrend.length > 0 && (
        <div style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.5rem' }}>Recent Submissions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {recentTrend.map((item) => (
              <div key={item.id} className="portal-activity-item" style={{ justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 700, fontSize: '0.875rem', margin: 0 }}>
                    {item.memberName} · <span style={{ color: ratingColor(item.rating) }}>{item.rating}/5</span> · {item.type}
                  </p>
                  {item.comment && (
                    <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0.125rem 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.comment}
                    </p>
                  )}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', flexShrink: 0 }}>
                  {new Date(item.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="portal-card portal-card--flat" style={{ padding: '1rem', marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
        <div>
          <label htmlFor="adminfeedbackclient-type-field" style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.25rem' }}>Type</label>
          <select id="adminfeedbackclient-type-field" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setSkip(0); }}
            style={{ padding: '0.4rem 0.625rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--color-on-surface)', fontSize: '0.875rem' }}>
            {FEEDBACK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="adminfeedbackclient-rating-field" style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.25rem' }}>Rating</label>
          <select id="adminfeedbackclient-rating-field" value={ratingFilter} onChange={(e) => { setRatingFilter(e.target.value); setSkip(0); }}
            style={{ padding: '0.4rem 0.625rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--color-on-surface)', fontSize: '0.875rem' }}>
            {RATING_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="adminfeedbackclient-from-field" style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.25rem' }}>From</label>
          <input id="adminfeedbackclient-from-field" type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setSkip(0); }}
            style={{ padding: '0.4rem 0.625rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--color-on-surface)', fontSize: '0.875rem' }} />
        </div>
        <div>
          <label htmlFor="adminfeedbackclient-to-field" style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.25rem' }}>To</label>
          <input id="adminfeedbackclient-to-field" type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setSkip(0); }}
            style={{ padding: '0.4rem 0.625rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--color-on-surface)', fontSize: '0.875rem' }} />
        </div>
        <button onClick={() => { setTypeFilter(''); setRatingFilter(''); setFromDate(''); setToDate(''); setSkip(0); }} className="btn btn-ghost btn-sm">
          Clear
        </button>
      </div>

      {/* Table */}
      <div className="portal-dash-section-header" style={{ marginBottom: '0.875rem' }}>
        <h2 className="portal-heading-with-bar portal-section-heading" style={{ margin: 0 }}>All Feedback</h2>
        <span style={{ fontSize: '0.8rem', color: 'var(--color-on-surface-variant)' }}>
          {loading ? '…' : `${total} total`}
        </span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {[1, 2, 3].map((i) => <div key={i} className="portal-skeleton" style={{ height: '3.5rem', borderRadius: '0.875rem' }} />)}
        </div>
      ) : rows.length === 0 ? (
        <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>No feedback yet.</p>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {rows.map((r) => {
              const initials = r.memberName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
              return (
                <div key={r.id} className="portal-activity-item" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.875rem', flex: 1, minWidth: 0 }}>
                    <div style={{ width: '2.25rem', height: '2.25rem', borderRadius: '9999px', background: 'linear-gradient(135deg, var(--color-accent-dark), var(--color-accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.75rem', flexShrink: 0, marginTop: '0.125rem' }}>
                      {initials}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-on-surface)', margin: 0 }}>
                        {r.memberName}
                        <span style={{ fontWeight: 400, color: 'var(--color-on-surface-variant)', marginLeft: '0.5rem' }}>
                          {r.memberEmail}
                        </span>
                      </p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', margin: '0.125rem 0 0' }}>
                        <span style={{ fontWeight: 700, color: ratingColor(r.rating) }}>{r.rating}/5</span>
                        {' · '}
                        {r.type}
                        {' · '}
                        {new Date(r.createdAt).toLocaleString()}
                      </p>
                      {r.comment && (
                        <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface)', margin: '0.375rem 0 0', lineHeight: 1.5 }}>
                          {r.comment}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {total > take ? (
            <nav style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }} aria-label="Feedback pagination">
              <Pagination
                variant="count"
                page={Math.floor(skip / take) + 1}
                totalItems={total}
                pageSize={take}
                onChange={(page) => setSkip((page - 1) * take)}
                label="Feedback pagination"
              />
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
