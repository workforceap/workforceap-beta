'use client';

import Link from 'next/link';
import { CheckCircle2, ClipboardCheck, Wand2 } from 'lucide-react';

/**
 * Pinned "Start here" shortcuts under the home greeting.
 *
 * Ops (10/8/26): members were not finding the WIOA Preassessment or the AI
 * Career Tools because both sat below several other cards (4 of 141 members
 * had completed the preassessment). These two links are always shown, at the
 * top, as plain large buttons; the preassessment one turns into a quiet
 * "done" link once taken so it never nags.
 */
export default function MemberStartHereCard({
  preassessmentHref = '/dashboard/assessment',
  toolkitHref = '/dashboard/ai-tools',
  preassessmentCompleted,
}: {
  preassessmentHref?: string;
  toolkitHref?: string;
  preassessmentCompleted: boolean;
}) {
  return (
    <section
      aria-labelledby="member-start-here-heading"
      className="wa-kit-card"
      data-testid="member-start-here"
      style={{ padding: '14px 16px' }}
    >
      <h2 id="member-start-here-heading" className="wa-text-base wa-font-bold" style={{ margin: '0 0 10px' }}>
        Start here
      </h2>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <Link
          href={preassessmentHref}
          className="wa-kit-cta wa-min-h-11"
          data-done={preassessmentCompleted ? 'true' : 'false'}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', textDecoration: 'none' }}
        >
          {preassessmentCompleted ? (
            <CheckCircle2 size={22} aria-hidden="true" />
          ) : (
            <ClipboardCheck size={22} aria-hidden="true" />
          )}
          <span style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
            <strong>WIOA Preassessment</strong>
            <span style={{ fontSize: 'var(--wa-type-meta)', opacity: 0.85 }}>
              {preassessmentCompleted ? 'Done. View your results' : '35 questions for your counselor'}
            </span>
          </span>
        </Link>
        <Link
          href={toolkitHref}
          className="wa-kit-cta wa-kit-cta--ghost wa-min-h-11"
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', textDecoration: 'none' }}
        >
          <Wand2 size={22} aria-hidden="true" />
          <span style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
            <strong>AI Career Tools</strong>
            <span style={{ fontSize: 'var(--wa-type-meta)', opacity: 0.85 }}>Resume, interview practice, cover letters</span>
          </span>
        </Link>
      </div>
    </section>
  );
}
