'use client';

import { useState } from 'react';
import { remindStaleApplication } from './remindAction';

export default function StaleApplicationsBanner({ staleApps }: { staleApps: any[] }) {
  const [reminded, setReminded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (staleApps.length === 0) return null;

  const handleRemind = async (appId: string, userId: string) => {
    setLoading((prev) => ({ ...prev, [appId]: true }));
    setErrors((prev) => ({ ...prev, [appId]: '' }));
    try {
      await remindStaleApplication(appId, userId);
      setReminded((prev) => ({ ...prev, [appId]: true }));
    } catch (e) {
      console.error(e);
      setErrors((prev) => ({ ...prev, [appId]: 'Failed to send reminder — try again.' }));
    }
    setLoading((prev) => ({ ...prev, [appId]: false }));
  };

  return (
    <div className="portal-alert portal-alert--accent" style={{ marginBottom: '1.5rem', display: 'block' }}>
      <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Stale Applications (Older than 3 days)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {staleApps.map((app) => (
          <div key={app.id} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', background: 'var(--surface-container)', padding: '0.5rem 1rem', borderRadius: '0.5rem' }}>
            <div style={{ flex: '1 1 16rem', minWidth: 0, wordBreak: 'break-word' }}>
              <span style={{ fontWeight: 500 }}>{app.user?.fullName}</span> ({app.user?.email}) - Applied {new Date(app.createdAt).toLocaleDateString()}
              {errors[app.id] ? (
                <div role="alert" style={{ color: 'rgb(153,27,27)', fontSize: '0.8125rem', marginTop: '0.25rem' }}>
                  {errors[app.id]}
                </div>
              ) : null}
            </div>
            <button type="button"
              className="btn btn-primary"
              style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem', flexShrink: 0 }}
              onClick={() => handleRemind(app.id, app.userId)}
              disabled={loading[app.id] || reminded[app.id]}
            >
              {reminded[app.id] ? 'Reminded' : loading[app.id] ? 'Sending...' : 'Send Reminder'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
