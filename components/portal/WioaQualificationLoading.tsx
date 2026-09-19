'use client';

import { useTranslations } from 'next-intl';

export default function WioaQualificationLoading() {
  const t = useTranslations('wioa');
  return <div role="status" style={{ minHeight: 280, padding: '40px 20px', textAlign: 'center' }}>{t('loading')}</div>;
}
