/**
 * Includes every public catalog program. Presentation labels live here;
 * duration, funding, preparation and providers come from PROGRAMS at render
 * time, preserving the catalog's explicit states for unverified details.
 */
import { PROGRAMS } from './programs';

const SHORT_NAMES: Record<string, string> = {
  "it-support-professional-certificate-ibm": "IT Support",
  "comptia-a-professional-certificate": "CompTIA A+",
  "comptia-network-professional-certificate": "CompTIA Network+",
  "comptia-security-professional-certificate": "CompTIA Security+",
  "cybersecurity-professional-certificate-google": "Cybersecurity (Google)",
  "it-automation-with-python-google": "IT Automation",
  "aws-cloud-technology-amazon": "Cloud (AWS)",
  "data-analytics-professional-certificate-google": "Management Analyst & Business Intelligence Professional Certificate",
  "data-science-professional-certificate-ibm": "Database Administrator (DBA) Professional Certificate (IBM)",
  "ai-practitioner-professional-certificate-aws": "AI Practitioner (AWS)",
  "software-developer-professional-certificate-ibm": "AI & Software Dev (IBM)",
  "project-management-professional-certificate-microsoft": "Project Management",
  "digital-marketing-e-commerce-google": "Digital Marketing",
  "ux-design-professional-certificate-google": "User Experience & Interface Design Professional Certificate",
  "health-information-technology-mchit": "Medical Billing & Health IT"
};

const CATEGORY_ORDER: Record<string, number> = {
  'Digital Literacy': 0,
  'IT & Cybersecurity': 1,
  'Cloud & Data': 2,
  'AI & Software Dev': 3,
  Business: 4,
  Healthcare: 5,
  Manufacturing: 6,
  'Construction & Trades': 7,
};

export const PROGRAM_COMPARISON_TRACKS = PROGRAMS.map((program) => ({
  slug: program.slug,
  shortName: SHORT_NAMES[program.slug] ?? program.title,
  categoryLabel: program.categoryLabel,
  categoryOrder: CATEGORY_ORDER[program.categoryLabel] ?? 8,
}));

/** Existing guided entry points; the full comparison remains open to everyone. */
export const STARTER_SLUGS = [
  "it-support-professional-certificate-ibm",
  "cybersecurity-professional-certificate-google",
  "data-analytics-professional-certificate-google"
] as const;
