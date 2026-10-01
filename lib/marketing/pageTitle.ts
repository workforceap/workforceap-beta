/**
 * Public page `<title>` normalisation for the static marketing site.
 *
 * Most Astro pages pass a title that already ends in "— WorkforceAP" (or that
 * names the organization outright); a handful passed a bare title such as
 * "Terms of Service" or "Community & Employer Partners", so the browser tab,
 * search snippet and social card for those pages carried no brand at all
 * while their neighbours did. Layout.astro runs every title through here so
 * the brand suffix is consistent without touching each page.
 *
 * The separator follows the one the title already uses: a title written as
 * "A | B" gets "| WorkforceAP", everything else gets the site's em dash.
 */
export const MARKETING_BRAND_SUFFIX = 'WorkforceAP';

const BRAND_PATTERN = /workforce\s*ap\b|workforce advancement project/i;

export function hasBrand(title: string): boolean {
  return BRAND_PATTERN.test(title);
}

export function brandedPageTitle(title: string): string {
  const trimmed = title.trim().replace(/\s*[—|–-]\s*$/, '');
  if (!trimmed) return MARKETING_BRAND_SUFFIX;
  if (hasBrand(trimmed)) return trimmed;
  const separator = / \| /.test(trimmed) ? ' | ' : ' — ';
  return `${trimmed}${separator}${MARKETING_BRAND_SUFFIX}`;
}
