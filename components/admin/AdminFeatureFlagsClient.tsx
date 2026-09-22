'use client';

import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/portal/PageHeader';

interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  rolloutPercentage: number;
  allowedRoles: string[];
  createdAt: string;
  updatedAt: string;
}

const ALL_ROLES = ['member', 'admin', 'super_admin', 'case_manager', 'counselor', 'partner', 'employer'];

function RoleBadge({ role }: { role: string }) {
  const colorMap: Record<string, string> = {
    member: 'var(--wa-info-soft)',
    admin: 'var(--wa-success-soft)',
    super_admin: 'var(--wa-accent-soft)',
    case_manager: 'var(--wa-gold-soft)',
    counselor: 'color-mix(in srgb, var(--wa-gold) 14%, transparent)',
    partner: 'color-mix(in srgb, var(--wa-success-soft) 50%, var(--wa-info-soft))',
    employer: 'var(--wa-accent-soft)',
  };
  const textMap: Record<string, string> = {
    member: 'var(--wa-info-dark)',
    admin: 'var(--wa-success-dark)',
    super_admin: 'var(--wa-accent-text)',
    case_manager: 'var(--wa-gold-dark)',
    counselor: 'color-mix(in srgb, var(--wa-gold-dark) 60%, var(--wa-accent-text))',
    partner: 'color-mix(in srgb, var(--wa-success-dark) 50%, var(--wa-info-dark))',
    employer: 'var(--wa-accent-text)',
  };
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: '0.8125rem',
        fontWeight: 700,
        padding: '0.15rem 0.5rem',
        borderRadius: '9999px',
        background: colorMap[role] ?? 'var(--surface-container-high)',
        color: textMap[role] ?? 'var(--color-on-surface-variant)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {role.replace('_', ' ')}
    </span>
  );
}

