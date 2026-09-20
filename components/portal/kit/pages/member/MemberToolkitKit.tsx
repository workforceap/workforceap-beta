'use client';

import {
  Briefcase,
  FilePen,
  Gauge,
  GitCompareArrows,
  Handshake,
  Headset,
  MailOpen,
  MessagesSquare,
  Mic,
  Speech,
  Wand2,
  Circle,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { DesignSurface, ChatThread, PageOpener, type ChatMessage } from '@/components/portal/kit';

/**
 * Member Portal — Career Studio destination list (AI tools + advisor).
 * PageOpener kicker “Career Studio”, title “Career tools”, 13px row indexes
 * and coach meta so the hub matches the rest of the member kit.
 *
 * Interactive (AI advisor composer) → 'use client'.
 *
 * Destination-style tool list. The live Career Studio hub
 * (`/dashboard/ai-tools` and `/dev/member/toolkit`) is VoiceStudioKit —
 * voice coaches + toolkit tabs. Do not swap that hub for this list.
 */

interface ToolCard {
  id: string;
  icon: ReactNode;
  title: string;
  body: string;
  cta: string;
  /** Destination route for the CTA (renders the CTA as a navigating link). */
  href?: string;
}

export interface MemberToolkitKitProps {
  /** PageOpener title. */
  heroTitle?: string;
  /** PageOpener lede. */
  heroSubtitle?: string;
  /** Voice-coach destination. Empty or `#` hides the coach CTA. */
  coachHref?: string;
  /**
   * Remap tool hrefs (e.g. `/dashboard/ai-tools/…` → `/dev/member/…`).
   * Tools whose live href is missing from the map are omitted.
   */
  hrefMap?: Record<string, string>;
  tools?: ToolCard[];
  advisorOnline?: boolean;
  advisorMessages?: ChatMessage[];
  /**
   * Per-tool CTA handler. When supplied it takes precedence over a tool's
   * `href` (the CTA renders as a button calling `onAction(tool.id)`).
   */
  onAction?: (toolId: string) => void;
  /**
   * AI Advisor composer send handler. The advisor is a text composer only when
   * a real send path is wired in by the caller. With no `onSend` there is no
   * live text-advisor backend, so the composer is replaced by an honest
   * empty-state pointing members at the (live) voice career coach rather than
   * silently discarding typed messages.
   */
  onSend?: (text: string) => void;
}

/**
 * CTAs link to the existing, real member AI-tool routes (the same destinations
 * used across the portal, e.g. ai-tools index, certifications, CareerCounselor).
 */
const DEFAULT_TOOLS: ToolCard[] = [
  {
    id: 'job-match',
    icon: <GitCompareArrows size={20} aria-hidden="true" />,
    title: 'Job match',
    body: 'Score a posting against your resume.',
    cta: 'Open',
    href: '/dashboard/ai-tools/job-match-scorer',
  },
  {
    id: 'resume-rewriter',
    icon: <FilePen size={20} aria-hidden="true" />,
    title: 'Resume rewriter',
    body: 'Reposition bullets toward a job title.',
    cta: 'Open',
    href: '/dashboard/ai-tools/resume-rewriter',
  },
  {
    id: 'resume-strength',
    icon: <Gauge size={20} aria-hidden="true" />,
    title: 'Resume strength',
    body: 'Score structure, keywords, and gaps.',
    cta: 'Open',
    href: '/dashboard/ai-tools/resume-analysis',
  },
  {
    id: 'interview-prep',
    icon: <Mic size={20} aria-hidden="true" />,
    title: 'Interview prep',
    body: 'Resume, letter, and practice in one bundle.',
    cta: 'Open',
    href: '/dashboard/ai-tools/interview-prep',
  },
  {
    id: 'interview-practice',
    icon: <Mic size={20} aria-hidden="true" />,
    title: 'Interview practice',
    body: 'Role questions with STAR frames.',
    cta: 'Open',
    href: '/dashboard/ai-tools/interview-practice',
  },
  {
    id: 'interview-coach',
    icon: <Headset size={20} aria-hidden="true" />,
    title: 'Interview coach',
    body: 'Run a mock interview and get feedback.',
    cta: 'Open',
    href: '/dashboard/ai-tools/interview-coach',
  },
  {
    id: 'linkedin-headline',
    icon: <Briefcase size={20} aria-hidden="true" />,
    title: 'LinkedIn headline',
    body: 'Write a headline recruiters can scan.',
    cta: 'Open',
    href: '/dashboard/ai-tools/linkedin-headline',
  },
  {
    id: 'linkedin-about',
    icon: <Briefcase size={20} aria-hidden="true" />,
    title: 'LinkedIn About',
    body: 'Three paragraphs from your highlights.',
    cta: 'Open',
    href: '/dashboard/ai-tools/linkedin-about',
  },
  {
    id: 'cover',
    icon: <MailOpen size={20} aria-hidden="true" />,
    title: 'Cover letter',
    body: 'Write a letter for a posting.',
    cta: 'Open',
    href: '/dashboard/ai-tools/cover-letter',
  },
  {
    id: 'salary',
    icon: <Handshake size={20} aria-hidden="true" />,
    title: 'Salary negotiation',
    body: 'Write a phone or email script from the offer.',
    cta: 'Open',
    href: '/dashboard/ai-tools/salary-negotiation',
  },
  {
    id: 'elevator',
    icon: <Speech size={20} aria-hidden="true" />,
    title: 'Elevator pitch',
    body: 'Write a 10–20 second intro, then rehearse it.',
    cta: 'Open',
    href: '/dashboard/ai-tools/elevator-pitch',
  },
];

export function MemberToolkitKit({
  heroTitle = 'Career tools',
  heroSubtitle = 'Each tool uses your program and saved jobs. Pick one and go.',
  coachHref = '/dashboard/ai-tools/career-business-coach',
  hrefMap,
  tools = DEFAULT_TOOLS,
  advisorOnline = true,
  advisorMessages,
  onAction,
  onSend,
}: MemberToolkitKitProps) {
  const resolvedTools = hrefMap
    ? tools.flatMap((tool) => {
        if (!tool.href || !hrefMap[tool.href]) return [];
        return [{ ...tool, href: hrefMap[tool.href] }];
      })
    : tools;
  const coachLink = coachHref && coachHref !== '#' ? coachHref : null;
  // No fabricated transcript: with no real advisor history supplied, show a
  // status line rather than a fake exchange.
  const messages: ChatMessage[] = advisorMessages ?? [];
  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--wa-pad-sm)' }} className="wa-space-y-5">
        <PageOpener
          kicker="Career Studio"
          title={heroTitle}
          lede={heroSubtitle}
          icon={<Wand2 size={13} aria-hidden="true" />}
        />

        {/* Tool list — one path, not a 3-up icon-circle grid. */}
        <div className="wa-kit-card" style={{ padding: 0, overflow: 'hidden' }}>
          {resolvedTools.map((tool, i) => {
            const row = (
              <>
                <span
                  aria-hidden="true"
                  style={{
                    fontSize: 'var(--wa-type-meta)',
                    fontWeight: 800,
                    fontVariantNumeric: 'tabular-nums',
                    color: 'var(--wa-muted)',
                    minWidth: 28,
                  }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h3 style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em', margin: 0, textWrap: 'balance' }}>{tool.title}</h3>
                  <p style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', margin: '4px 0 0' }}>{tool.body}</p>
                </div>
                <span className="wa-kit-cta wa-kit-cta--ghost" style={{ pointerEvents: 'none' }}>
                  {tool.cta}
                </span>
              </>
            );
            const rowStyle = {
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              minHeight: 72,
              padding: '14px 18px',
              borderTop: i === 0 ? 'none' : '1px solid var(--wa-border)',
              textDecoration: 'none',
              color: 'var(--wa-text)',
              width: '100%',
              background: 'transparent',
              cursor: 'pointer',
              textAlign: 'left' as const,
            };
            const rowClass =
              'wa-kit-focus hover:wa-opacity-90 wa-transition-opacity wa-duration-150 motion-reduce:wa-transition-none';
            if (onAction) {
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => onAction(tool.id)}
                  className={rowClass}
                  style={rowStyle}
                >
                  {row}
                </button>
              );
            }
            if (tool.href) {
              return (
                <Link key={tool.id} href={tool.href} className={rowClass} style={rowStyle}>
                  {row}
                </Link>
              );
            }
            return (
              <div
                key={tool.id}
                className="wa-kit-focus"
                style={{ ...rowStyle, cursor: 'not-allowed', opacity: 0.6 }}
                aria-disabled="true"
              >
                {row}
              </div>
            );
          })}
        </div>

        {/* AI Advisor */}
        <div className="wa-kit-card">
          <div className="wa-flex wa-items-center wa-gap-3" style={{ marginBottom: 16 }}>
            <div style={{ padding: 10, background: 'var(--wa-accent-soft)', color: 'var(--wa-accent)', borderRadius: 'var(--wa-radius-sm)' }}>
              <MessagesSquare size={18} aria-hidden="true" />
            </div>
            <div>
              <h3 style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em', margin: 0 }}>Career coach</h3>
              <p style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', margin: '4px 0 0' }}>
                Pick a tool above, or open the coach.
              </p>
            </div>
            {advisorOnline && onSend ? (
              <span
                className="wa-flex wa-items-center wa-gap-1"
                style={{ marginLeft: 'auto', fontSize: 'var(--wa-type-meta)', fontWeight: 700, color: 'var(--wa-success-dark)' }}
              >
                <Circle size={6} fill="currentColor" aria-hidden="true" />
                Online
              </span>
            ) : null}
          </div>
          {onSend ? (
            /* Live text composer only when a real send path is wired in. */
            <div style={{ minHeight: 200 }}>
              <ChatThread
                messages={messages}
                placeholder="Ask about a resume, posting, or interview"
                onSend={onSend}
              />
            </div>
          ) : (
            /* No wired text-advisor backend. Rendering ChatThread here would
               show a live-looking composer that silently discards input, so
               show the greeting and route members to the live (voice) career
               coach instead. */
            <div>
              {messages.map((m) => (
                <p key={m.id} style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', margin: '0 0 8px' }}>
                  {m.text}
                </p>
              ))}
              {coachLink ? (
                <Link
                  href={coachLink}
                  className="wa-kit-cta wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none"
                  style={{ marginTop: 16 }}
                >
                  Open career coach
                </Link>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </DesignSurface>
  );
}
