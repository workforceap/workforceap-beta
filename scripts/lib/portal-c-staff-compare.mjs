/** Parsers for staff-protection compare. Keep them free of Playwright so unit tests can lock the rules. */

const LOCALE_PREFIX = /^\/(en|es|fr|pt)(?=\/)/;
const DETAIL_ID = /^[a-zA-Z0-9_-]+$/;
const BLOCKED_DETAIL_SEGMENTS = new Set(['new', 'merge', 'duplicates', 'training']);

/**
 * First authorized `parent/<id>` path from roster links. Hash and query are
 * ignored so a message deep-link still counts as the member record.
 */
export function staffMemberDetailPathFromHrefs(parent, hrefs, trustedOrigin = 'https://fixture.invalid') {
  if (!['/admin/members', '/counselor/students'].includes(parent)) throw new Error('Unsupported staff collection');
  const prefix = `${parent}/`;
  for (const raw of hrefs) {
    if (!raw) continue;
    let pathname = raw;
    try {
      const url = new URL(raw, trustedOrigin);
      if (url.origin !== trustedOrigin || raw.includes('\\')) continue;
      pathname = url.pathname;
    } catch {
      continue;
    }
    pathname = pathname.replace(LOCALE_PREFIX, '');
    if (!pathname.startsWith(prefix)) continue;
    const id = pathname.slice(prefix.length);
    if (DETAIL_ID.test(id) && !BLOCKED_DETAIL_SEGMENTS.has(id)) return `${parent}/${id}`;
  }
  return undefined;
}

/**
 * Counselor roster rows are clickable cards, not `<a href>`. After hydration
 * the authorized member id still sits in the RSC payload as `"memberId":"…"`.
 */
export function staffMemberDetailPathFromHtml(parent, html, trustedOrigin = 'https://fixture.invalid') {
  const fromHref = staffMemberDetailPathFromHrefs(
    parent,
    [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]),
    trustedOrigin,
  );
  if (fromHref) return fromHref;
  const id = html.match(/"memberId":"([a-zA-Z0-9_-]+)"/)?.[1]
    ?? html.match(/\\"memberId\\":\\"([a-zA-Z0-9_-]+)\\"/)?.[1]
    ?? html.match(/\\u0022memberId\\u0022:\\u0022([a-zA-Z0-9_-]+)\\u0022/)?.[1];
  return id ? `${parent}/${id}` : undefined;
}

export function resolveStaffMemberDetailPath(parent, hrefs, html, trustedOrigin = 'https://fixture.invalid') {
  return staffMemberDetailPathFromHrefs(parent, hrefs, trustedOrigin) ?? staffMemberDetailPathFromHtml(parent, html, trustedOrigin);
}
