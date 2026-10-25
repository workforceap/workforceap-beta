import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
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
  const t = useTranslations('memberWorkspace.ai');
  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 16 }} className="wa-space-y-6">
        <PageOpener
          title={title}
          meta={subtitle}
        />

        <p className="wa-kit-lede">{t('humanDescription')} <Link href="/dashboard/messages" className="wa-page-action wa-kit-focus">{t('humanLink')}</Link></p>

        <div style={{ maxWidth: 640, margin: '0 auto', width: '100%' }}>{voiceSurface}</div>

        {pastSessions.length > 0 ? (
          <section aria-labelledby="counselor-sessions-title">
            <div className="wa-kit-card__head" style={{ marginBottom: 12 }}>
              <h2 id="counselor-sessions-title" className="wa-kit-card-title">{pastSessionsLabel}</h2>
            </div>
            <div className="wa-kit-card wa-kit-card--flush">
              <ul className="wa-kit-task-list">
                {pastSessions.map((session) => (
                  <li key={session.id}>
                    <Link
                      href={`/dashboard/counselor/${session.id}`}
                      className="wa-kit-task-row wa-kit-task-row--link wa-kit-focus"
                      style={{ textDecoration: 'none', color: 'inherit' }}
                    >
                      <div className="wa-kit-task-row__body">
                        <p className="wa-kit-task-row__title" style={{ fontVariantNumeric: 'tabular-nums' }}>{session.dateLabel}</p>
                        {session.steps.length > 0 ? (
                          <ul style={{ margin: '6px 0 0', padding: '0 0 0 1.1rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {session.steps.map((step, i) => (
                              <li key={i} style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)' }}>{step}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                      <ArrowRight size={14} aria-hidden="true" style={{ color: 'var(--wa-muted)', flexShrink: 0 }} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}
      </div>
    </DesignSurface>
  );
}
