'use client';

import { useState } from 'react';
import { FileText, ChevronDown, ExternalLink, FolderOpen } from 'lucide-react';
import PortalEmptyState from '@/components/portal/PortalEmptyState';

type Resource = {
  title: string;
  description: string;
  url: string;
};

export default function ResourcesClient({ resources }: { resources: Resource[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  if (resources.length === 0) {
    return (
      <PortalEmptyState
        icon={<FolderOpen size={40} aria-hidden="true" style={{ color: 'var(--wa-accent)' }} />}
        title="No resources yet"
        description="Resources for your program will appear here once you're enrolled."
        primaryAction={{ href: '/dashboard/program', label: 'Choose a program' }}
      />
    );
  }

  return (
    <div className="wa-space-y-2">
      {resources.map((r, i) => {
        const isOpen = openIdx === i;
        return (
          <div key={r.url} className="wa-kit-card wa-kit-card--sm" style={{ padding: 0, overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setOpenIdx(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="wa-kit-focus hover:wa-bg-[var(--wa-bg)] wa-transition-[background-color] wa-duration-150"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.875rem',
                padding: '1rem 1.25rem',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: 'var(--wa-radius-sm)',
                  background: 'var(--wa-accent-soft)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <FileText size={16} style={{ color: 'var(--wa-accent)' }} aria-hidden="true" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: 'var(--wa-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.title}
                </p>
                <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--wa-muted)' }}>
                  {r.description}
                </p>
              </div>
              <ChevronDown
                size={18}
                aria-hidden="true"
                style={{
                  color: 'var(--wa-muted)',
                  flexShrink: 0,
                  transition: 'transform 0.15s',
                  transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
              />
            </button>

            {isOpen && (
              <div style={{ borderTop: '1px solid var(--wa-border)' }}>
                {/* Try to embed — many sites block iframes, so show description + prominent CTA */}
                <div style={{ padding: '1.25rem' }}>
                  <p style={{ fontSize: '0.875rem', color: 'var(--wa-muted)', lineHeight: 1.6, margin: '0 0 1rem' }}>
                    {r.description}
                  </p>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.375rem',
                        minHeight: 40,
                        padding: '0.5rem 1.125rem',
                        background: 'var(--wa-accent)',
                        color: 'var(--wa-on-accent-control)',
                        borderRadius: 999,
                        fontSize: '0.875rem',
                        fontWeight: 700,
                        textDecoration: 'none',
                      }}
                    >
                      Open resource
                      <ExternalLink size={14} aria-hidden="true" />
                    </a>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--wa-muted)' }}>
                      Opens in a new tab
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
