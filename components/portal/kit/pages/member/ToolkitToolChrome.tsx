import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { DesignSurface, PageOpener } from '@/components/portal/kit';

/**
 * Shared opener for AI Career Tools destinations (interview, LinkedIn, match).
 * Same kicker / quiet 44px back action / `--wa-pad-sm` as InterviewPrepKit so those
 * routes read as the same product as /dev/member/toolkit.
 */
export function ToolkitToolChrome({
  title,
  lede,
  icon,
  backHref = '/dashboard/ai-tools',
  maxWidth = 860,
  children,
}: {
  title: string;
  lede: string;
  icon: ReactNode;
  backHref?: string;
  maxWidth?: number;
  children: ReactNode;
}) {
  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth, margin: '0 auto', padding: 'var(--wa-pad-sm)' }} className="wa-space-y-5">
        <PageOpener
          kicker="AI Career Tools"
          title={title}
          lede={lede}
          icon={icon}
          action={
            <Link
              href={backHref}
              className="wa-page-action wa-kit-focus"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              Back to AI Career Tools
            </Link>
          }
        />
        {children}
      </div>
    </DesignSurface>
  );
}
