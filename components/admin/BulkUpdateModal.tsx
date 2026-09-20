'use client';

import { useState, useEffect, useRef } from 'react';
import { Users, AlertCircle } from 'lucide-react';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter, HStack, VStack } from '@astryxdesign/core/Layout';
import { Button } from '@astryxdesign/core/Button';

const PIPELINE_STAGES = [
  { value: '', label: '— No change —' },
  { value: 'applied', label: 'Applied' },
  { value: 'enrolled', label: 'Enrolled' },
  { value: 'in_training', label: 'In Training' },
  { value: 'certified', label: 'Certified' },
  { value: 'job_searching', label: 'Job Searching' },
  { value: 'placed', label: 'Placed' },
];

const MEMBER_STATUSES = [
  { value: '', label: '— No change —' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'placed', label: 'Placed' },
];

type Counselor = { userId: string; fullName: string; partnerName: string | null };
type Program = { slug: string; title: string };

type Props = {
  open: boolean;
  memberIds: string[];
  programs: Program[];
  onClose: () => void;
  onUpdated: (result: { updated: number; total: number; errors: string[]; warnings?: string[] }) => void;
};

export default function BulkUpdateModal({ open, memberIds, programs, onClose, onUpdated }: Props) {
  const [pipelineStage, setPipelineStage] = useState('');
  const [memberStatus, setMemberStatus] = useState('');
  const [counselorUserId, setCounselorUserId] = useState('');
  const [programSlug, setProgramSlug] = useState('');
  const [counselors, setCounselors] = useState<Counselor[]>([]);
  const [loadingCounselors, setLoadingCounselors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestPending = useRef(false);
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !requestPending.current) onClose();
  };

  useEffect(() => {
    if (open) {
      setPipelineStage('');
      setMemberStatus('');
      setCounselorUserId('');
      setProgramSlug('');
      setError(null);
      setSaving(false);
      setLoadingCounselors(true);
      fetch('/api/admin/counselors', { credentials: 'include' })
        .then((r) => r.json())
        .then((d) => {
          if (d.counselors) {
            setCounselors(d.counselors.map((c: { userId: string; fullName: string; partnerName?: string | null }) => ({
              userId: c.userId,
              fullName: c.fullName,
              partnerName: c.partnerName ?? null,
            })));
          }
        })
        .catch(() => setCounselors([]))
        .finally(() => setLoadingCounselors(false));
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (requestPending.current) return;
    const hasUpdate = pipelineStage !== '' || memberStatus !== '' || counselorUserId !== '' || programSlug !== '';
    if (!hasUpdate) { setError('Select at least one field to update.'); return; }

    requestPending.current = true;
    setSaving(true);
    setError(null);

    const payload: Record<string, unknown> = { memberIds };
    if (pipelineStage !== '') payload.pipelineStage = pipelineStage === '__null' ? null : pipelineStage;
    if (memberStatus !== '') payload.memberStatus = memberStatus === '__null' ? null : memberStatus;
    if (counselorUserId !== '') payload.counselorUserId = counselorUserId === '__null' ? null : counselorUserId;
    if (programSlug !== '') payload.programSlug = programSlug === '__null' ? null : programSlug;

    try {
      const res = await fetch('/api/admin/members/bulk-update', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Update failed. Please try again.');
        return;
      }
      onUpdated(data);
      const partialErrors = Array.isArray(data.errors) ? data.errors.filter((value: unknown) => typeof value === 'string') : [];
      if (partialErrors.length > 0 || Number(data.updated) < Number(data.total)) {
        const firstFailure = partialErrors[0] ?? 'One or more members could not be updated.';
        setError(`Updated ${Number(data.updated) || 0} of ${Number(data.total) || memberIds.length}. ${firstFailure}`);
        return;
      }
      onClose();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      requestPending.current = false;
      setSaving(false);
    }
  }

  return (
    <Dialog isOpen={open} onOpenChange={handleOpenChange} purpose="form" width={480} maxHeight="90dvh" aria-label="Bulk Update">
      <Layout
        header={<DialogHeader title="Bulk Update" startContent={<Users size={20} aria-hidden="true" />} onOpenChange={saving ? undefined : handleOpenChange} />}
        content={
          <LayoutContent>
            <form id="bulk-update-form" onSubmit={handleSubmit} aria-busy={saving}>
              <VStack gap={4}>
                {error && (
                  <div role="alert" style={{
                    padding: '0.625rem 0.875rem',
                    borderRadius: '0.625rem',
                    background: 'var(--wa-accent-soft)',
                    color: 'var(--wa-accent-text)',
                    fontSize: '0.875rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}>
                    <AlertCircle size={16} />
                    {error}
                  </div>
                )}

                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                  <strong>{memberIds.length}</strong> member{memberIds.length === 1 ? '' : 's'} selected.
                  Choose the fields you want to update. Empty fields will not be changed.
                </p>

                <div>
                  <label htmlFor="bulkupdatemodal-member-status-field" style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.375rem' }}>
                    Member Status
                  </label>
                  <select id="bulkupdatemodal-member-status-field"
                    value={memberStatus}
                    onChange={(e) => setMemberStatus(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.5rem',
                      border: '1px solid var(--outline-variant)',
                      background: 'var(--surface-container)',
                      color: 'var(--color-on-surface)',
                      fontSize: '0.875rem',
                    }}
                  >
                    {MEMBER_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="bulkupdatemodal-pipeline-stage-field" style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.375rem' }}>
                    Pipeline Stage
                  </label>
                  <select id="bulkupdatemodal-pipeline-stage-field"
                    value={pipelineStage}
                    onChange={(e) => setPipelineStage(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.5rem',
                      border: '1px solid var(--outline-variant)',
                      background: 'var(--surface-container)',
                      color: 'var(--color-on-surface)',
                      fontSize: '0.875rem',
                    }}
                  >
                    {PIPELINE_STAGES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="bulkupdatemodal-counselor-field" style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.375rem' }}>
                    Counselor
                  </label>
                  <select id="bulkupdatemodal-counselor-field"
                    value={counselorUserId}
                    onChange={(e) => setCounselorUserId(e.target.value)}
                    disabled={loadingCounselors}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.5rem',
                      border: '1px solid var(--outline-variant)',
                      background: 'var(--surface-container)',
                      color: 'var(--color-on-surface)',
                      fontSize: '0.875rem',
                    }}
                  >
                    <option value="">— No change —</option>
                    <option value="__null">— Unassign —</option>
                    {counselors.map((c) => (
                      <option key={c.userId} value={c.userId}>
                        {c.fullName}{c.partnerName ? ` (${c.partnerName})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="bulkupdatemodal-program-field" style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.375rem' }}>
                    Program
                  </label>
                  <select id="bulkupdatemodal-program-field"
                    value={programSlug}
                    onChange={(e) => setProgramSlug(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.5rem',
                      border: '1px solid var(--outline-variant)',
                      background: 'var(--surface-container)',
                      color: 'var(--color-on-surface)',
                      fontSize: '0.875rem',
                    }}
                  >
                    <option value="">— No change —</option>
                    <option value="__null">— Clear program —</option>
                    {programs.map((p) => (
                      <option key={p.slug} value={p.slug}>{p.title}</option>
                    ))}
                  </select>
                </div>
              </VStack>
            </form>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack gap={2} hAlign="end">
              <Button type="button" label="Cancel" variant="secondary" isDisabled={saving} onClick={() => handleOpenChange(false)} />
              <Button type="submit" form="bulk-update-form" label={saving ? 'Updating…' : 'Update'} variant="primary" isDisabled={saving} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
