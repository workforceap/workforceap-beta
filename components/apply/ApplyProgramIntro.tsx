import LocalizedLink from '@/components/LocalizedLink';
import { getProgramBySlug } from '@/lib/content/programs';
import { buildApplyProgramBlockCopy } from '@/lib/apply/applyProgramPage';
import { getTranslations } from 'next-intl/server';

export default async function ApplyProgramIntro({
  programSlug,
  schoolName = null,
  schoolRef = null,
}: {
  programSlug: string;
  schoolName?: string | null;
  schoolRef?: string | null;
}) {
  const program = getProgramBySlug(programSlug);
  if (!program) return null;

  const { bullets } = buildApplyProgramBlockCopy(program);
  const [t, tCta] = await Promise.all([getTranslations('apply'), getTranslations('cta')]);
  const toggleId = `apply-program-intro-${program.slug}`;

  return (
    <section className="apply-program-intro" aria-labelledby="apply-program-intro-heading">
      <input
        type="checkbox"
        id={toggleId}
        className="apply-program-intro__toggle"
        aria-controls={`${toggleId}-panel`}
      />
      <label htmlFor={toggleId} className="apply-program-intro__header">
        <span id="apply-program-intro-heading" className="apply-program-intro__title">
          {t('programIntroApplyingFor', { title: program.title })}
        </span>
        <span className="apply-program-intro__summary-hint">{t('programIntroExpandHint')}</span>
      </label>
      <div id={`${toggleId}-panel`} className="apply-program-intro__panel">
        {schoolName ? (
          <p className="apply-program-intro__cert">
            {t('schoolProgramIntroSponsor', { school: schoolName })}
          </p>
        ) : null}
        <p className="apply-program-intro__cert">
          {t('programIntroCertPartner')}: <strong>{program.partner}</strong>
        </p>
        <ul className="apply-program-intro__bullets">
          {bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        <p className="apply-program-intro__more">
          <LocalizedLink href="/salary-guide">{tCta('viewSalaryGuide')}</LocalizedLink>
        </p>
        <p className="apply-program-intro__more">
          <LocalizedLink href={schoolRef ? `/programs/${program.slug}?ref=${encodeURIComponent(schoolRef)}` : `/programs/${program.slug}`}>{t('programIntroReadOverview')}</LocalizedLink>{' '}
          {t('programIntroOr')}{' '}
          <LocalizedLink href="/programs">{t('programIntroCompareAll')}</LocalizedLink>.
        </p>
      </div>
      <style>{`
        .apply-program-intro {
          margin-bottom: var(--space-4);
        }

        .apply-program-intro__toggle {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }

        .apply-program-intro__header {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
          padding: var(--space-4);
          border: 1px solid var(--outline-variant);
          border-radius: var(--radius-lg);
          background: var(--surface-container);
          cursor: pointer;
          min-height: 44px;
        }

        .apply-program-intro__title {
          font-size: var(--font-size-base);
          font-weight: 700;
          color: var(--color-on-surface);
          margin: 0;
        }

        .apply-program-intro__summary-hint {
          font-size: var(--font-size-sm);
          font-weight: 600;
          color: var(--wa-accent-text);
        }

        .apply-program-intro__panel {
          display: none;
          padding: 0 var(--space-4) var(--space-4);
          margin-top: calc(-1 * var(--space-2));
          border: 1px solid var(--outline-variant);
          border-top: none;
          border-radius: 0 0 var(--radius-lg) var(--radius-lg);
          background: var(--surface-container);
        }

        .apply-program-intro__toggle:checked ~ .apply-program-intro__panel {
          display: block;
        }

        .apply-program-intro__toggle:checked ~ .apply-program-intro__header .apply-program-intro__summary-hint {
          color: var(--color-on-surface-variant);
        }

        .apply-program-intro__cert,
        .apply-program-intro__more {
          font-size: var(--font-size-sm);
          line-height: var(--line-height-normal);
          color: var(--color-on-surface-variant);
          margin: 0 0 var(--space-3);
        }

        .apply-program-intro__bullets {
          margin: 0 0 var(--space-3);
          padding-left: 1.1rem;
          font-size: var(--font-size-sm);
          line-height: var(--line-height-normal);
          color: var(--color-on-surface-variant);
        }

        @media (min-width: 769px) {
          .apply-program-intro__toggle,
          .apply-program-intro__summary-hint {
            display: none;
          }

          .apply-program-intro__header {
            display: block;
            padding: 0;
            border: none;
            background: transparent;
            cursor: default;
            pointer-events: none;
            margin-bottom: var(--space-3);
          }

          .apply-program-intro__panel {
            display: block;
            padding: 0;
            margin: 0;
            border: none;
            background: transparent;
          }
        }
      `}</style>
    </section>
  );
}
