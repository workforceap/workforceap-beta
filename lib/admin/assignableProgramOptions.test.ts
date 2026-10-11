import assert from 'node:assert/strict';
import test from 'node:test';
import { PROGRAMS, getProgramBySlug } from '@/lib/content/programs';
import { PROGRAM_SLUG_ALIASES } from '@/lib/content/programSlug';
import {
  buildAssignableProgramOptions,
  buildMemberProgramOptions,
  CATALOG_REPAIR_STATUS,
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

// ---- WAP-286: alias-only tenant catalog rows --------------------------------

/** A legacy alias whose canonical program exists and is assignable. */
function assignableAlias() {
  for (const [alias, canonical] of Object.entries(PROGRAM_SLUG_ALIASES)) {
    const program = PROGRAMS.find((p) => p.slug === canonical);
    if (program && !program.curriculumMigrationPending && getProgramBySlug(alias)?.slug === canonical) {
      return { alias, program };
    }
  }
  throw new Error('no assignable aliased program in the catalog');
}

test('WAP-286: an active alias-only row is shown as needing catalog repair, never as assignable', () => {
  const { alias, program } = assignableAlias();
  const catalog = [{ slug: alias, name: 'Old tenant title', status: 'active' }];

  assert.deepEqual(buildMemberProgramOptions(catalog, null), [
    { slug: program.slug, name: program.title, status: CATALOG_REPAIR_STATUS, curriculumMigrationPending: false },
  ]);
  assert.deepEqual(buildAssignableProgramOptions([{ slug: alias }]), []);
});

test('WAP-286: an exact canonical row wins over an alias row for the same program', () => {
  const { alias, program } = assignableAlias();
  for (const [exactStatus, expected] of [['active', 'active'], ['inactive', undefined]] as const) {
    const catalog = [
      { slug: alias, name: 'Old tenant title', status: 'active' },
      { slug: program.slug, name: 'Tenant title', status: exactStatus },
    ];
    const option = buildMemberProgramOptions(catalog, null).find((o) => o.slug === program.slug);
    assert.equal(option?.status, expected, `exact row ${exactStatus}`);
  }
  assert.deepEqual(buildAssignableProgramOptions([{ slug: alias }, { slug: program.slug }]), [
    { slug: program.slug, title: program.title },
  ]);
});

test('WAP-286: inactive alias rows stay hidden, and a current alias-only program is shown needing repair', () => {
  const { alias, program } = assignableAlias();
  assert.deepEqual(buildMemberProgramOptions([{ slug: alias, name: 'x', status: 'inactive' }], null), []);
  assert.deepEqual(buildMemberProgramOptions([{ slug: alias, name: 'x', status: 'active' }], program.slug), [
    { slug: program.slug, name: program.title, status: CATALOG_REPAIR_STATUS, curriculumMigrationPending: false },
  ]);
});

/**
 * The writers' contract (PATCH /api/admin/members/[id]/program and
 * bulk-update): an explicit catalog must have an active row with exactly the
 * canonical slug; an empty catalog falls back to the static catalog. Paused
 * curricula are refused either way.
 */
function writerAccepts(catalog: Array<{ slug: string; status?: string }>, canonical: string) {
  const program = PROGRAMS.find((p) => p.slug === canonical);
  if (!program || program.curriculumMigrationPending) return false;
  return catalog.length === 0 || catalog.some((row) => row.slug === canonical && row.status === 'active');
}

test('WAP-286 parity: the pickers mark assignable exactly what the writers accept', () => {
  const { alias, program: aliased } = assignableAlias();
  const [a, b] = PROGRAMS.filter((p) => !p.curriculumMigrationPending && p.slug !== aliased.slug);
  const paused = PROGRAMS.find((p) => p.curriculumMigrationPending)!;
  const catalogs: Array<Array<{ slug: string; name: string; status: string }>> = [
    [{ slug: alias, name: 'alias', status: 'active' }],
    [{ slug: alias, name: 'alias', status: 'active' }, { slug: aliased.slug, name: 'exact', status: 'active' }],
    [{ slug: alias, name: 'alias', status: 'active' }, { slug: aliased.slug, name: 'exact', status: 'inactive' }],
    [{ slug: a.slug, name: 'a', status: 'active' }, { slug: b.slug, name: 'b', status: 'inactive' }],
    [{ slug: paused.slug, name: 'paused', status: 'active' }, { slug: a.slug, name: 'a', status: 'active' }],
    [{ slug: a.slug.toUpperCase(), name: 'case variant', status: 'active' }],
    [{ slug: a.title, name: 'title as slug', status: 'active' }],
  ];
  for (const catalog of catalogs) {
    for (const current of [null, aliased.slug, a.slug, paused.slug]) {
      const member = buildMemberProgramOptions(catalog, current);
      const bulk = buildAssignableProgramOptions(catalog.filter((row) => row.status === 'active'));
      for (const program of PROGRAMS) {
        const accepted = writerAccepts(catalog, program.slug);
        const memberOption = member.find((o) => o.slug === program.slug);
        const memberAssignable = Boolean(memberOption && !memberOption.curriculumMigrationPending
          && (!memberOption.status || memberOption.status === 'active'));
        const label = `${JSON.stringify(catalog.map((r) => [r.slug, r.status]))} current=${current} program=${program.slug}`;
        assert.equal(memberAssignable, accepted, `member picker: ${label}`);
        assert.equal(bulk.some((o) => o.slug === program.slug), accepted, `bulk picker: ${label}`);
      }
    }
  }
});
