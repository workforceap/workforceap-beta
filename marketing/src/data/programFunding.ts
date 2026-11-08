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

const WIOA_COPY =
  'Funding may cover this program if you qualify and your local workforce board approves your training. Confirm your eligibility and any costs with an advisor before enrollment.';
const GRANT_COPY =
  'Grant or scholarship support may be available if you meet its eligibility requirements. Confirm available support and any costs with an advisor before enrollment.';
const PENDING_COPY =
  'Program details, costs and available funding are still being confirmed. Ask an advisor about this program before starting an application.';

/** One public status for the badge, paragraph, reassurance, and call to action. */
export function publicProgramFundingCopy(program: FundingProgram): string {
  if (programFundingRequiresConfirmation(program)) return PENDING_COPY;
  if (program.fundingSource === 'WIOA') return WIOA_COPY;
  if (program.fundingSource === 'Grant') return GRANT_COPY;
  return 'Confirm available support and any costs with an advisor before enrollment.';
}

type ProgramLink = FundingProgram & { externalCourseUrl?: string | null };

export function catalogProgramAction(program: ProgramLink): { label: string; href: string; external: boolean } {
  if (programFundingRequiresConfirmation(program)) {
    return { label: 'Ask about this program', href: `/programs/${program.slug}`, external: false };
  }
  if (program.externalCourseUrl) {
    return { label: 'Start the free course', href: program.externalCourseUrl, external: true };
  }
  return { label: 'Get Started', href: `/apply?program=${program.slug}`, external: false };
}

export function detailProgramAction(program: ProgramLink, partnerRef = ''): { label: string; href: string; external: boolean } {
  if (programFundingRequiresConfirmation(program)) {
    return { label: 'Ask about this program', href: '/contact', external: false };
  }
  if (program.externalCourseUrl) {
    return { label: 'Start the free course', href: program.externalCourseUrl, external: true };
  }
  const href = partnerRef
    ? `/apply?ref=${encodeURIComponent(partnerRef)}&program=${encodeURIComponent(program.slug)}`
    : `/apply?program=${program.slug}`;
  return { label: 'Apply Now', href, external: false };
}
