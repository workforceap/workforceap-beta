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

function matchesPrefix(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function matches(pathname: string, candidate: string, exact: boolean): boolean {
  return exact ? pathname === candidate : matchesPrefix(pathname, candidate);
}

export function isActiveRoute(pathname: string, href: string, aliases: string[] = [], exact = false): boolean {
  return [href, ...aliases].some((candidate) => matches(pathname, candidate, exact));
}

/**
 * The rail item to mark `aria-current`: the longest href or alias that
 * matches the pathname wins; an `exact` link only competes on its own
 * pathname; and when nothing matches the result is null, so a route without
 * a rail item marks nothing current rather than falling back to the root.
 */
export function getBestActiveHref(pathname: string, links: ActiveNavLink[]): string | null {
  let bestHref: string | null = null;
  let bestLength = -1;
  for (const link of links) {
    for (const candidate of [link.href, ...(link.aliases ?? [])]) {
      if (matches(pathname, candidate, link.exact === true) && candidate.length > bestLength) {
        bestHref = link.href;
        bestLength = candidate.length;
      }
    }
  }
  return bestHref;
}
