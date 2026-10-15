import { describe, expect, it } from 'vitest';
import { PROGRAMS, type Program } from '../../marketing/src/data/programs';
import { verifiedProgramPriceRows } from '../../marketing/src/data/programPriceList';

describe('official program price-list publication', () => {
  it('publishes only the twelve supplied syllabi and excludes all unsupported or draft facts', () => {
    const rows = verifiedProgramPriceRows(PROGRAMS);
    expect(rows).toHaveLength(12);
    expect(rows.map((row) => row.slug).sort()).toEqual(PROGRAMS.filter((program) => program.syllabus).map((program) => program.slug).sort());
    expect(rows.some((row) => row.slug === 'digital-literacy-empowerment-class')).toBe(false);
    expect(rows.every((row) => [160, 200].includes(row.contactHours) && row.maximumProgramCost === 7500)).toBe(true);
  });

  it('takes approved hours, delivery and tuition from the supplied source rather than provider estimates', () => {
    const supplied = PROGRAMS.find((program) => program.syllabus)!;
    const fixture = { ...supplied, duration: 'unverified duration', courses: [], syllabus: { ...supplied.syllabus!, totalHours: 160, deliveryFormat: 'Source delivery format', tuitionAndFees: 1234 } };
    const [row] = verifiedProgramPriceRows([fixture]);
    expect(row).toMatchObject({ contactHours: 160, duration: '160 hours • Source delivery format', maximumProgramCost: 1234 });
  });

  it('requires explicit owner verification before an authored curriculum can contribute official terms', () => {
    const draft = PROGRAMS.find((program) => program.curriculum)!;
    expect(verifiedProgramPriceRows([draft])).toEqual([]);
    const verified: Program = { ...draft, courses: [], curriculum: { ...draft.curriculum!, status: 'owner-verified', tuitionAndFees: 2345 } };
    expect(verifiedProgramPriceRows([verified])[0]).toMatchObject({ contactHours: verified.curriculum!.totalHours, maximumProgramCost: 2345 });
  });
});
