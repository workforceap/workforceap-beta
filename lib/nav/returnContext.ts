import { splitLocalePrefix } from '@/lib/i18n/config';

const LOCAL_ORIGIN = 'https://portal.workforceap.invalid';
const MAX_RETURN_LENGTH = 2000;

/** Only list/workspace destinations may be carried through a record. */
const WORKSPACE_PATHS = new Set([
  '/dashboard', '/dashboard/jobs', '/dashboard/job-applications', '/dashboard/resume',
  '/dashboard/ai-tools', '/dashboard/ai-tools/history', '/dashboard/learning', '/dashboard/program',
  '/admin', '/admin/today', '/admin/students', '/admin/members', '/admin/applications',
  '/admin/interview-ready', '/admin/job-ready', '/admin/members/interview-ready', '/admin/members/job-ready', '/admin/training-progress', '/admin/placements',
  '/admin/command-center', '/admin/reporting', '/admin/notifications', '/admin/sessions',
  '/counselor', '/counselor/today', '/counselor/overview', '/counselor/students',
  '/counselor/inbox', '/counselor/inbox-zero', '/counselor/queue', '/counselor/triage',
  '/counselor/at-risk', '/counselor/inactive-members', '/counselor/placements', '/counselor/notifications',
  '/counselor/sessions', '/counselor/lab-reviews',
  '/employer', '/employer/jobs', '/employer/candidates', '/employer/applications',
  '/employer/matches', '/employer/pipeline', '/employer/work-queue',
  '/partner', '/partner/members', '/partner/referred-members', '/partner/attention',
  '/partner/impact', '/partner/outcomes', '/partner/milestones', '/partner/exports',
]);

function localUrl(value: unknown): URL | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')
    || value.length > MAX_RETURN_LENGTH || /[\\\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const parsed = new URL(value, LOCAL_ORIGIN);
    if (parsed.origin !== LOCAL_ORIGIN || /%2f|%5c|%00|%0[ad]/i.test(parsed.pathname)) return null;
    return parsed;
  } catch { return null; }
}

function scope(pathname: string) {
  return splitLocalePrefix(pathname).pathnameWithoutLocale.split('/')[1];
}

function workspaceUrl(value: unknown, expectedScope: string | undefined): URL | null {
  const parsed = localUrl(value);
  if (!parsed || scope(parsed.pathname) !== expectedScope) return null;
  const path = splitLocalePrefix(parsed.pathname).pathnameWithoutLocale.replace(/\/$/, '') || '/';
  if (!WORKSPACE_PATHS.has(path) && !/^\/employer\/jobs\/[A-Za-z0-9_-]+\/applicants$/.test(path)) return null;
  // Do not recursively carry older return destinations through a new list.
  if (parsed.searchParams.has('returnTo')) parsed.searchParams.delete('returnTo');
  return parsed;
}

function relative(url: URL) { return `${url.pathname}${url.search}${url.hash}`; }

/** Same-portal, same-origin list context. This never grants record access. */
export function resolvePortalReturnTo(candidate: unknown, fallback: string): string {
  const fallbackUrl = localUrl(fallback);
  if (!fallbackUrl) return '/dashboard';
  const accepted = workspaceUrl(candidate, scope(fallbackUrl.pathname));
  return accepted ? relative(accepted) : relative(fallbackUrl);
}

/** Preserve filters, paging and selected view when opening an existing record. */
export function withPortalReturnTo(href: string, returnTo: string): string {
  const destination = localUrl(href);
  if (!destination) return href;
  const origin = workspaceUrl(returnTo, scope(destination.pathname));
  if (!origin) return href;
  destination.searchParams.set('returnTo', relative(origin));
  const locale = splitLocalePrefix(origin.pathname).locale;
  if (locale && !splitLocalePrefix(destination.pathname).locale) destination.pathname = `/${locale}${destination.pathname}`;
  return relative(destination);
}
