'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  RESUME_UPLOAD_ACCEPT,
  RESUME_UPLOAD_FORMAT_LABEL,
  uploadMemberResumeFile,
} from '@/lib/portal/memberResumeUpload';

type Props = {
  completeness: number;
  initialHasOriginal: boolean;
  initialHasEnhanced: boolean;
};

const recommendedProfileCompleteness = 50;

/** Upload + AI generate for narrow viewports (desktop uses ResumeClient). */
export default function ResumeMobileResumeTools({
  completeness,
  initialHasOriginal,
  initialHasEnhanced,
}: Props) {
  const router = useRouter();
  const [resumeData, setResumeData] = useState<{
    originalUrl: string | null;
    enhancedUrl: string | null;
    enhancedText: string | null;
    hasOriginal: boolean;
    hasEnhanced: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadWarning, setUploadWarning] = useState('');
  const [generateError, setGenerateError] = useState('');
  const [dragover, setDragover] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadInFlightRef = useRef(false);

  useEffect(() => {
    fetch('/api/member/resume')
      .then((r) => r.json())
      .then((d) => {
        setResumeData({
          originalUrl: d.originalUrl ?? null,
          enhancedUrl: d.enhancedUrl ?? null,
          enhancedText: d.enhancedText ?? null,
          hasOriginal: d.hasOriginal ?? false,
          hasEnhanced: d.hasEnhanced ?? false,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleUpload = async (file: File) => {
    if (uploadInFlightRef.current) return;
    uploadInFlightRef.current = true;
    setUploading(true);
    setUploadError('');
    setUploadWarning('');
    try {
      const result = await uploadMemberResumeFile(file);
      if (!result.ok) {
        setUploadError(result.error);
        return;
      }
      setUploadWarning(result.warning ?? '');
      const refetch = await fetch('/api/member/resume');
      const d = await refetch.json();
      setResumeData({
        originalUrl: d.originalUrl ?? null,
        enhancedUrl: d.enhancedUrl ?? null,
        enhancedText: d.enhancedText ?? null,
        hasOriginal: d.hasOriginal ?? true,
        hasEnhanced: d.hasEnhanced ?? false,
      });
      router.refresh();
    } catch {
      setUploadError('Could not refresh resume status');
    } finally {
      uploadInFlightRef.current = false;
      setUploading(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateError('');
    try {
      const res = await fetch('/api/member/resume/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        const refetch = await fetch('/api/member/resume');
        const d = await refetch.json();
        setResumeData({
          originalUrl: d.originalUrl ?? null,
          enhancedUrl: d.enhancedUrl ?? null,
          enhancedText: d.enhancedText ?? data.resume ?? null,
          hasOriginal: d.hasOriginal ?? false,
          hasEnhanced: d.hasEnhanced ?? true,
        });
        router.refresh();
      } else {
        setGenerateError(data.error ?? 'Generation failed');
      }
    } catch {
      setGenerateError('Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragover(false);
    if (uploadInFlightRef.current) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (uploadInFlightRef.current) {
      e.target.value = '';
      return;
    }
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = '';
  };

  if (loading && !resumeData) {
    return (
      <div style={{ padding: '0 1rem', marginBottom: '1rem' }} role="status" aria-live="polite">
        <div className="skeleton skeleton-text" style={{ width: '30%', height: '1rem', marginBottom: '0.5rem' }} />
        <div className="skeleton skeleton-rounded" style={{ height: '4.5rem', marginBottom: '1rem' }} />
        <div className="skeleton skeleton-text" style={{ width: '35%', height: '1rem', marginBottom: '0.5rem' }} />
        <div className="skeleton skeleton-rounded" style={{ height: '2.5rem' }} />
        <span className="sr-only">Loading resume tools…</span>
      </div>
    );
  }

  const hasOriginal = resumeData?.hasOriginal ?? initialHasOriginal;
  const hasEnhanced = resumeData?.hasEnhanced ?? initialHasEnhanced;

  return (
    <div style={{ padding: '0 1rem', marginBottom: '1rem' }}>
      <section style={{ marginBottom: '1.25rem' }} aria-busy={uploading}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Upload</h2>
        <div
          className={`counselor-resume-upload ${dragover ? 'dragover' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (uploadInFlightRef.current) return;
            setDragover(true);
          }}
          onDragLeave={() => setDragover(false)}
          onDrop={handleDrop}
          onClick={() => {
            if (!uploadInFlightRef.current) fileInputRef.current?.click();
          }}
          role="button"
          tabIndex={uploading ? -1 : 0}
          aria-disabled={uploading}
          onKeyDown={(e) => {
            if (!uploadInFlightRef.current && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={RESUME_UPLOAD_ACCEPT}
            onChange={handleFileInput}
            disabled={uploading}
            style={{ display: 'none' }}
          />
          <p role="status" aria-live="polite" style={{ margin: 0, color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>
            {uploading ? 'Uploading…' : 'Tap to choose a file, or drag and drop'}
          </p>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
            {RESUME_UPLOAD_FORMAT_LABEL} — max 5MB
          </p>
        </div>
        {uploadError && <p role="alert" style={{ color: 'var(--color-error)', marginTop: '0.5rem', fontSize: '0.8125rem' }}>{uploadError}</p>}
        {uploadWarning && <p role="status" style={{ color: 'var(--color-on-surface-variant)', marginTop: '0.5rem', fontSize: '0.8125rem' }}>{uploadWarning}</p>}
        {hasOriginal && (
          <p style={{ marginTop: '0.75rem', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
            Original resume on file.
            {resumeData?.originalUrl && (
              <>
                {' '}
                <a href={resumeData.originalUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--wa-accent-text)', fontWeight: 600 }}>
                  Open file
                </a>
              </>
            )}
          </p>
        )}
      </section>

      <section id="resume-ai-generator" style={{ marginBottom: '0.5rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>AI Generator</h2>
        <div style={{ marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.875rem' }}>Profile completeness: {completeness}%</span>
          <div className="counselor-profile-bar">
            <div className="counselor-profile-bar-fill" style={{ width: `${completeness}%` }} />
          </div>
        </div>
        {completeness < recommendedProfileCompleteness && (
          <p style={{ marginBottom: '0.75rem', fontSize: '0.8125rem' }}>
            <Link href="/dashboard/profile" style={{ color: 'var(--wa-accent-text)', fontWeight: 600 }}>
              Complete My Profile
            </Link>{' '}
            for a better resume. You can still generate now.
          </p>
        )}
        <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={generating} aria-busy={generating} style={{ width: '100%' }}>
          <span aria-live="polite">
            {generating ? 'Generating…' : 'Generate Resume'}
          </span>
        </button>
        {generateError && <p role="alert" style={{ color: 'var(--color-error)', marginTop: '0.5rem', fontSize: '0.8125rem' }}>{generateError}</p>}
        {hasEnhanced && resumeData?.enhancedUrl && (
          <p style={{ marginTop: '0.75rem', fontSize: '0.8125rem' }}>
            <a href={resumeData.enhancedUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline" style={{ display: 'inline-block', width: '100%', textAlign: 'center' }}>
              Download AI-enhanced resume
            </a>
          </p>
        )}
      </section>
    </div>
  );
}
