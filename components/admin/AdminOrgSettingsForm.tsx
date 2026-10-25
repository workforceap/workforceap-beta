'use client';

import { useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { PortalInlineSpinner } from '@/components/portal/PortalInlineSpinner';
import { DEFAULT_BRAND_ACCENT } from '@/lib/platform/brandColors';
import { FormField } from '@/components/portal/kit';

type Props = {
  defaultName: string;
  defaultOverviewVideoUrl: string;
  defaultLogoUrl: string;
  defaultPrimaryColor: string;
};

export default function AdminOrgSettingsForm({
  defaultName,
  defaultOverviewVideoUrl,
  defaultLogoUrl,
  defaultPrimaryColor,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [overviewVideoUrl, setOverviewVideoUrl] = useState(defaultOverviewVideoUrl);
  const [primaryColor, setPrimaryColor] = useState(defaultPrimaryColor || DEFAULT_BRAND_ACCENT);
  const [logoUrl, setLogoUrl] = useState(defaultLogoUrl);
  const [logoUploading, setLogoUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setOk(false);
    setLoading(true);
    try {
      const res = await fetch('/api/admin/settings/organization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          overviewVideoUrl: overviewVideoUrl.trim() || null,
          primaryColor: /^#[0-9A-Fa-f]{6}$/.test(primaryColor.trim()) ? primaryColor.trim() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      setOk(true);
      router.refresh();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  const uploadLogo = async (file: File, input?: HTMLInputElement | null) => {
    setLogoUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admin/organization/logo', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Logo upload failed');
      if (data.logo) setLogoUrl(data.logo);
      setOk(true);
      router.refresh();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'Logo upload failed');
    } finally {
      setLogoUploading(false);
      if (input) input.value = '';
    }
  };

  const onLogo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadLogo(file, e.target);
  };

  const validPrimaryColor = /^#[0-9A-Fa-f]{6}$/.test(primaryColor);

  return (
    <form onSubmit={save} className="wa-kit-card" style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--wa-danger)' }}>
          {error}
        </p>
      ) : null}
      {ok ? (
        <p style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--wa-success)' }}>
          <CheckCircle2 size={14} aria-hidden /> Saved.
        </p>
      ) : null}

      <FormField label="Organization display name" id="orgName" value={name} onChange={(e) => setName(e.target.value)} required />

      <div>
        <label className="wa-kit-field-label" htmlFor="logo">Organization logo</label>
        <label
          htmlFor="logo"
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (logoUploading) return;
            const file = e.dataTransfer.files?.[0];
            if (!file || !file.type.startsWith('image/')) return;
            void uploadLogo(file);
          }}
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            marginTop: 6,
            minHeight: 120,
            padding: 16,
            border: '1px dashed var(--wa-border)',
            borderRadius: 'var(--wa-radius-sm)',
            background: 'var(--wa-surface-2)',
            cursor: logoUploading ? 'wait' : 'pointer',
            textAlign: 'center',
          }}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Current organization logo"
              style={{ display: 'block', maxHeight: 64, maxWidth: '100%', objectFit: 'contain' }}
            />
          ) : (
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--wa-text)' }}>Drop a logo here</span>
          )}
          <span style={{ fontSize: 13, color: 'var(--wa-muted)' }}>
            {logoUploading ? 'Uploading…' : logoUrl ? 'Drop to replace, or click to choose a file' : 'or click to choose a file'}
          </span>
          <input
            id="logo"
            type="file"
            accept="image/*"
            onChange={(e) => void onLogo(e)}
            disabled={logoUploading}
            className="wa-kit-focus"
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: 'hidden',
              clip: 'rect(0,0,0,0)',
              whiteSpace: 'nowrap',
              border: 0,
            }}
          />
        </label>
        <p style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 6 }}>
          Stored in Supabase bucket organization-branding and resolved at render time.
        </p>
      </div>

      <div>
        <label className="wa-kit-field-label" htmlFor="pc">Primary color (hex)</label>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
          <input
            id="pc"
            type="color"
            value={validPrimaryColor ? primaryColor : DEFAULT_BRAND_ACCENT}
            onChange={(e) => setPrimaryColor(e.target.value)}
            className="wa-kit-focus"
            style={{ width: 48, height: 36, padding: 0, border: 'none', cursor: 'pointer', background: 'transparent' }}
            aria-label="Color picker"
          />
          <input
            type="text"
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            placeholder={DEFAULT_BRAND_ACCENT}
            pattern="^#[0-9A-Fa-f]{6}$"
            aria-label="Primary color hex value"
            className="wa-kit-focus"
            style={{
              maxWidth: 120,
              fontFamily: 'monospace',
              fontSize: 13,
              border: '1px solid var(--wa-border)',
              borderRadius: 'var(--wa-radius-sm)',
              padding: '8px 10px',
              background: 'var(--wa-surface)',
              color: 'var(--wa-text)',
            }}
          />
          <span
            aria-hidden
            style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              background: validPrimaryColor ? primaryColor : 'var(--wa-border)',
              border: '1px solid var(--wa-border)',
            }}
          />
        </div>
        <p style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 6 }}>
          Drives accent buttons and links site-wide via CSS variables.
        </p>
      </div>

      <div>
        <FormField
          label="Overview step video URL (Loom, YouTube, Vimeo)"
          id="vid"
          type="url"
          value={overviewVideoUrl}
          onChange={(e) => setOverviewVideoUrl(e.target.value)}
          placeholder="https://..."
        />
        <p style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 6 }}>
          Shown on the public &ldquo;How it works&rdquo; page for the Overview step. Leave blank to use text only.
        </p>
      </div>

      <button
        type="submit"
        className="wa-kit-focus"
        disabled={loading || logoUploading}
        aria-busy={loading || logoUploading}
        style={{
          alignSelf: 'flex-start',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '10px 20px',
          borderRadius: 999,
          border: 'none',
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--wa-on-accent)',
          background: 'var(--wa-accent-fill)',
          cursor: loading || logoUploading ? 'default' : 'pointer',
          opacity: loading || logoUploading ? 0.75 : 1,
        }}
      >
        <span aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {loading ? (
            <>
              <PortalInlineSpinner size={14} />
              Saving…
            </>
          ) : logoUploading ? (
            <>
              <PortalInlineSpinner size={14} />
              Uploading logo…
            </>
          ) : (
            'Save settings'
          )}
        </span>
      </button>
    </form>
  );
}
