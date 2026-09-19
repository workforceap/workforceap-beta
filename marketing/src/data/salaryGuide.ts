/**
 * @deprecated Unused legacy snapshot. The live salary guide uses occupational
 * research links; these unsourced ranges must not be published as outcomes.
 *
 * These values are the VERBATIM output of the Next site's
 * `buildSalaryGuideRows()` and `salaryGuideSummaryStats()`
 * (lib/content/programSalaryOutcomes.ts) applied to the canonical 20-program
 * catalog (lib/content/programs.ts → PROGRAMS).
 *
 * They are copied as plain data so the marketing page never imports the
 * server-only Next content modules. If the Next catalog changes, re-resolve
 * those two functions and update the arrays below — do not invent numbers.
 *
 * Rows are sorted by salary midpoint (highest first), exactly as the Next page
 * renders them.
 */

export type SalaryLevel = 'Entry' | 'Mid' | 'Mid-High' | 'High';
export type SalaryRamp = 'Easier' | 'Moderate' | 'Steeper';

export interface SalaryGuideRow {
  slug: string;
  program: string;
  duration: string;
  /** Published starting range, e.g. "$95K–$145K". */
  salary: string;
  level: SalaryLevel;
  ramp: SalaryRamp;
  /** Level badge background color. */
  color: string;
  /** Range midpoint in $K — used only for sort order. */
  midpointK: number;
}

export const salaryGuideRows: SalaryGuideRow[] = [
  {
    slug: 'aws-cloud-technology-amazon',
    program: 'AWS Cloud Technology Certificate',
    duration: '3-5 months',
    salary: '$95K–$145K',
    level: 'High',
    ramp: 'Steeper',
    color: '#4a9b4f',
    midpointK: 120,
  },
  {
    slug: 'ai-practitioner-professional-certificate-aws',
    program: 'AI Practitioner Professional Certificate (AWS)',
    duration: '3-5 months',
    salary: '$85K–$135K',
    level: 'High',
    ramp: 'Steeper',
    color: '#4a9b4f',
    midpointK: 110,
  },
  {
    slug: 'software-developer-professional-certificate-ibm',
    program: 'AI and Software Developer Professional Certificate (IBM)',
    duration: '200 hours • Hybrid, Self-Paced',
    salary: '$85K–$135K',
    level: 'High',
    ramp: 'Steeper',
    color: '#4a9b4f',
    midpointK: 110,
  },
  {
    slug: 'data-science-professional-certificate-ibm',
    program: 'Database Administrator (DBA) Professional Certificate (IBM)',
    duration: '3-5 months',
    salary: '$88K–$130K',
    level: 'High',
    ramp: 'Steeper',
    color: '#4a9b4f',
    midpointK: 109,
  },
  {
    slug: 'ux-design-professional-certificate-google',
    program: 'User Experience & Interface Design Professional Certificate',
    duration: '3-5 months',
    salary: '$88K–$120K',
    level: 'High',
    ramp: 'Steeper',
    color: '#4a9b4f',
    midpointK: 104,
  },
  {
    slug: 'project-management-professional-certificate-microsoft',
    program: 'Project Management Professional Certificate (Microsoft)',
    duration: '3-5 months',
    salary: '$82K–$112K',
    level: 'Mid-High',
    ramp: 'Steeper',
    color: '#2b7bb9',
    midpointK: 97,
  },
  {
    slug: 'cybersecurity-professional-certificate-google',
    program: 'Networking and Cybersecurity Professional Certificate (CompTIA Net+, Sec+)',
    duration: '3-5 months',
    salary: '$75K–$112K',
    level: 'Mid-High',
    ramp: 'Steeper',
    color: '#2b7bb9',
    midpointK: 93.5,
  },
  {
    slug: 'comptia-security-professional-certificate',
    program: 'CompTIA Security+ Professional Certificate',
    duration: '3-5 months',
    salary: '$72K–$108K',
    level: 'Mid-High',
    ramp: 'Steeper',
    color: '#2b7bb9',
    midpointK: 90,
  },
  {
    slug: 'it-automation-with-python-google',
    program: 'IT Automation with Python Certificate (Google)',
    duration: '3-5 months',
    salary: '$78K–$98K',
    level: 'Mid-High',
    ramp: 'Moderate',
    color: '#2b7bb9',
    midpointK: 88,
  },
  {
    slug: 'data-analytics-professional-certificate-google',
    program: 'Management Analyst & Business Intelligence Professional Certificate',
    duration: '3-5 months',
    salary: '$72K–$102K',
    level: 'Mid-High',
    ramp: 'Moderate',
    color: '#2b7bb9',
    midpointK: 87,
  },
  {
    slug: 'it-support-and-entry-level-cyber-security-certificate',
    program: 'IT Support and Entry-level Cybersecurity Certificate (IBM)',
    duration: '3-5 months',
    salary: '$60K–$88K',
    level: 'Mid',
    ramp: 'Moderate',
    color: '#2b7bb9',
    midpointK: 74,
  },
  {
    slug: 'comptia-network-professional-certificate',
    program: 'CompTIA Network+ Professional Certificate',
    duration: '3-5 months',
    salary: '$60K–$88K',
    level: 'Mid',
    ramp: 'Moderate',
    color: '#2b7bb9',
    midpointK: 74,
  },
  {
    slug: 'digital-marketing-e-commerce-google',
    program: 'Digital Marketing & E-Commerce (Google)',
    duration: '3-5 months',
    salary: '$62K–$78K',
    level: 'Mid',
    ramp: 'Moderate',
    color: '#2b7bb9',
    midpointK: 70,
  },
  {
    slug: 'comptia-a-professional-certificate',
    program: 'CompTIA A+ Professional Certificate',
    duration: '3-5 months',
    salary: '$55K–$78K',
    level: 'Mid',
    ramp: 'Moderate',
    color: '#2b7bb9',
    midpointK: 66.5,
  },
  {
    slug: 'certified-logistics-technician-clt',
    program: 'Certified Logistics Technician (CLT)',
    duration: '3-5 months',
    salary: '$55K–$78K',
    level: 'Mid',
    ramp: 'Moderate',
    color: '#2b7bb9',
    midpointK: 66.5,
  },
  {
    slug: 'it-support-professional-certificate-ibm',
    program: 'IT Support Professional Certificate (IBM)',
    duration: '3-5 months',
    salary: '$55K–$72K',
    level: 'Entry',
    ramp: 'Moderate',
    color: '#888',
    midpointK: 63.5,
  },
  {
    slug: 'health-information-technology-mchit',
    program: 'Medical Billing, Coding, and Health Information Technician Certificate (MBCHIT)',
    duration: '3-5 months',
    salary: '$52K–$72K',
    level: 'Entry',
    ramp: 'Moderate',
    color: '#888',
    midpointK: 62,
  },
  {
    slug: 'certified-production-technician-cpt',
    program: 'Certified Production Technician (CPT)',
    duration: '3-5 months',
    salary: '$48K–$70K',
    level: 'Entry',
    ramp: 'Moderate',
    color: '#888',
    midpointK: 59,
  },
  {
    slug: 'core-construction-training-certificate',
    program: 'Core Construction',
    duration: '5 hours per section',
    salary: '$48K–$68K',
    level: 'Entry',
    ramp: 'Easier',
    color: '#888',
    midpointK: 58,
  },
  {
    slug: 'digital-literacy-empowerment-class',
    program: 'Workforce AP Digital Literacy Course',
    duration: 'Online, self-paced — 10 short modules (DigitalLearn.org)',
    salary: '$38K–$52K',
    level: 'Entry',
    ramp: 'Easier',
    color: '#888',
    midpointK: 45,
  },
];

