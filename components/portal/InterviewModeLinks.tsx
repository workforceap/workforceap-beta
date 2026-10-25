import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { INTERVIEW_MODES, INTERVIEW_WORKSPACE_PATH, interviewModeHref, normalizeInterviewRole, type InterviewMode } from '@/lib/member/memberWorkspace';
import styles from './MemberWorkspace.module.css';
import modeStyles from './InterviewModeLinks.module.css';

/** Keep role context and distinct destinations; phone links form a compact, fully labelled grid. */
export function InterviewModeLinks({ current, role = '' }: { current: InterviewMode; role?: string }) {
  const t = useTranslations('memberWorkspace.interviews');
  const targetRole = normalizeInterviewRole(role);
  return (
    <nav className={`${styles.navigation} ${modeStyles.navigation}`} aria-label={t('nav')}>
      <Link href={`${INTERVIEW_WORKSPACE_PATH}${targetRole ? `?role=${encodeURIComponent(targetRole)}` : ''}`} className="wa-kit-focus">{t('all')}</Link>
      {INTERVIEW_MODES.map(mode => (
        <Link key={mode.id} href={interviewModeHref(mode.id, targetRole)} className="wa-kit-focus" aria-current={mode.id === current ? 'page' : undefined}>{t(`modes.${mode.id}.title`)}</Link>
      ))}
    </nav>
  );
}
