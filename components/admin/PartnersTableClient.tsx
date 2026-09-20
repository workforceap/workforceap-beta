'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2, RotateCcw, Download, CheckCircle, XCircle } from 'lucide-react';
import PartnerEditModal from './PartnerEditModal';
import PartnerDeactivateDialog from './PartnerDeactivateDialog';
import OpenPartnerPortalButton from '@/app/admin/partners/OpenPartnerPortalButton';
import DataTable from '@/components/portal/ui/DataTable';

type Partner = {
  id: string;
  name: string;
  slug: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  active: boolean;
  status: string;
  notes: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  partnerType?: string;
  referralCode?: string | null;
  sponsoredEnrollment?: boolean;
  sponsorshipFundingSource?: string | null;
  sponsorshipTermLabel?: string | null;
  enrollmentPageEnabled?: boolean;
  enrollmentHeadline?: string | null;
  enrollmentBlurb?: string | null;
  schoolDistrict?: string | null;
  programCatalog?: { programSlug: string }[];
  _count: { counselors: number; referrals: number };
};
type Subgroup = { id: string; name: string; type: string; partnerId: string | null };
type Props = {
  partners: Partner[];
  subgroups: Subgroup[];
  superAdmin?: boolean;
  programs?: { slug: string; title: string }[];
};

