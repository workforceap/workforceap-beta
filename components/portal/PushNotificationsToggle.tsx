'use client';

import { useEffect, useState } from 'react';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY ?? '';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type PushState = 'unsupported' | 'loading' | 'off' | 'on' | 'denied';

/**
 * Device-level Web Push opt-in. Renders nothing when the deployment has no
 * VAPID key or the browser lacks push support, so it is safe to mount
 * unconditionally on the notification settings page.
 */
export default function PushNotificationsToggle() {
  const [state, setState] = useState<PushState>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!VAPID_PUBLIC_KEY || typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? 'on' : 'off'))
      .catch(() => setState('off'));
  }, []);

  async function enable() {
    setError(null);
    setState('loading');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        await sub.unsubscribe().catch(() => {});
        setError(data.error ?? 'Could not enable push notifications.');
        setState('off');
        return;
      }
      setState('on');
    } catch {
      setError('Could not enable push notifications on this device.');
      setState('off');
    }
  }

  async function disable() {
    setError(null);
    setState('loading');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setState('off');
    } catch {
      setError('Could not turn off push on this device.');
      setState('on');
    }
  }

  if (state === 'unsupported') return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Push notifications on this device</span>
        {state === 'denied' ? (
          <span style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
            Blocked in your browser settings — allow notifications for this site to enable.
          </span>
        ) : (
          <button
            type="button"
            className={state === 'on' ? 'btn btn-outline btn-sm' : 'btn btn-primary btn-sm'}
            disabled={state === 'loading'}
            onClick={() => void (state === 'on' ? disable() : enable())}
          >
            {state === 'loading' ? 'Working…' : state === 'on' ? 'Turn off' : 'Turn on'}
          </button>
        )}
      </div>
      <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
        Get notified about counselor messages and job matches even when the portal is closed.
      </p>
      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: '0.8125rem', color: '#b91c1c' }}>{error}</p>
      ) : null}
    </div>
  );
}
