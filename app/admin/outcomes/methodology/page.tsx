import type { Metadata } from 'next';
import Link from 'next/link';
import { readFileSync } from 'fs';
import { join } from 'path';
import { redirect } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { buildPageMetadata } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import PageHeader from '@/components/portal/PageHeader';
import PortalPageFrame from '@/components/portal/PortalPageFrame';

export const metadata: Metadata = buildPageMetadata({
  title: 'Admin – Outcomes methodology',
  description: 'Definitions and query sources for placement and board outcome metrics.',
  path: '/admin/outcomes/methodology',
});

export const dynamic = 'force-dynamic';

function loadMethodologyMarkdown(): string {
  const filePath = join(process.cwd(), 'docs', 'OUTCOMES-METHODOLOGY.md');
  return readFileSync(filePath, 'utf8');
}

function tableTitleAtLine(markdown: string, tableLine?: number): string {
  if (tableLine) {
    const lines = markdown.split(/\r?\n/);
    for (let index = tableLine - 2; index >= 0; index -= 1) {
      const heading = /^#{2,6}\s+(.+)$/.exec(lines[index]);
      if (heading) return `${heading[1]} table`;
    }
  }
  return 'Outcomes methodology reference table';
}

export default async function OutcomesMethodologyPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/outcomes/methodology');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const markdown = loadMethodologyMarkdown();

  return (
    <PortalPageFrame>
      <PageHeader
        title="Outcomes methodology"
        subtitle="Metric definitions, Prisma sources, and small-sample rules for external reporting."
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Outcomes', href: '/admin/outcomes' },
          { label: 'Methodology' },
        ]}
      />
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <p style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>
          <Link href="/admin/outcomes" style={{ color: 'var(--wa-accent-text)', fontWeight: 600 }}>
            ← Back to outcomes truth-set
          </Link>
        </p>
        <article className="resource-content markdown-body outcomes-methodology-content">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // PageHeader above already renders the page h1; the document's
              // own "# Outcomes Methodology" becomes a section heading.
              h1: ({ children }) => <h2>{children}</h2>,
              table: ({ children, node }) => {
                const title = tableTitleAtLine(markdown, node?.position?.start.line);
                return (
                  <div className="admin-table-scroll" role="region" aria-label={`Scrollable ${title}`} tabIndex={0}>
                    <table>
                      <caption className="sr-only">{title}</caption>
                      {children}
                    </table>
                  </div>
                );
              },
              a: ({ href, children }) => {
                const isInternal = href?.startsWith('/');
                return isInternal ? (
                  <Link href={href!}>{children}</Link>
                ) : (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                );
              },
            }}
          >
            {markdown}
          </ReactMarkdown>
        </article>
      </div>
    </PortalPageFrame>
  );
}
