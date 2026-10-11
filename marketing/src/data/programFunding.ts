/**
 * Display-only funding correction from the owner's October 8, 2026 catalog mail.
 * The numbered exclusions are 0 (Digital Literacy), 1 (Admin Assistant),
 * 14 (CPT) and 15 (CLT). Literacy retains its separate grant claim; Admin
 * Assistant is not yet in the source catalog. Never infer enrollment eligibility
 * or alter operational fundingSource values from these public labels.
 */
const FUNDING_REQUIRES_CONFIRMATION = new Set([
  'certified-production-technician-cpt',
  'certified-logistics-technician-clt',
]);

type FundingProgram = { slug: string; fundingSource?: string };

export function publicProgramFundingLabel(program: FundingProgram): string {
  if (FUNDING_REQUIRES_CONFIRMATION.has(program.slug)) return 'Funding confirmation required';
  const source = program.fundingSource ?? 'WIOA';
  return source === 'WIOA' ? 'WIOA/Grant' : source;
}

export function publicProgramFundingCopy(program: FundingProgram): string {
  if (FUNDING_REQUIRES_CONFIRMATION.has(program.slug)) {
    return 'Ask an advisor to confirm available funding and any costs before enrollment.';
  }
  return program.fundingSource
    ? `Available at no cost through ${program.fundingSource} funding for qualifying members.`
    : 'No-cost training for qualifying members.';
}
