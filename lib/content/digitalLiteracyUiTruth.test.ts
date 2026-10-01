import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('Digital Literacy provider and completion truth', () => {
  it('shows attribution, license, fallback status, and local completion boundaries in the member module', () => {
    const source = read('app/(portal)/dashboard/learning/modules/[courseSlug]/page.tsx');
    assert.match(source, /Provider and license/);
    assert.match(source, /course\.provider\.license\.url/);
    assert.match(source, /provider terms/);
    assert.match(source, /does not copy, host, adapt, or imply endorsement/);
    assert.match(source, /WorkforceApModuleLessons/);
    assert.match(source, /Mark module complete in WorkforceAP/);
    assert.match(source, /does not verify DigitalLearn activity or issue a DigitalLearn certificate/);
    assert.match(source, /\/dashboard\/certifications/);
  });

  it('makes DigitalLearn destinations kit CTAs instead of title hyperlinks', () => {
    const source = read('app/(portal)/dashboard/learning/modules/[courseSlug]/page.tsx');
    const lessons = read('components/portal/WorkforceApModuleLessons.tsx');
    const complete = read('components/portal/WorkforceApModuleCompleteButton.tsx');
    assert.match(source, /WorkforceApModuleLessons/);
    assert.doesNotMatch(source, /style=\{\{ fontWeight: 700 \}\}/);
    assert.match(lessons, /Start this lesson/);
    assert.match(lessons, /Open this lesson/);
    assert.match(lessons, /wa-kit-cta--ghost/);
    assert.match(lessons, /wa-kit-cta/);
    assert.match(lessons, /target="_blank"/);
    assert.match(complete, /wa-kit-cta--ghost/);
    assert.doesNotMatch(complete, /btn-primary/);
  });

  it('shows the same attribution and provider-progress boundary on the public program page', () => {
    const source = read('marketing/src/pages/programs/[slug].astro');
    assert.match(source, /Course provider and license/);
    assert.match(source, /linkedContentProvider\.license\.url/);
    assert.match(source, /Provider-side progress and certificates are not synced or promised/);
  });

  it('does not retain the previously unsupported printable-certificate promise', () => {
    for (const path of [
      'shared/digitalLiteracyPathway.ts',
      'lib/content/programEnrollmentSteps.ts',
      'app/(portal)/dashboard/learning/modules/[courseSlug]/page.tsx',
    ]) {
      assert.doesNotMatch(read(path), /printable certificate|lets you print a certificate/i, path);
    }
  });

  it('gives unenrolled members an ungated Digital Literacy start', () => {
    const learning = read('app/(portal)/dashboard/learning/page.tsx');
    const program = read('app/(portal)/dashboard/program/page.tsx');
    assert.match(learning, /digitalLiteracyFirstModuleHref/);
    // The label moved into messages (`empty.learningPathway.action`) with the
    // empty-state consolidation; the page reads it through next-intl.
    assert.match(learning, /learningPathway\.action/);
    const en = JSON.parse(read('messages/en.json')) as { empty: { learningPathway: { action: string } } };
    assert.equal(en.empty.learningPathway.action, 'Start digital basics, no application needed');
    assert.match(program, /workforceApProgram/);
    assert.match(program, /workforceApProgram \|\| isNext/);
  });
});