export interface SalaryGuideSummaryStats {
  highestSalary: string;
  highestProgram: string;
  avgMidpointLabel: string;
  over100Count: number;
}

/** Verbatim output of salaryGuideSummaryStats(salaryGuideRows). */
export const salaryGuideSummaryStats: SalaryGuideSummaryStats = {
  highestSalary: '$95K–$145K',
  highestProgram: 'AWS Cloud Technology Certificate',
  avgMidpointLabel: '$82K',
  over100Count: 9,
};

/** Total tracks shown in the guide (matches the 20-program catalog). */
export const salaryGuideProgramCount = salaryGuideRows.length;

/**
 * Decision-support insight cards (verbatim copy from the Next /salary-guide
 * `insights` array). Icon names map to marketing Icon.astro (Lucide) names.
 */
export interface SalaryInsight {
  icon: string;
  title: string;
  desc: string;
}

export const salaryInsights: SalaryInsight[] = [
  {
    icon: 'lightbulb',
    title: 'Higher ranges = deeper programs',
    desc: 'Cloud, AI engineering, and database administration tracks sit at the top of the range for a reason — more depth, more commitment. Worth it if you will finish.',
  },
  {
    icon: 'check-circle',
    title: 'Entry ranges are not "lesser" options',
    desc: 'IT Support, Digital Literacy, and several CompTIA paths get you credentialed faster. Plenty of people stack from there. The win is momentum.',
  },
  {
    icon: 'trending-up',
    title: 'Career growth',
    desc: 'Most members see meaningful increases inside 2-3 years once they are in-role. Pick a track you can complete; we help match ramp to your life.',
  },
  {
    icon: 'map',
    title: 'Grounded in national data',
    desc: 'We anchor ranges to national hiring and cost-of-living data. Your offer depends on employer, location, proof, and fit.',
  },
  {
    icon: 'handshake',
    title: 'Job placement support',
    desc: 'Resume support, interview prep, employer intros. We do not disappear after you certify.',
  },
  {
    icon: 'dollar',
    title: 'Total compensation',
    desc: 'Beyond base pay: bonuses, equity at some firms, benefits. Negotiate with the full picture.',
  },
];

/**
 * Career-growth phases (verbatim copy from the Next /salary-guide
 * `GROWTH_PHASES` array).
 */
export interface GrowthPhase {
  num: string;
  title: string;
  desc: string;
}

export const growthPhases: GrowthPhase[] = [
  { num: '01', title: 'Foundation', desc: 'Complete your certification program and land your first role. Focus on demonstrating competence.' },
  { num: '02', title: 'Specialization', desc: 'Build depth in your niche. Stack additional certifications. Salary typically increases 15-25%.' },
  { num: '03', title: 'Leadership', desc: 'Move into senior IC or management roles. Mentor others. Compensation reflects your impact.' },
  { num: '04', title: 'Mastery', desc: 'Industry expert. Multiple career options. Many alumni return to WorkforceAP as mentors or instructors.' },
];
