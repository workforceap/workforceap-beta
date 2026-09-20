import LocalizedLink from '@/components/LocalizedLink';
import { getTranslations } from 'next-intl/server';
import { ShieldCheck } from 'lucide-react';

export default async function PaidApplyProofBlock() {
  const t = await getTranslations('apply');

  return (
    <section className="paid-apply-proof" aria-labelledby="paid-apply-proof-heading">
      <div className="paid-apply-proof__card" role="note">
        <ShieldCheck size={24} className="paid-apply-proof__badge-icon" aria-hidden="true" />
        <div>
          <h2 id="paid-apply-proof-heading" className="paid-apply-proof__title">
            {t('applyNonprofitBadge')}
          </h2>
          <p className="paid-apply-proof__body">{t('paidApplyProofBody')}</p>
          <div className="paid-apply-proof__actions">
          <LocalizedLink href="/contact?topic=application" className="btn btn-secondary paid-apply-proof__help-link">
            {t('helpCta1')}
          </LocalizedLink>
          <a href="tel:+15127771808" className="btn btn-primary paid-apply-proof__help-link">
            {t('helpCta2')}
          </a>
          </div>
        </div>
      </div>
    </section>
  );
}
