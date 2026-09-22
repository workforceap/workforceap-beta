'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { collectInvalidFieldLabels, describeMissingRequired, focusFirstInvalid } from '@/lib/forms/requiredFields';

type UserOpt = { id: string; fullName: string; email: string };
type PartnerOpt = { id: string; name: string };

type Props = {
  users: UserOpt[];
  partners: PartnerOpt[];
  subgroup?: {
    id: string;
    name: string;
    type: string;
    leaderId: string;
    partnerId: string | null;
    description: string | null;
  };
};

export default function SubgroupForm({ users, partners, subgroup }: Props) {
  const router = useRouter();
  const [name, setName] = useState(subgroup?.name ?? '');
  const [type, setType] = useState<'partner' | 'manager' | 'church'>(subgroup?.type as 'partner' | 'manager' | 'church' ?? 'partner');
  const [leaderId, setLeaderId] = useState(subgroup?.leaderId ?? '');
  const [partnerId, setPartnerId] = useState(subgroup?.partnerId ?? '');
  const [description, setDescription] = useState(subgroup?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Inline summary instead of the browser tooltip (audit 2026-09-20).
    const formEl = e.currentTarget;
    const missing = collectInvalidFieldLabels(formEl);
    if (missing.length > 0) {
      setError(describeMissingRequired(missing, { leadIn: 'Before you can save this subgroup' }));
      focusFirstInvalid(formEl);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = subgroup
        ? await fetch(`/api/admin/subgroups/${subgroup.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: name.trim(),
              type,
              leaderId,
              partnerId: type === 'partner' ? (partnerId || null) : null,
              description: description.trim() || null,
            }),
          })
        : await fetch('/api/admin/subgroups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: name.trim(),
              type,
              leaderId,
              partnerId: type === 'partner' ? (partnerId || null) : null,
              description: description.trim() || null,
            }),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to save');
      router.push(subgroup ? `/admin/subgroups/${subgroup.id}` : `/admin/subgroups/${data.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setSaving(false);
    }
  };

  const inputStyle = { width: '100%', maxWidth: '480px', padding: '0.5rem 0.75rem', border: '1px solid var(--outline-variant)', borderRadius: '6px', fontSize: '1rem' } as const;
  const labelStyle = { display: 'block', marginBottom: '0.25rem', fontWeight: 500 } as const;

  return (
    <form onSubmit={handleSubmit} noValidate style={{ maxWidth: '560px' }}>
      {error && (
        <div id="subgroupform-error" role="alert" style={{ padding: '0.75rem', marginBottom: '1rem', background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)', borderRadius: '6px', color: 'var(--wa-accent-text)' }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="subgroupform-name-field" style={labelStyle}>Name *</label>
        <input id="subgroupform-name-field"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          style={inputStyle}
          placeholder="e.g. Oak Hill Church, Workforce Solutions Central"
          disabled={saving}
        />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="subgroupform-type-field" style={labelStyle}>Type *</label>
        <select id="subgroupform-type-field"
          value={type}
          onChange={(e) => setType(e.target.value as 'partner' | 'manager' | 'church')}
          style={inputStyle}
          disabled={saving}
        >
          <option value="partner">Partner</option>
          <option value="manager">Manager</option>
          <option value="church">Church</option>
        </select>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="subgroupform-leader-field" style={labelStyle}>Leader *</label>
        <select id="subgroupform-leader-field"
          value={leaderId}
          onChange={(e) => setLeaderId(e.target.value)}
          required
          style={inputStyle}
          disabled={saving}
        >
          <option value="">Select leader</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName} ({u.email})
            </option>
          ))}
        </select>
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginTop: '0.25rem' }}>
          The leader can view this subgroup&rsquo;s members in the portal.
        </p>
      </div>

      {type === 'partner' && (
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="subgroupform-linked-partner-optional-field" style={labelStyle}>Linked Partner (optional)</label>
          <select id="subgroupform-linked-partner-optional-field"
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value)}
            style={inputStyle}
            disabled={saving}
          >
            <option value="">No partner</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginTop: '0.25rem' }}>
            Link to a partner for auto-assignment when members are referred by that partner.
          </p>
        </div>
      )}

      <div style={{ marginBottom: '1.5rem' }}>
        <label htmlFor="subgroupform-description-optional-field" style={labelStyle}>Description (optional)</label>
        <textarea id="subgroupform-description-optional-field"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          style={{ ...inputStyle, maxWidth: '100%' }}
          placeholder="Brief description of this subgroup"
          disabled={saving}
        />
      </div>

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button type="submit" className="btn btn-primary" disabled={saving} aria-busy={saving} aria-describedby={error ? 'subgroupform-error' : undefined}>
          <span aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            {saving ? (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: '1rem', animation: 'spin 1s linear infinite' }} aria-hidden="true">progress_activity</span>
                Saving…
              </>
            ) : subgroup ? (
              'Update'
            ) : (
              'Create'
            )}
          </span>
        </button>
        <button type="button" className="btn btn-outline" onClick={() => router.back()} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
