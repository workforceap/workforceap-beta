'use client';

import { useState } from 'react';

type Props = {
  memberId: string;
  memberName: string | null;
  memberEmail: string;
  currentFullName: string | null;
  currentPhone: string | null;
  currentProfilePhone: string | null;
  currentProfileAddress: string | null;
  currentProfileBio: string | null;
  currentProfileLinkedin: string | null;
};

export default function AdminMemberDbActions({
  memberId,
  memberName,
  memberEmail,
  currentFullName,
  currentPhone,
  currentProfilePhone,
  currentProfileAddress,
  currentProfileBio,
  currentProfileLinkedin,
}: Props) {
  const [resetStatus, setResetStatus] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [resetMsg, setResetMsg] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Edit form state
  const [fullName, setFullName] = useState(currentFullName ?? '');
  const [phone, setPhone] = useState(currentPhone ?? '');
  const [profilePhone, setProfilePhone] = useState(currentProfilePhone ?? '');
  const [profileAddress, setProfileAddress] = useState(currentProfileAddress ?? '');
  const [profileBio, setProfileBio] = useState(currentProfileBio ?? '');
  const [profileLinkedin, setProfileLinkedin] = useState(currentProfileLinkedin ?? '');

  const sendPasswordReset = async () => {
    setResetStatus('loading');
    try {
      const res = await fetch(`/api/admin/members/${memberId}/reset-password`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setResetStatus('err'); setResetMsg(data.error ?? 'Failed'); return; }
      setResetStatus('ok');
      setResetMsg(data.message ?? `Reset email sent to ${memberEmail}`);
    } catch {
      setResetStatus('err');
      setResetMsg('Network error — try again');
    }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/admin/members/${memberId}/edit-profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ fullName, phone, profilePhone, profileAddress, profileBio, profileLinkedin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setSaveMsg({ type: 'err', text: data.error ?? 'Save failed' }); return; }
      setSaveMsg({ type: 'ok', text: 'Profile updated successfully.' });
    } catch {
      setSaveMsg({ type: 'err', text: 'Network error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Password Reset */}
      <div>
        <p style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)', marginBottom: '0.5rem' }}>
          Password Reset
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => void sendPasswordReset()}
            disabled={resetStatus === 'loading'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.875rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--color-on-surface)', fontWeight: 700, fontSize: '0.8125rem', cursor: resetStatus === 'loading' ? 'default' : 'pointer', opacity: resetStatus === 'loading' ? 0.7 : 1 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '0.9rem', fontVariationSettings: "'FILL' 1" }}>
              {resetStatus === 'loading' ? 'hourglass_empty' : 'lock_reset'}
            </span>
            {resetStatus === 'loading' ? 'Sending…' : 'Send password reset email'}
          </button>
          {resetMsg && (
            <span style={{ fontSize: '0.8125rem', color: resetStatus === 'ok' ? 'var(--wa-success-dark)' : 'var(--wa-accent-text)', fontWeight: 600 }}>
              {resetMsg}
            </span>
          )}
        </div>
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginTop: '0.375rem' }}>
          Sends to: <strong>{memberEmail}</strong>
        </p>
      </div>

      {/* Profile Edit */}
      <div>
        <p style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)', marginBottom: '0.5rem' }}>
          Edit Profile
        </p>
        {!editOpen ? (
          /* Edit Profile is the most common admin action on this page;
             give it the primary visual weight so it stands out from
             the destructive-adjacent Password Reset (audit #148). */
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.875rem', borderRadius: '0.5rem', border: '1px solid var(--color-accent)', background: 'var(--color-accent)', color: '#fff', fontWeight: 700, fontSize: '0.8125rem', cursor: 'pointer' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '0.9rem', fontVariationSettings: "'FILL' 1" }}>edit</span>
            Edit member profile
          </button>
        ) : (
          <form onSubmit={saveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '520px' }}>
            {saveMsg && (
              <div style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', background: saveMsg.type === 'ok' ? 'rgba(74,155,79,0.1)' : 'rgba(173,44,77,0.1)', color: saveMsg.type === 'ok' ? 'var(--wa-success-dark)' : 'var(--wa-accent-text)', fontSize: '0.875rem' }}>
                {saveMsg.text}
              </div>
            )}
            {[
              { label: 'Full Name', id: 'adminmemberdbactions-fullname-field', value: fullName, set: setFullName, type: 'text' },
              { label: 'Phone', id: 'adminmemberdbactions-phone-field', value: phone, set: setPhone, type: 'tel' },
              { label: 'Profile Phone', id: 'adminmemberdbactions-profilephone-field', value: profilePhone, set: setProfilePhone, type: 'tel' },
              { label: 'Address', id: 'adminmemberdbactions-address-field', value: profileAddress, set: setProfileAddress, type: 'text' },
              { label: 'LinkedIn URL', id: 'adminmemberdbactions-linkedin-field', value: profileLinkedin, set: setProfileLinkedin, type: 'url' },
            ].map(({ label, id, value, set, type }) => (
              <div key={label}>
                <label htmlFor={id} style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.3rem' }}>{label}</label>
                <input id={id} type={type} value={value} onChange={(e) => set(e.target.value)}
                  style={{ width: '100%', padding: '0.45rem 0.7rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--color-on-surface)', fontSize: '0.875rem', boxSizing: 'border-box' as const }} />
              </div>
            ))}
            <div>
              <label htmlFor="adminmemberdbactions-bio-field" style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.3rem' }}>Bio</label>
              <textarea id="adminmemberdbactions-bio-field" value={profileBio} onChange={(e) => setProfileBio(e.target.value)} rows={3}
                style={{ width: '100%', padding: '0.45rem 0.7rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--color-on-surface)', fontSize: '0.875rem', resize: 'vertical', boxSizing: 'border-box' as const }} />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" disabled={saving} aria-busy={saving} className="btn btn-primary btn-sm">
                <span aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  {saving ? (
                    <>
                      <span className="material-symbols-outlined" style={{ fontSize: '1rem', animation: 'spin 1s linear infinite' }} aria-hidden="true">progress_activity</span>
                      Saving…
                    </>
                  ) : (
                    'Save changes'
                  )}
                </span>
              </button>
              <button type="button" onClick={() => { setEditOpen(false); setSaveMsg(null); }} className="btn btn-outline btn-sm" disabled={saving}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
