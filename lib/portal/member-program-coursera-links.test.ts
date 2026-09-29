import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const programPage = fs.readFileSync(
  path.join(process.cwd(), 'app/(portal)/dashboard/program/page.tsx'),
  'utf8',
);
const programKit = fs.readFileSync(
  path.join(process.cwd(), 'components/portal/kit/pages/member/MemberProgramKit.tsx'),
  'utf8',
);

test('live program CTAs launch the selected Coursera course and keep Learning Hub separate', () => {
  assert.match(programPage, /getActiveProgramForDashboard/);
  assert.match(programPage, /const enrolledSlug = activeProgramView\.activeProgramSlug/);
  assert.doesNotMatch(programPage, /const enrolledSlug = dbUser\?\.enrolledProgram/);
  assert.match(programPage, /slug:\s*c\.slug/);
  assert.match(
    programPage,
    /launchHref:\s*launchableCourseSlugs\.has\(c\.slug\)[\s\S]{0,160}courseraLaunchHref\(c\.slug\)/,
  );
  assert.match(programPage, /courseraLaunchHref=\{nextCourseLaunchHref\}/);
  assert.match(programPage, /resumeHref="\/dashboard\/learning"/);
  assert.match(programPage, /const launchableCourseSlugs = new Set/);
  assert.match(programPage, /launchableCourseSlugs\.has\(nextCourseSlug\)/);
  assert.match(programPage, /launchableCourseSlugs\.has\(c\.slug\)/);

  assert.match(
    programKit,
    /import TrackedCourseraLaunchLink from ['"]@\/components\/portal\/TrackedCourseraLaunchLink['"]/,
  );
  assert.match(
    programKit,
    /courseraLaunchHref\s*\?\s*\(\s*<TrackedCourseraLaunchLink\s+href=\{courseraLaunchHref\}/,
  );
  assert.match(
    programKit,
    /isActive && m\.launchHref \? \(/,
  );
  assert.match(
    programKit,
    /<TrackedCourseraLaunchLink\s+href=\{moduleHref\}/,
  );
  assert.match(
    programKit,
    />Modules<\/h3>[\s\S]{0,500}href=\{resumeHref\}[\s\S]{0,300}>\s*Learning Hub/,
  );
});

/**
 * A WorkforceAP-authored pathway (e.g. the DigitalLearn-linked Digital Literacy
 * course) has no Coursera launch for any course, so its module CTA used to fall
 * through to the Learning Hub anchor — a page with no module content — and the
 * member never reached the provider lesson.
 */
test('a WorkforceAP-authored module carries its in-platform destination', () => {
  // The page supplies it, through the shared helper rather than a second
  // hand-built copy of the same URL.
  assert.match(
    programPage,
    /import \{[^}]*workforceApCourseHref[^}]*\} from ['"]@\/lib\/content\/courseDelivery['"]/,
  );
  assert.match(
    programPage,
    /moduleHref:\s*isWorkforceApCourse\(c\)[\s\S]{0,120}workforceApCourseHref\(c\.slug,\s*enrolledSlug\)/,
  );
  assert.doesNotMatch(
    programPage,
    /moduleHref:\s*`\/dashboard\/learning\/modules\//,
    'build the module URL through workforceApCourseHref so the two call sites cannot drift',
  );

  // …and the kit prefers it over the Learning Hub anchor fallback.
  assert.match(
    programKit,
    /const moduleHref =\s*\n\s*m\.launchHref\s*\n?\s*\?\?\s*m\.moduleHref\s*\n?\s*\?\?\s*\(m\.slug/,
  );
});
