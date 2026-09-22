'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';

const MarkdownPreview = dynamic(() => import('@/components/MarkdownPreview'), { ssr: false });

type ResumeMeta = {
  hasOriginal: boolean;
  hasEnhanced: boolean;
  originalUrl: string | null;
  enhancedUrl: string | null;
  enhancedText: string | null;
  originalExt: string | null;
  enhancedExt: string | null;
  previewOriginalPath: string | null;
  previewEnhancedPath: string | null;
};

type StaffMemberResumePanelProps = {
  memberId: string;
};

export default function StaffMemberResumePanel({ memberId }: StaffMemberResumePanelProps) {
  const tCommon = useTranslations('common');
  const [data, setData] = useState<ResumeMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [originalDocHtml, setOriginalDocHtml] = useState<string | null>(null);
  const [enhancedDocHtml, setEnhancedDocHtml] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<'original' | 'enhanced' | null>(null);

  const apiBase = `/api/counselor/members/${encodeURIComponent(memberId)}/resume`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(apiBase)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 403 ? 'No access to this member’s resume.' : 'Could not load resume.');
        return r.json();
      })
      .then((d: ResumeMeta) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(requestFailureMessage(e, { connection: tCommon('connectionError'), fallback: 'Could not load resume.' }, 'staff-member-resume'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiBase, memberId, tCommon]);

  useEffect(() => {
    const ext = data?.originalExt;
    if (!ext || !['doc', 'docx'].includes(ext) || !data?.hasOriginal) {
      setOriginalDocHtml(null);
      return;
    }
    let cancelled = false;
    fetch(`${apiBase}/docx-html?variant=original`, { method: 'POST' })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.html) setOriginalDocHtml(d.html as string);
      })
      .catch(() => {
        if (!cancelled) setOriginalDocHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [apiBase, data?.originalExt, data?.hasOriginal]);

  useEffect(() => {
    const ext = data?.enhancedExt;
    if (!ext || !['doc', 'docx'].includes(ext) || !data?.hasEnhanced) {
      setEnhancedDocHtml(null);
      return;
    }
    let cancelled = false;
    fetch(`${apiBase}/docx-html?variant=enhanced`, { method: 'POST' })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.html) setEnhancedDocHtml(d.html as string);
      })
      .catch(() => {
        if (!cancelled) setEnhancedDocHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [apiBase, data?.enhancedExt, data?.hasEnhanced]);

  const closeModal = useCallback(() => setExpanded(null), []);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded, closeModal]);

  // Basic focus management: move focus into the dialog when it opens and
  // restore it to whatever triggered the dialog when it closes, so keyboard
  // users aren't dropped back at the top of the page.
  useEffect(() => {
    if (expanded) {
      lastFocusedRef.current = document.activeElement as HTMLElement | null;
      closeButtonRef.current?.focus();
    } else {
      lastFocusedRef.current?.focus();
    }
  }, [expanded]);

  if (loading) {
    return (
      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-on-surface-variant)' }}>Loading resume…</p>
    );
  }

  if (error) {
    return (
      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--wa-danger)' }} role="alert">
        {error}
      </p>
    );
  }

  if (!data || (!data.hasOriginal && !data.hasEnhanced)) {
    return (
      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-on-surface-variant)' }}>
        No resume on file yet.
      </p>
    );
  }

  const iframeDocShell = (bodyHtml: string) =>
    `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>body{font-family:system-ui,sans-serif;padding:1rem;margin:0;line-height:1.45;color:#111;}.mammoth-doc img{max-width:100%;height:auto;}</style></head><body>${bodyHtml}</body></html>`;

  const renderPreviewBlock = (
    variant: 'original' | 'enhanced',
    label: string,
    icon: string
  ) => {
    const isOriginal = variant === 'original';
    const has = isOriginal ? data.hasOriginal : data.hasEnhanced;
    if (!has) return null;

    const url = isOriginal ? data.originalUrl : data.enhancedUrl;
    const ext = isOriginal ? data.originalExt : data.enhancedExt;
    const previewPath = isOriginal ? data.previewOriginalPath : data.previewEnhancedPath;
    const docHtml = isOriginal ? originalDocHtml : enhancedDocHtml;

    return (
      <div
        style={{
          marginBottom: '1.25rem',
          border: '1px solid var(--outline-variant)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
            padding: '0.6rem 0.9rem',
            background: 'var(--surface-container)',
            borderBottom: '1px solid var(--outline-variant)',
            fontSize: '0.85rem',
          }}
        >
          <span style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">{icon}</span>
            {label}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setExpanded(variant)}
              style={{ fontSize: '0.8125rem' }}
            >
              Larger view
            </button>
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--color-accent)', fontWeight: 600, textDecoration: 'none' }}
              >
                Download ↗
              </a>
            ) : (
              <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem' }}>Preparing link…</span>
            )}
          </div>
        </div>

        {previewPath && ext === 'pdf' && (
          <iframe
            title={`${label} PDF preview`}
            src={previewPath}
            style={{ width: '100%', minHeight: '420px', border: 'none', display: 'block', background: 'var(--wa-surface-2)' }}
          />
        )}
        {['doc', 'docx'].includes(ext ?? '') && (
          <div style={{ background: 'var(--surface-container)' }}>
            {docHtml ? (
              <iframe
                title={`${label} preview`}
                srcDoc={iframeDocShell(docHtml)}
                sandbox="allow-same-origin"
                style={{ width: '100%', minHeight: '420px', border: 'none', display: 'block' }}
              />
            ) : (
              <p style={{ padding: '1rem', margin: 0, fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
                Loading preview…
              </p>
            )}
          </div>
        )}
        {ext && !['pdf', 'doc', 'docx'].includes(ext) && url && (
          <div style={{ padding: '1rem', textAlign: 'center', background: 'var(--surface-container)' }}>
            <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">
              Open file
            </a>
          </div>
        )}
        {!isOriginal &&
          data.enhancedText &&
          !['pdf', 'doc', 'docx'].includes(data.enhancedExt ?? '') && (
            <article
              className="markdown-body"
              style={{
                padding: '1.25rem',
                background: 'var(--wa-surface)',
                fontSize: '0.9375rem',
                lineHeight: 1.65,
                maxHeight: 'min(55vh, 560px)',
                overflowY: 'auto',
                color: 'var(--color-on-surface)',
              }}
            >
              <MarkdownPreview>{data.enhancedText}</MarkdownPreview>
            </article>
          )}
      </div>
    );
  };

  const modalSrc =
    expanded === 'original'
      ? data.previewOriginalPath
      : expanded === 'enhanced'
        ? data.previewEnhancedPath
        : null;
  const modalDocHtml =
    expanded === 'original' ? originalDocHtml : expanded === 'enhanced' ? enhancedDocHtml : null;
  const modalExt =
    expanded === 'original' ? data.originalExt : expanded === 'enhanced' ? data.enhancedExt : null;

  return (
    <>
      {renderPreviewBlock('original', 'Original resume', 'description')}
      {renderPreviewBlock('enhanced', 'AI-enhanced resume', 'auto_awesome')}

      {expanded ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Resume preview"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={closeModal}
        >
          <div
            style={{
              width: 'min(960px, 100%)',
              maxHeight: 'min(92vh, 900px)',
              background: 'var(--surface-container-lowest)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--outline-variant)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 24px 48px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.65rem 1rem',
                borderBottom: '1px solid var(--outline-variant)',
                background: 'var(--surface-container)',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                {expanded === 'original' ? 'Original resume' : 'Enhanced resume'}
              </span>
              <button ref={closeButtonRef} type="button" className="btn btn-outline btn-sm" onClick={closeModal}>
                Close
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: 'var(--surface-container)' }}>
              {modalSrc && modalExt === 'pdf' && (
                <iframe
                  title="Resume PDF"
                  src={modalSrc}
                  style={{ width: '100%', height: 'min(82vh, 800px)', border: 'none', display: 'block', background: 'var(--wa-surface-2)' }}
                />
              )}
              {['doc', 'docx'].includes(modalExt ?? '') && modalDocHtml && (
                <iframe
                  title="Resume document preview"
                  srcDoc={iframeDocShell(modalDocHtml)}
                  sandbox="allow-same-origin"
                  style={{ width: '100%', height: 'min(82vh, 800px)', border: 'none', display: 'block' }}
                />
              )}
              {expanded === 'enhanced' &&
                data.enhancedText &&
                !['pdf', 'doc', 'docx'].includes(data.enhancedExt ?? '') && (
                  <article
                    className="markdown-body"
                    style={{
                      padding: '1.5rem',
                      fontSize: '0.95rem',
                      lineHeight: 1.65,
                      color: 'var(--color-on-surface)',
                    }}
                  >
                    <MarkdownPreview>{data.enhancedText}</MarkdownPreview>
                  </article>
                )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
