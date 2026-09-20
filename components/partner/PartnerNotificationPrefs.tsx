'use client';

import { useState, useCallback } from 'react';
import { CardHead, Toggle } from '@/components/portal/kit';

type Prefs = {
  notifyOnEnrollment: boolean;
  notifyOnCourse: boolean;
  notifyOnCertified: boolean;
  notifyOnPlaced: boolean;
};

const PREF_LABELS: { key: keyof Prefs; label: string; desc: string }[] = [
  { key: 'notifyOnEnrollment', label: 'New enrollment', desc: 'When a referred member enrolls in a program' },
  { key: 'notifyOnCourse', label: 'Course milestones', desc: 'When a member completes a course' },
  { key: 'notifyOnCertified', label: 'Certification earned', desc: 'When a member earns a certificate' },
  { key: 'notifyOnPlaced', label: 'Job placement', desc: 'When a member is placed in a role' },
];

export default function PartnerNotificationPrefs({ initial }: { initial: Prefs }) {
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const toggle = useCallback(async (key: keyof Prefs, label: string) => {
    const next = !prefs[key];
    setSaving(key);
    try {
      const res = await fetch('/api/partner/settings/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: next }),
      });
      if (res.ok) {
        setPrefs((p) => ({ ...p, [key]: next }));
        setAnnouncement(`${label} notifications turned ${next ? 'on' : 'off'}.`);
      } else {
        setAnnouncement(`Could not update ${label} notifications. Please try again.`);
      }
    } catch {
      setAnnouncement(`Could not update ${label} notifications. Please try again.`);
    } finally {
      setSaving(null);
    }
  }, [prefs]);

  return (
    <div className="wa-kit-card">
      <CardHead title="Email notifications" />
      <p aria-live="polite" className="wa-sr-only">{announcement}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {PREF_LABELS.map(({ key, label, desc }) => (
          <div
            key={key}
            style={{
              padding: '10px 0',
              borderBottom: '1px solid var(--wa-border)',
              opacity: saving === key ? 0.6 : 1,
            }}
          >
            <Toggle
              checked={prefs[key]}
              onChange={() => {
                if (saving !== null) return;
                void toggle(key, label);
              }}
              label={label}
            />
            <span style={{ fontSize: 13, color: 'var(--wa-muted)' }}>{desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
