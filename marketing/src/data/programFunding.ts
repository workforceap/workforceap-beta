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

/**
 * Local workforce boards approve WIOA funding per participant and per program,
 * so public copy may say a source *can* cover a program, never that it will.
 */
export function programFundingRequiresConfirmation(program: FundingProgram): boolean {
  return FUNDING_REQUIRES_CONFIRMATION.has(program.slug);
}

export function publicProgramFundingLabel(program: FundingProgram): string {
  if (programFundingRequiresConfirmation(program)) return 'Funding confirmation required';
  const source = program.fundingSource ?? 'WIOA';
  return source === 'WIOA' ? 'WIOA/Grant if eligible' : source;
}

export function publicProgramFundingCopy(program: FundingProgram): string {
  if (FUNDING_REQUIRES_CONFIRMATION.has(program.slug)) {
    return 'Ask an advisor to confirm available funding and any costs before enrollment.';
  }
  return program.fundingSource
    ? `May be available at no cost to qualifying members through ${program.fundingSource} or other funding. Approval depends on your eligibility, this program, and your local workforce board.`
    : 'May be available at no cost to qualifying members, depending on eligibility and available funding.';
}
