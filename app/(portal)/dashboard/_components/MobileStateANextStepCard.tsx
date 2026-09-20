import Link from 'next/link';
import type { DashboardTranslator } from './types';

/* State A: unmissable next-step CTA (mobile) - extracted verbatim from
   page.tsx. Rendered there only when dashboardState === 'A', shown before the
   voice section when the member hasn't enrolled. */
export default function MobileStateANextStepCard({
  t,
  noApplicationOnFile,
}: {
  t: DashboardTranslator;
  noApplicationOnFile: boolean;
}) {
  return (
          <section aria-label="Next step" style={{ padding: '0 1.25rem 1.25rem' }}>
            <Link
              href={noApplicationOnFile ? '/apply' : '/dashboard/program'}
              style={{
                display: 'block',
                borderRadius: '1rem',
                overflow: 'hidden',
                background: 'linear-gradient(135deg, var(--color-accent-dark), var(--color-accent))',
                boxShadow: '0 6px 24px color-mix(in srgb, var(--color-accent) 28%, transparent)',
                padding: '1.25rem',
                textDecoration: 'none',
              }}
            >
              <p style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'rgba(255,255,255,0.78)', margin: '0 0 0.4rem' }}>
                {t('yourNextStep')}
              </p>
              <p style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#fff', margin: '0 0 0.5rem', lineHeight: 1.3 }}>
                {noApplicationOnFile
                  ? t('applyNowTenMinutes')
                  : t('chooseYourProgram')}
              </p>
              <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.85)', margin: '0 0 1rem', lineHeight: 1.5 }}>
                {noApplicationOnFile
                  ? t('careerTrainingNoCost')
                  : t('pickCareerTrack')}
              </p>
              {/* The pill stays white in both modes, so its label is pinned to the
                  light-mode crimson (6.5:1 on white). `var(--color-accent)` flips to
                  #e0658a in dark mode, which measured 3.28:1 on this white pill. */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#fff', color: '#ad2c4d', padding: '0.75rem 1.25rem', borderRadius: '0.625rem', fontWeight: 700, fontSize: '0.9375rem', maxWidth: '100%', boxSizing: 'border-box' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{noApplicationOnFile ? t('startApplication') : t('chooseProgramBtn')}</span>
                <span className="material-symbols-outlined" style={{ fontSize: '1rem', flexShrink: 0 }} aria-hidden="true">arrow_forward</span>
              </div>
            </Link>
          </section>
  );
}
