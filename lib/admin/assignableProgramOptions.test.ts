import assert from 'node:assert/strict';
import test from 'node:test';
import { PROGRAMS, getProgramBySlug } from '@/lib/content/programs';
import {
  buildAssignableProgramOptions,
  buildMemberProgramOptions,
} from './assignableProgramOptions';

test('bulk assignment choices come from the active catalog, not current-page enrollments', () => {
  const assignable = PROGRAMS.find((program) => !program.curriculumMigrationPending);
  const paused = PROGRAMS.find((program) => program.curriculumMigrationPending);

  assert.ok(assignable);
  assert.ok(paused);

  const result = buildAssignableProgramOptions([
    { slug: paused.slug },
    { slug: assignable.slug },
    { slug: assignable.slug },
    { slug: 'tenant-row-without-a-canonical-program' },
  ]);

  assert.deepEqual(result, [{ slug: assignable.slug, title: assignable.title }]);
});

test('single-member choices hide paused curricula except the current enrollment', () => {
  const assignable = PROGRAMS.find((program) => !program.curriculumMigrationPending);
  const paused = PROGRAMS.find((program) => program.curriculumMigrationPending);

  assert.ok(assignable);
  assert.ok(paused);

  const catalog = [
    { slug: paused.slug, name: 'Tenant paused title', status: 'active' },
    { slug: assignable.slug, name: 'Tenant active title', status: 'active' },
    { slug: 'tenant-row-without-a-canonical-program', name: 'Unknown' },
  ];

  assert.deepEqual(buildMemberProgramOptions(catalog, null), [
    {
      slug: assignable.slug,
      name: assignable.title,
      status: 'active',
      curriculumMigrationPending: false,
    },
  ]);

  assert.deepEqual(
    buildMemberProgramOptions(catalog, paused.slug).find((option) => option.slug === paused.slug),
    {
      slug: paused.slug,
      name: paused.title,
      status: 'active',
      curriculumMigrationPending: true,
    },
  );
});

test('single-member choices hide inactive catalog rows except the current program', () => {
  const programs = PROGRAMS.filter((program) => !program.curriculumMigrationPending).slice(0, 2);
  assert.equal(programs.length, 2);

  const catalog = programs.map((program) => ({
    slug: program.slug,
    name: program.title,
    status: 'inactive',
  }));

  assert.deepEqual(buildMemberProgramOptions(catalog, null), []);
  assert.deepEqual(buildMemberProgramOptions(catalog, programs[0].slug), [
    {
      slug: programs[0].slug,
      name: programs[0].title,
      status: 'inactive',
      curriculumMigrationPending: false,
    },
  ]);
});

test('single-member choices use canonical titles, not stale tenant catalog names', () => {
  // Names as seeded into organization_program_catalog before the August 2026
  // program renames (what staff saw in the admin "Change program" dropdown).
  const staleCatalog = [
    { slug: 'digital-literacy-empowerment-class', name: 'Digital Literacy Empowerment Class', status: 'active' },
    { slug: 'ai-practitioner-professional-certificate-aws', name: 'AI Professional Developer Certificate (IBM)', status: 'active' },
    { slug: 'aws-cloud-technology-amazon', name: 'AWS Cloud Technology (Amazon)', status: 'active' },
    { slug: 'core-construction-training-certificate', name: 'Construction Readiness Certificate (OSHA-10)', status: 'active' },
    { slug: 'certified-logistics-technician-clt', name: 'Logistics and Supply Chain Certificate (CLT)', status: 'active' },
    { slug: 'health-information-technology-mchit', name: 'Medical Coding & Health Information Technology (MCHIT)', status: 'active' },
  ];

  const options = buildMemberProgramOptions(staleCatalog, null);
  const names = options.map((option) => option.name);
  for (const stale of staleCatalog) {
    assert.ok(!names.includes(stale.name), `stale title still offered: ${stale.name}`);
  }
  for (const option of options) {
    assert.equal(option.name, getProgramBySlug(option.slug)?.title);
  }
  // Production rows keep the canonical slug with an old display name.
  assert.ok(options.some((option) => option.slug === 'ai-practitioner-professional-certificate-aws'));
});

test('single-member choices keep a current program that left the catalog, disabled', () => {
  const [inCatalog, dropped] = PROGRAMS.filter((program) => !program.curriculumMigrationPending);
  assert.ok(inCatalog && dropped);
  const catalog = [{ slug: inCatalog.slug, name: inCatalog.title, status: 'active' }];

  assert.deepEqual(
    buildMemberProgramOptions(catalog, dropped.slug).find((option) => option.slug === dropped.slug),
    {
      slug: dropped.slug,
      name: dropped.title,
      status: 'not in catalog',
      curriculumMigrationPending: false,
    },
  );

  assert.deepEqual(
    buildMemberProgramOptions(catalog, 'retired-program-slug').find(
      (option) => option.slug === 'retired-program-slug',
    ),
    {
      slug: 'retired-program-slug',
      name: 'retired-program-slug',
      status: 'retired',
      curriculumMigrationPending: false,
    },
  );
});
