'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { purgePendingResumeDrafts } from '@/lib/resume/pendingResumeDraft';
import { resetCurrentUserCache } from '@/lib/auth/currentUserClient';

type SignOutButtonProps = {
  className?: string;
  children?: React.ReactNode;
  /** e.g. close mobile drawer before navigation */
  onSignOutStart?: () => void;
};

export function SignOutButton({ className, children, onSignOutStart }: SignOutButtonProps) {
  const router = useRouter();
  const t = useTranslations('nav');

  const handleSignOut = async () => {
    onSignOutStart?.();
    const response = await fetch('/api/auth/logout', { method: 'POST' });
    // Forget the shared current-user snapshot so nothing renders a stale role (WAP-27).
    resetCurrentUserCache();
    if (response.ok) {
      try {
        purgePendingResumeDrafts(sessionStorage);
      } catch {
        // Logout still succeeded; unavailable browser storage needs no retry.
      }
    }
    router.push('/');
    router.refresh();
  };

  // Kit CTA (`wa-kit-cta`) and header text-action callers own their styling;
  // legacy `.btn` is only added for callers that still rely on it.
  const mergedClass =
    className != null && className !== ''
      ? /\bbtn\b/.test(className) ||
        className.includes('wa-shell-text-action') ||
        className.includes('wa-kit-cta')
        ? className
        : `btn ${className}`.trim()
      : 'btn';

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className={mergedClass}
      style={
        className
          ? undefined
          : {
              background: 'rgba(255,255,255,0.15)',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.4)',
              padding: '0.5rem 1rem',
              fontSize: '.9rem',
            }
      }
    >
      {children ?? t('signOut')}
    </button>
  );
}
