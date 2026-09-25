'use client';

import { useEffect, useState } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { remindStaleApplication } from './remindAction';

type StaleApp = {
  id: string;
  userId: string;
  createdAt: string;
  user: { fullName: string | null; email: string } | null;
};

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; apps: StaleApp[] };

export const STALE_APPLICATIONS_ID = 'stale-applications';

/**
 * Stale applications (pending > 3 days) with a per-row "Send reminder" on the
 * default /admin/pipeline view (WAP-193). Same tenant-scoped list route and
 * server action as the ?ui=legacy banner.
 */
export function StaleApplicationsPanel() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [busy, setBusy] = useState<string | null>(null);
  const [reminded, setReminded] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/pipeline/stale')
      .then((r) => {
        if (!r.ok) throw new Error(`stale ${r.status}`);
        return r.json() as Promise<{ staleApps?: StaleApp[] }>;
      })
      .then((d) => {
        if (!cancelled) setLoad({ state: 'ready', apps: d.staleApps ?? [] });
      })
      .catch(() => {
        if (!cancelled) setLoad({ state: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function remind(app: StaleApp) {
    setBusy(app.id);
    setErrors((prev) => ({ ...prev, [app.id]: '' }));
    try {
      await remindStaleApplication(app.id, app.userId);
      setReminded((prev) => ({ ...prev, [app.id]: true }));
    } catch {
      setErrors((prev) => ({ ...prev, [app.id]: 'Failed to send reminder — try again.' }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section id={STALE_APPLICATIONS_ID} aria-labelledby={`${STALE_APPLICATIONS_ID}-title`} style={{ scrollMarginTop: 16 }}>
      <Card style={{ minWidth: 0 }}>
        <h2 id={`${STALE_APPLICATIONS_ID}-title`} style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em' }}>
          Stale applications
        </h2>
        <p style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', marginTop: 2, marginBottom: 16 }}>
          Pending for more than 3 days
        </p>
        {load.state === 'loading' ? (
          <p role="status" style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)' }}>Loading…</p>
        ) : load.state === 'error' ? (
          <p role="alert" style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-danger)' }}>
            Couldn&apos;t load stale applications. Reload to try again.
          </p>
        ) : load.apps.length === 0 ? (
          <p style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)' }}>
            No applications have been pending for more than 3 days.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {load.apps.map((app) => {
              const name = app.user?.fullName?.trim() || app.user?.email || 'Applicant';
              return (
                <li
                  key={app.id}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '8px 0',
                    borderTop: '1px solid var(--wa-border)',
                  }}
                >
                  <div style={{ flex: '1 1 16rem', minWidth: 0, wordBreak: 'break-word' }}>
                    <span style={{ fontWeight: 700 }}>{name}</span>
                    {app.user?.email && app.user.email !== name ? (
                      <span style={{ color: 'var(--wa-muted)' }}> · {app.user.email}</span>
                    ) : null}
                    <span style={{ color: 'var(--wa-muted)' }}>
                      {' '}· applied {new Date(app.createdAt).toLocaleDateString()}
                    </span>
                    {errors[app.id] ? (
                      <div role="alert" style={{ color: 'var(--wa-danger)', fontSize: 'var(--wa-type-meta)', marginTop: 4 }}>
                        {errors[app.id]}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm wa-kit-focus"
                    aria-label={reminded[app.id] ? `Reminder sent to ${name}` : `Send reminder to ${name}`}
                    onClick={() => void remind(app)}
                    disabled={busy !== null || reminded[app.id]}
                  >
                    {reminded[app.id] ? 'Reminded' : busy === app.id ? 'Sending…' : 'Send reminder'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}
