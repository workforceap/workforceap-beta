'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Briefcase, BookOpen, Home, MessageSquare, Sparkles } from 'lucide-react';
import { getBestActiveHref, type ActiveNavLink } from '@/lib/nav/activeRoute';
import { MEMBER_PORTAL_NAV_ITEMS, navItemsForActiveRoute } from '@/lib/nav/portalNav';
import { splitLocalePrefix } from '@/lib/i18n/config';
import { localizeHref } from '@/lib/i18n/localizeHref';

const RAIL_LINKS = new Map<string, ActiveNavLink>();
for (const link of navItemsForActiveRoute(MEMBER_PORTAL_NAV_ITEMS)) {
  if (!RAIL_LINKS.has(link.href)) RAIL_LINKS.set(link.href, link);
}

const HOME_LINKS = [
  { canonical: '/dashboard', labelKey: 'dashboard' as const, Icon: Home, tourTarget: 'tour-dashboard' },
  { canonical: '/dashboard/program', labelKey: 'myProgram' as const, Icon: BookOpen, tourTarget: 'tour-programs' },
  { canonical: '/dashboard/jobs', labelKey: 'jobBoard' as const, Icon: Briefcase, tourTarget: 'tour-jobs' },
  { canonical: '/dashboard/ai-tools', labelKey: 'careerToolkit' as const, Icon: Sparkles, tourTarget: 'tour-ai-tools', prominent: true },
  { canonical: '/dashboard/messages', labelKey: 'counselorChat' as const, Icon: MessageSquare, tourTarget: 'tour-messages' },
] as const;

const COMPACT_EXACT = new Set([
  '/dashboard',
  '/dashboard/program',
  '/dashboard/jobs',
  '/dashboard/ai-tools',
  '/dev/member/home',
  '/dev/member/program',
  '/dev/member/jobs',
  '/dev/member/ai-tools',
  '/dev/member/toolkit',
  '/dev/member/resume-studio',
  '/dev/member/v/home',
  '/dev/member/v/program',
  '/dev/member/v/jobs',
  '/dev/member/v/ai-tools',
  '/dev/member/v/resume-studio',
]);

export function isMemberHomeCompactPath(pathname: string): boolean {
  if (COMPACT_EXACT.has(pathname)) return true;
  return pathname.startsWith('/dashboard/ai-tools/');
}

/**
 * Desktop-only five-link strip for the member home. Replaces the persistent
 * left rail on `/dashboard` and `/dev/member/home` so the page can keep the
 * full rail on every other portal route. Tour anchors move here on those
 * two paths so the home tour still has exactly one target per step.
 */
export default function MemberHomeCompactNav({
  hrefMap,
}: {
  hrefMap?: Record<string, string>;
}) {
  const rawPathname = usePathname() ?? '/dashboard';
  const { locale: explicitLocale, pathnameWithoutLocale: pathname } = splitLocalePrefix(rawPathname);
  const t = useTranslations('nav');
  const th = useTranslations('dashboard.home');
  const remap = (href: string) => hrefMap?.[href] ?? href;

  const activeCanonical = getBestActiveHref(
    pathname,
    HOME_LINKS.map((tab) => {
      const rail = RAIL_LINKS.get(tab.canonical);
      const remapped = remap(tab.canonical);
      const extra =
        tab.canonical === '/dashboard'
          ? ['/dev/member/v/home']
          : tab.canonical === '/dashboard/program'
            ? ['/dev/member/v/program']
            : tab.canonical === '/dashboard/jobs'
              ? ['/dev/member/v/jobs']
              : tab.canonical === '/dashboard/ai-tools'
                ? [
                    '/dev/member/ai-tools',
                    '/dev/member/toolkit',
                    '/dev/member/resume-studio',
                    '/dev/member/v/ai-tools',
                    '/dev/member/v/resume-studio',
                  ]
                : [];
      return {
        href: tab.canonical,
        aliases: [...(remapped !== tab.canonical ? [remapped] : []), ...extra, ...(rail?.aliases ?? [])],
        exact: rail?.exact,
      };
    }),
  );

  return (
    <nav className="member-home-compact-nav" aria-label={th('compactNav')}>
      <ul className="member-home-compact-nav__list">
        {HOME_LINKS.map((tab) => {
          const mappedHref = remap(tab.canonical);
          const href = explicitLocale ? localizeHref(mappedHref, explicitLocale) : mappedHref;
          const active = tab.canonical === activeCanonical;
          const Icon = tab.Icon;
          return (
            <li key={tab.canonical}>
              <Link
                href={href}
                prefetch={false}
                className={`member-home-compact-nav__link${active ? ' member-home-compact-nav__link--active' : ''}${tab.canonical === '/dashboard/ai-tools' ? ' member-home-compact-nav__link--tools' : ''}`}
                aria-current={active ? 'page' : undefined}
                data-tour={tab.tourTarget}
              >
                <Icon size={18} aria-hidden />
                <span>{t(tab.labelKey)}</span>
                {tab.canonical === '/dashboard/ai-tools' ? (
                  <span className="member-home-compact-nav__dot" aria-hidden />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
