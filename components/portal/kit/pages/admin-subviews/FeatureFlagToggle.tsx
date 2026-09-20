'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Toggle } from '@/components/portal/kit';

/**
 * Feature flag on/off switch for the kit registry table.
 *
 * Calls the existing `PATCH /api/admin/feature-flags/[id]` with `{ enabled }`
 * — the same request the legacy workspace sends — so the server keeps the
 * same guard (isAdmin) and audit trail. Optimistic flip, rolled back on
 * failure with the server's message (e.g. operational cron flags are refused
 * with a pointer to Email & Cron Management).
 */
export default function FeatureFlagToggle({
  id,
  name,
  enabled,
}: {
  id: string;
  name: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onChange = async (next: boolean) => {
    if (saving) return;
    const previous = checked;
    setSaving(true);
    setError(null);
    setChecked(next);
    try {
      const res = await fetch(`/api/admin/feature-flags/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
            ? (data as { error: string }).error
            : `Could not update "${name}" — try again.`;
        throw new Error(message);
      }
      const flag = data && typeof data === 'object' ? (data as { flag?: { enabled?: unknown } }).flag : undefined;
      setChecked(typeof flag?.enabled === 'boolean' ? flag.enabled : next);
      router.refresh();
    } catch (err) {
      setChecked(previous);
      setError(err instanceof Error && err.message ? err.message : `Could not update "${name}" — try again.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, minWidth: 0 }} data-saving={saving ? 'true' : undefined}>
      <Toggle checked={checked} onChange={onChange} label={checked ? 'On' : 'Off'} />
      {error ? (
        <span role="alert" style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-danger)' }}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
