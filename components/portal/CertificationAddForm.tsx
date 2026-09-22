'use client';

import { useId, useState, useRef } from 'react';

// Common certificate suggestions for quick-add
const CERT_SUGGESTIONS = [
  'CompTIA A+',
  'CompTIA Security+',
  'CompTIA Network+',
  'Google IT Support',
  'Google Data Analytics',
  'Google Project Management',
  'PMI Project Management Professional (PMP)',
  'PMI Certified Associate in Project Management (CAPM)',
  'IBM AI Professional Practitioner',
  'AWS Cloud Practitioner',
  'Microsoft Azure Fundamentals',
  'Salesforce Administrator',
  'Coursera Certificate',
  'LinkedIn Learning Certificate',
  'HIPAA Compliance',
  'CPR/First Aid',
  'OSHA 10',
  'Forklift Operator',
  'Other',
];

export default function CertificationAddForm() {
  const idPrefix = useId();
  const certNameId = `${idPrefix}-certificate-name`;
  const certNameLabelId = `${certNameId}-label`;
  const earnedDateId = `${idPrefix}-date-earned`;
  const certificateFileId = `${idPrefix}-certificate-file`;
  const [open, setOpen] = useState(false);
  const [certName, setCertName] = useState('');
  const [customName, setCustomName] = useState('');
  const [earnedDate, setEarnedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const finalName = certName === 'Other' ? customName.trim() : certName.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!finalName) { setError('Please enter a certificate name.'); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/member/certifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ certName: finalName, earned: true, earnedAt: new Date(earnedDate).toISOString() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? 'Could not add certificate.'); return; }

      // Optionally upload a file — surface errors before showing success
      const file = fileRef.current?.files?.[0];
      if (file) {
        setUploading(true);
        try {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('certName', finalName);
          const uploadRes = await fetch('/api/member/certifications/upload', {
            method: 'POST', body: fd, credentials: 'include',
          });
          if (!uploadRes.ok) {
            const uploadData = await uploadRes.json().catch(() => ({})) as { error?: string };
            // File upload failed — cert is still recorded; warn the user
            const uploadErr = uploadData.error ?? `File upload failed (${uploadRes.status})`;
            setError(`Certificate added, but file was not attached: ${uploadErr}`);
            setSaving(false);
            setUploading(false);
            // Still show partial success after a moment
            setTimeout(() => { setError(null); setSuccess(true); }, 2500);
            return;
          }
        } catch {
          // Network error on upload — cert recorded, file not attached
          setError('Certificate added, but file could not be uploaded. Try again later.');
          setSaving(false);
          setUploading(false);
          setTimeout(() => { setError(null); setSuccess(true); }, 2500);
          return;
        } finally {
          setUploading(false);
        }
      }

      setSuccess(true);
      setTimeout(() => {
        // Reload to show the newly added cert
        window.location.reload();
      }, 100);
      setTimeout(() => {
        setOpen(false);
        setSuccess(false);
        setCertName('');
        setCustomName('');
        setEarnedDate(new Date().toISOString().split('T')[0]);
        if (fileRef.current) fileRef.current.value = '';
      }, 1500);
    } catch {
      setError('Network error — try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 1rem', borderRadius: '0.625rem', border: '2px dashed rgba(173,44,77,0.3)', background: 'rgba(173,44,77,0.04)', color: 'var(--wa-accent-text)', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', width: '100%', justifyContent: 'center' }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '1.125rem', fontVariationSettings: "'FILL' 1" }} aria-hidden="true">add_circle</span>
        Add a Certificate
      </button>
    );
  }

  if (success) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', background: 'rgba(74,155,79,0.08)', border: '1px solid rgba(74,155,79,0.2)', borderRadius: '0.875rem' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '1.375rem', color: 'var(--color-green, #4a9b4f)', fontVariationSettings: "'FILL' 1" }} aria-hidden="true">check_circle</span>
        <p style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-on-surface)', margin: 0 }}>
          {finalName} added{uploading ? ' (uploading file…)' : ''}!
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: '1.125rem', background: 'var(--surface-container-low)', border: '1px solid rgba(173,44,77,0.15)', borderRadius: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <h3 style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-on-surface)', margin: 0 }}>Add Certificate</h3>
        <button type="button" aria-label="Close" onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-on-surface-variant)', display: 'flex' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.125rem' }} aria-hidden="true">close</span>
        </button>
      </div>

      {error && (
        <p role="alert" style={{ fontSize: '0.875rem', color: 'var(--wa-accent-text)', margin: 0, padding: '0.5rem 0.75rem', background: 'rgba(173,44,77,0.08)', borderRadius: '0.5rem' }}>{error}</p>
      )}

      {/* Certificate name */}
      <div>
        <label id={certNameLabelId} htmlFor={certNameId} style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.375rem' }}>
          Certificate Name
        </label>
        <select id={certNameId}
          value={certName}
          onChange={(e) => setCertName(e.target.value)}
          style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--color-on-surface)', fontSize: '0.875rem', marginBottom: certName === 'Other' ? '0.5rem' : 0 }}
        >
          <option value="">Select a certificate…</option>
          {CERT_SUGGESTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {certName === 'Other' && (
          <input
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            aria-labelledby={certNameLabelId}
            placeholder="Type the certificate name…"
            style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--color-on-surface)', fontSize: '0.875rem', boxSizing: 'border-box' as const }}
          />
        )}
      </div>

      {/* Date earned */}
      <div>
        <label htmlFor={earnedDateId} style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.375rem' }}>
          Date Earned
        </label>
        <input id={earnedDateId}
          type="date"
          value={earnedDate}
          max={new Date().toISOString().split('T')[0]}
          onChange={(e) => setEarnedDate(e.target.value)}
          style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--color-on-surface)', fontSize: '0.875rem', boxSizing: 'border-box' as const }}
        />
      </div>

      {/* Optional file upload */}
      <div>
        <label htmlFor={certificateFileId} style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.375rem' }}>
          Certificate File <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional · PDF or image)</span>
        </label>
        <input id={certificateFileId}
          ref={fileRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          style={{ width: '100%', padding: '0.375rem 0', fontSize: '0.875rem', color: 'var(--color-on-surface)' }}
        />
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0.25rem 0 0' }}>
          Uploading stores your certificate for easy access — not required to record it.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.625rem' }}>
        <button
          type="submit"
          disabled={saving || !finalName}
          className="btn btn-primary"
          style={{ flex: 1 }}
          aria-busy={saving}
        >
          <span aria-live="polite">
            {saving ? 'Adding…' : 'Add Certificate'}
          </span>
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-outline">
          Cancel
        </button>
      </div>
    </form>
  );
}
