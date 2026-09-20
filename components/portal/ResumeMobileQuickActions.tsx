'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/** Mobile-only shortcuts: mirror desktop resume API URLs (signed Supabase links). */
export default function ResumeMobileQuickActions() {
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [enhancedUrl, setEnhancedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/member/resume')
      .then((r) => r.json())
      .then((d) => {
        setOriginalUrl(d.originalUrl ?? null);
        setEnhancedUrl(d.enhancedUrl ?? null);
      })
      .catch(() => {});
  }, []);

  const downloadUrl = enhancedUrl || originalUrl;

  const shareResume = async () => {
    if (!downloadUrl) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'My resume', url: downloadUrl });
      } else {
        await navigator.clipboard.writeText(downloadUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* user cancelled share or clipboard failed */
    }
  };

  return (
    <div style={{ padding: '0 1rem', display: 'flex', gap: '0.625rem', marginBottom: '1rem' }}>
      <Link
        href="/dashboard/resume#resume-ai-generator"
        scroll
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.25rem',
          background: 'var(--surface-container)',
          border: '1px solid var(--outline-variant)',
          borderRadius: '0.875rem',
          padding: '0.875rem 0.5rem',
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '1.375rem', color: 'var(--color-accent)', '--ms-fill': 1 }} aria-hidden="true">
          auto_fix_high
        </span>
        <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>AI Rewrite</span>
      </Link>
      <button
        type="button"
        onClick={shareResume}
        disabled={!downloadUrl}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.25rem',
          background: 'var(--surface-container)',
          border: '1px solid var(--outline-variant)',
          borderRadius: '0.875rem',
          padding: '0.875rem 0.5rem',
          cursor: downloadUrl ? 'pointer' : 'not-allowed',
          opacity: downloadUrl ? 1 : 0.5,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '1.375rem', color: 'var(--color-blue)' }} aria-hidden="true">
          {copied ? 'check' : 'share'}
        </span>
        <span aria-live="polite" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{copied ? 'Copied!' : 'Share'}</span>
      </button>
      {downloadUrl ? (
        <a
          href={downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          download
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.25rem',
            background: 'var(--surface-container)',
            border: '1px solid var(--outline-variant)',
            borderRadius: '0.875rem',
            padding: '0.875rem 0.5rem',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '1.375rem', color: 'var(--color-green)' }} aria-hidden="true">
            picture_as_pdf
          </span>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Download</span>
        </a>
      ) : (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.25rem',
            background: 'var(--surface-container)',
            border: '1px solid var(--outline-variant)',
            borderRadius: '0.875rem',
            padding: '0.875rem 0.5rem',
            opacity: 0.5,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '1.375rem', color: 'var(--color-green)' }} aria-hidden="true">
            picture_as_pdf
          </span>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Download</span>
        </div>
      )}
    </div>
  );
}
