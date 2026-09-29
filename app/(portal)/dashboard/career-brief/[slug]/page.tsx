import type { Metadata } from 'next';
import { redirect, notFound } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { getMemberDashboardAccess } from '@/lib/auth/memberDashboardAccess';
import { getCareerBriefs, getCareerBriefContent } from '@/lib/content/careerBriefs';
import { getCareerBriefContext } from '@/lib/content/careerBriefPersonalization';
import { generatePersonalizedBriefSection } from '@/lib/ai/careerBriefAI';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { PageOpener } from '@/components/portal/kit';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const briefs = getCareerBriefs();
  const brief = briefs.find((b) => b.slug === slug);
  if (!brief) return { title: 'Brief not found' };
  return buildPageMetadataAsync({
    title: brief.title,
    description: 'Weekly Career Brief for WorkforceAP members.',
    path: `/dashboard/career-brief/${slug}`,
  });
}

export default async function CareerBriefDetailPage({ params }: Props) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/career-brief');
  const access = await getMemberDashboardAccess(user.id);
  if (access.redirectTo) redirect(access.redirectTo);

  const { slug } = await params;
  const content = getCareerBriefContent(slug);
  if (!content) notFound();

  const briefs = getCareerBriefs();
  const brief = briefs.find((b) => b.slug === slug);

  const context = await getCareerBriefContext(user.id);
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());
  const aiSection = readOnlyAudit
    ? ''
    : await generatePersonalizedBriefSection(
        context,
        brief?.title ?? 'Weekly Career Brief'
      );

  return (
    <>
    <div
      className="inner-page"
      {...(readOnlyAudit ? { 'data-portal-audit-suppressed': 'career-brief-personalized-llm' } : {})}
    >
      <section className="content-section" style={{ paddingBottom: 0 }}>
        <div className="container">
          <PageOpener
            kicker="Weekly Career Brief"
            title={brief?.title ?? 'Career Brief'}
            action={
              <Link href="/dashboard/career-brief" className="wa-kit-cta wa-kit-cta--ghost">
                Back to Career Brief
              </Link>
            }
          />
        </div>
      </section>

      <section className="content-section">
        <div className="container">
          {aiSection && (
            <div className="career-brief-ai-section">
              <h2 className="career-brief-ai-title">This Week for You</h2>
              <div className="career-brief-ai-content">
                {aiSection.split('\n\n').map((p, i) => (
                  <p key={i}>{p.trim()}</p>
                ))}
              </div>
            </div>
          )}
          <article className="resource-content markdown-body">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
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
              {content}
            </ReactMarkdown>
          </article>
        </div>
      </section>

    </div>    </>
  );
}
