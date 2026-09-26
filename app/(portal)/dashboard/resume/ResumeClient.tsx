"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import dynamic from 'next/dynamic';
import {
  UploadCloud,
  Sparkles,
  RefreshCw,
  FileEdit,
  Target,
  LineChart,
  FileWarning,
  ArrowUpRight,
  FileText as FileTextIcon,
} from 'lucide-react';

const MarkdownPreview = dynamic(() => import('@/components/MarkdownPreview'), { ssr: false });
import {
  RESUME_UPLOAD_ACCEPT,
  RESUME_UPLOAD_FORMAT_LABEL,
  uploadMemberResumeFile,
} from "@/lib/portal/memberResumeUpload";
import { trackFunnelEvent } from "@/lib/analytics/events";
import { CardHead, ProgressBar, StatusTag } from '@/components/portal/kit';

type WitData = {
  name: string;
  email: string;
  phone: string;
  recentEmployer: string;
  targetJob: string;
  skills: string;
};

type ResumeClientProps = {
  completeness: number;
  witData: WitData;
  hasOriginal: boolean;
  hasEnhanced: boolean;
  layout?: "side-by-side";
};

export default function ResumeClient({
  completeness,
  witData,
  hasOriginal: initialHasOriginal,
  hasEnhanced: initialHasEnhanced,
  layout,
}: ResumeClientProps) {
  const recommendedProfileCompleteness = 50;
  const [resumeData, setResumeData] = useState<{
    originalUrl: string | null;
    enhancedUrl: string | null;
    enhancedText: string | null;
    hasOriginal: boolean;
    hasEnhanced: boolean;
    enhancedUnavailable: boolean;
    originalExt: string | null;
    enhancedExt: string | null;
    previewOriginalPath: string | null;
    previewEnhancedPath: string | null;
  } | null>(null);
  const [originalDocHtml, setOriginalDocHtml] = useState<string | null>(null);
  const [enhancedDocHtml, setEnhancedDocHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadWarning, setUploadWarning] = useState("");
  const [generateError, setGenerateError] = useState("");
  const [dragover, setDragover] = useState(false);
  const [originalPdfFailed, setOriginalPdfFailed] = useState(false);
  const [enhancedPdfFailed, setEnhancedPdfFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadInFlightRef = useRef(false);

  useEffect(() => {
    setOriginalPdfFailed(false);
  }, [resumeData?.previewOriginalPath]);

  useEffect(() => {
    setEnhancedPdfFailed(false);
  }, [resumeData?.previewEnhancedPath]);

  useEffect(() => {
    trackFunnelEvent("member_signup", "resume_page_viewed");
  }, []);

  useEffect(() => {
    fetch("/api/member/resume")
      .then((r) => r.json())
      .then((d) => {
        setResumeData({
          originalUrl: d.originalUrl ?? null,
          enhancedUrl: d.enhancedUrl ?? null,
          enhancedText: d.enhancedText ?? null,
          hasOriginal: d.hasOriginal ?? false,
          hasEnhanced: d.hasEnhanced ?? false,
          enhancedUnavailable: d.enhancedUnavailable ?? false,
          originalExt: d.originalExt ?? null,
          enhancedExt: d.enhancedExt ?? null,
          previewOriginalPath: d.previewOriginalPath ?? null,
          previewEnhancedPath: d.previewEnhancedPath ?? null,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleUpload = async (file: File) => {
    if (uploadInFlightRef.current) return;
    uploadInFlightRef.current = true;
    setUploading(true);
    setUploadError("");
    setUploadWarning("");
    try {
      const result = await uploadMemberResumeFile(file);
      if (!result.ok) {
        setUploadError(result.error);
        return;
      }
      setUploadWarning(result.warning ?? "");
      trackFunnelEvent("member_signup", "resume_uploaded");
      const refetch = await fetch("/api/member/resume");
      const d = await refetch.json();
      setResumeData({
        originalUrl: d.originalUrl ?? null,
        enhancedUrl: d.enhancedUrl ?? null,
        enhancedText: d.enhancedText ?? null,
        hasOriginal: d.hasOriginal ?? true,
        hasEnhanced: d.hasEnhanced ?? false,
        enhancedUnavailable: d.enhancedUnavailable ?? false,
        originalExt: d.originalExt ?? null,
        enhancedExt: d.enhancedExt ?? null,
        previewOriginalPath: d.previewOriginalPath ?? null,
        previewEnhancedPath: d.previewEnhancedPath ?? null,
      });
    } catch {
      setUploadError("Could not refresh resume status");
    } finally {
      uploadInFlightRef.current = false;
      setUploading(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateError("");
    let saved = false;
    try {
      const res = await fetch("/api/member/resume/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        saved = true;
        const refetch = await fetch("/api/member/resume");
        if (!refetch.ok) throw new Error('Could not verify the saved resume');
        const d = await refetch.json();
        const textFromApi = d.enhancedUnavailable
          ? null
          : typeof d.enhancedText === "string" && d.enhancedText.trim()
            ? d.enhancedText
            : null;
        setResumeData({
          originalUrl: d.originalUrl ?? null,
          enhancedUrl: d.enhancedUrl ?? null,
          enhancedText: textFromApi,
          hasOriginal: d.hasOriginal ?? false,
          hasEnhanced: Boolean(d.hasEnhanced && !d.enhancedUnavailable),
          enhancedUnavailable: d.enhancedUnavailable ?? false,
          originalExt: d.originalExt ?? null,
          enhancedExt: d.enhancedExt ?? null,
          previewOriginalPath: d.previewOriginalPath ?? null,
          previewEnhancedPath: d.previewEnhancedPath ?? null,
        });
      } else {
        setGenerateError(data.error ?? "Generation failed");
      }
    } catch {
      setGenerateError(saved
        ? 'The resume was saved, but its preview could not be verified. Reload to check it.'
        : 'Generation failed');
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
      e.target.value = "";
      return;
    }
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = "";
  };

  useEffect(() => {
    const ext = resumeData?.originalExt;
    if (!ext || !["doc", "docx"].includes(ext)) {
      setOriginalDocHtml(null);
      return;
    }
    let cancelled = false;
    setOriginalDocHtml(null);
    const revision = resumeData.previewOriginalPath ?? '';
    fetch(`/api/member/resume/docx-html?variant=original&v=${encodeURIComponent(revision)}`, { method: "POST", cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("Could not prepare original resume preview");
        return r.json();
      })
      .then((d) => {
        if (!cancelled && d.html) setOriginalDocHtml(d.html as string);
      })
      .catch(() => {
        if (!cancelled) setOriginalDocHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [resumeData?.originalExt, resumeData?.hasOriginal, resumeData?.previewOriginalPath]);

  useEffect(() => {
    const ext = resumeData?.enhancedExt;
    if (!ext || !["doc", "docx"].includes(ext)) {
      setEnhancedDocHtml(null);
      return;
    }
    let cancelled = false;
    setEnhancedDocHtml(null);
    const revision = resumeData.previewEnhancedPath ?? '';
    fetch(`/api/member/resume/docx-html?variant=enhanced&v=${encodeURIComponent(revision)}`, { method: "POST", cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("Could not prepare enhanced resume preview");
        return r.json();
      })
      .then((d) => {
        if (!cancelled && d.html) setEnhancedDocHtml(d.html as string);
      })
      .catch(() => {
        if (!cancelled) setEnhancedDocHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [resumeData?.enhancedExt, resumeData?.hasEnhanced, resumeData?.previewEnhancedPath]);

  if (loading && !resumeData) {
    const controlsSkeleton = (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div className="skeleton skeleton-text" style={{ width: "40%", height: "1rem" }} />
        <div className="skeleton skeleton-rounded" style={{ height: "6rem" }} />
        <div className="skeleton skeleton-text" style={{ width: "55%", height: "1rem", marginTop: "0.5rem" }} />
        <div className="skeleton skeleton-rounded" style={{ height: "2.5rem", width: "10rem" }} />
      </div>
    );
    const previewSkeleton = (
      <div className="skeleton skeleton-rounded" style={{ minHeight: "420px" }} />
    );
    return (
      <div role="status" aria-live="polite" aria-label="Loading your resume tools">
        {layout === "side-by-side" ? (
          <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "2rem", alignItems: "start" }}>
            <div>{controlsSkeleton}</div>
            <div>{previewSkeleton}</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {controlsSkeleton}
            {previewSkeleton}
          </div>
        )}
        <span className="sr-only">Loading your resume tools…</span>
      </div>
    );
  }

  const hasOriginal = resumeData?.hasOriginal ?? initialHasOriginal;
  const hasEnhanced = resumeData?.hasEnhanced ?? initialHasEnhanced;

  // ── Section elements ──────────────────────────────────────────────────────

  const uploadSection = (
    <section className="wa-kit-card" style={{ marginBottom: "1.25rem" }} aria-busy={uploading}>
      <CardHead title="Upload resume" />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (uploadInFlightRef.current) return;
          setDragover(true);
        }}
        onDragLeave={() => setDragover(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragover ? "var(--wa-accent)" : "var(--wa-border)"}`,
          borderRadius: "var(--wa-radius-sm)",
          background: dragover ? "color-mix(in srgb, var(--wa-accent) 6%, transparent)" : "var(--wa-surface-2)",
          padding: "1.5rem 1rem",
          transition: "border-color 150ms ease, background-color 150ms ease",
        }}
      >
        <input
          ref={fileInputRef}
          id="resume-upload-input"
          type="file"
          accept={RESUME_UPLOAD_ACCEPT}
          onChange={handleFileInput}
          disabled={uploading}
          className="sr-only"
        />
        <label
          htmlFor="resume-upload-input"
          className="wa-kit-focus"
          aria-disabled={uploading}
          style={{
            cursor: uploading ? "not-allowed" : "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: "0.5rem",
          }}
        >
          <UploadCloud size={22} color="var(--wa-accent)" aria-hidden="true" />
          <p role="status" aria-live="polite" style={{ margin: 0, color: "var(--wa-text)", fontWeight: 600, fontSize: "0.9rem" }}>
            {uploading
              ? "Uploading…"
              : "Drag and drop your resume here, or click to choose a file"}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: "0.8125rem",
              color: "var(--wa-muted)",
            }}
          >
            {RESUME_UPLOAD_FORMAT_LABEL} — max 5MB
          </p>
        </label>
      </div>
      {uploadError && (
        <p role="alert" style={{ color: "var(--wa-danger)", marginTop: "0.75rem", fontSize: "0.85rem" }}>{uploadError}</p>
      )}
      {uploadWarning && (
        <p role="status" style={{ color: "var(--wa-warning-text, var(--wa-muted))", marginTop: "0.75rem", fontSize: "0.85rem" }}>
          {uploadWarning}
        </p>
      )}
    </section>
  );

  const aiGeneratorSection = (
    <section id="resume-ai-generator" className="wa-kit-card" style={{ marginBottom: "1.25rem" }}>
      <CardHead title="Build from profile" />
      <div style={{ marginBottom: "1rem" }}>
        <div className="wa-flex wa-items-center wa-justify-between" style={{ marginBottom: 6, fontSize: "0.8125rem", color: "var(--wa-muted)" }}>
          <span>Profile completeness</span>
          <span style={{ fontWeight: 700, color: "var(--wa-text)" }}>{completeness}%</span>
        </div>
        <ProgressBar pct={completeness} tone={completeness >= recommendedProfileCompleteness ? "ok" : "warn"} aria-label="Profile completeness" />
      </div>
      {completeness < recommendedProfileCompleteness && (
        <p style={{ marginBottom: "0.875rem", fontSize: "0.875rem", color: "var(--wa-muted)" }}>
          <Link
            href="/dashboard/profile"
            style={{ color: "var(--wa-accent)", fontWeight: 700, textDecoration: "none" }}
          >
            Complete My Profile
          </Link>{" "}
          with concrete work history, skills, or education before building from it. You can also upload a readable resume.
        </p>
      )}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={generating}
        className="wa-kit-focus enabled:hover:wa-opacity-90 enabled:active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          minHeight: 40,
          padding: "8px 18px",
          background: "var(--wa-accent)",
          color: "var(--wa-on-accent-control)",
          fontWeight: 700,
          fontSize: 13,
          borderRadius: 999,
          border: "none",
          cursor: generating ? "not-allowed" : "pointer",
          opacity: generating ? 0.7 : 1,
        }}
      >
        {generating ? <RefreshCw size={14} className="wa-animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
        {generating
          ? "Building…"
          : hasEnhanced
            ? "Refresh from Profile"
            : "Build Resume"}
      </button>
      {generateError && (
        <p role="alert" style={{ color: "var(--wa-danger)", marginTop: "0.75rem", fontSize: "0.85rem" }}>{generateError}</p>
      )}
      {resumeData?.enhancedUnavailable && (
        <p role="status" style={{ color: "var(--wa-warning-text, var(--wa-muted))", marginTop: "0.75rem", fontSize: "0.85rem" }}>
          An older AI-built resume could not be read safely, so it is hidden. {hasOriginal ? 'Your original resume is still available. ' : ''}
          Upload a PDF with selectable text, DOCX, or TXT file, or add concrete work history and skills to your{' '}
          <Link href="/dashboard/profile" style={{ color: "var(--wa-accent)", fontWeight: 700 }}>profile</Link>, then build again.
        </p>
      )}
    </section>
  );

  const resumePreviewSection =
    hasOriginal || hasEnhanced ? (
      <section className="wa-kit-card" style={{ marginBottom: "1.25rem" }}>
        <CardHead title="Resume preview" />

        {/* Original resume */}
        {hasOriginal && (
          <div
            style={{
              marginBottom: "1.25rem",
              border: "1px solid var(--wa-border)",
              borderRadius: "var(--wa-radius-sm)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.6rem 0.9rem",
                background: "var(--wa-surface-2)",
                borderBottom: "1px solid var(--wa-border)",
                fontSize: "0.85rem",
              }}
            >
              <span className="wa-flex wa-items-center wa-gap-2" style={{ fontWeight: 600 }}>
                Original Resume
                <StatusTag tone={resumeData?.originalUrl ? "ok" : "muted"}>
                  {resumeData?.originalUrl ? "Available" : "On file"}
                </StatusTag>
              </span>
              {resumeData?.originalUrl ? (
                <a
                  href={resumeData.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "var(--wa-accent)",
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  Download ↗
                </a>
              ) : loading ? (
                <span
                  style={{
                    color: "var(--wa-muted)",
                    fontSize: "0.8125rem",
                  }}
                >
                  Loading…
                </span>
              ) : (
                <span
                  style={{
                    color: "var(--wa-muted)",
                    fontSize: "0.8125rem",
                  }}
                >
                  File unavailable —{" "}
                  <button
                    type="button"
                    onClick={() => {
                      if (!uploadInFlightRef.current) fileInputRef.current?.click();
                    }}
                    disabled={uploading}
                    aria-busy={uploading}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--wa-accent)",
                      fontWeight: 600,
                      cursor: uploading ? "not-allowed" : "pointer",
                      opacity: uploading ? 0.6 : 1,
                      padding: 0,
                      fontSize: "inherit",
                    }}
                  >
                    re-upload
                  </button>
                </span>
              )}
            </div>
            {resumeData?.previewOriginalPath &&
              resumeData.originalExt === "pdf" && (
                originalPdfFailed ? (
                  <div style={{ padding: '1.25rem', textAlign: 'center', background: 'var(--wa-surface-2)' }}>
                    <FileWarning size={30} color="var(--wa-muted)" aria-hidden="true" style={{ display: 'block', margin: '0 auto 0.5rem' }} />
                    <p style={{ fontSize: '0.85rem', color: 'var(--wa-muted)', margin: '0 0 0.75rem' }}>PDF preview isn't available in this browser.</p>
                    {resumeData.originalUrl && (
                      <a href={resumeData.originalUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline" style={{ fontSize: '0.875rem' }}>Download to view ↗</a>
                    )}
                  </div>
                ) : (
                  <iframe
                    title="Original resume preview"
                    src={resumeData.previewOriginalPath}
                    onError={() => setOriginalPdfFailed(true)}
                    onLoad={(e) => {
                      try {
                        const doc = (e.target as HTMLIFrameElement).contentDocument;
                        if (!doc || doc.title === '404' || doc.body?.innerHTML === '') setOriginalPdfFailed(true);
                      } catch { /* cross-origin — assume ok */ }
                    }}
                    style={{
                      width: "100%",
                      minHeight: "480px",
                      border: "none",
                      display: "block",
                      background: "#525659",
                    }}
                  />
                )
              )}
            {["doc", "docx"].includes(resumeData?.originalExt ?? "") && (
              <div style={{ background: "var(--wa-surface-2)" }}>
                {originalDocHtml ? (
                  <iframe
                    title="Original resume preview"
                    srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"/><style>body{font-family:system-ui,sans-serif;padding:1rem;margin:0;line-height:1.45;color:#111;}.mammoth-doc img{max-width:100%;height:auto;}</style></head><body>${originalDocHtml}</body></html>`}
                    sandbox=""
                    style={{
                      width: "100%",
                      minHeight: "480px",
                      border: "none",
                      display: "block",
                    }}
                  />
                ) : (
                  <p
                    style={{
                      padding: "1rem",
                      margin: 0,
                      fontSize: "0.85rem",
                      color: "var(--wa-muted)",
                    }}
                  >
                    Loading preview…
                  </p>
                )}
              </div>
            )}
            {resumeData?.originalExt &&
              !["pdf", "doc", "docx"].includes(resumeData.originalExt) &&
              resumeData?.originalUrl && (
                <div
                  style={{
                    padding: "1rem",
                    textAlign: "center",
                    background: "var(--wa-surface-2)",
                  }}
                >
                  <a
                    href={resumeData.originalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      fontSize: "0.875rem",
                    }}
                  >
                    Open resume
                  </a>
                </div>
              )}
          </div>
        )}

        {/* Enhanced resume */}
        {hasEnhanced && (
          <div
            style={{
              marginBottom: "1.25rem",
              border: "1px solid var(--wa-border)",
              borderRadius: "var(--wa-radius-sm)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.6rem 0.9rem",
                background: "var(--wa-surface-2)",
                borderBottom: "1px solid var(--wa-border)",
                fontSize: "0.85rem",
              }}
            >
              <span className="wa-flex wa-items-center wa-gap-2" style={{ fontWeight: 600 }}>
                Updated Resume
                <StatusTag tone="info">AI-built</StatusTag>
              </span>
              {resumeData?.enhancedUrl ? (
                <a
                  href={resumeData.enhancedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "var(--wa-accent)",
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  Download ↗
                </a>
              ) : null}
            </div>
            {resumeData?.previewEnhancedPath &&
              resumeData.enhancedExt === "pdf" && (
                enhancedPdfFailed ? (
                  <div style={{ padding: '1.25rem', textAlign: 'center', background: 'var(--wa-surface-2)' }}>
                    <FileWarning size={30} color="var(--wa-muted)" aria-hidden="true" style={{ display: 'block', margin: '0 auto 0.5rem' }} />
                    <p style={{ fontSize: '0.85rem', color: 'var(--wa-muted)', margin: '0 0 0.75rem' }}>PDF preview isn't available in this browser.</p>
                    {resumeData.enhancedUrl && (
                      <a href={resumeData.enhancedUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline" style={{ fontSize: '0.875rem' }}>Download to view ↗</a>
                    )}
                  </div>
                ) : (
                  <iframe
                    title="Enhanced resume preview"
                    src={resumeData.previewEnhancedPath}
                    onError={() => setEnhancedPdfFailed(true)}
                    onLoad={(e) => {
                      try {
                        const doc = (e.target as HTMLIFrameElement).contentDocument;
                        if (!doc || doc.title === '404' || doc.body?.innerHTML === '') setEnhancedPdfFailed(true);
                      } catch { /* cross-origin — assume ok */ }
                    }}
                    style={{
                      width: "100%",
                      minHeight: "480px",
                      border: "none",
                      display: "block",
                      background: "#525659",
                    }}
                  />
                )
              )}
            {["doc", "docx"].includes(resumeData?.enhancedExt ?? "") && (
              <div style={{ background: "var(--wa-surface-2)" }}>
                {enhancedDocHtml ? (
                  <iframe
                    title="Enhanced resume preview"
                    srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"/><style>body{font-family:system-ui,sans-serif;padding:1rem;margin:0;line-height:1.45;color:#111;}.mammoth-doc img{max-width:100%;height:auto;}</style></head><body>${enhancedDocHtml}</body></html>`}
                    sandbox=""
                    style={{
                      width: "100%",
                      minHeight: "480px",
                      border: "none",
                      display: "block",
                    }}
                  />
                ) : (
                  <p
                    style={{
                      padding: "1rem",
                      margin: 0,
                      fontSize: "0.85rem",
                      color: "var(--wa-muted)",
                    }}
                  >
                    Loading preview…
                  </p>
                )}
              </div>
            )}
            {resumeData?.enhancedUrl &&
              resumeData.enhancedExt &&
              !["pdf", "doc", "docx"].includes(resumeData.enhancedExt) &&
              !resumeData.enhancedText && (
                <div
                  style={{
                    padding: "1rem",
                    textAlign: "center",
                    background: "var(--wa-surface-2)",
                  }}
                >
                  <a
                    href={resumeData.enhancedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      fontSize: "0.875rem",
                    }}
                  >
                    Open enhanced resume
                  </a>
                </div>
              )}
            {resumeData?.enhancedText &&
              !["pdf", "doc", "docx"].includes(
                resumeData?.enhancedExt ?? "",
              ) && (
                <article
                  key={resumeData.enhancedText.slice(0, 120)}
                  className="markdown-body"
                  style={{
                    padding: "1.25rem",
                    background: "var(--wa-bg)",
                    fontSize: "0.9375rem",
                    lineHeight: 1.65,
                    maxHeight: "min(70vh, 720px)",
                    overflowY: "auto",
                    color: "var(--wa-text)",
                  }}
                >
                <MarkdownPreview>{resumeData.enhancedText}</MarkdownPreview>
                </article>
              )}
          </div>
        )}
      </section>
    ) : null;

  const RESUME_TOOLS: Array<{ icon: typeof FileEdit; title: string; desc: string; href: string }> = [
    {
      icon: FileEdit,
      title: "Resume Rewriter",
      desc: "Rewrite and polish your resume for a specific role.",
      href: "/dashboard/ai-tools/resume-studio?view=rewrite",
    },
    {
      icon: Target,
      title: "Job Match Scorer",
      desc: "See how well your resume matches a job posting.",
      href: "/dashboard/ai-tools/job-match-scorer",
    },
    {
      icon: LineChart,
      title: "Resume Analysis",
      desc: "See what is working well and what to strengthen before you apply.",
      href: "/dashboard/ai-tools/resume-studio?view=score",
    },
  ];

  const aiToolsSection = (
    <section className="wa-kit-card" style={{ marginBottom: "1.25rem" }}>
      <CardHead title="Resume tools" />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: "0.75rem",
        }}
      >
        {RESUME_TOOLS.map(({ icon: Icon, title, desc, href }) => (
          // Whole card is the interactive target (not just the "Open" text)
          // — matches "cards only where the card IS the interaction".
          <Link
            key={href}
            href={href}
            className="wa-kit-focus wa-kit-card--hover wa-transition-[border-color,box-shadow,transform] wa-duration-150 hover:wa-border-[var(--wa-accent)] active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 motion-reduce:wa-transition-none"
            style={{
              background: "var(--wa-surface-2)",
              borderRadius: "var(--wa-radius-sm)",
              padding: "1rem 1.1rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.4rem",
              border: "1px solid var(--wa-border)",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                width: 34,
                height: 34,
                borderRadius: "var(--wa-radius-sm)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "color-mix(in srgb, var(--wa-accent) 12%, transparent)",
                color: "var(--wa-accent)",
              }}
            >
              <Icon size={17} />
            </div>
            <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--wa-text)" }}>
              {title}
            </span>
            <span
              style={{
                fontSize: "0.82rem",
                color: "var(--wa-muted)",
                flexGrow: 1,
              }}
            >
              {desc}
            </span>
            <span
              aria-hidden="true"
              style={{
                color: "var(--wa-accent)",
                fontWeight: 700,
                fontSize: "0.8125rem",
                marginTop: "0.25rem",
              }}
            >
              Open →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );

  const witDataEmpty = !witData.name && !witData.email && !witData.phone && !witData.recentEmployer && !witData.targetJob && !witData.skills;
  const witDataComplete = !!(witData.name && witData.email && witData.phone && witData.recentEmployer && witData.targetJob && witData.skills);
  const witContact = [witData.name || 'Add your name', witData.email || 'Add your email', witData.phone || 'Add your phone'].join(', ');

  const witGuideSection = (
    <section className="wa-kit-card">
      <CardHead title="WorkInTexas guide" />
      <div className="wa-flex wa-items-center wa-gap-2" style={{ marginBottom: 12, marginTop: -6 }}>
        <StatusTag tone={witDataEmpty ? "muted" : "info"}>{witDataEmpty ? "Fill in manually" : witDataComplete ? "Ready to copy" : "Partially filled"}</StatusTag>
      </div>
      <p
        style={{
          marginBottom: "1rem",
          color: "var(--wa-muted)",
          fontSize: "0.875rem",
          lineHeight: 1.55,
        }}
      >
        {witDataComplete
          ? "Use these details when creating your WorkInTexas profile."
          : "Use the available details below. Fill in the prompts with your own work history, skills, and target job before copying them."}
      </p>
      <ol style={{ margin: "0 0 1rem", paddingLeft: "1.15rem", color: "var(--wa-text)", fontSize: "0.875rem", lineHeight: 1.85 }}>
        <li>
          <strong>Create account</strong> at workintexas.com
        </li>
        <li>
          <strong>Contact info</strong> → {witContact}
        </li>
        <li>
          <strong>Work history</strong> → {witData.recentEmployer || (hasOriginal ? "Use the jobs and dates on your original resume" : "Add your jobs and dates")}
        </li>
        <li>
          <strong>Target job</strong> → {witData.targetJob || "Choose the job title you want to pursue"}
        </li>
        <li>
          <strong>Upload resume</strong> → {resumeData?.originalUrl ? "Download your original resume from above" : hasOriginal ? "Original file on record; download currently unavailable" : "Upload your original resume above first"}
        </li>
        <li>
          <strong>Skills</strong> → {witData.skills || (hasOriginal ? "Use the skills on your original resume" : "List skills you can demonstrate")}
        </li>
      </ol>
      <a
        href="https://www.workintexas.com"
        target="_blank"
        rel="noopener noreferrer"
        className="wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          minHeight: 40,
          padding: "8px 16px",
          background: "var(--wa-accent)",
          color: "var(--wa-on-accent-control)",
          fontWeight: 700,
          fontSize: 13,
          borderRadius: 999,
          textDecoration: "none",
        }}
      >
        Open WorkInTexas
        <ArrowUpRight size={14} aria-hidden />
      </a>
    </section>
  );

  // ── Layouts ───────────────────────────────────────────────────────────────

  if (layout === "side-by-side") {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "320px 1fr",
          gap: "2rem",
          alignItems: "start",
        }}
      >
        {/* Left: controls */}
        <div>
          {uploadSection}
          {aiGeneratorSection}
          {aiToolsSection}
          {witGuideSection}
        </div>
        {/* Right: preview */}
        <div>
          {resumePreviewSection ?? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "420px",
                background: "var(--wa-surface-2)",
                borderRadius: "0.875rem",
                border: "2px dashed var(--wa-border)",
                color: "var(--wa-muted)",
                textAlign: "center",
                padding: "2.5rem",
              }}
            >
              <FileTextIcon size={40} aria-hidden="true" style={{ marginBottom: "0.75rem", opacity: 0.35 }} />
              <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.55 }}>
                Upload a resume or use <strong>Build from Profile</strong> to
                create one. Your preview will appear here.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {uploadSection}
      {aiGeneratorSection}
      {resumePreviewSection}
      {aiToolsSection}
      {witGuideSection}
    </div>
  );
}
