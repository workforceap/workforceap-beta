import Link from 'next/link';
import { KitEmptyState } from '@/components/portal/kit';
import { skillMissionEmptyState } from '@/lib/member/skillMissionEmptyState';

/**
 * Shared empty shell for Skill Missions (live `/dashboard/missions` and
 * `/dev/member/missions` proofs). Left-aligned KitEmptyState + kit CTA —
 * never a centered icon card.
 */
export function SkillMissionEmpty({
  programSlug,
  programTitle,
  hrefMap,
}: {
  programSlug: string | null;
  programTitle: string | null;
  hrefMap?: Record<string, string>;
}) {
  const empty = skillMissionEmptyState({ programSlug, programTitle });
  const href = hrefMap?.[empty.primaryAction.href] ?? empty.primaryAction.href;

  return (
    <div className="wa-kit-card">
      <KitEmptyState
        headingAs="h2"
        title={empty.title}
        description={empty.description}
        action={
          <Link href={href} className="wa-kit-cta wa-kit-focus hover:wa-opacity-90">
            {empty.primaryAction.label}
          </Link>
        }
      />
    </div>
  );
}
