export type ActiveNavLink = {
  href: string;
  aliases?: string[];
  /**
   * Match the href (and aliases) only on the exact pathname. Set on portal
   * roots such as `/dashboard`, `/employer`, `/partner` and `/admin`: as a
   * prefix they would claim every route in the portal, so a member page with
   * no rail item of its own (`/dashboard/eligibility`, `/dashboard/points`, …)
   * used to light up "Home" as the current page.
   */
  exact?: boolean;
};

/**
 * The current page's query string, as `useSearchParams()` returns it. Only
 * links whose href (or alias) carries a query string read it.
 */
export type ActiveNavSearch = Pick<URLSearchParams, 'get'> | null | undefined;

function matchesPrefix(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * A candidate with a query string (`/admin/command-center?queue=applications`)
 * matches only when the page URL carries every one of those parameters with
 * the same value. Other parameters on the page (`page=2`, `ui=legacy`) do not
 * matter, and without `search` such a candidate never matches. So one rail
 * row can own one queue of a shared workbench route without claiming the
 * other queues or the bare route (WAP-190).
 */
function matchesQuery(query: string, search: ActiveNavSearch): boolean {
  for (const [key, value] of new URLSearchParams(query)) {
    if (search?.get(key) !== value) return false;
  }
  return true;
}

function matches(pathname: string, candidate: string, exact: boolean, search: ActiveNavSearch): boolean {
  const queryStart = candidate.indexOf('?');
  const path = queryStart === -1 ? candidate : candidate.slice(0, queryStart);
  const pathMatches = exact ? pathname === path : matchesPrefix(pathname, path);
  return pathMatches && (queryStart === -1 || matchesQuery(candidate.slice(queryStart + 1), search));
}

export function isActiveRoute(
  pathname: string,
  href: string,
  aliases: string[] = [],
  exact = false,
  search?: ActiveNavSearch,
): boolean {
  return [href, ...aliases].some((candidate) => matches(pathname, candidate, exact, search));
}

/**
 * The rail item to mark `aria-current`: the longest href or alias that
 * matches the pathname (and, for a candidate with a query string, the
 * `search` parameters it names) wins; an `exact` link only competes on its
 * own pathname; and when nothing matches the result is null, so a route
 * without a rail item marks nothing current rather than falling back to the
 * root.
 */
export function getBestActiveHref(pathname: string, links: ActiveNavLink[], search?: ActiveNavSearch): string | null {
  let bestHref: string | null = null;
  let bestLength = -1;
  for (const link of links) {
    for (const candidate of [link.href, ...(link.aliases ?? [])]) {
      if (matches(pathname, candidate, link.exact === true, search) && candidate.length > bestLength) {
        bestHref = link.href;
        bestLength = candidate.length;
      }
    }
  }
  return bestHref;
}
