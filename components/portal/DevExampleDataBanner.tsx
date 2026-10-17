'use client';

import { useTranslations } from 'next-intl';

/** Yellow proof banner on `/dev/member/*`. Never mounts on live portal routes. */
export default function DevExampleDataBanner() {
  const t = useTranslations('dashboard.dev');
  return (
    <p className="wa-dev-example-banner" role="status">
      {t('exampleData')}
    </p>
  );
}
