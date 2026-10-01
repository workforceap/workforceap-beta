'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { KitEmptyState } from '@/components/portal/kit/KitEmptyState';
import type { MemberResource, ResourceCategory, ResourceStage } from '@/lib/content/memberResources';
import ResourceCard from '@/components/portal/ResourceCard';
import ResourceFilters from '@/components/portal/ResourceFilters';

type ProgressRecord = { completedAt: string | Date | null; savedAt: string | Date | null };

type ResourcesClientProps = {
  resources: MemberResource[];
  progressByResource?: Record<string, ProgressRecord>;
};

export default function ResourcesClient({ resources, progressByResource = {} }: ResourcesClientProps) {
  const [category, setCategory] = useState<ResourceCategory | ''>('');
  const [stage, setStage] = useState<ResourceStage | ''>('');
  const te = useTranslations('empty');

  const filtered = useMemo(() => {
    return resources.filter((r) => {
      if (category && r.category !== category) return false;
      if (stage && r.stage !== stage) return false;
      return true;
    });
  }, [resources, category, stage]);

  return (
    <>
      <ResourceFilters
        selectedCategory={category}
        selectedStage={stage}
        onCategoryChange={setCategory}
        onStageChange={setStage}
      />
      {filtered.length === 0 ? (
        // `empty.*` (KIT_GUIDE §6): rows exist but none match → `filtered` with
        // a real Clear filters; the library itself is empty → `unavailable`
        // (nothing the member can do here), pointing at the tools that do exist.
        category || stage ? (
          <KitEmptyState
            kind="filtered"
            framed
            icon={<span className="material-symbols-outlined" style={{ fontSize: '1.75rem' }}>filter_alt_off</span>}
            title={te('resourcesFiltered.title')}
            description={te('resourcesFiltered.body')}
            primaryAction={{
              label: te('resourcesFiltered.action'),
              onClick: () => {
                setCategory('');
                setStage('');
              },
            }}
          />
        ) : (
          <KitEmptyState
            kind="unavailable"
            framed
            icon={<span className="material-symbols-outlined" style={{ fontSize: '1.75rem' }}>filter_alt_off</span>}
            title={te('resourcesUnavailable.title')}
            description={te('resourcesUnavailable.body')}
            primaryAction={{ href: '/dashboard/ai-tools', label: te('resourcesUnavailable.action') }}
          />
        )
      ) : (
        <ul className="resource-grid">
          {filtered.map((r) => (
            <li key={r.id}>
              <ResourceCard resource={r} progress={progressByResource[r.id]} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
