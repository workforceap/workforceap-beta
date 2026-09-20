import Link from 'next/link';
import { PROGRAMS } from '@/lib/content/programs';
import type { DashboardTranslator } from './types';

const mobileCarouselCardWidth = 'min(240px, calc(100vw - 3rem))';

/* Recommended programs (only when not enrolled) OR "keep going" actions (when
   enrolled) - extracted verbatim from page.tsx (mobile carousel). */
export default function MobileDiscoverSection({
  t,
  enrolledProgram,
  programTitle,
  nextIncompleteCourseName,
}: {
  t: DashboardTranslator;
  enrolledProgram: string | null;
  programTitle: string | null;
  nextIncompleteCourseName: string | null;
}) {
  return !enrolledProgram ? (
          <section aria-label="Recommended programs" style={{ marginBottom:"1.5rem", display:"flex", flexDirection:"column", gap:"0.75rem" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", padding:"0 1.5rem" }}>
              <h2 className="wa-text-xs wa-font-bold wa-uppercase wa-tracking-[0.1em] wa-text-[var(--color-on-surface-variant)]">{t('recommendedPrograms')}</h2>
              <a href="/programs" className="wa-text-xs wa-font-bold wa-text-[var(--color-accent-dark)]" style={{ textDecoration:"none" }}>{t('viewAll')}</a>
            </div>
            <div style={{ display:"flex", gap:"1rem", overflowX:"auto", padding:"0 1.5rem 0.5rem", scrollbarWidth:"none", msOverflowStyle:"none" }}>
              {PROGRAMS.slice(0, 3).map((prog, i) => (
                <Link
                  key={i}
                  href={prog.slug ? `/programs/${prog.slug}` : '/programs'}
                  style={{ textDecoration: 'none', color: 'inherit', flexShrink: 0 }}
                >
                <div
                className="portal-card portal-card--flat"
                style={{
                  width: mobileCarouselCardWidth,
                  minWidth: mobileCarouselCardWidth,
                  overflow:"hidden",
                  flexShrink:0,
                  background:"var(--surface-container-lowest)",
                  borderRadius:"0.75rem",
                }}
                >
                <div style={{ height:"7rem", position:"relative", background: `linear-gradient(135deg, ${prog.categoryColor} 0%, var(--surface-container-highest) 100%)` }} />
                <div style={{ padding:"1rem", display:"flex", flexDirection:"column", gap:"0.25rem" }}>
                  <p className="wa-text-[13px] wa-font-bold wa-uppercase wa-tracking-widest" style={{ color: 'var(--color-gold)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prog.partner || t('workforceAP')}</p>
                  <h3 className="wa-font-bold wa-text-sm wa-text-[var(--color-on-surface)] wa-leading-tight" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prog.title}</h3>
                </div>
                </div>
                </Link>
              ))}
            </div>
          </section>
        ) : (
          <section aria-label="Next milestones" style={{ marginBottom:"1.5rem", display:"flex", flexDirection:"column", gap:"0.75rem" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", padding:"0 1.5rem" }}>
              <h2 className="wa-text-xs wa-font-bold wa-uppercase wa-tracking-[0.1em] wa-text-[var(--color-on-surface-variant)]">
                {t('nextMilestones')}
              </h2>
              <a href="/dashboard/learning" className="wa-text-xs wa-font-bold wa-text-[var(--color-accent-dark)]" style={{ textDecoration:"none" }}>
                {t('trainingLink')}
              </a>
            </div>
            <div style={{ display:"flex", gap:"0.75rem", overflowX:"auto", padding:"0 1.5rem 0.5rem", scrollbarWidth:"none", msOverflowStyle:"none" }}>
              {[
                {
                  eyebrow: programTitle ?? t('yourProgram'),
                  title: nextIncompleteCourseName ? `Continue: ${nextIncompleteCourseName}` : t('continueTraining'),
                  desc: nextIncompleteCourseName ? t('pickUpWhereLeftOff') : t('openTrainingTrack'),
                  href: '/dashboard/learning',
                  icon: 'school',
                },
                {
                  eyebrow: t('jobSearchTools'),
                  title: t('practiceInterviewAnswers'),
                  desc: t('buildConfidenceInterview'),
                  href: '/dashboard/ai-tools/interview-practice',
                  icon: 'record_voice_over',
                },
                {
                  eyebrow: t('connect'),
                  title: t('browseJobBoard'),
                  desc: t('exploreRoles'),
                  href: '/dashboard/jobs',
                  icon: 'work',
                },
              ].map((card) => (
                <a
                  key={card.href}
                  href={card.href}
                  className="wa-no-underline active:scale-[0.98] wa-transition-transform"
                  style={{ width: mobileCarouselCardWidth, minWidth: mobileCarouselCardWidth, flexShrink:0 }}
                >
                  <div className="portal-card portal-card--flat" style={{ borderRadius:"0.75rem", overflow: 'hidden' }}>
                    <div className="portal-card__body" style={{ padding:"1rem" }}>
                      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:"0.75rem" }}>
                        <div style={{ minWidth:0, overflow: 'hidden' }}>
                          <p className="wa-text-[13px] wa-font-bold wa-uppercase wa-tracking-widest" style={{ color:'var(--color-on-surface-variant)', margin:0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {card.eyebrow}
                          </p>
                          <p className="wa-text-sm wa-font-bold wa-tracking-tight" style={{ color:'var(--color-on-surface)', margin:"0.35rem 0 0", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {card.title}
                          </p>
                        </div>
                        <span className="material-symbols-outlined" style={{ color:'var(--color-accent)', fontSize:"1.1rem", flexShrink:0 }}>
                          {card.icon}
                        </span>
                      </div>
                      <p className="wa-text-xs" style={{ color:'var(--color-on-surface-variant)', margin:"0.5rem 0 0", lineHeight:1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {card.desc}
                      </p>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </section>
  );
}
