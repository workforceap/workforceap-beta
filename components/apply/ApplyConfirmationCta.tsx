'use client';

import { useMemo } from 'react';
import LocalizedLink from '@/components/LocalizedLink';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

export default function ApplyConfirmationCta() {
  const t = useTranslations('apply');
  const searchParams = useSearchParams();
  const email = useMemo(() => {
    const raw = searchParams?.get('email')?.trim() ?? '';
    return raw;
  }, [searchParams]);

  const createHref = email ? `/apply/create-account?email=${encodeURIComponent(email)}` : '/apply/create-account';

  return (
    <div className="apply-confirmation-account-cta afd-confirm__recommend">
      <p className="afd-confirm__recommend-eyebrow">{t('confirmationRecommendedEyebrow')}</p>
      <h2>{t('confirmationGuestPromoTitle')}</h2>
      <p className="afd-confirm__recommend-body">{t('confirmationGuestPromoBody')}</p>
      {email ? (
        <p className="afd-confirm__recommend-email">
          <strong>{t('confirmationGuestEmailLabel')}</strong> {email}
        </p>
      ) : null}
      <div className="afd-confirm__recommend-actions">
        <LocalizedLink href={createHref} className="btn btn-primary">
          {t('confirmationGuestCreateAccount')}
        </LocalizedLink>
        <LocalizedLink href="/apply/status" className="btn btn-secondary">
          {t('confirmationCheckStatusShort')}
        </LocalizedLink>
      </div>
      <p className="afd-confirm__recommend-later">{t('confirmationGuestLaterNote')}</p>
    </div>
  );
}
