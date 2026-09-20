import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { DesignSurface, PageOpener } from '@/components/portal/kit';
import PortalBreadcrumb from '@/components/portal/PortalBreadcrumb';
import ToolHistoryPanel from '@/components/portal/ToolHistoryPanel';

const SkillMapperClient = dynamic(() => import('@/components/portal/tools/SkillMapperClient'), {
  loading: () => (
    <div
      role="status"
      aria-live="polite"
      className="wa-kit-card"
      style={{
        padding: '2.5rem 1.25rem',
        textAlign: 'center',
        color: 'var(--wa-muted)',
        fontSize: '0.9rem',
        fontWeight: 600,
      }}
    >
      Loading Skill Mapper…
    </div>
  ),
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard');
  return buildPageMetadataAsync({
    title: t('skillMapperMetaTitle'),
    description: t('skillMapperMetaDesc'),
    path: '/dashboard/ai-tools/skill-mapper',
  });
}

export default async function SkillMapperPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/ai-tools/skill-mapper');

  return (
    <DesignSurface surface="warm">
      <div className="skill-mapper-page-shell" style={{ maxWidth: 900, margin: '0 auto', padding: '1.25rem 1rem 3rem' }}>
        <div className="wa-space-y-5" style={{ marginBottom: 20 }}>
          <PortalBreadcrumb
            items={[
              { label: 'AI Career Tools', href: '/dashboard/ai-tools' },
              { label: 'Skill Mapper' },
            ]}
          />
          <PageOpener
            kicker="AI Career Tools"
            title="Skill Mapper"
            lede="Search any occupation to see its top skills and competency radar chart."
          />
        </div>
        <div className="wa-kit-card skill-mapper-card">
          <SkillMapperClient />
        </div>
        <ToolHistoryPanel
          userId={user.id}
          toolType="skill_assessment"
          title="Recent Skill Mapper Lookups"
        />
      </div>
    </DesignSurface>
  );
}
