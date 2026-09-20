'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { MemberResource } from '@/lib/content/memberResources';
import { trackResourceOpen } from '@/lib/analytics/events';

type ResourceCardProps = {
  resource: MemberResource;
  progress?: { completedAt: string | Date | null; savedAt: string | Date | null } | null;
};

export default function ResourceCard({ resource, progress }: ResourceCardProps) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  const isExternal = resource.url.startsWith('http');
  const href = resource.url;
  const isCompleted = !!progress?.completedAt;
  const isSaved = !!progress?.savedAt;
  const hasFile = !!resource.file;

  const handleClick = () => {
    trackResourceOpen(resource.id, resource.title);
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (downloading || !hasFile) return;
    setDownloading(true);
    setDownloadError(false);
    try {
      const res = await fetch(`/api/member/resources/${resource.id}/download`, { credentials: 'include' });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${resource.title.replace(/[^a-z0-9-]/gi, '-')}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      fetch(`/api/member/resources/${resource.id}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'download' }),
        credentials: 'include',
      }).catch(() => {});
    } catch {
      // Previously failed silently — the button just reset with no sign
      // anything went wrong.
      setDownloadError(true);
    } finally {
      setDownloading(false);
    }
  };

  const content = (
    <>
      <div className="resource-card-header">
        <span className="resource-card-category">{resource.category}</span>
        <span className="resource-card-type">{resource.type}</span>
        {(isCompleted || isSaved) && (
          <span className="resource-card-badges">
            {isCompleted && <span className="wa-kit-tag wa-kit-tag--ok">Completed</span>}
            {isSaved && <span className="wa-kit-tag wa-kit-tag--warn">Saved</span>}
          </span>
        )}
      </div>
      <h3 className="resource-card-title">{resource.title}</h3>
      <p className="resource-card-summary">{resource.summary}</p>
      {resource.tags.length > 0 ? (
        <div className="resource-card-tags">
          {resource.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="resource-card-tag">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      <div className="resource-card-footer">
        {downloadError && (
          <span role="alert" style={{ fontSize: '0.75rem', color: 'var(--color-error, #dc2626)' }}>
            Couldn&rsquo;t download — try again
          </span>
        )}
        {hasFile && (
          <button
            type="button"
            className="resource-card-download"
            onClick={handleDownload}
            disabled={downloading}
            aria-busy={downloading}
          >
            <span aria-live="polite">
              {downloading ? 'Downloading…' : '↓ Download'}
            </span>
            <span className="sr-only"> {resource.title}</span>
          </button>
        )}
        <span className="resource-card-arrow" aria-hidden>
          →
        </span>
      </div>
    </>
  );

  if (isExternal) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="resource-card"
        onClick={handleClick}
        aria-label={`Open ${resource.title}: ${resource.summary}`}
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      href={href}
      className="resource-card"
      onClick={handleClick}
      aria-label={`Open ${resource.title}: ${resource.summary}`}
    >
      {content}
    </Link>
  );
}
