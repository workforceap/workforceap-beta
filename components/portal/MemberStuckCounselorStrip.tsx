import Link from 'next/link';
import { useTranslations } from 'next-intl';

type MemberStuckCounselorStripProps = {
  /** Primary: counselor messages; fallback contact page. */
  messagesHref?: string;
};

/**
 * Shown when enrolled training has gone quiet — see `isTrainingStaleForCounselorEscalation`.
 */
export default function MemberStuckCounselorStrip({
  messagesHref = '/dashboard/messages',
}: MemberStuckCounselorStripProps) {
  const t = useTranslations('dashboard');
  return (
    <aside
      className="portal-card portal-card--flat"
      style={{
        margin: '0 0 1.25rem',
        padding: '1rem 1.25rem',
        borderLeft: '4px solid var(--color-gold)',
        background: 'color-mix(in srgb, var(--color-gold) 8%, var(--surface-container-lowest))',
      }}
      aria-label={t('counselorSupport')}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
        <span className="material-symbols-outlined" style={{ color: 'var(--wa-accent-text)', flexShrink: 0 }}>
          support_agent
        </span>
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-on-surface)' }}>
            {t('stuckTalkToCounselor')}
          </p>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.5 }}>
            {t('stuckNoActivityMessage')}{' '}
            <a href="mailto:info@workforceap.org" style={{ color: 'var(--wa-accent-text)', fontWeight: 600 }}>
              info@workforceap.org
            </a>
            .
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <Link href={messagesHref} className="btn btn-primary btn-sm" style={{ fontSize: '0.8125rem' }}>
            {t('openMessages')}
          </Link>
          <Link href="/contact?topic=training" className="btn btn-outline btn-sm" style={{ fontSize: '0.8125rem' }}>
            {t('contact')}
          </Link>
        </div>
      </div>
    </aside>
  );
}
