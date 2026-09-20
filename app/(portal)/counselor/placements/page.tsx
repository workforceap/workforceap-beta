'use client';

import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';
import { useState, useEffect } from 'react';
import { Briefcase } from 'lucide-react';
import PageHeader from '@/components/portal/PageHeader';
import PortalEmptyState from '@/components/portal/PortalEmptyState';
import {
  DesignSurface,
  SectionHeader,
  DataTable,
  KpiStrip,
  FormField,
  type Column,
  type KpiItem,
} from '@/components/portal/kit';

interface Placement {
  id: string;
  user_id: string;
  member_name: string | null;
  member_email: string;
  employer_name: string;
  job_title: string;
  start_date: string | null;
  salary_offered: number | null;
  placed_at: string;
  notes: string | null;
  program_title: string | null;
}

interface MemberOption {
  id: string;
  fullName: string | null;
  email: string;
  programTitle: string | null;
}

function PortalListSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{
        textAlign: 'center',
        padding: '2.5rem 1rem',
        color: 'var(--color-on-surface-variant)',
        fontSize: '0.9rem',
      }}
    >
      {label}
    </div>
  );
}

const textAreaStyle: React.CSSProperties = {
  marginTop: 4,
  width: '100%',
  fontSize: 14,
  border: '1px solid var(--wa-border)',
  borderRadius: 'var(--wa-radius-sm)',
  padding: '10px 12px',
  outline: 'none',
  background: 'var(--wa-surface)',
  color: 'var(--wa-text)',
  transition: 'border-color 0.2s, box-shadow 0.2s',
  resize: 'vertical',
};

