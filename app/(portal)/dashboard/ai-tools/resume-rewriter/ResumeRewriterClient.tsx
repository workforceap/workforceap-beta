'use client';

import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';
import { FileText, Upload } from 'lucide-react';
import ResumeRewriterForm from '@/components/portal/tools/ResumeRewriterForm';
import { useResumeStudioDraft } from '@/components/portal/ResumeDraftContinuity';

type ResumeResponse = {
  hasOriginal?: boolean;
  resumePlainText?: string | null;
};

function ResumeCoachRedirectCard() {
  return (
    <p
      style={{
        margin: '0 0 12px',
        fontSize: 13,
        color: 'var(--wa-muted)',
        lineHeight: 1.45,
      }}
    >
      Voice flow:{' '}
      <Link
        href="/dashboard/ai-tools/resume-studio?view=coach"
        style={{ color: 'var(--wa-accent)', fontWeight: 600 }}
      >
        Resume & Experience Enhancer
      </Link>
    </p>
  );
}

function ResumeRewriterWithPrefill({ initialData }: { initialData?: { resume: string; jobTarget: string | null; framework: 'auto' } | null }) {
  const [resumeText, setResumeText] = useState(initialData?.resume ?? '');
  const [hasHydrated, setHasHydrated] = useState(false);
  const [hasStoredResume, setHasStoredResume] = useState(!!initialData?.resume);
  const [hasOriginalOnFile, setHasOriginalOnFile] = useState(!!initialData?.resume);
  const [showLoadedBanner, setShowLoadedBanner] = useState(!!initialData?.resume);
  const [showUploadBanner, setShowUploadBanner] = useState(false);
  const edited = useRef(false);
  const draft = useResumeStudioDraft();
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  const ready = draft?.ready ?? true;
  const hasRecoveredDraft = Boolean(draft?.restored?.rewrite);

  useEffect(() => {
    if (!ready) return;
    if (hasRecoveredDraft) {
      setShowLoadedBanner(false);
      setHasHydrated(true);
      return;
    }
    // If server already provided resume, skip client-side fetch
    if (initialData?.resume) {
      setHasHydrated(true);
      return;
    }
    let cancelled = false;

    fetch('/api/member/resume?includePlainText=1&originalOnly=1')
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load resume');
        return res.json() as Promise<ResumeResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        const plainText = data.resumePlainText?.trim() ?? '';
        const hasOriginal = Boolean(data.hasOriginal);
        setHasOriginalOnFile(hasOriginal);

        if (plainText) {
          if (!edited.current) {
            setResumeText((prev) => prev.trim() || plainText);
            // Target/options can be edited before the source request completes.
            // Keep the accepted source with those latest values so recovery does
            // not mistake a not-yet-prefilled field for an intentional blank.
            const saved = latestDraft.current?.saved?.rewrite;
            if (saved) latestDraft.current?.save('rewrite', { ...saved, resume: plainText });
          }
          setHasStoredResume(true);
          setShowLoadedBanner(!edited.current);
          setShowUploadBanner(false);
        } else {
          setHasStoredResume(false);
          setShowLoadedBanner(false);
          setShowUploadBanner(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setShowLoadedBanner(false);
          setShowUploadBanner(false);
        }
      })
      .finally(() => {
        if (!cancelled) setHasHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [ready, hasRecoveredDraft, initialData?.resume]);

  return (
    <ResumeRewriterForm
      resumeControlled={resumeText}
      initialJobTarget={initialData?.jobTarget ?? ''}
      onResumeChange={(val) => {
        edited.current = true;
        setResumeText(val);
        if (showLoadedBanner) setShowLoadedBanner(false);
      }}
      resumeBanner={hasHydrated ? (
        <>
          {showLoadedBanner && hasStoredResume ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                padding: '10px 12px',
                borderRadius: 'var(--wa-radius-sm)',
                background: 'var(--wa-success-soft)',
                color: 'var(--wa-success)',
                border: '1px solid var(--wa-border)',
                marginBottom: 8,
                fontSize: 13,
                lineHeight: 1.45,
              }}
            >
              <FileText size={16} aria-hidden="true" />
              <span style={{ fontWeight: 600 }}>
                Resume on file loaded.{' '}
                <button
                  type="button"
                  onClick={() => {
                    edited.current = true;
                    setResumeText('');
                    setShowLoadedBanner(false);
                    draft?.save('rewrite', {
                      jobTarget: initialData?.jobTarget ?? '', targetSalary: '', targetLocation: '',
                      language: 'en', tone: 'professional', atsOptimize: true,
                      ...draft.saved?.rewrite, resume: '',
                    });
                  }}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'inherit',
                    fontWeight: 700,
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    padding: 0,
                    minHeight: 44,
                  }}
                >
                  Replace
                </button>
              </span>
            </div>
          ) : null}

          {showUploadBanner ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                padding: '10px 12px',
                borderRadius: 'var(--wa-radius-sm)',
                background: 'var(--wa-surface-2)',
                color: 'var(--wa-muted)',
                border: '1px solid var(--wa-border)',
                marginBottom: 8,
                fontSize: 13,
                lineHeight: 1.45,
              }}
            >
              <Upload size={16} aria-hidden="true" />
              <span>
                {hasOriginalOnFile ? 'Could not read the original resume. Paste it into the text box below or ' : 'No resume on file. Paste one into the text box below or '}
                <Link href="/dashboard/resume" style={{ color: 'var(--wa-accent)', fontWeight: 600 }}>
                  upload a readable resume
                </Link>
              </span>
            </div>
          ) : null}
        </>
      ) : null}
    />
  );
}

export default function ResumeRewriterClient({ initialData }: { initialData?: { resume: string; jobTarget: string | null; framework: 'auto' } | null }) {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return (
    <div>
      {hydrated ? <ResumeCoachRedirectCard /> : null}
      <ResumeRewriterWithPrefill initialData={initialData} />
    </div>
  );
}
