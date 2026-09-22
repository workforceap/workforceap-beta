import Image from 'next/image';
import LocalizedLink from '@/components/LocalizedLink';
import LanguageToggle from '@/components/portal/LanguageToggle';
import { AtSign, Linkedin } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function Footer({ variant = 'inner' }: { variant?: 'home' | 'inner' }) {
  const t = useTranslations('footer');
  const year = new Date().getFullYear();
  return (
    <footer style={{ background: 'var(--color-background-dark, #121416)', borderTop: '1px solid var(--surface-container-highest)', paddingTop: '4rem', paddingBottom: '2rem', color: 'var(--color-on-surface, #e2e2e5)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '3rem', padding: '0 2rem 4rem', maxWidth: '1400px', margin: '0 auto' }}>
        {/* Brand Column */}
        <div>
          {variant === 'inner' ? (
            <Image
              src="/images/wap_logo.png"
              alt="WorkforceAP"
              className="footer-logo"
              width={210}
              height={107}
              sizes="(max-width: 768px) 140px, 210px"
              quality={85}
              loading="lazy"
              style={{ maxWidth: '180px', height: 'auto', marginBottom: '1rem' }}
            />
          ) : (
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--wa-accent-text)', marginBottom: '1.5rem' }}>
              {t('workforceAdvancementProject')}
            </div>
          )}
          <p style={{ fontSize: '0.875rem', lineHeight: 1.7, color: 'var(--color-on-surface-variant, #debfc2)' }}>
            {t('builtInAustin')}
          </p>
          <p style={{ fontSize: '0.8125rem', lineHeight: 1.6, color: 'var(--color-on-surface-variant, #debfc2)', opacity: 0.85, marginTop: '0.75rem' }}>
            {t('nonprofitDisclaimer')}
          </p>
          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
            <a href="https://www.linkedin.com/company/workforce-advancement-project" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
              <Linkedin size={18} color="var(--color-on-surface-variant)" aria-hidden="true" />
            </a>
            <a href="mailto:info@workforceap.org" aria-label="Email">
              <AtSign size={18} color="var(--color-on-surface-variant)" aria-hidden="true" />
            </a>
          </div>
        </div>

        {/* Programs / About / Support titles are sibling h2s (not h4) so public
            apply pages whose last content heading is h1 or h2 do not skip levels.
            Visual size stays on .text-label-upper, not the heading tag. */}
        <div>
          <h2 className="text-label-upper" style={{ color: 'var(--color-on-surface)', margin: '0 0 1.5rem' }}>{t('programs')}</h2>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <li><LocalizedLink href="/programs" style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '44px', minWidth: '44px', padding: '0.75rem 0.5rem' }}>{t('allPrograms')}</LocalizedLink></li>
            <li><LocalizedLink href="/find-your-path" style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '44px', minWidth: '44px', padding: '0.75rem 0.5rem' }}>{t('findYourPath')}</LocalizedLink></li>
            <li><LocalizedLink href="/career-quiz" style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '44px', minWidth: '44px', padding: '0.75rem 0.5rem' }}>{t('freeCareerQuiz')}</LocalizedLink></li>
            <li><LocalizedLink href="/program-comparison" style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '44px', minWidth: '44px', padding: '0.75rem 0.5rem' }}>{t('comparePrograms')}</LocalizedLink></li>
            <li><LocalizedLink href="/salary-guide" style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '44px', minWidth: '44px', padding: '0.75rem 0.5rem' }}>{t('salaryGuide')}</LocalizedLink></li>
            <li><LocalizedLink href="/apply" style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '44px', minWidth: '44px', padding: '0.75rem 0.5rem' }}>{t('applyNow')}</LocalizedLink></li>
          </ul>
        </div>

        {/* About */}
        <div>
          <h2 className="text-label-upper" style={{ color: 'var(--color-on-surface)', margin: '0 0 1.5rem' }}>{t('about')}</h2>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <li><LocalizedLink href="/what-we-do" style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '44px', minWidth: '44px', padding: '0.75rem 0.5rem' }}>{t('whatWeDo')}</LocalizedLink></li>
            <li><LocalizedLink href="/how-it-works" style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '44px', minWidth: '44px', padding: '0.75rem 0.5rem' }}>{t('howItWorks')}</LocalizedLink></li>
            <li><LocalizedLink href="/leadership" style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '44px', minWidth: '44px', padding: '0.75rem 0.5rem' }}>{t('leadershipTeam')}</LocalizedLink></li>
            <li><LocalizedLink href="/employers" style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '44px', minWidth: '44px', padding: '0.75rem 0.5rem' }}>{t('forEmployers')}</LocalizedLink></li>
            <li><LocalizedLink href="/partners" style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '44px', minWidth: '44px', padding: '0.75rem 0.5rem' }}>{t('partners')}</LocalizedLink></li>
            <li><LocalizedLink href="/careers" style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '44px', minWidth: '44px', padding: '0.75rem 0.5rem' }}>{t('careers')}</LocalizedLink></li>
          </ul>
        </div>

        {/* Support */}
        <div>
          <h2 className="text-label-upper" style={{ color: 'var(--color-on-surface)', margin: '0 0 1.5rem' }}>{t('support')}</h2>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <li><LocalizedLink href="/donate" style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '44px', minWidth: '44px', padding: '0.75rem 0.5rem' }}>{t('donate')}</LocalizedLink></li>
            <li><LocalizedLink href="/contact" style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '44px', minWidth: '44px', padding: '0.75rem 0.5rem' }}>{t('contactUs')}</LocalizedLink></li>
            <li><LocalizedLink href="/faq" style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '44px', minWidth: '44px', padding: '0.75rem 0.5rem' }}>{t('faq')}</LocalizedLink></li>
            <li><LocalizedLink href="/blog" style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '44px', minWidth: '44px', padding: '0.75rem 0.5rem' }}>{t('blog')}</LocalizedLink></li>
            <li><LocalizedLink href="/privacy" style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '44px', minWidth: '44px', padding: '0.75rem 0.5rem' }}>{t('privacyPolicy')}</LocalizedLink></li>
            <li><LocalizedLink href="/terms" style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '44px', minWidth: '44px', padding: '0.75rem 0.5rem' }}>{t('termsOfService')}</LocalizedLink></li>
            <li><LocalizedLink href="/accessibility" style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '44px', minWidth: '44px', padding: '0.75rem 0.5rem' }}>{t('accessibilityStatement')}</LocalizedLink></li>
          </ul>
        </div>
      </div>

      {/* Workforce ecosystem context */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 2rem 1.5rem', borderTop: '1px solid var(--surface-container-highest)', textAlign: 'center' }}>
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {t('experienceAcrossEcosystem')}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: '1.5rem', marginBottom: '1.5rem' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-on-surface-variant)' }}>{t('communityOrganizations')}</span>
          <span style={{ color: 'var(--color-on-surface-variant)', opacity: 0.4 }}>|</span>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-on-surface-variant)' }}>{t('workforceBoards')}</span>
          <span style={{ color: 'var(--color-on-surface-variant)', opacity: 0.4 }}>|</span>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-on-surface-variant)' }}>{t('employerPartners')}</span>
        </div>
      </div>

      {/* Copyright bar */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem 2rem 0', borderTop: '1px solid var(--surface-container-highest)', textAlign: 'center' }}>
        <div style={{ marginBottom: '1rem', color: 'var(--color-on-surface-variant)' }}>
          <LanguageToggle />
        </div>
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
          {t('copyright', { year })}
        </p>
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', opacity: 0.6, marginTop: '0.75rem', maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto' }}>
          {t('onetAttribution')}{' '}
          <a href="https://services.onetcenter.org/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-on-surface-variant)', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', minHeight: '44px', minWidth: '44px', padding: '0.75rem 0.5rem' }}>
            O*NET Web Services
          </a>{' '}
          by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA). O*NET&reg; is a trademark of USDOL/ETA.
        </p>
      </div>
    </footer>
  );
}