function ApproveRejectButtons({ partnerId, onDone }: { partnerId: string; onDone: () => void }) {
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  async function handleApprove() {
    setLoading('approve');
    try {
      const res = await fetch(`/api/admin/partners/${partnerId}/approve`, { method: 'POST' });
      if (res.ok) onDone();
    } finally {
      setLoading(null);
    }
  }

  async function handleReject() {
    if (!rejectNotes.trim()) {
      setShowRejectInput(true);
      return;
    }
    setLoading('reject');
    try {
      const res = await fetch(`/api/admin/partners/${partnerId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: rejectNotes.trim() }),
      });
      if (res.ok) onDone();
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
      <button
        type="button"
        onClick={handleApprove}
        disabled={loading !== null}
        style={{
          padding: '0.25rem 0.5rem',
          background: 'rgba(74, 155, 79, 0.12)',
          border: '1px solid rgba(74, 155, 79, 0.3)',
          borderRadius: '4px',
          cursor: loading ? 'wait' : 'pointer',
          color: '#2d7a32',
          fontSize: '0.8125rem',
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
        }}
      >
        <CheckCircle size={14} />
        {loading === 'approve' ? '…' : 'Approve'}
      </button>
      {showRejectInput ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <input
            type="text"
            placeholder="Reason (optional)"
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid var(--outline-variant)', fontSize: '0.8125rem', width: 140 }}
          />
          <button
            type="button"
            onClick={handleReject}
            disabled={loading !== null}
            style={{
              padding: '0.25rem 0.5rem',
              background: 'rgba(185, 28, 28, 0.08)',
              border: '1px solid rgba(185, 28, 28, 0.25)',
              borderRadius: '4px',
              cursor: loading ? 'wait' : 'pointer',
              color: '#b91c1c',
              fontSize: '0.8125rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            <XCircle size={14} />
            {loading === 'reject' ? '…' : 'Reject'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowRejectInput(true)}
          disabled={loading !== null}
          style={{
            padding: '0.25rem 0.5rem',
            background: 'rgba(185, 28, 28, 0.08)',
            border: '1px solid rgba(185, 28, 28, 0.25)',
            borderRadius: '4px',
            cursor: loading ? 'wait' : 'pointer',
            color: '#b91c1c',
            fontSize: '0.8125rem',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
          }}
        >
          <XCircle size={14} />
          Reject
        </button>
      )}
    </div>
  );
}

export default function PartnersTableClient({ partners, subgroups, superAdmin, programs = [] }: Props) {
  const router = useRouter();
  const [editPartner, setEditPartner] = useState<Partner | null>(null);
  const [deactivatePartner, setDeactivatePartner] = useState<Partner | null>(null);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive' | 'pending'>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let list = partners;
    if (filter === 'active') list = list.filter((p) => p.active && p.status === 'active');
    if (filter === 'inactive') list = list.filter((p) => !p.active);
    if (filter === 'pending') list = list.filter((p) => p.status === 'pending_approval');
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q) ||
          (p.contactEmail?.toLowerCase().includes(q) ?? false) ||
          (p.contactName?.toLowerCase().includes(q) ?? false)
      );
    }
    return list;
  }, [partners, filter, search]);

  function exportCsv() {
    const params = new URLSearchParams();
    if (filter !== 'all') params.set('status', filter);
    if (search.trim()) params.set('search', search.trim());
    window.open(`/api/admin/partners/export?${params.toString()}`, '_blank');
  }

  const columns = useMemo(() => {
    const base = [
      {
        key: 'org',
        header: 'Organization',
        cell: (partner: Partner) => (
          <>
            <div style={{ fontWeight: 600 }}>{partner.name}</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{partner.slug}</div>
            {partner.partnerType === 'high_school' || partner.enrollmentPageEnabled || partner.sponsoredEnrollment ? (
              <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-accent)', marginTop: 2 }}>School partner</div>
            ) : null}
          </>
        ),
      },
      {
        key: 'contact',
        header: 'Contact',
        cell: (partner: Partner) => (
          <span style={{ fontSize: '0.9rem' }}>
            {partner.contactName && <div>{partner.contactName}</div>}
            {partner.contactEmail && (
              <div style={{ color: 'var(--color-on-surface-variant)' }}>{partner.contactEmail}</div>
            )}
          </span>
        ),
      },
      {
        key: 'subgroup',
        header: 'Subgroup',
        cell: (partner: Partner) => {
          const partnerSubgroups = subgroups.filter((s) => s.type === 'partner' && s.partnerId === partner.id);
          return (
            <span style={{ fontSize: '0.9rem' }}>
              {partnerSubgroups.length > 0 ? partnerSubgroups.map((s) => s.name).join(', ') : '—'}
            </span>
          );
        },
      },
      {
        key: 'counselors',
        header: 'Counselors',
        align: 'center' as const,
        cell: (partner: Partner) => partner._count.counselors,
      },
      {
        key: 'referrals',
        header: 'Members Referred',
        align: 'center' as const,
        cell: (partner: Partner) => partner._count.referrals,
      },
      {
        key: 'status',
        header: 'Status',
        cell: (partner: Partner) => {
          const isPending = partner.status === 'pending_approval';
          return (
            <span
              style={{
                padding: '0.2rem 0.5rem',
                borderRadius: '4px',
                fontSize: '0.8125rem',
                background: isPending
                  ? 'rgba(255, 187, 0, 0.15)'
                  : partner.active
                    ? 'rgba(74, 155, 79, 0.12)'
                    : 'var(--surface-container)',
                color: isPending ? '#b38600' : partner.active ? '#2d7a32' : 'var(--color-on-surface-variant)',
              }}
            >
              {isPending ? 'Pending' : partner.active ? 'Active' : 'Inactive'}
            </span>
          );
        },
      },
      {
        key: 'actions',
        header: 'Actions',
        cell: (partner: Partner) => (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {partner.status === 'pending_approval' ? (
              <>
                <ApproveRejectButtons partnerId={partner.id} onDone={() => router.refresh()} />
                <Link
                  href={`/admin/partners/${partner.id}`}
                  style={{ color: 'var(--color-accent)', textDecoration: 'none', fontSize: '0.9rem', marginLeft: '0.25rem' }}
                >
                  Review →
                </Link>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setEditPartner(partner)}
                  aria-label={`Edit ${partner.name}`}
                  style={{ padding: '0.25rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-on-surface-variant)' }}
                  title="Edit"
                >
                  <Pencil size={16} />
                </button>
                {partner.active ? (
                  <button
                    type="button"
                    onClick={() => setDeactivatePartner(partner)}
                    aria-label={`Deactivate ${partner.name}`}
                    style={{ padding: '0.25rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-on-surface-variant)' }}
                    title="Deactivate"
                  >
                    <Trash2 size={16} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      setReactivatingId(partner.id);
                      try {
                        const res = await fetch(`/api/admin/partners/${partner.id}/reactivate`, { method: 'POST' });
                        if (res.ok) router.refresh();
                      } finally {
                        setReactivatingId(null);
                      }
                    }}
                    disabled={reactivatingId === partner.id}
                    aria-label={`Reactivate ${partner.name}`}
                    style={{
                      padding: '0.25rem',
                      background: 'none',
                      border: 'none',
                      cursor: reactivatingId === partner.id ? 'wait' : 'pointer',
                      color: 'var(--color-on-surface-variant)',
                    }}
                    title="Reactivate"
                  >
                    <RotateCcw size={16} />
                  </button>
                )}
                <Link
                  href={`/admin/partners/${partner.id}`}
                  style={{ color: 'var(--color-accent)', textDecoration: 'none', fontSize: '0.9rem', marginLeft: '0.25rem' }}
                >
                  Manage →
                </Link>
              </>
            )}
          </div>
        ),
      },
    ];

    if (superAdmin) {
      base.push({
        key: 'preview',
        header: 'Preview',
        cell: (partner: Partner) => (
          <OpenPartnerPortalButton
            partnerId={partner.id}
            canOpenPortal={partner.active}
            disabledReason="Inactive partners cannot be opened in portal preview. Reactivate the partner first."
          />
        ),
      });
    }

    return base;
  }, [reactivatingId, router, subgroups, superAdmin]);

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(['all', 'active', 'inactive', 'pending'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: '6px',
                border: `1px solid ${filter === f ? 'var(--color-accent)' : 'var(--outline-variant)'}`,
                background: filter === f ? 'rgba(173,44,77,0.08)' : 'var(--color-white)',
                color: filter === f ? 'var(--color-accent)' : 'var(--color-on-surface)',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              {f === 'all' ? 'All' : f === 'active' ? 'Active' : f === 'inactive' ? 'Inactive' : 'Pending'}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: '0.4rem 0.75rem',
            minWidth: 220,
            border: '1px solid var(--outline-variant)',
            borderRadius: '6px',
            fontSize: '0.9rem',
          }}
        />
        <button
          type="button"
          onClick={() => void exportCsv()}
          className="btn btn-outline btn-sm"
          title="Export partners to CSV"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      <div className="admin-table-scroll admin-partners-desktop">
        <DataTable
          variant="admin"
          tableClassName="admin-table"
          scrollX={false}
          rows={filtered}
          rowKey={(p) => p.id}
          columns={columns}
        />
      </div>

      <ul className="admin-portal-card-list admin-partners-cards" aria-label="Partners (mobile layout)">
        {filtered.map((partner) => {
          const partnerSubgroups = subgroups.filter((s) => s.type === 'partner' && s.partnerId === partner.id);
          return (
            <li key={partner.id} className="admin-portal-card">
              <div className="admin-portal-card__header">
                <div>
                  <div style={{ fontWeight: 700 }}>{partner.name}</div>
                  <div className="admin-portal-card__meta">{partner.slug}</div>
                </div>
                <span
                  className="admin-portal-card__badge"
                  style={{
                    background:
                      partner.status === 'pending_approval'
                        ? 'rgba(255,187,0,0.15)'
                        : partner.active
                          ? 'rgba(74,155,79,0.12)'
                          : 'var(--surface-container)',
                    color:
                      partner.status === 'pending_approval'
                        ? '#b38600'
                        : partner.active
                          ? '#2d7a32'
                          : 'var(--color-on-surface-variant)',
                  }}
                >
                  {partner.status === 'pending_approval' ? 'Pending' : partner.active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <p className="admin-portal-card__meta">{partner.contactName ?? '—'}</p>
              <p className="admin-portal-card__meta">{partner.contactEmail ?? '—'}</p>
              <p className="admin-portal-card__row">
                <span className="admin-portal-card__label">Subgroup</span>{' '}
                {partnerSubgroups.length > 0 ? partnerSubgroups.map((s) => s.name).join(', ') : '—'}
              </p>
              <p className="admin-portal-card__row">
                <span className="admin-portal-card__label">Counselors</span> {partner._count.counselors}
              </p>
              <p className="admin-portal-card__row">
                <span className="admin-portal-card__label">Members</span> {partner._count.referrals}
              </p>
              <div className="admin-portal-card__actions">
                {partner.status === 'pending_approval' ? (
                  <>
                    <ApproveRejectButtons partnerId={partner.id} onDone={() => router.refresh()} />
                    <Link href={`/admin/partners/${partner.id}`} className="btn btn-primary btn-sm">
                      Review
                    </Link>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => setEditPartner(partner)} className="btn btn-outline btn-sm">
                      Edit
                    </button>
                    {partner.active ? (
                      <button type="button" onClick={() => setDeactivatePartner(partner)} className="btn btn-outline btn-sm">
                        Deactivate
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          setReactivatingId(partner.id);
                          try {
                            const res = await fetch(`/api/admin/partners/${partner.id}/reactivate`, { method: 'POST' });
                            if (res.ok) router.refresh();
                          } finally {
                            setReactivatingId(null);
                          }
                        }}
                        disabled={reactivatingId === partner.id}
                        className="btn btn-outline btn-sm"
                      >
                        Reactivate
                      </button>
                    )}
                    {superAdmin && (
                      <OpenPartnerPortalButton
                        partnerId={partner.id}
                        canOpenPortal={partner.active}
                        disabledReason="Inactive partners cannot be opened in portal preview. Reactivate the partner first."
                      />
                    )}
                    <Link href={`/admin/partners/${partner.id}`} className="btn btn-primary btn-sm">
                      Manage
                    </Link>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {editPartner && (
        <PartnerEditModal
          partner={editPartner}
          subgroups={subgroups}
          programs={programs}
          onClose={() => setEditPartner(null)}
        />
      )}
      {deactivatePartner && (
        <PartnerDeactivateDialog partner={deactivatePartner} partners={partners} onClose={() => setDeactivatePartner(null)} />
      )}
    </>
  );
}
