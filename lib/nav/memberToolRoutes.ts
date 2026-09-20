import { Sparkles } from 'lucide-react';
import type { PortalNavItem } from './portalNav';

/**
 * Canonical member toolkit hub. Product copy calls this surface **Career
 * Studio** (`ToolkitToolChrome` kicker + "Back to AI Career Tools" on every tool
 * page, `MemberHomeKit` CTA), so the rail uses the same noun.
 */
export const MEMBER_TOOLKIT_HUB_HREF = '/dashboard/ai-tools';
export const MEMBER_TOOLKIT_HUB_LABEL = 'AI Career Tools';

/** Route prefix every AI Career Tools tool lives under. */
const TOOL_ROUTE_PREFIX = `${MEMBER_TOOLKIT_HUB_HREF}/`;

/**
 * Rail labels for the AI Career Tools tools, keyed by the first path segment
 * under `/dashboard/ai-tools/`. These mirror each tool's on-page
 * `ToolkitToolChrome` title so the rail row and the page heading agree.
 *
 * A slug missing from this map still gets a contextual row — see
 * `humanizeToolSlug` — so a newly added tool route is highlighted correctly
 * the day it ships, without a nav change.
 */
const MEMBER_TOOL_LABELS: Record<string, string> = {
  'benefits-cliff': 'Benefits cliff',
  'career-business-coach': 'Career & business coach',
  'cover-letter': 'Cover letter',
  'elevator-pitch': 'Elevator pitch',
  'gap-analyzer': 'Gap analyzer',
  history: 'My AI results',
  'interview-coach': 'Interview coach',
  'interview-practice': 'Interview practice',
  'interview-prep': 'Interview prep',
  'job-match-scorer': 'Job match scorer',
  'linkedin-about': 'LinkedIn About',
  'linkedin-headline': 'LinkedIn headline',
  'readiness-coach': 'Readiness coach',
  'resume-analysis': 'Resume analysis',
  'resume-coach': 'Resume coach',
  'resume-rewriter': 'Resume rewriter',
  'resume-studio': 'Resume studio',
  'salary-negotiation': 'Salary negotiation',
  'skill-checkpoints': 'Skill checkpoints',
  'skill-mapper': 'Skill mapper',
  'training-bridge': 'Training bridge',
  'voice-interview': 'Voice interview',
};

/** `interview-practice` → `Interview practice`. Fallback for unmapped slugs. */
export function humanizeToolSlug(slug: string): string {
  const words = slug.replace(/[-_]+/g, ' ').trim();
  if (!words) return '';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The AI Career Tools tool slug the pathname sits inside, or `null` for the hub
 * itself and every non-toolkit route. Locale prefixes must already be stripped
 * (WorkspaceShell does this before calling).
 */
export function memberToolSlugForPath(pathname: string): string | null {
  if (!pathname) return null;
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (!clean.startsWith(TOOL_ROUTE_PREFIX)) return null;
  const slug = clean.slice(TOOL_ROUTE_PREFIX.length).split('/')[0] ?? '';
  return slug.length > 0 ? slug : null;
}

/**
 * The single contextual rail row for the tool the member is currently inside.
 *
 * Returns at most one item, always — the rail shows the tool you are in and
 * nothing else from the ~22 AI Career Tools tools. `claimedHrefs` carries the
 * hrefs and aliases already owned by permanent rail entries (Job applications
 * owns `/dashboard/ai-tools/application-tracker`, the hub owns
 * `/dashboard/ai-tools/studio`), so those routes keep highlighting their own
 * row instead of growing a duplicate.
 */
export function memberContextualToolItem(
  pathname: string,
  claimedHrefs: ReadonlySet<string>,
): PortalNavItem | null {
  const slug = memberToolSlugForPath(pathname);
  if (!slug) return null;
  const href = `${TOOL_ROUTE_PREFIX}${slug}`;
  if (claimedHrefs.has(href)) return null;
  const label = MEMBER_TOOL_LABELS[slug] ?? humanizeToolSlug(slug);
  if (!label) return null;
  return {
    href,
    label,
    group: 'primary',
    tab: 'me',
    Icon: Sparkles,
    nestedUnder: MEMBER_TOOLKIT_HUB_HREF,
  };
}

/** Every href/alias already owned by a permanent rail entry. */
export function claimedNavHrefs(items: readonly PortalNavItem[]): Set<string> {
  const claimed = new Set<string>();
  for (const item of items) {
    claimed.add(item.href);
    for (const alias of item.aliases ?? []) claimed.add(alias);
  }
  return claimed;
}

/**
 * The permanent rail items plus, when the member is inside a tool, exactly one
 * extra row for that tool, inserted directly under the AI Career Tools entry.
 * On the hub itself — and on every non-toolkit route — the list is unchanged.
 */
export function withContextualToolRow(
  items: PortalNavItem[],
  pathname: string,
): { items: PortalNavItem[]; toolItem: PortalNavItem | null } {
  const toolItem = memberContextualToolItem(pathname, claimedNavHrefs(items));
  if (!toolItem) return { items, toolItem: null };
  const hubIndex = items.findIndex((item) => item.href === MEMBER_TOOLKIT_HUB_HREF);
  if (hubIndex === -1) return { items: [...items, toolItem], toolItem };
  const next = [...items];
  next.splice(hubIndex + 1, 0, toolItem);
  return { items: next, toolItem };
}