export default function PlacementsPage() {
  const t = useTranslations('counselor');
  const tCommon = useTranslations('common');
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [memberOptions, setMemberOptions] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsSuccess, setMessageIsSuccess] = useState(false);

  const [memberId, setMemberId] = useState('');
  const [employerName, setEmployerName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [salary, setSalary] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadPlacements();
  }, []);

  const loadPlacements = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/counselor/placements');
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setPlacements(data.placements || []);
      setMemberOptions(data.memberOptions || []);
    } catch {
      setMemberOptions([]);
      setMessage('Could not load placements');
      setMessageIsSuccess(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setMessageIsSuccess(false);

    try {
      const res = await fetch('/api/counselor/placements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: memberId,
          employerName,
          jobTitle,
          startDate: startDate || null,
          salaryOffered: salary ? parseInt(salary, 10) : null,
          notes: notes || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || t('failed'));
      }

      setMessage(t('placementRecordedSuccess'));
      setMessageIsSuccess(true);
      setShowAddForm(false);
      resetForm();
      loadPlacements();
    } catch (e: unknown) {
      setMessage(requestFailureMessage(e, { connection: tCommon('connectionError'), fallback: t('failedToRecordPlacement') }, 'counselor-placement'));
      setMessageIsSuccess(false);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setMemberId('');
    setEmployerName('');
    setJobTitle('');
    setStartDate('');
    setSalary('');
    setNotes('');
  };

  const selectedMember = memberOptions.find((member) => member.id === memberId) ?? null;

  const formatMemberOption = (member: MemberOption) => {
    const identity = member.fullName?.trim()
      ? `${member.fullName.trim()} (${member.email})`
      : member.email;
    return member.programTitle ? `${identity} — ${member.programTitle}` : identity;
  };

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatCurrency = (n: number | null) => {
    if (!n) return '—';
    return `$${n.toLocaleString()}/yr`;
  };

  const kpis: KpiItem[] = [{ label: t('total'), value: placements.length, color: 'accent' }];

  const columns: Column<Placement>[] = [
    {
      key: 'member',
      header: t('member'),
      render: (p) => (
        <>
          <div style={{ fontWeight: 700 }}>{p.member_name || p.member_email}</div>
          {p.member_name && p.member_name !== p.member_email ? (
            <div style={{ fontSize: '0.8125rem', color: 'var(--wa-muted)' }}>{p.member_email}</div>
          ) : null}
          <div style={{ fontSize: '0.8125rem', color: 'var(--wa-muted)' }}>{p.program_title || t('noProgram')}</div>
        </>
      ),
    },
    {
      key: 'employer',
      header: t('employer'),
      render: (p) => <span style={{ fontWeight: 500 }}>{p.employer_name}</span>,
    },
    { key: 'job', header: t('jobTitle'), render: (p) => p.job_title },
    {
      key: 'start',
      header: t('startDate'),
      render: (p) => <span style={{ color: 'var(--wa-muted)' }}>{formatDate(p.start_date)}</span>,
    },
    {
      key: 'salary',
      header: t('salary'),
      align: 'right',
      render: (p) => (
        <span style={{ fontWeight: 700, color: 'var(--color-green)', fontVariantNumeric: 'tabular-nums' }}>
          {formatCurrency(p.salary_offered)}
        </span>
      ),
    },
    {
      key: 'placed',
      header: t('placed'),
      render: (p) => <span style={{ color: 'var(--wa-muted)' }}>{formatDate(p.placed_at)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title={t('placementTrackingTitle')}
        subtitle={t('placementTrackingSubtitle')}
        breadcrumbs={[{ label: t('counselorPortal'), href: '/counselor' }, { label: t('placements') }]}
        action={
          <button type="button" className="btn btn-primary" onClick={() => setShowAddForm(!showAddForm)}>
            {showAddForm ? t('cancel') : t('recordPlacement')}
          </button>
        }
      />

      <DesignSurface surface="dense" className="wa-p-6">
        {message ? (
          <div
            role={messageIsSuccess ? 'status' : 'alert'}
            style={{
              padding: '0.875rem 1rem',
              borderRadius: 'var(--radius-md)',
              background: messageIsSuccess
                ? 'color-mix(in srgb, var(--color-green) 10%, transparent)'
                : 'color-mix(in srgb, var(--color-error, #dc2626) 10%, transparent)',
              border: `1px solid color-mix(in srgb, ${messageIsSuccess ? 'var(--color-green)' : 'var(--color-error, #dc2626)'} 20%, transparent)`,
              color: messageIsSuccess ? 'var(--color-green)' : 'var(--color-error, #dc2626)',
              marginBottom: '1.5rem',
              fontSize: '0.9rem',
              fontWeight: 600,
            }}
          >
            {message}
          </div>
        ) : null}

        {showAddForm ? (
          <form onSubmit={handleSubmit} className="wa-kit-card" style={{ marginBottom: '1.5rem' }}>
            <SectionHeader title={t('newPlacement')} />
            <div style={{ display: 'grid', gap: '0 1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
              <FormField label={t('member')}>
                <select
                  value={memberId}
                  onChange={(e) => setMemberId(e.target.value)}
                  required
                  aria-required="true"
                  className="wa-kit-control"
                >
                  <option value="">— {t('member')} —</option>
                  {memberOptions.map((member) => (
                    <option key={member.id} value={member.id}>
                      {formatMemberOption(member)}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label={t('employer')}
                type="text"
                value={employerName}
                onChange={(e) => setEmployerName(e.target.value)}
                required
                aria-required
              />
              <FormField
                label={t('jobTitle')}
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                required
                aria-required
              />
              <FormField label={t('startDate')} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <FormField
                label={t('salaryAnnual')}
                type="number"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                placeholder="50000"
                inputMode="numeric"
              />
              <div>
                <span className="wa-kit-field-label">{t('program')}</span>
                <div
                  aria-live="polite"
                  className="wa-kit-control"
                  style={{ display: 'flex', alignItems: 'center', color: 'var(--wa-muted)' }}
                >
                  {selectedMember?.programTitle || t('noProgram')}
                </div>
              </div>
            </div>
            <FormField label={t('notes')} full>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={textAreaStyle} />
            </FormField>
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="submit"
                disabled={submitting || !memberId}
                className="btn btn-primary"
                style={{ opacity: submitting || !memberId ? 0.7 : 1 }}
              >
                {submitting ? t('recording') : t('recordPlacement')}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setShowAddForm(false);
                  resetForm();
                }}
              >
                {t('cancel')}
              </button>
            </div>
          </form>
        ) : null}

        {loading ? <PortalListSkeleton label={t('loadingPlacements')} /> : null}

        {!loading && placements.length === 0 ? (
          <PortalEmptyState
            title={t('noPlacementsYet')}
            description={t('noPlacementsDesc')}
            icon={<Briefcase size={48} aria-hidden style={{ color: 'var(--color-on-surface-variant)' }} />}
            primaryAction={{ label: t('recordPlacement'), onClick: () => setShowAddForm(true) }}
          />
        ) : null}

        {!loading && placements.length > 0 ? (
          <>
            <SectionHeader title={t('recordedPlacements')} goal={`${placements.length} ${t('total')}`} />
            <KpiStrip items={kpis} />
            <div style={{ marginTop: '1.25rem' }}>
              <DataTable<Placement>
                columns={columns}
                rows={placements}
                rowKey={(p) => p.id}
                minWidth={720}
                mobile="cards"
                cardRender={(p) => (
                  <div className="wa-kit-card wa-kit-card--sm">
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.member_name || p.member_email}
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: 'var(--wa-muted)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            marginTop: 2,
                          }}
                        >
                          {p.job_title} · {p.employer_name}
                        </div>
                      </div>
                      <span
                        style={{
                          flexShrink: 0,
                          fontWeight: 700,
                          color: 'var(--color-green)',
                          fontVariantNumeric: 'tabular-nums',
                          fontSize: 13,
                        }}
                      >
                        {formatCurrency(p.salary_offered)}
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        gap: 8,
                        fontSize: 13,
                        color: 'var(--wa-muted)',
                        marginTop: 12,
                      }}
                    >
                      <span>{p.program_title || t('noProgram')}</span>
                      <span>
                        {t('startDate')}: {formatDate(p.start_date)}
                      </span>
                      <span>
                        {t('placed')}: {formatDate(p.placed_at)}
                      </span>
                    </div>
                  </div>
                )}
                emptyTitle={t('noPlacementsYet')}
                emptyDescription={t('noPlacementsDesc')}
              />
            </div>
          </>
        ) : null}
      </DesignSurface>
    </>
  );
}
