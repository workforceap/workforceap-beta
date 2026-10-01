'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';
import {
  RESUME_UPLOAD_ACCEPT,
  RESUME_UPLOAD_FORMAT_LABEL,
  uploadMemberResumeFile,
} from '@/lib/portal/memberResumeUpload';

type MemberResumeResponse = {
  hasOriginal: boolean;
  originalUrl: string | null;
  originalExt: string | null;
  previewOriginalPath: string | null;
};

type ResumePreview =
  | { kind: 'pdf'; src: string; downloadUrl: string | null }
  | { kind: 'docx'; html: string; downloadUrl: string | null }
  | { kind: 'txt'; text: string; downloadUrl: string | null }
  | { kind: 'download'; extension: string | null; downloadUrl: string | null };

function extensionFromPath(path: string | null): string | null {
  if (!path) return null;
  const pathWithoutQuery = path.split(/[?#]/, 1)[0] ?? '';
  const extension = pathWithoutQuery.match(/\.([a-z0-9]+)$/i)?.[1];
  return extension?.toLowerCase() ?? null;
}

function resumeLabel(extension: string | null): string {
  return extension ? `Your resume (${extension.toUpperCase()})` : 'Your resume';
}

function documentShell(bodyHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{box-sizing:border-box;font-family:system-ui,sans-serif;padding:1rem;margin:0;line-height:1.5;color:#111;overflow-wrap:anywhere}.mammoth-doc img{max-width:100%;height:auto}</style></head><body>${bodyHtml}</body></html>`;
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: unknown };
    return typeof data.error === 'string' && data.error.trim() ? data.error : fallback;
  } catch {
    return fallback;
  }
}

export default function MobileProfileSkillsResume({
  resumeOriginalPath,
}: {
  resumeOriginalPath: string | null;
}) {
  const router = useRouter();
  const tCommon = useTranslations('common');
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadInFlightRef = useRef(false);
  const previewRequestRef = useRef(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [hasResume, setHasResume] = useState(Boolean(resumeOriginalPath));
  const [fileName, setFileName] = useState(() => resumeLabel(extensionFromPath(resumeOriginalPath)));
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<ResumePreview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    setHasResume(Boolean(resumeOriginalPath));
    setFileName(resumeLabel(extensionFromPath(resumeOriginalPath)));
  }, [resumeOriginalPath]);

  const refreshResumeState = async (showPreview: boolean) => {
    const requestId = ++previewRequestRef.current;
    setPreviewOpen(showPreview);
    setPreview(null);
    setPreviewError('');
    setLoadingPreview(showPreview);

    try {
      const response = await fetch('/api/member/resume', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(await readError(response, 'Could not load your resume.'));
      }

      const data = (await response.json()) as MemberResumeResponse;
      if (requestId !== previewRequestRef.current) return;

      setHasResume(Boolean(data.hasOriginal));
      setFileName(resumeLabel(data.originalExt));

      if (!showPreview) return;
      if (!data.hasOriginal) throw new Error('No resume is available to preview.');

      const extension = data.originalExt?.toLowerCase() ?? null;
      const proxyPath = data.previewOriginalPath;

      if (extension === 'pdf') {
        if (!proxyPath) throw new Error('The PDF preview is not available yet.');
        setPreview({ kind: 'pdf', src: proxyPath, downloadUrl: data.originalUrl });
        return;
      }

      if (extension === 'docx') {
        const revision = proxyPath ?? '';
        const docxResponse = await fetch(
          `/api/member/resume/docx-html?variant=original&v=${encodeURIComponent(revision)}`,
          { method: 'POST', cache: 'no-store' },
        );
        if (!docxResponse.ok) {
          throw new Error(await readError(docxResponse, 'Could not prepare this Word document for preview.'));
        }
        const docxData = (await docxResponse.json()) as { html?: unknown };
        if (requestId !== previewRequestRef.current) return;
        if (typeof docxData.html !== 'string' || !docxData.html.trim()) {
          throw new Error('Could not prepare this Word document for preview.');
        }
        setPreview({ kind: 'docx', html: docxData.html, downloadUrl: data.originalUrl });
        return;
      }

      if (extension === 'txt') {
        if (!proxyPath) throw new Error('The text preview is not available yet.');
        const textResponse = await fetch(proxyPath, { cache: 'no-store' });
        if (!textResponse.ok) {
          throw new Error(await readError(textResponse, 'Could not load this text resume.'));
        }
        const text = await textResponse.text();
        if (requestId !== previewRequestRef.current) return;
        setPreview({ kind: 'txt', text, downloadUrl: data.originalUrl });
        return;
      }

      setPreview({ kind: 'download', extension, downloadUrl: data.originalUrl });
    } catch (caught) {
      if (requestId !== previewRequestRef.current) return;
      setPreviewError(requestFailureMessage(caught, { connection: tCommon('connectionError'), fallback: 'Could not load your resume preview.' }, 'member-resume-preview'));
    } finally {
      if (requestId === previewRequestRef.current) setLoadingPreview(false);
    }
  };

  const handleFile = async (file: File) => {
    if (uploadInFlightRef.current) return;
    uploadInFlightRef.current = true;
    const shouldReloadPreview = previewOpen;
    setError('');
    setWarning('');
    setUploading(true);
    try {
      const result = await uploadMemberResumeFile(file);
      if (result.ok) {
        ++previewRequestRef.current;
        setPreview(null);
        setPreviewError('');
        setLoadingPreview(shouldReloadPreview);
        setWarning(result.warning ?? '');
        setHasResume(true);
        setFileName(file.name);
        await refreshResumeState(shouldReloadPreview);
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch {
      setError('Upload failed (network error)');
    } finally {
      uploadInFlightRef.current = false;
      setUploading(false);
    }
  };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (uploadInFlightRef.current) {
      event.target.value = '';
      return;
    }
    const file = event.target.files?.[0];
    if (file) void handleFile(file);
    event.target.value = '';
  };

  const closePreview = () => {
    ++previewRequestRef.current;
    setPreviewOpen(false);
    setPreview(null);
    setPreviewError('');
    setLoadingPreview(false);
  };

  const previewDownloadUrl = preview?.downloadUrl ?? null;

  return (
    <div aria-busy={uploading} style={{ margin: '0 1.5rem 1rem', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <h3 className="wa-text-[13px] wa-font-bold wa-uppercase wa-tracking-[0.1em]" style={{ color: 'var(--color-on-surface-variant)' }}>Resume</h3>
      </div>

      {hasResume ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--wa-accent-text)', fontSize: '24px' }} aria-hidden="true">description</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="wa-text-sm wa-font-semibold wa-truncate" style={{ color: 'var(--color-on-surface)' }}>
                {fileName}
              </p>
              <p className="wa-text-[13px]" style={{ color: 'var(--color-on-surface-variant)' }}>Uploaded</p>
            </div>
            <button type="button"
              className="wa-text-xs wa-font-bold"
              style={{ padding: '0.375rem 0.75rem', borderRadius: '9999px', background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)', color: 'var(--wa-accent-text)' }}
              onClick={() => {
                if (!uploadInFlightRef.current) fileRef.current?.click();
              }}
              disabled={uploading}
            >
              {uploading ? 'Uploading…' : 'Replace'}
            </button>
            <input ref={fileRef} type="file" accept={RESUME_UPLOAD_ACCEPT} onChange={onFileChange} disabled={uploading} style={{ display: 'none' }} />
          </div>

          {!previewOpen ? (
            <button
              type="button"
              onClick={() => void refreshResumeState(true)}
              disabled={loadingPreview}
              style={{
                marginTop: '0.75rem',
                width: '100%',
                padding: '0.5rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--outline-variant)',
                background: 'var(--surface-container-lowest)',
                color: 'var(--wa-accent-text)',
                fontWeight: 700,
                fontSize: '0.8125rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.375rem',
                cursor: loadingPreview ? 'wait' : 'pointer',
              }}
            >
              <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '1.125rem' }}>
                visibility
              </span>
              View Resume
            </button>
          ) : (
            <div style={{ marginTop: '0.75rem', borderRadius: '0.5rem', overflow: 'hidden', border: '1px solid var(--outline-variant)', background: 'var(--surface-container-lowest)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--outline-variant)' }}>
                <span className="wa-text-xs wa-font-bold" style={{ color: 'var(--color-on-surface)' }}>Resume preview</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {previewDownloadUrl ? (
                    <a href={previewDownloadUrl} target="_blank" rel="noopener noreferrer" className="wa-text-xs wa-font-bold" style={{ color: 'var(--wa-accent-text)', textDecoration: 'none' }}>
                      Download
                    </a>
                  ) : null}
                  <button type="button" onClick={closePreview} className="wa-text-xs wa-font-bold" style={{ color: 'var(--wa-accent-text)', background: 'none', border: 0, padding: 0 }}>
                    Hide
                  </button>
                </div>
              </div>

              {loadingPreview ? (
                <p role="status" style={{ padding: '1rem', margin: 0, color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem' }}>Loading preview…</p>
              ) : null}

              {previewError ? (
                <div style={{ padding: '1rem', textAlign: 'center' }}>
                  <p role="alert" style={{ margin: '0 0 0.75rem', color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem' }}>{previewError}</p>
                  <button type="button" onClick={() => void refreshResumeState(true)} className="wa-text-xs wa-font-bold" style={{ color: 'var(--wa-accent-text)', background: 'none', border: 0, padding: 0 }}>
                    Try again
                  </button>
                </div>
              ) : null}

              {!loadingPreview && !previewError && preview?.kind === 'pdf' ? (
                <iframe
                  src={preview.src}
                  title="Resume PDF preview"
                  onError={() => setPreviewError('The PDF preview is not available in this browser. Use Download instead.')}
                  style={{ width: '100%', height: '500px', border: 'none', display: 'block', background: '#525659' }}
                />
              ) : null}

              {!loadingPreview && !previewError && preview?.kind === 'docx' ? (
                <iframe
                  srcDoc={documentShell(preview.html)}
                  sandbox=""
                  title="Resume document preview"
                  style={{ width: '100%', height: '500px', border: 'none', display: 'block', background: '#fff' }}
                />
              ) : null}

              {!loadingPreview && !previewError && preview?.kind === 'txt' ? (
                <pre style={{ margin: 0, padding: '1rem', maxHeight: '500px', overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: 'var(--color-on-surface)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.8125rem', lineHeight: 1.55 }}>
                  {preview.text || 'This text resume is empty.'}
                </pre>
              ) : null}

              {!loadingPreview && !previewError && preview?.kind === 'download' ? (
                <div style={{ padding: '1rem', textAlign: 'center' }}>
                  <p style={{ margin: '0 0 0.75rem', color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem' }}>
                    {preview.extension ? `${preview.extension.toUpperCase()} preview is not supported.` : 'This resume cannot be previewed.'}
                  </p>
                  {preview.downloadUrl ? (
                    <a href={preview.downloadUrl} target="_blank" rel="noopener noreferrer" className="wa-text-xs wa-font-bold" style={{ color: 'var(--wa-accent-text)' }}>
                      Download resume
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </>
      ) : (
        <label
          aria-disabled={uploading}
          onClick={(event) => {
            if (uploadInFlightRef.current) event.preventDefault();
          }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '1.5rem 0', borderRadius: '0.75rem', border: '2px dashed var(--outline-variant)', background: 'var(--surface-container-lowest)', cursor: uploading ? 'wait' : 'pointer', opacity: uploading ? 0.6 : 1 }}
        >
          <span className="material-symbols-outlined" style={{ color: 'var(--wa-accent-text)', fontSize: '1.875rem' }} aria-hidden="true">
            {uploading ? 'hourglass_top' : 'upload_file'}
          </span>
          <p role="status" aria-live="polite" className="wa-text-sm wa-font-semibold" style={{ color: 'var(--color-on-surface)' }}>
            {uploading ? 'Uploading…' : 'Upload Resume'}
          </p>
          <p className="wa-text-[13px]" style={{ color: 'var(--color-on-surface-variant)' }}>{RESUME_UPLOAD_FORMAT_LABEL} · Max 5MB</p>
          <input type="file" accept={RESUME_UPLOAD_ACCEPT} onChange={onFileChange} disabled={uploading} style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', borderWidth: 0 }} />
        </label>
      )}

      {error ? (
        <p role="alert" style={{ color: 'var(--wa-accent-text)', fontSize: '0.8125rem', marginTop: '0.5rem' }}>{error}</p>
      ) : null}
      {warning ? (
        <p role="status" style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem', marginTop: '0.5rem' }}>{warning}</p>
      ) : null}
    </div>
  );
}
