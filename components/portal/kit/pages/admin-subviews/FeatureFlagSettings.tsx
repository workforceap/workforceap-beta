'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { FEATURE_FLAG_ROLES } from '@/lib/admin/featureFlagRoles';

const FIELD_STYLE = {
  minHeight: 44,
  padding: '0 10px',
  borderRadius: 8,
  border: '1px solid var(--wa-border)',
  background: 'var(--wa-surface)',
  color: 'var(--wa-text)',
} as const;

async function errorFrom(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
  return data && typeof data.error === 'string' ? data.error : fallback;
}

function RolePicker({
  legend,
  roles,
  onChange,
  disabled,
}: {
  legend: string;
  roles: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
      <legend style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', marginBottom: 4 }}>{legend}</legend>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
        {FEATURE_FLAG_ROLES.map((role) => (
          <label key={role} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44 }}>
            <input
              type="checkbox"
              checked={roles.includes(role)}
              disabled={disabled}
              onChange={(e) =>
                onChange(e.target.checked ? [...roles, role] : roles.filter((r) => r !== role))
              }
            />
            {role}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Rollout %, role gating and delete for one flag in the kit registry
 * (WAP-193). Same PATCH / DELETE /api/admin/feature-flags/[id] requests as
 * the ?ui=legacy workspace; delete asks for confirmation.
 */
export function FeatureFlagSettings({
  id,
  name,
  rolloutPercentage,
  allowedRoles,
}: {
  id: string;
  name: string;
  rolloutPercentage: number;
  allowedRoles: string[];
}) {
  const router = useRouter();
  const rolloutId = useId();
  const [rollout, setRollout] = useState(String(rolloutPercentage));
  const [roles, setRoles] = useState<string[]>(allowedRoles);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    const pct = Number(rollout);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setMessage({ ok: false, text: 'Rollout must be a number from 0 to 100.' });
      return;
    }
    setBusy('save');
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/feature-flags/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rolloutPercentage: Math.round(pct), allowedRoles: roles }),
      });
      if (!res.ok) throw new Error(await errorFrom(res, `Could not update "${name}" — try again.`));
      setMessage({ ok: true, text: 'Saved.' });
      router.refresh();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong.' });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy('delete');
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/feature-flags/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await errorFrom(res, `Could not delete "${name}" — try again.`));
      setConfirmDelete(false);
      router.refresh();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong.' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <details>
      <summary className="wa-kit-focus" style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>
        <span>
          {rolloutPercentage}% · {allowedRoles.length ? allowedRoles.join(', ') : 'all roles'}
          <span className="sr-only"> — edit {name}</span>
        </span>
      </summary>
      <div style={{ display: 'grid', gap: 10, marginTop: 8, maxWidth: 420 }}>
        <label htmlFor={rolloutId} style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)' }}>
          Rollout %
        </label>
        <input
          id={rolloutId}
          type="number"
          min={0}
          max={100}
          inputMode="numeric"
          className="wa-kit-focus"
          value={rollout}
          disabled={busy !== null}
          onChange={(e) => setRollout(e.target.value)}
          style={{ ...FIELD_STYLE, width: 120 }}
        />
        <RolePicker legend="Allowed roles (none checked = everyone)" roles={roles} onChange={setRoles} disabled={busy !== null} />
        <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6 }}>
          <button
            type="button"
            className="btn btn-primary btn-sm wa-kit-focus"
            aria-label={`Save ${name}`}
            disabled={busy !== null}
            onClick={() => void save()}
          >
            {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm wa-kit-focus"
            aria-label={`Delete ${name}`}
            disabled={busy !== null}
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </button>
        </span>
        {message ? (
          <span
            role={message.ok ? 'status' : 'alert'}
            style={{ fontSize: 'var(--wa-type-meta)', color: message.ok ? 'var(--wa-muted)' : 'var(--wa-danger)' }}
          >
            {message.text}
          </span>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete "${name}"?`}
        body="Code that checks this flag will treat it as off for everyone. This cannot be undone."
        confirmLabel="Delete flag"
        danger
        busy={busy === 'delete'}
        onConfirm={() => void remove()}
        onCancel={() => {
          if (busy !== 'delete') setConfirmDelete(false);
        }}
      />
    </details>
  );
}

export const NEW_FEATURE_FLAG_ID = 'new-feature-flag';

/** Create a flag (POST /api/admin/feature-flags), as the legacy workspace does. */
export function NewFeatureFlagForm() {
  const router = useRouter();
  const ids = { key: useId(), name: useId(), description: useId(), rollout: useId() };
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [rollout, setRollout] = useState('0');
  const [roles, setRoles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim() || !name.trim()) {
      setMessage({ ok: false, text: 'Key and name are required.' });
      return;
    }
    const pct = Number(rollout);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setMessage({ ok: false, text: 'Rollout must be a number from 0 to 100.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/feature-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: key.trim(),
          name: name.trim(),
          description: description.trim() || undefined,
          enabled,
          rolloutPercentage: Math.round(pct),
          allowedRoles: roles,
        }),
      });
      if (!res.ok) throw new Error(await errorFrom(res, 'Failed to create flag'));
      setMessage({ ok: true, text: `Created "${name.trim()}".` });
      setKey('');
      setName('');
      setDescription('');
      setEnabled(false);
      setRollout('0');
      setRoles([]);
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed to create flag' });
    } finally {
      setBusy(false);
    }
  }

  const label = { fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)' } as const;

  return (
    <form
      id={NEW_FEATURE_FLAG_ID}
      onSubmit={submit}
      className="wa-kit-card"
      style={{ display: 'grid', gap: 10, maxWidth: 560, scrollMarginTop: 16 }}
    >
      <h2 style={{ fontWeight: 800, fontSize: 16 }}>New flag</h2>
      <label htmlFor={ids.key} style={label}>Key</label>
      <input id={ids.key} className="wa-kit-focus" value={key} onChange={(e) => setKey(e.target.value)} placeholder="e.g. coursera-v2" style={FIELD_STYLE} />
      <label htmlFor={ids.name} style={label}>Name</label>
      <input id={ids.name} className="wa-kit-focus" value={name} onChange={(e) => setName(e.target.value)} style={FIELD_STYLE} />
      <label htmlFor={ids.description} style={label}>Description (optional)</label>
      <input id={ids.description} className="wa-kit-focus" value={description} onChange={(e) => setDescription(e.target.value)} style={FIELD_STYLE} />
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44 }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Start enabled
      </label>
      <label htmlFor={ids.rollout} style={label}>Rollout %</label>
      <input
        id={ids.rollout}
        type="number"
        min={0}
        max={100}
        inputMode="numeric"
        className="wa-kit-focus"
        value={rollout}
        onChange={(e) => setRollout(e.target.value)}
        style={{ ...FIELD_STYLE, width: 120 }}
      />
      <RolePicker legend="Allowed roles (none checked = everyone)" roles={roles} onChange={setRoles} />
      <button type="submit" className="btn btn-primary wa-kit-focus" disabled={busy} style={{ justifySelf: 'start' }}>
        {busy ? 'Creating…' : 'Create flag'}
      </button>
      {message ? (
        <span
          role={message.ok ? 'status' : 'alert'}
          style={{ fontSize: 'var(--wa-type-meta)', color: message.ok ? 'var(--wa-muted)' : 'var(--wa-danger)' }}
        >
          {message.text}
        </span>
      ) : null}
    </form>
  );
}
