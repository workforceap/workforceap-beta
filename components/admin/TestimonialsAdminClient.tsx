'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessageSquare, CheckCircle, XCircle, Eye, Trash2, Star, Clock, AlertCircle } from 'lucide-react';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { programDisplayTitle } from '@/lib/content/programTitle';

type Testimonial = {
  id: string;
  memberId: string;
  content: string;
  rating: number | null;
  programId: string | null;
  placementId: string | null;
  source: 'SURVEY' | 'MANUAL' | 'INTERVIEW';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PUBLISHED';
  photoUrl: string | null;
  consentGiven: boolean;
  createdAt: string;
  updatedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  member: {
    id: string;
    fullName: string;
    email: string;
    enrolledProgram: string | null;
  };
  reviewer: {
    id: string;
    fullName: string;
    email: string;
  } | null;
};

export default function TestimonialsAdminClient() {
  const [rows, setRows] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, published: 0 });
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  // Testimonial id awaiting soft-delete confirmation; null = dialog closed.
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = statusFilter
        ? `/api/admin/testimonials?status=${encodeURIComponent(statusFilter)}`
        : '/api/admin/testimonials';
      const r = await fetch(url, { credentials: 'include' });
      const d = await r.json();
      if (r.ok) {
        setRows(d.testimonials ?? []);
        setStats(d.stats ?? { pending: 0, approved: 0, rejected: 0, published: 0 });
      } else {
        setRows([]);
      }
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateStatus(id: string, status: Testimonial['status'], rejectionReason?: string) {
    setActionId(id);
    setMsg(null);
    try {
      const body: Record<string, unknown> = { status };
      if (status === 'REJECTED' && rejectionReason) {
        body.rejectionReason = rejectionReason;
      }
      const r = await fetch(`/api/admin/testimonials/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg({ type: 'err', text: typeof data.error === 'string' ? data.error : 'Update failed' });
        return;
      }
      setMsg({ type: 'ok', text: `Testimonial ${status.toLowerCase()}.` });
      void load();
    } catch {
      setMsg({ type: 'err', text: 'Network error' });
    } finally {
      setActionId(null);
    }
  }

  async function handleDelete(id: string) {
    setActionId(id);
    setMsg(null);
    try {
      const r = await fetch(`/api/admin/testimonials/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setMsg({ type: 'err', text: typeof data.error === 'string' ? data.error : 'Delete failed' });
        return;
      }
      setMsg({ type: 'ok', text: 'Testimonial deleted.' });
      void load();
    } catch {
      setMsg({ type: 'err', text: 'Network error' });
    } finally {
      setActionId(null);
    }
  }

  const statusBadge = (status: Testimonial['status']) => {
    const styles: Record<string, React.CSSProperties> = {
      PENDING: { background: 'var(--wa-gold-soft)', color: 'var(--wa-gold-dark)' },
      APPROVED: { background: 'var(--wa-success-soft)', color: 'var(--wa-success-dark)' },
      REJECTED: { background: 'var(--wa-accent-soft)', color: 'var(--wa-accent-text)' },
      PUBLISHED: { background: 'var(--wa-info-soft)', color: 'var(--wa-info-dark)' },
    };
    const icons: Record<string, React.ReactNode> = {
      PENDING: <Clock className="w-3 h-3" />,
      APPROVED: <CheckCircle className="w-3 h-3" />,
      REJECTED: <XCircle className="w-3 h-3" />,
      PUBLISHED: <Eye className="w-3 h-3" />,
    };
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          fontSize: '0.8125rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          padding: '0.25rem 0.5rem',
          borderRadius: '9999px',
          ...styles[status],
        }}
      >
        {icons[status]} {status}
      </span>
    );
  };

  return (
    <div>
      {msg && (
        <div
          style={{
            padding: '0.625rem 0.875rem',
            borderRadius: '0.625rem',
            background: msg.type === 'ok' ? 'rgba(74,155,79,0.1)' : 'rgba(173,44,77,0.1)',
            color: msg.type === 'ok' ? 'var(--wa-success-dark)' : 'var(--color-accent)',
            fontSize: '0.875rem',
            marginBottom: '1rem',
          }}
        >
          {msg.text}
        </div>
      )}

      {/* Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '0.75rem',
          marginBottom: '1.5rem',
        }}
      >
        {[
          { label: 'Pending', value: stats.pending, icon: <Clock className="w-4 h-4" /> },
          { label: 'Approved', value: stats.approved, icon: <CheckCircle className="w-4 h-4" /> },
          { label: 'Rejected', value: stats.rejected, icon: <XCircle className="w-4 h-4" /> },
          { label: 'Published', value: stats.published, icon: <Eye className="w-4 h-4" /> },
        ].map((s) => (
          <button
            key={s.label}
            onClick={() => setStatusFilter(statusFilter === s.label.toUpperCase() ? '' : s.label.toUpperCase())}
            style={{
              background: statusFilter === s.label.toUpperCase() ? 'var(--wa-sidebar-bg)' : 'var(--wa-surface)',
              color: statusFilter === s.label.toUpperCase() ? 'var(--wa-sidebar-text)' : 'inherit',
              border: '1px solid var(--wa-border)',
              borderRadius: '0.625rem',
              padding: '0.875rem 1rem',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            {s.icon}
            <div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{s.value}</div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.7 }}>
                {s.label}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Filter hint */}
      {statusFilter && (
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.75rem' }}>
          Showing: <strong>{statusFilter}</strong>{' '}
          <button onClick={() => setStatusFilter('')} style={{ color: 'var(--color-accent)', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>
            Clear filter
          </button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <p style={{ color: 'var(--color-on-surface-variant)', padding: '2rem 0' }}>Loading…</p>
      ) : rows.length === 0 ? (
        <div
          style={{
            padding: '3rem 1.5rem',
            textAlign: 'center',
            background: 'var(--wa-surface-2)',
            borderRadius: 'var(--radius-lg, 0.75rem)',
            color: 'var(--color-on-surface-variant)',
          }}
        >
          <MessageSquare className="w-8 h-8" style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
          <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>
            No testimonials yet
          </p>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem' }}>
            Testimonials appear here when members consent on their post-placement survey.
          </p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse', background: 'var(--wa-surface)', borderRadius: '0.625rem', overflow: 'hidden' }}>
            <caption className="sr-only">
              Member testimonials with content, rating, publication status, source, and moderation actions.
            </caption>
            <thead>
              <tr style={{ background: 'var(--wa-surface-2)' }}>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)' }}>Member</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)' }}>Content</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700, fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)' }}>Rating</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700, fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)' }}>Source</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700, fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} style={{ borderTop: '1px solid var(--wa-border)' }}>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ fontWeight: 600 }}>{t.member.fullName}</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{t.member.email}</div>
                    {t.member.enrolledProgram && (
                      <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginTop: '0.125rem' }}>
                        {programDisplayTitle(t.member.enrolledProgram)}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', maxWidth: '360px' }}>
                    <div style={{ lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const }}>
                      {t.content}
                    </div>
                    {t.rejectionReason && (
                      <div style={{ fontSize: '0.8125rem', color: 'var(--wa-accent-text)', marginTop: '0.25rem' }}>
                        <AlertCircle className="w-3 h-3" style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> {t.rejectionReason}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                    {t.rating ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.125rem' }}>
                        {t.rating} <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>{statusBadge(t.status)}</td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.8125rem', textTransform: 'uppercase', fontWeight: 600, color: 'var(--color-on-surface-variant)' }}>
                    {t.source}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                      {t.status === 'PENDING' && (
                        <>
                          <button
                            disabled={actionId === t.id}
                            onClick={() => updateStatus(t.id, 'APPROVED')}
                            style={actionBtnStyle('green')}
                            title="Approve"
                            aria-label="Approve"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                          </button>
                          <button
                            disabled={actionId === t.id}
                            onClick={() => {
                              const reason = window.prompt('Rejection reason (optional):');
                              updateStatus(t.id, 'REJECTED', reason ?? undefined);
                            }}
                            style={actionBtnStyle('red')}
                            title="Reject"
                            aria-label="Reject"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      {t.status === 'APPROVED' && (
                        <button
                          disabled={actionId === t.id}
                          onClick={() => updateStatus(t.id, 'PUBLISHED')}
                          style={actionBtnStyle('blue')}
                          title="Publish"
                          aria-label="Publish"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {(t.status === 'PUBLISHED' || t.status === 'REJECTED') && (
                        <button
                          disabled={actionId === t.id}
                          onClick={() => updateStatus(t.id, 'PENDING')}
                          style={actionBtnStyle('amber')}
                          title="Reset to pending"
                          aria-label="Reset to pending"
                        >
                          <Clock className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        disabled={actionId === t.id}
                        onClick={() => setDeleteId(t.id)}
                        style={actionBtnStyle('gray')}
                        title="Delete"
                        aria-label="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        title="Soft-delete testimonial?"
        body="Soft-delete this testimonial? It can be restored later."
        danger
        confirmLabel="Delete"
        onConfirm={() => {
          const id = deleteId;
          setDeleteId(null);
          if (id) void handleDelete(id);
        }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}

function actionBtnStyle(color: 'green' | 'red' | 'blue' | 'amber' | 'gray'): React.CSSProperties {
  const colors: Record<string, string> = {
    green: 'var(--wa-success-dark)',
    red: 'var(--wa-accent-text)',
    blue: 'var(--wa-info-dark)',
    amber: 'var(--wa-gold-dark)',
    gray: 'var(--wa-muted-strong)',
  };
  return {
    padding: '0.375rem',
    borderRadius: '0.375rem',
    border: '1px solid transparent',
    background: 'transparent',
    color: colors[color],
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
}
