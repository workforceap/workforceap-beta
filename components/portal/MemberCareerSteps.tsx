import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { skillMapperHref, trainingBridgeHref } from '@/lib/member/memberWorkspace';
import styles from './MemberWorkspace.module.css';

/** Exploration links retain the exact saved occupation lookup when one is selected. */
export function MemberCareerSteps({ current, resultId }: {
  current: 'interests' | 'skills' | 'training';
  resultId?: string | null;
}) {
  const t = useTranslations('memberWorkspace.exploration');
  const items = [
    { id: 'interests', label: t('interests'), href: '/dashboard/learning/interest-profiler' },
    { id: 'skills', label: t('skills'), href: skillMapperHref({ resultId }) },
    { id: 'training', label: t('training'), href: trainingBridgeHref(resultId) },
  ];
  return (
    <nav className={`${styles.navigation} ${styles.careerNavigation}`} aria-label={t('nav')}>
      {items.map(item => (
        <Link key={item.id} href={item.href} className="wa-kit-focus" aria-current={current === item.id ? 'step' : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/** Assigned learning, optional resources, and readiness keep their own definitions. */
export function MemberTrainingNav({ current, programSlug }: {
  current: 'program' | 'learning' | 'readiness';
  programSlug?: string | null;
}) {
  const t = useTranslations('memberWorkspace.training');
  const items = [
    { id: 'program', label: t('program'), href: `/dashboard/program${programSlug ? `?program=${encodeURIComponent(programSlug)}` : ''}` },
    { id: 'learning', label: t('learning'), href: `/dashboard/learning${programSlug ? `?program=${encodeURIComponent(programSlug)}` : ''}` },
    { id: 'readiness', label: t('readiness'), href: '/dashboard/readiness' },
  ];
  return (
    <nav className={styles.navigation} aria-label={t('nav')}>
      {items.map(item => (
        <Link key={item.id} href={item.href} className="wa-kit-focus" aria-current={current === item.id ? 'page' : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