export default function AdminFeatureFlagsClient({ notice }: { notice?: React.ReactNode } = {}) {
  const router = useRouter();
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [createKey, setCreateKey] = useState('');
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createEnabled, setCreateEnabled] = useState(false);
  const [createRollout, setCreateRollout] = useState(0);
  const [createRoles, setCreateRoles] = useState<string[]>([]);

  const loadFlags = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/feature-flags');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setFlags(data.flags ?? []);
    } catch (err) {
      setError('Failed to load feature flags');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFlags();
  }, [loadFlags]);

  const toggleEnabled = async (flag: FeatureFlag) => {
    setSavingId(flag.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/feature-flags/${flag.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !flag.enabled }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setFlags((prev) => prev.map((f) => (f.id === flag.id ? data.flag : f)));
      router.refresh();
    } catch (err) {
      console.error(err);
      setError(`Failed to update "${flag.name}" — try again.`);
    } finally {
      setSavingId(null);
    }
  };

  const updateRollout = async (flag: FeatureFlag, value: number) => {
    setSavingId(flag.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/feature-flags/${flag.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rolloutPercentage: value }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setFlags((prev) => prev.map((f) => (f.id === flag.id ? data.flag : f)));
    } catch (err) {
      console.error(err);
      setError(`Failed to update rollout for "${flag.name}" — try again.`);
    } finally {
      setSavingId(null);
    }
  };

  const updateRoles = async (flag: FeatureFlag, roles: string[]) => {
    setSavingId(flag.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/feature-flags/${flag.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowedRoles: roles }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setFlags((prev) => prev.map((f) => (f.id === flag.id ? data.flag : f)));
    } catch (err) {
      console.error(err);
      setError(`Failed to update roles for "${flag.name}" — try again.`);
    } finally {
      setSavingId(null);
    }
  };

  const deleteFlag = async (id: string) => {
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/feature-flags/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      setFlags((prev) => prev.filter((f) => f.id !== id));
      router.refresh();
    } catch (err) {
      console.error(err);
      setError('Failed to delete flag — try again.');
    } finally {
      setSavingId(null);
    }
  };

  const createFlag = async () => {
    if (!createKey.trim() || !createName.trim()) {
      setError('Key and name are required.');
      return;
    }
    setSavingId('create');
    setError(null);
    try {
      const res = await fetch('/api/admin/feature-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: createKey.trim(),
          name: createName.trim(),
          description: createDescription.trim() || undefined,
          enabled: createEnabled,
          rolloutPercentage: createRollout,
          allowedRoles: createRoles,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to create flag');
        return;
      }
      const data = await res.json();
      setFlags((prev) => [data.flag, ...prev]);
      setShowCreate(false);
      setCreateKey('');
      setCreateName('');
      setCreateDescription('');
      setCreateEnabled(false);
      setCreateRollout(0);
      setCreateRoles([]);
      router.refresh();
    } catch (err) {
      console.error(err);
      setError('Failed to create flag — try again.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Feature Flags"
        subtitle={`${flags.length} flag${flags.length !== 1 ? 's' : ''}`}
        action={
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setShowCreate((s) => !s)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
              {showCreate ? 'close' : 'add'}
            </span>
            {showCreate ? 'Cancel' : 'New Flag'}
          </button>
        }
      />
      {notice}

      {error && (
        <div role="alert" style={{ padding: '1rem', background: 'color-mix(in srgb, var(--wa-accent) 8%, transparent)', color: 'var(--wa-accent-text)', borderRadius: '0.625rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {showCreate && (
        <div className="portal-card portal-card--flat" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>Create Feature Flag</h3>
          <div style={{ display: 'grid', gap: '0.875rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Key</span>
                <input
                  type="text"
                  value={createKey}
                  onChange={(e) => setCreateKey(e.target.value)}
                  placeholder="e.g. coursera-v2"
                  style={{ minHeight: '40px', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--color-on-surface)' }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Name</span>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g. Coursera Integration V2"
                  style={{ minHeight: '40px', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--color-on-surface)' }}
                />
              </label>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Description</span>
              <input
                type="text"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder="Optional description"
                style={{ minHeight: '40px', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--color-on-surface)' }}
              />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={createEnabled}
                  onChange={(e) => setCreateEnabled(e.target.checked)}
                />
                <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Enabled</span>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Rollout: {createRollout}%</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={createRollout}
                  onChange={(e) => setCreateRollout(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
              </label>
            </div>
            <div>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Allowed Roles</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {ALL_ROLES.map((role) => (
                  <label key={role} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: '0.8125rem' }}>
                    <input
                      type="checkbox"
                      checked={createRoles.includes(role)}
                      onChange={(e) => {
                        setCreateRoles((prev) =>
                          e.target.checked ? [...prev, role] : prev.filter((r) => r !== role)
                        );
                      }}
                    />
                    <RoleBadge role={role} />
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={createFlag}
                disabled={savingId === 'create'}
              >
                {savingId === 'create' ? 'Creating…' : 'Create Flag'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-on-surface-variant)' }}>Loading…</div>
      ) : flags.length === 0 ? (
        <div className="admin-empty-state">
          <h3>No feature flags yet</h3>
          <p>Create a flag to start rolling out features gradually.</p>
          <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
            New Flag
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {flags.map((flag) => {
            const isEditing = editingId === flag.id;
            return (
              <div
                key={flag.id}
                className="portal-card portal-card--flat"
                style={{
                  padding: '1rem 1.125rem',
                  opacity: savingId === flag.id ? 0.6 : 1,
                  transition: 'opacity 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                  <div
                    style={{
                      width: '2.5rem',
                      height: '2.5rem',
                      borderRadius: '0.625rem',
                      background: flag.enabled ? 'var(--wa-success-soft)' : 'var(--surface-container)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: '1.125rem',
                        color: flag.enabled ? 'var(--wa-success)' : 'var(--color-on-surface-variant)',
                        fontVariationSettings: "'FILL' 1",
                      }}
                    >
                      {flag.enabled ? 'toggle_on' : 'toggle_off'}
                    </span>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem', flexWrap: 'wrap', marginBottom: '0.375rem' }}>
                      <p style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-on-surface)', margin: 0, lineHeight: 1.3 }}>
                        {flag.name}
                      </p>
                      <span
                        style={{
                          fontSize: '0.8125rem',
                          fontWeight: 800,
                          padding: '0.15rem 0.5rem',
                          borderRadius: '9999px',
                          background: flag.enabled ? 'var(--wa-success-soft)' : 'var(--surface-container-high)',
                          color: flag.enabled ? 'var(--wa-success-dark)' : 'var(--color-on-surface-variant)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          flexShrink: 0,
                        }}
                      >
                        {flag.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.5rem' }}>
                      <code style={{ background: 'var(--surface-container)', padding: '0.1rem 0.35rem', borderRadius: '0.25rem' }}>{flag.key}</code>
                      {flag.description && <span style={{ marginLeft: '0.5rem' }}>{flag.description}</span>}
                    </div>

                    {isEditing ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Rollout: {flag.rolloutPercentage}%</span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={flag.rolloutPercentage}
                            onChange={(e) => updateRollout(flag, Number(e.target.value))}
                            style={{ width: '100%' }}
                          />
                        </label>
                        <div>
                          <span style={{ fontSize: '0.8125rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Allowed Roles</span>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {ALL_ROLES.map((role) => (
                              <label key={role} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: '0.8125rem' }}>
                                <input
                                  type="checkbox"
                                  checked={flag.allowedRoles.includes(role)}
                                  onChange={(e) => {
                                    const next = e.target.checked
                                      ? [...flag.allowedRoles, role]
                                      : flag.allowedRoles.filter((r) => r !== role);
                                    updateRoles(flag, next);
                                  }}
                                />
                                <RoleBadge role={role} />
                              </label>
                            ))}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => setEditingId(null)}
                          style={{ alignSelf: 'flex-start' }}
                        >
                          Done
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                        <span>Rollout: {flag.rolloutPercentage}%</span>
                        <span>·</span>
                        <span style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                          {flag.allowedRoles.length > 0 ? flag.allowedRoles.map((r) => <RoleBadge key={r} role={r} />) : <span>All roles</span>}
                        </span>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => toggleEnabled(flag)}
                      disabled={savingId === flag.id}
                    >
                      {flag.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setEditingId(isEditing ? null : flag.id)}
                      aria-label={isEditing ? `Stop editing "${flag.name}"` : `Edit "${flag.name}"`}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '0.875rem' }} aria-hidden="true">
                        {isEditing ? 'close' : 'edit'}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setConfirmDeleteId(flag.id)}
                      disabled={savingId === flag.id}
                      aria-label={`Delete "${flag.name}"`}
                      style={{ color: 'var(--wa-accent-text)', borderColor: 'color-mix(in srgb, var(--wa-accent) 30%, transparent)' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '0.875rem' }} aria-hidden="true">
                        delete
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete feature flag?"
        body="Delete this feature flag? Any code checking it will fall back to its default."
        confirmLabel="Delete flag"
        danger
        busy={savingId === confirmDeleteId && confirmDeleteId !== null}
        onConfirm={() => { if (confirmDeleteId) { void deleteFlag(confirmDeleteId); setConfirmDeleteId(null); } }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
