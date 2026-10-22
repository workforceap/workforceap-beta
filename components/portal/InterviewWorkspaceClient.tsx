'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { TextInput } from '@astryxdesign/core/TextInput';
import { KitLinkButton } from '@/components/portal/kit/KitLinkButton';
import { INTERVIEW_MODES, interviewModeHref, normalizeInterviewRole } from '@/lib/member/memberWorkspace';
import styles from './MemberWorkspace.module.css';

/** A chooser over the full tools; it never starts a provider session on arrival. */
export default function InterviewWorkspaceClient({ initialRole = '' }: { initialRole?: string }) {
  const t = useTranslations('memberWorkspace.interviews');
  const [role, setRole] = useState(normalizeInterviewRole(initialRole));
  return (
    <section className="wa-space-y-5" aria-label={t('choose')}>
      <TextInput label={t('role')} value={role} onChange={value => setRole(value.slice(0, 200))} isOptional description={t('roleHelp')} placeholder={t('roleExample')} />
      <p className={styles.context}>{t('resumeContext')} <Link href="/dashboard/resume">{t('openResume')}</Link></p>
      <ul className={styles.modeList}>
        {INTERVIEW_MODES.map(mode => (
          <li key={mode.id} className={styles.modeRow}>
            <section>
              <h2>{t(`modes.${mode.id}.title`)}</h2>
              <small>{t(`modes.${mode.id}.modality`)}</small>
              <p>{t(`modes.${mode.id}.detail`)}</p>
            </section>
            <KitLinkButton href={interviewModeHref(mode.id, role)} label={t('open', { mode: t(`modes.${mode.id}.title`) })} size="md" />
          </li>
        ))}
      </ul>
      <p className={styles.context}>{t('humanNotice')} <Link href="/dashboard/messages">{t('humanMessages')}</Link></p>
    </section>
  );
}
