import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Sparkles, FolderOpen, Headset, Mail, ArrowRight } from 'lucide-react';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { getProgramBySlug } from '@/lib/content/programs';
import { getResourcesForCategory } from '@/lib/content/programResources';
import { getCareerBriefContext } from '@/lib/content/careerBriefPersonalization';
import ResourcesClient from './ResourcesClient';
import PageHeader from '@/components/portal/PageHeader';
import { DesignSurface, CardHead, KitEmptyState } from '@/components/portal/kit';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard');
  return buildPageMetadataAsync({
    title: t('resourcesMetaTitle'),
    description: t('resourcesMetaDesc'),
    path: '/dashboard/resources',
  });
}

const CATEGORY_LABELS: Record<string, string> = {
  'digital-literacy': 'Digital Literacy',
  'ai-software': 'AI & Software Development',
  'cloud-data': 'Cloud & Data',
  'it-cyber': 'IT & Cybersecurity',
  business: 'Business',
  healthcare: 'Healthcare',
  manufacturing: 'Manufacturing',
  construction: 'Construction & Trades',
};

export default async function DashboardResourcesPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/resources');

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { enrolledProgram: true, enrolledAt: true },
  });

  const counselorAssignment = await prisma.counselorAssignment.findFirst({
    where: { memberId: user.id, active: true },
    orderBy: { assignedAt: 'desc' },
    select: {
      counselor: {
        select: {
          user: { select: { fullName: true, email: true } },
        },
      },
    },
  });
  const counselorContact = counselorAssignment?.counselor.user ?? null;

  const program = dbUser?.enrolledProgram ? getProgramBySlug(dbUser.enrolledProgram) : null;
  const category = program?.category ?? 'digital-literacy';
  const categoryLabel = CATEGORY_LABELS[category] ?? category;

  let suggestedAiTools: Array<{ label: string; href: string }> = [];
  let suggestedToolsLoadFailed = false;
  try {
    const briefContext = await getCareerBriefContext(user.id);
    suggestedAiTools = briefContext.recommendedActions
      .filter((a) => a.href.startsWith('/dashboard/ai-tools'))
      .slice(0, 4);
  } catch {
    suggestedToolsLoadFailed = true;
    suggestedAiTools = [
      { label: 'Resume Rewriter', href: '/dashboard/ai-tools/resume-studio?view=rewrite' },
      { label: 'Interview Coach', href: '/dashboard/ai-tools/interview-coach' },
      { label: 'Job Match Scorer', href: '/dashboard/ai-tools/job-match-scorer' },
    ];
  }

  const programResources = getResourcesForCategory(category);
  // `empty.programResources` (KIT_GUIDE §6): getResourcesForCategory falls
  // back to the Digital Literacy list for members without a program, so an
  // empty list is never an enrollment gate — it means the catalog has no
  // resources for this program area yet (`unavailable`, info).
  const te = await getTranslations('empty');

  return (
    <DesignSurface surface="warm">
      {suggestedToolsLoadFailed ? <span hidden data-portal-error-state="member-resources-personalization-load" /> : null}
      <div style={{ maxWidth: 'var(--max-width, 60rem)', margin: '0 auto', padding: '0 1.5rem 4rem' }}>
        <div style={{ marginTop: '1rem', marginBottom: '2rem' }}>
          <PageHeader
            title="Program resources"
            subtitle={`${categoryLabel} — AI tools, career tips, and links matched to your program, plus ways to reach the team.`}
            breadcrumbs={[
              { label: 'Member Portal', href: '/dashboard' },
              { label: 'Learning Hub', href: '/dashboard/learning' },
              { label: 'Program resources' },
            ]}
          />
        </div>

        {/* Suggested AI tools */}
        {suggestedAiTools.length > 0 && (
          <section style={{ marginBottom: '2rem' }}>
            <CardHead title="Suggested for you" />
            <div className="wa-flex wa-flex-wrap wa-gap-2">
              {suggestedAiTools.map((a) => (
                <Link
                  key={a.href + a.label}
                  href={a.href}
                  className="wa-kit-focus hover:wa-opacity-90 wa-transition-opacity wa-duration-150"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    minHeight: 36,
                    padding: '0.5rem 1rem',
                    borderRadius: 999,
                    background: 'var(--wa-accent-soft)',
                    border: '1px solid color-mix(in srgb, var(--wa-accent) 20%, transparent)',
                    color: 'var(--wa-accent)',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  <Sparkles size={14} aria-hidden="true" />
                  {a.label}
                </Link>
              ))}
              <Link
                href="/dashboard/ai-tools"
                className="wa-kit-focus hover:wa-opacity-90 wa-transition-opacity wa-duration-150"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  minHeight: 36,
                  padding: '0.5rem 1rem',
                  borderRadius: 999,
                  background: 'var(--wa-surface-2)',
                  border: '1px solid var(--wa-border)',
                  color: 'var(--wa-muted)',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                All AI tools
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </div>
          </section>
        )}

        {/* Program resources with inline preview */}
        <section style={{ marginBottom: '2rem' }}>
          <CardHead title={`${categoryLabel} resources`} />
          {programResources.length === 0 ? (
            <KitEmptyState
              kind="unavailable"
              tone="info"
              framed
              icon={<FolderOpen size={40} aria-hidden="true" />}
              title={te('programResources.title')}
              description={te('programResources.body')}
              primaryAction={{ href: '/dashboard/messages', label: te('programResources.action') }}
              secondaryAction={{ href: '/dashboard/ai-tools', label: te('programResources.secondary') }}
            />
          ) : (
            <ResourcesClient resources={programResources} />
          )}
        </section>

        {/* Support + Counselor */}
        <section style={{ marginBottom: '2rem' }}>
          <CardHead title="Support" />
          <div className="wa-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem' }}>
            {/* Counselor card */}
            <div className="wa-kit-card wa-kit-card--sm">
              <div className="wa-flex wa-items-center wa-gap-2" style={{ marginBottom: '0.625rem' }}>
                <Headset size={18} style={{ color: 'var(--wa-accent)' }} aria-hidden="true" />
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--wa-text)', margin: 0 }}>Your Counselor</h3>
              </div>
              {counselorContact ? (
                <>
                  <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--wa-text)', margin: '0 0 0.25rem' }}>{counselorContact.fullName}</p>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--wa-muted)', margin: '0 0 0.75rem' }}>
                    <a href={`mailto:${counselorContact.email}`} style={{ color: 'var(--wa-accent)', textDecoration: 'none' }}>{counselorContact.email}</a>
                  </p>
                </>
              ) : (
                <p style={{ fontSize: '0.8125rem', color: 'var(--wa-muted)', margin: '0 0 0.75rem', lineHeight: 1.55 }}>
                  {dbUser?.enrolledAt
                    ? 'Your counselor will reach out shortly — leave a message anytime.'
                    : 'A counselor will be assigned as you move through enrollment.'}
                </p>
              )}
              <Link href="/dashboard/messages" className="wa-kit-focus" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--wa-accent)', textDecoration: 'none' }}>
                Open messages
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </div>

            {/* General contact */}
            <div className="wa-kit-card wa-kit-card--sm">
              <div className="wa-flex wa-items-center wa-gap-2" style={{ marginBottom: '0.625rem' }}>
                <Mail size={18} style={{ color: 'var(--wa-accent)' }} aria-hidden="true" />
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--wa-text)', margin: 0 }}>Contact</h3>
              </div>
              <p style={{ fontSize: '0.8125rem', color: 'var(--wa-muted)', margin: '0 0 0.5rem', lineHeight: 1.55 }}>
                <a href="mailto:info@workforceap.org" style={{ color: 'var(--wa-accent)', textDecoration: 'none', fontWeight: 600 }}>info@workforceap.org</a>
              </p>
              <p style={{ fontSize: '0.8125rem', color: 'var(--wa-muted)', margin: '0 0 0.75rem' }}>
                (512) 777-1808
              </p>
              <p style={{ fontSize: '0.8125rem', color: 'var(--wa-muted)', margin: 0, lineHeight: 1.55 }}>
                <strong style={{ color: 'var(--wa-text)' }}>Loaner Laptop:</strong> Earned upon program completion. <Link href="/how-it-works" prefetch={false} style={{ color: 'var(--wa-accent)', textDecoration: 'none' }}>Learn more</Link>
              </p>
            </div>
          </div>
        </section>
      </div>
    </DesignSurface>
  );
}
