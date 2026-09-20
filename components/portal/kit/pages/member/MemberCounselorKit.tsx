import type { ReactNode } from 'react';
import Link from 'next/link';
import { MessagesSquare, ArrowRight } from 'lucide-react';
import { Card } from '@astryxdesign/core/Card';
import { DesignSurface, PageOpener } from '@/components/portal/kit';

/**
 * Member Portal — LILLEY AI CAREER COACH view.
 * Elevates the bespoke `.portal-card--flat` history list around the existing
 * VoiceAgentSurface widget to the Command Center kit language.
 *
 * Target route: app/(portal)/dashboard/counselor
 * Surface: warm (member-facing).
 */

export interface CounselorSessionSummary {
  id: string;
  dateLabel: string;
  steps: string[];
}

export interface MemberCounselorKitProps {
  title: string;
  subtitle: string;
  /** The existing VoiceAgentSurface + CareerCounselor widget, unchanged. */
  voiceSurface: ReactNode;
  pastSessions: CounselorSessionSummary[];
  pastSessionsLabel: string;
}

export function MemberCounselorKit({ title, subtitle, voiceSurface, pastSessions, pastSessionsLabel }: MemberCounselorKitProps) {
  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 16 }} className="wa-space-y-6">
        <PageOpener
          kicker="AI career coach"
          icon={<MessagesSquare size={13} aria-hidden="true" />}
          title={title}
          lede={subtitle}
        />

        <div style={{ maxWidth: 640, margin: '0 auto', width: '100%' }}>{voiceSurface}</div>

        {pastSessions.length > 0 ? (
          <div>
            <h2 style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em', marginBottom: 16 }}>{pastSessionsLabel}</h2>
            <div className="wa-space-y-2">
              {pastSessions.map((session) => (
                <Link
                  key={session.id}
                  href={`/dashboard/counselor/${session.id}`}
                  className="wa-kit-focus"
                  style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
                >
                  <Card>
                    <div className="wa-flex wa-items-center wa-justify-between wa-gap-3">
                      <p style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', fontVariantNumeric: 'tabular-nums' }}>{session.dateLabel}</p>
                      <ArrowRight size={13} aria-hidden="true" style={{ color: 'var(--wa-muted)', flexShrink: 0 }} />
                    </div>
                    {session.steps.length > 0 ? (
                      <ul style={{ margin: '6px 0 0', padding: '0 0 0 1.1rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {session.steps.map((step, i) => (
                          <li key={i} style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-text)' }}>{step}</li>
                        ))}
                      </ul>
                    ) : null}
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </DesignSurface>
  );
}
