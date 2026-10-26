/** Partner reporting navigation only; each view keeps its own disclosure and metric rules. */
export const PARTNER_IMPACT_PATH = '/partner/impact';
export const PARTNER_IMPACT_VIEWS = ['outcomes', 'milestones', 'exports'] as const;
export type PartnerImpactView = (typeof PARTNER_IMPACT_VIEWS)[number];
export type PartnerImpactParams = Record<string, string | string[] | undefined>;

export function parsePartnerImpactView(value: string | string[] | undefined): PartnerImpactView {
  const first = Array.isArray(value) ? value[0] : value;
  return PARTNER_IMPACT_VIEWS.find((view) => view === first) ?? 'outcomes';
}

export function partnerImpactHref(view: PartnerImpactView, params: PartnerImpactParams = {}, baseHref = PARTNER_IMPACT_PATH): string {
  const query = new URLSearchParams({ view });
  for (const [key, value] of Object.entries(params)) {
    if (key === 'view' || value == null) continue;
    for (const item of Array.isArray(value) ? value : [value]) query.append(key, item);
  }
  return `${baseHref}?${query.toString()}`;
}

export interface PartnerImpactCopy {
  title: string;
  description: string;
  navLabel: string;
  views: Record<PartnerImpactView, string>;
}

type ImpactCopyKey = 'impactWorkspaceTitle' | 'impactWorkspaceDescription' | 'impactWorkspaceViews'
  | 'impactWorkspaceOutcomes' | 'impactWorkspaceMilestones' | 'impactWorkspaceExports';

export function partnerImpactCopy(t: (key: ImpactCopyKey) => string): PartnerImpactCopy {
  return {
    title: t('impactWorkspaceTitle'),
    description: t('impactWorkspaceDescription'),
    navLabel: t('impactWorkspaceViews'),
    views: {
      outcomes: t('impactWorkspaceOutcomes'),
      milestones: t('impactWorkspaceMilestones'),
      exports: t('impactWorkspaceExports'),
    },
  };
}
