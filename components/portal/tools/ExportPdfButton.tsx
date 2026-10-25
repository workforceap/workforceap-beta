'use client';

import { useState, type CSSProperties } from 'react';
import { FileDown } from 'lucide-react';
import { PortalInlineSpinner } from '@/components/portal/PortalInlineSpinner';

const GENERIC_ERROR = "Couldn't generate the PDF — please try again. If this keeps happening, contact support.";

const KIT_BTN =
  'wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none';

const kitBtnOutline: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  minHeight: 44,
  padding: '10px 16px',
  background: 'transparent',
  color: 'var(--wa-accent)',
  border: '1px solid var(--wa-border)',
  fontWeight: 600,
  fontSize: 'var(--wa-type-body)',
  borderRadius: 999,
  cursor: 'pointer',
};

export default function ExportPdfButton({
  text,
  title,
  toolName,
  label = 'Download PDF',
  srSuffix,
  kit = false,
}: {
  text: string;
  title?: string;
  toolName?: string;
  label?: string;
  /** Screen-reader-only words after the label (e.g. "of rewritten resume") that tell repeated buttons apart. */
  srSuffix?: string;
  /** 44px --wa-* pill + lucide — kit results chrome. */
  kit?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, title, toolName })});
      if (!res.ok) {
        setError(GENERIC_ERROR);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(title || 'workforceap-export').replace(/[^a-zA-Z0-9-_ ]/g, '')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  };

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
      <button
        type="button"
        className={kit ? KIT_BTN : 'btn btn-outline btn-sm'}
        onClick={handleExport}
        disabled={loading || !text}
        aria-busy={loading}
        style={kit ? { ...kitBtnOutline, opacity: loading || !text ? 0.55 : 1, cursor: loading || !text ? 'not-allowed' : 'pointer' } : { display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}
      >
        {loading ? (
          <PortalInlineSpinner size={14} />
        ) : kit ? (
          <FileDown size={16} aria-hidden="true" />
        ) : (
          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">picture_as_pdf</span>
        )}
        <span aria-live="polite">{loading ? 'Saving…' : label}</span>
        {srSuffix && !loading ? <>{' '}<span className="wa-sr-only">{srSuffix}</span></> : null}
      </button>
      {error ? (
        <span
          role="alert"
          style={{
            color: kit ? 'var(--wa-danger)' : 'var(--color-error, #b91c1c)',
            fontSize: kit ? 13 : 12,
            lineHeight: kit ? 1.45 : 1.3,
          }}
        >
          {error}
        </span>
      ) : null}
    </span>
  );
}
