import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { DesignSurface, SectionHeader, StatusTag } from '@/components/portal/kit';
import PortalBreadcrumb from '@/components/portal/PortalBreadcrumb';
import TrainingBridgeClient, {
  type SavedAssessment,
} from '@/components/portal/TrainingBridgeClient';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('trainingBridge');
  return buildPageMetadataAsync({
    title: t('metaTitle'),
    description: t('metaDesc'),
    path: '/dashboard/ai-tools/training-bridge',
  });
}

/** Parse the most recent saved Skill Mapper run into the shape the client needs. */
function parseAssessment(row: { output: string; createdAt: Date } | null): SavedAssessment | null {
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.output) as {
      occupationTitle?: unknown;
      occupationCode?: unknown;
      skills?: unknown;
    };
    const skills = Array.isArray(parsed.skills)
      ? parsed.skills
          .filter(
            (s): s is { name: string; score?: number } =>
              !!s && typeof (s as { name?: unknown }).name === 'string'
          )
          .map((s) => ({ name: s.name, score: typeof s.score === 'number' ? s.score : undefined }))
      : [];
    if (skills.length === 0) return null;
    return {
      occupationTitle: typeof parsed.occupationTitle === 'string' ? parsed.occupationTitle : null,
      occupationCode: typeof parsed.occupationCode === 'string' ? parsed.occupationCode : null,
      skills,
      createdAt: row.createdAt.toISOString(),
    };
  } catch {
    return null;
  }
}

export default async function TrainingBridgePage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/ai-tools/training-bridge');

  const t = await getTranslations('trainingBridge');

  let assessment: SavedAssessment | null = null;
  let assessmentLoadFailed = false;
  try {
    // Most recent Skill Mapper occupation lookup (skips Interest Profiler and
    // resume-extraction rows, which use other inputSummary prefixes).
    const row = await prisma.aIToolResult.findFirst({
      where: {
        userId: user.id,
        toolType: 'skill_assessment',
        inputSummary: { startsWith: 'Skill mapper lookup' },
      },
      orderBy: { createdAt: 'desc' },
      select: { output: true, createdAt: true },
    });
    assessment = parseAssessment(row);
  } catch (err) {
    assessmentLoadFailed = true;
    console.error('[training-bridge page] assessment lookup failed', err);
  }

  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.25rem 1rem 3rem' }} className="wa-space-y-5">
        {assessmentLoadFailed ? (
          <span hidden data-portal-error-state="training-bridge-assessment-load" />
        ) : null}
        <PortalBreadcrumb
          items={[
            { label: 'AI Career Tools', href: '/dashboard/ai-tools' },
            { label: t('title') },
          ]}
        />
        <SectionHeader
          kicker="AI Career Tools"
          title={t('title')}
          goal={t('subtitle')}
          action={<StatusTag tone="info">{t('betaTag')}</StatusTag>}
        />
        <TrainingBridgeClient assessment={assessment} />
      </div>
    </DesignSurface>
  );
}
