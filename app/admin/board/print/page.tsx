import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { isSuperAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { getBoardOutcomes, type BoardOutcomesPeriod } from '@/lib/admin/boardOutcomes';
import { programDisplayTitle } from '@/lib/content/programTitle';
import BoardOutcomesView from '@/components/admin/BoardOutcomesView';
import PrintButton from '@/components/admin/PrintButton';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
  title: 'Funder report',
  description: 'Print-ready funder outcomes report.',
  path: '/admin/board/print',
  robots: { index: false, follow: false },
});
}

const VALID_PERIODS: BoardOutcomesPeriod[] = ['all-time', 'ytd', 'q-current', 'q-prev'];

/**
 * Print-friendly funder report. No portal chrome, no sidebar — just the
 * outcomes view in a clean layout with print CSS so admin can hit Cmd+P
 * and get a clean PDF for funders.
 *
 * Same data as /admin/board, no chrome.
 */
export default async function FunderReportPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; org?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/board/print');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const sp = await searchParams;
  const period: BoardOutcomesPeriod = (VALID_PERIODS as string[]).includes(sp.period ?? '')
    ? (sp.period as BoardOutcomesPeriod)
    : 'all-time';

  const orgId = await getActorOrganizationId(user.id);
  const superUser = await isSuperAdmin(user.id);

  const outcomes = await getBoardOutcomes(period, superUser ? undefined : orgId);
  const programsWithTitles = outcomes.programs.map((p) => ({
    ...p,
    title: programDisplayTitle(p.programSlug),
  }));
  const boardName = sp.org ? prettifyOrgSlug(sp.org) : 'Workforce Advancement Project';

  return (
    <>
      <style>{`
        @media print {
          @page { margin: 0.6in; size: letter; }
          .funder-report-toolbar { display: none !important; }
          body { background: white !important; }
          .portal-card, .portal-card--flat { box-shadow: none !important; }
          a { text-decoration: none !important; color: inherit !important; }
          /* Avoid awkward page breaks inside cards / tables */
          section, table, tr { break-inside: avoid; page-break-inside: avoid; }
        }
        .funder-report-shell { padding: 1.25rem; max-width: 1100px; margin: 0 auto; }
      `}</style>
      <div className="funder-report-shell">
        <h1 style={{ fontSize: '1.75rem', margin: '0 0 1rem' }}>Funder outcomes report</h1>
        <div
          className="funder-report-toolbar"
          style={{
            display: 'flex',
            gap: '0.5rem',
            justifyContent: 'flex-end',
            marginBottom: '1rem',
          }}
        >
          <a href="/admin/board" className="btn btn-muted btn-small">
            ← Back to dashboard
          </a>
          <PrintButton />
        </div>
        <BoardOutcomesView outcomes={outcomes} programs={programsWithTitles} boardName={boardName} />
      </div>
    </>
  );
}

function prettifyOrgSlug(slug: string): string {
  return slug
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}
