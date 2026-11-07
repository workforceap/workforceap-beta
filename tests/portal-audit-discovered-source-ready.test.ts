import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (...segments: string[]) => readFileSync(join(process.cwd(), ...segments), 'utf8');

function exerciseReadOnlyNavigationBody(): string {
  const source = read('scripts', 'audit-portal-routes.mjs');
  const start = source.indexOf('async function exerciseReadOnlyNavigation(');
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('\nasync function ', start + 1);
  return source.slice(start, end === -1 ? undefined : end);
}

describe('portal audit discovered-navigation source readiness', () => {
  it('waits for streamed route content before looking for record links or empty-state copy', () => {
    const body = exerciseReadOnlyNavigationBody();
    const ready = body.indexOf('await waitForPortalReady(page');
    const routeContent = body.indexOf('await waitForPortalRouteContent(page');
    const inspection = body.indexOf('const sourceInspection = await inspectPortalPage(');
    const anchor = body.indexOf('await findVisibleActionAnchor(');

    expect(ready).toBeGreaterThan(-1);
    expect(routeContent).toBeGreaterThan(ready);
    expect(inspection).toBeGreaterThan(routeContent);
    expect(anchor).toBeGreaterThan(routeContent);
  });

  it('keeps the route-content wait bounded and non-fatal so the final DOM still classifies failures', () => {
    const body = exerciseReadOnlyNavigationBody();
    expect(body).toMatch(/await waitForPortalRouteContent\(page, remainingTimeout\(5_000\)\)\.catch\(\(\) => \{\}\);/);
  });

  it('documents why: the employer jobs skeleton has neither a heading, a record link nor the declared empty text', () => {
    const skeleton = read('app', '(portal)', 'employer', 'jobs', 'loading.tsx');
    expect(skeleton).not.toMatch(/<h1\b/);
    expect(skeleton).not.toMatch(/<(a|Link)\b/);
    expect(skeleton).not.toContain('No jobs yet');
  });
});
