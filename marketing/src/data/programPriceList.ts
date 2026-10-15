import type { Program } from './programs';

/** Catalog/provider estimates are not evidence for official funder price-list facts. */
export function verifiedProgramPriceRows(programs: readonly Program[]) {
  return programs.flatMap((program) => {
    const terms = program.syllabus ?? (
      program.curriculum?.status === 'owner-verified' ? program.curriculum : null
    );
    if (!terms) return [];
    return [{
      slug: program.slug,
      title: program.title,
      duration: `${terms.totalHours} hours • ${terms.deliveryFormat}`,
      contactHours: terms.totalHours,
      maximumProgramCost: terms.tuitionAndFees,
    }];
  }).sort((a, b) => a.title.localeCompare(b.title));
}
