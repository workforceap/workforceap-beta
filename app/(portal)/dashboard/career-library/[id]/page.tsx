import type { Metadata } from 'next';
import { redirect, notFound } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { readFileSync } from 'fs';
import { join } from 'path';
import ReactMarkdown from 'react-markdown';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { getMemberResources, getMemberResourcesResult } from '@/lib/content/memberResources';
import { SignOutButton } from '@/components/portal/SignOutButton';
import ResourceViewTracker from '@/components/portal/ResourceViewTracker';
import ResourceProgressActions from '@/components/portal/ResourceProgressActions';
import ResourceDownloadButton from '@/components/portal/ResourceDownloadButton';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { PageOpener } from '@/components/portal/kit';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const resources = await getMemberResources();
  const resource = resources.find((r) => r.id === id);
  if (!resource) return { title: 'Resource not found' };
  return buildPageMetadataAsync({
    title: resource.title,
    description: resource.summary,
    path: `/dashboard/career-library/${id}`,
  });
}

export default async function DashboardCareerLibraryDetailPage({ params }: Props) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/career-library');

  // Authenticated release audits send this header from a trusted, read-only
  // browser context. Suppressing view telemetry keeps the fixture observable
  // without mutating member progress; save/complete controls remain guarded by
  // the audit browser and are never exercised.
  const requestHeaders = await headers();
  const readOnlyAudit = isReadOnlyPortalAuditHeader(requestHeaders);

  const { id } = await params;
  const resourcesResult = await getMemberResourcesResult({ readOnlyAudit });
  const resources = resourcesResult.resources;
  const resource = resources.find((r) => r.id === id);
  if (!resource) notFound();

  const { prisma } = await import('@/lib/db/prisma');
  let progress = null;
  let progressLoadFailed = false;
  try {
    progress = await prisma.resourceProgress.findUnique({
      where: { userId_resourceId: { userId: user.id, resourceId: id } },
    });
  } catch (e) {
    progressLoadFailed = true;
    console.error('[career-library detail] progress query failed', e);
  }

  let content = '';
  let contentLoadFailed = false;
  if (resource.file) {
    try {
      const filePath = join(process.cwd(), 'content', 'member-resources', resource.file);
      content = readFileSync(filePath, 'utf-8');
    } catch (error) {
      contentLoadFailed = true;
      console.error('[career-library detail] resource content read failed', error);
      content = '*Content not available.*';
    }
  }

  return (
    <>
      <div className="inner-page wa-pb-24 md:wa-pb-8">
        {readOnlyAudit ? (
          <span hidden data-portal-audit-suppressed="career-library-view-progress-and-download-mutations" />
        ) : (
          <ResourceViewTracker resourceId={id} />
        )}
        {resourcesResult.loadFailed ? (
          <span hidden data-portal-error-state="career-library-resource-catalog-load" />
        ) : null}
        {progressLoadFailed ? <span hidden data-portal-error-state="career-library-progress-load" /> : null}
        {contentLoadFailed ? <span hidden data-portal-error-state="career-library-content-load" /> : null}
        <section className="content-section" style={{ paddingBottom: 0 }}>
          <div className="container">
            <PageOpener
              kicker="Career library"
              title={resource.title}
              lede={resource.summary}
              action={
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <Link href="/dashboard/learning" className="wa-kit-cta wa-kit-cta--ghost">
                    Learning hub
                  </Link>
                  <Link href="/dashboard" className="wa-kit-cta wa-kit-cta--ghost">
                    Dashboard
                  </Link>
                  <SignOutButton className="wa-kit-cta wa-kit-cta--ghost" />
                </div>
              }
            />
          </div>
        </section>

        <section className="content-section">
          <div className="container">
            <div className="resource-detail-actions">
              {!readOnlyAudit ? (
                <>
                  <ResourceProgressActions
                    resourceId={id}
                    progress={progress ? { completedAt: progress.completedAt, savedAt: progress.savedAt } : null}
                  />
                  {resource.file && (
                    <ResourceDownloadButton resourceId={id} resourceTitle={resource.title} />
                  )}
                </>
              ) : null}
            </div>
            <article className="resource-content markdown-body">
              <ReactMarkdown>{content}</ReactMarkdown>
            </article>
          </div>
        </section>

      </div>    </>
  );
}
