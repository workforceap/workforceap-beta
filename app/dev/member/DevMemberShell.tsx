'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import WorkspaceShell from '@/components/portal/WorkspaceShell';
import memberStyles from '@/components/portal/MemberWorkspace.module.css';
import DashboardFooter from '@/components/portal/DashboardFooter';
import TourProviderWrapper from '@/components/onboarding/TourProviderWrapper';
import type { MemberShellIdentity } from '@/lib/member/memberIdentity';
import { MEMBER_PORTAL_NAV_ITEMS } from '@/lib/nav/portalNav';
import { PRODUCT_COPY } from '@/lib/nav/workspaceCopy';
import DevReviewBar from '../DevReviewBar';

/**
 * Credential-free `/dev/member/*` chrome — same WorkspaceShell as live
 * `/dashboard`, with nav hrefs remapped onto the proof routes so the active
 * rail/tab matches the page being reviewed. Destinations without a proof
 * (AI Advisor, Learning Hub, Help, …) are omitted so the rail cannot jump
 * out of `/dev/member`. Profile proofs map from `/dashboard/profile` (not
 * Resume) so the active rail item matches the page. Superadmin view switcher
 * is only on missions proofs (that page is the switcher fixture); other member
 * surfaces stay member chrome so the suite reads as one product.
 */
const DEV_HREF: Record<string, string> = {
  '/dashboard': '/dev/member/home',
  '/dashboard/program': '/dev/member/program',
  '/dashboard/missions': '/dev/member/missions',
  '/dashboard/certifications': '/dev/member/certificates',
  '/dashboard/jobs': '/dev/member/jobs',
  '/dashboard/readiness': '/dev/member/progress',
  '/dashboard/ai-tools': '/dev/member/toolkit',
  '/dashboard/resume': '/dev/member/resume-studio',
  '/dashboard/messages': '/dev/member/messages',
  '/dashboard/assessment': '/dev/member/assessment',
  '/dashboard/profile': '/dev/member/profile',
};

const DEV_ALIASES: Record<string, string[]> = {
  '/dev/member/jobs': ['/dev/member/jobs-empty'],
  '/dev/member/certificates': ['/dev/member/certificates-empty'],
  '/dev/member/resume-studio': ['/dev/member/resume-rewriter', '/dev/member/resume-strength'],
  '/dev/member/toolkit': [
    '/dev/member/interviews',
    '/dev/member/skill-mapper',
    '/dev/member/interview-prep',
    '/dev/member/interview-practice',
    '/dev/member/linkedin-headline',
    '/dev/member/linkedin-about',
    '/dev/member/job-match',
    '/dev/member/interview-coach',
    '/dev/member/cover-letter',
    '/dev/member/salary-negotiation',
    '/dev/member/elevator-pitch',
    '/dev/member/gap-analyzer',
    '/dev/member/benefits-cliff',
    '/dev/member/career-business-coach',
  ],
};

/** Fixture member for the header identity block (the tour's `tour-account` step). */
const DEV_MEMBER_IDENTITY: MemberShellIdentity = {
  name: 'Alex Rivera',
  email: 'alex.rivera@example.test',
  initials: 'AR',
  avatarUrl: null,
  href: '/dev/member/profile',
};

export default function DevMemberShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const seenHref = new Set<string>();
  const navItems = MEMBER_PORTAL_NAV_ITEMS.filter((item) => item.href in DEV_HREF)
    .map((item) => {
      const href = DEV_HREF[item.href];
      const extra = DEV_ALIASES[href] ?? [];
      return extra.length
        ? { ...item, href, aliases: [...(item.aliases ?? []), ...extra] }
        : { ...item, href };
    })
    .filter((item) => {
      // Home and "My Account" both canonicalise to /dashboard → same proof.
      if (seenHref.has(item.href)) return false;
      seenHref.add(item.href);
      return true;
    });

  // WAP-230: the same tour provider as live /dashboard (PortalLayoutClient), so
  // `?onboarding=tour` and `?tour=member.home` run the guided tour here. The
  // identity block and the help menu are its account and help anchors.
  // Fixture tour interactions stay local: no account progress or analytics writes.
  return (
    <TourProviderWrapper previewMode>
      <WorkspaceShell
        portalRole="member"
        memberShellClassName={memberStyles.memberShell}
        navItems={navItems}
        identity={DEV_MEMBER_IDENTITY}
        helpTourKey="member.home"
        workspaceLabel={PRODUCT_COPY.memberWorkspace}
        contextLabel="Design preview"
        minimalMobileHeader
        previewMode
        knownIsAdmin={false}
        superAdmin={pathname.startsWith('/dev/member/missions')}
        marketingSiteHref="/en"
        marketingSiteLabel="WorkforceAP.org"
        navHrefMap={DEV_HREF}
        footer={<DashboardFooter />}
        topBanner={<DevReviewBar notice={
          pathname.endsWith('/home')
            ? 'Progress, sources and confirmation dates are synthetic. Email, calendar and training connections are not active.'
            : pathname.includes('/resume-studio')
              ? 'Uploads, generation, account access and voice are disabled.'
              : undefined
        } />}
      >
        {children}
      </WorkspaceShell>
    </TourProviderWrapper>
  );
}
