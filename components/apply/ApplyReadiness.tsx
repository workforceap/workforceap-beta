'use client';

import type { ReactNode } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import LocalizedLink from '@/components/LocalizedLink';
import { applyRecoveryHref, type ApplyRecoveryContext } from '@/lib/apply/applyRecoveryHref';
import { clearApplyBrowserState, type ApplyDraft } from '@/lib/apply/applyBrowserState';

export function ApplyResumeGate({ draft, hasEligibility = false, recoveryContext }: { draft: ApplyDraft | null; hasEligibility?: boolean; recoveryContext?: ApplyRecoveryContext }) {
  const t = useTranslations('apply');
  const format = useFormatter();
  return <section className="content-section afd-band">
    <div className="container">
      <div className="mdx-card afd-surface apply-missing-session" style={{ maxWidth: 560, margin: '0 auto' }}>
        <h1 className="apply-step-title">{t('resultsMissingResumeTitle')}</h1>
        <p className="apply-step-desc">{t(hasEligibility ? 'resumeProgramsDesc' : draft ? 'resultsMissingResumeDesc' : 'resumeEmptyDesc')}</p>
        {draft && !hasEligibility && <p>{t('resumeSavedAt', { date: format.dateTime(new Date(draft.updatedAt), { dateStyle: 'medium', timeStyle: 'short' }) })}</p>}
        <p><LocalizedLink href={applyRecoveryHref(hasEligibility ? '/apply/results' : '/apply', recoveryContext)} className="btn btn-primary">{t(hasEligibility ? 'resumeChoosePrograms' : draft ? 'resumeContinueDetails' : 'resumeStart')}</LocalizedLink></p>
        {(draft || hasEligibility) && <p><LocalizedLink href={applyRecoveryHref('/apply', recoveryContext)} onClick={clearApplyBrowserState}>{t('resumeStartOver')}</LocalizedLink></p>}
      </div>
    </div>
  </section>;
}

export function ApplyReadyContent({ header, intro, account = false, children }: { header?: ReactNode; intro?: ReactNode; account?: boolean; children: ReactNode }) {
  return <>{header}<section className="content-section afd-band"><div className="container">
    <div className={account ? 'mdx-card afd-surface' : undefined} style={account ? { maxWidth: 560, margin: '0 auto' } : undefined}>
      {intro}{children}
    </div>
  </div></section></>;
}
