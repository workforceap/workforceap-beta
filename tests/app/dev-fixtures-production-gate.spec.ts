import { afterEach, describe, expect, it, vi } from 'vitest';
import { devLayoutModules, devPageModules, type DevModuleLoader as Loader } from '../devFixturePages';

/**
 * Every `/dev/*` page is a credential-free fixture: synthetic data, preview-only
 * actions, no auth. None of them may ever render in production. The repo's
 * production signal is `VERCEL_ENV === 'production'` (the same one the staff MFA
 * policy uses); `/dev/staff/people` is stricter and renders in `next dev` only.
 *
 * This spec loads every page under `app/dev` with that signal set and requires a
 * `notFound()` (Next's 404 digest) from the page itself or, for the Astryx
 * showcase, from its layout. A future fixture added without a gate fails here
 * instead of shipping to production.
 *
 * The pages are enumerated by tests/devFixturePages.ts, so this is a behavioural
 * test (it runs each page), not a read of application source text.
 */

const pageModules = devPageModules;
const layoutModules = devLayoutModules;

const DEV_ROOT = '/app/dev';
const pageFiles = Object.keys(pageModules).sort();

const NOT_FOUND_DIGEST = /^NEXT_(HTTP_ERROR_FALLBACK;404|NOT_FOUND)$/;

async function renders404(load: Loader): Promise<boolean> {
  const mod = await load();
  if (typeof mod.default !== 'function') return false;
  try {
    await mod.default({
      children: null,
      params: Promise.resolve({}),
      searchParams: Promise.resolve({}),
    });
    return false;
  } catch (error) {
    return NOT_FOUND_DIGEST.test(String((error as { digest?: unknown })?.digest ?? ''));
  }
}

/** The page, then each ancestor layout up to app/dev, nearest first. */
function gateCandidates(pageFile: string): Loader[] {
  const candidates: Loader[] = [pageModules[pageFile]];
  let dir = pageFile.slice(0, pageFile.lastIndexOf('/'));
  while (dir.startsWith(DEV_ROOT)) {
    const layout = layoutModules[`${dir}/layout.tsx`];
    if (layout) candidates.push(layout);
    dir = dir.slice(0, dir.lastIndexOf('/'));
  }
  return candidates;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/dev fixtures are unreachable in production', () => {
  const label = (file: string) => file.slice(1);

  it('covers the member, staff and standalone fixture pages', () => {
    const pages = pageFiles.map(label);
    expect(pages.length).toBeGreaterThan(60);
    expect(pages).toContain('app/dev/member/missions/page.tsx');
    expect(pages).toContain('app/dev/member/progress/page.tsx');
    expect(pages).toContain('app/dev/staff/employer-command/page.tsx');
  });

  it.each(pageFiles.map((file) => [label(file), file] as const))(
    '%s answers 404 when VERCEL_ENV is production',
    async (name, file) => {
      vi.stubEnv('VERCEL_ENV', 'production');
      let gated = false;
      for (const candidate of gateCandidates(file)) {
        if (await renders404(candidate)) {
          gated = true;
          break;
        }
      }
      expect(gated, `${name} (or an ancestor layout) must call notFound() in production`).toBe(true);
    },
    120_000,
  );
});
