import type { Program, ProgramCourse } from '@/lib/content/programs';
import { getProgramSyllabus } from '@/shared/programSyllabi';
import { roundMoney, type PacketLineItem } from './packetSchema';
import { allocateAmount } from './packetText';

/**
 * Price-list ceiling used when neither the org catalog nor the syllabus prices
 * a program. It is only a reference (a maximum), never a prefilled charge.
 */
const FALLBACK_TUITION = 7500;

/** A default J5 row before staff review; `amount` is null when no price is on file. */
export type DefaultLineItem = Omit<PacketLineItem, 'amount'> & { amount: number | null };

export type ProgramPricing = {
  tuition: number;
  certCost: number;
  bookCost: number;
  miscCost: number;
  /** Where the tuition figure came from, shown to the admin on the form. */
  source: 'organization_catalog' | 'syllabus' | 'price_list_default';
};

export type CatalogPricingRow = {
  cost: number | null;
  certCost: number | null;
  bookCost: number | null;
  miscCost: number | null;
} | null;

export function resolveProgramPricing(program: Pick<Program, 'slug'>, catalog: CatalogPricingRow): ProgramPricing {
  if (catalog && catalog.cost != null && catalog.cost > 0) {
    return {
      tuition: roundMoney(catalog.cost),
      certCost: roundMoney(catalog.certCost ?? 0),
      bookCost: roundMoney(catalog.bookCost ?? 0),
      miscCost: roundMoney(catalog.miscCost ?? 0),
      source: 'organization_catalog',
    };
  }
  const syllabus = getProgramSyllabus(program.slug);
  if (syllabus && syllabus.tuitionAndFees > 0) {
    return { tuition: roundMoney(syllabus.tuitionAndFees), certCost: 0, bookCost: 0, miscCost: 0, source: 'syllabus' };
  }
  return { tuition: FALLBACK_TUITION, certCost: 0, bookCost: 0, miscCost: 0, source: 'price_list_default' };
}

/**
 * Default J5 rows: one line per class in the member's curriculum, with the
 * tuition spread by contact hours, followed by any catalog fees. With no
 * catalog or syllabus price (`price_list_default`) the tuition rows are left
 * empty: staff must enter the approved tuition before signing.
 */
export function buildDefaultLineItems(args: {
  courses: ReadonlyArray<Pick<ProgramCourse, 'name' | 'estimatedHours'>>;
  pricing: ProgramPricing;
  programTitle: string;
}): DefaultLineItem[] {
  const rows: DefaultLineItem[] = [];
  const priced = args.pricing.source !== 'price_list_default';
  if (args.courses.length > 0) {
    const shares = allocateAmount(args.pricing.tuition, args.courses.map((c) => c.estimatedHours ?? 0));
    args.courses.forEach((course, i) => {
      rows.push({
        description: course.name,
        hours: course.estimatedHours > 0 ? course.estimatedHours : null,
        amount: priced ? (shares[i] ?? 0) : null,
      });
    });
  } else {
    rows.push({ description: `${args.programTitle} - tuition`, hours: null, amount: priced ? args.pricing.tuition : null });
  }
  if (args.pricing.certCost > 0) rows.push({ description: 'Certification exam voucher(s)', hours: null, amount: args.pricing.certCost });
  if (args.pricing.bookCost > 0) rows.push({ description: 'Books and course materials', hours: null, amount: args.pricing.bookCost });
  if (args.pricing.miscCost > 0) rows.push({ description: 'Miscellaneous program fees', hours: null, amount: args.pricing.miscCost });
  return rows;
}
