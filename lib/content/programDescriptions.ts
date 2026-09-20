import { DIGITAL_LITERACY_DESCRIPTION } from '../../shared/digitalLiteracyPathway';

import { getProgramSyllabus } from '../../shared/programSyllabi';

/**
 * 2–3 sentence program description per category for program detail pages.
 * Slug-specific overrides take priority over category-level descriptions.
 */
export const PROGRAM_CATEGORY_DESCRIPTIONS: Record<string, string> = {
  'it-cyber':
    'Prepare for a career in IT support, networking, or cybersecurity with hands-on training and an industry-recognized certification. Our programs cover hardware, software, and security fundamentals employers look for.',
  'ai-software':
    'Learn the tools, languages, and frameworks powering today\'s AI-driven software industry. From Python and machine learning to full-stack development, these programs prepare you for in-demand tech roles.',
  'cloud-data':
    'Build skills in cloud architecture, data analytics, and DevOps. These programs connect you with certifications from Google, IBM, and Amazon that employers hire against.',
  'business':
    'Develop project management, digital marketing, and UX design skills. These credentials transfer across industries and open doors to roles in tech, healthcare, and beyond.',
  'healthcare':
    'Prepare for medical coding and health information roles. Learn EHR systems, HIPAA compliance, and coding fundamentals employers use in healthcare administration.',
  'manufacturing':
    'Gain hands-on skills in production technology, logistics, and construction readiness. These certifications prepare you for roles in advanced manufacturing and skilled trades.',
  'digital-literacy':
    'Build foundational digital skills for work and life. From email and online safety to financial literacy, this program prepares you for today\'s connected workplace.',
};

/**
 * Slug-specific program descriptions for representative programs.
 * These override the category-level fallback when a slug match is found.
 * They answer: who it is for, how hard it is, what skills it builds,
 * what roles it leads to, and what to do next.
 */
export const PROGRAM_SLUG_DESCRIPTIONS: Record<string, string> = {
  'digital-literacy-empowerment-class': DIGITAL_LITERACY_DESCRIPTION,

  'cybersecurity-professional-certificate-google':
    'This program is designed for members who are serious about entering the security field and are ready to commit three to five months of focused effort. You will build hands-on skills in Linux, SQL, Python scripting, network security, and incident response — the exact toolkit that Security Operations Center (SOC) roles require. The Google Cybersecurity Certificate is widely recognized and signals job-readiness to employers. Members who succeed here typically start as Cybersecurity Analysts, SOC Analysts, or Security Operations Specialists; research current pay for those roles in the salary guide. If you have never used a computer for work before, we recommend starting with Digital Literacy or IT Support first to build a foundation. Ready to move forward? Apply now or use the comparison tool to see how this program stacks up against other IT tracks.',

  'health-information-technology-mchit':
    'This program is the right fit for members drawn to healthcare administration — people who want to work in a clinical setting without a clinical role. Over three to five months you will learn medical coding (ICD-10 and CPT), electronic health records (EHR), HIPAA compliance, and revenue cycle management. These are the skills hospitals, clinics, and billing offices hire for directly. Members who complete this program move into roles as Medical Coders, Health Information Technicians, and Billing Specialists; research current pay for those roles in the salary guide. If you are newer to healthcare concepts, this program starts from fundamentals — no prior medical background is needed. If you are deciding between Health IT and a tech track, the pathfinder quiz or our program comparison tool can help clarify which direction fits your goals.',

  'project-management-professional-certificate-microsoft':
    'This program is built for organizers, coordinators, and career changers who want a structured path into project-based work. Over three to five months you will learn project planning, stakeholder communication, Agile methods, scheduling, budgeting, and the delivery habits employers expect. Members who complete this track move into project coordinator, operations, and junior project management roles across tech, healthcare, logistics, and business teams.',

  'data-analytics-professional-certificate-google':
    'This 160-hour professional certificate prepares learners for careers as management analysts and business intelligence professionals. Learners build management consulting, business analysis, strategy, financial analysis, data analytics, and dashboarding skills, then apply them in an integrated consulting capstone and professional portfolio.',

  'data-science-professional-certificate-ibm':
    'This 160-hour professional certificate prepares learners for database-administration careers. Learners build relational database, SQL, Python, Linux, ETL, warehousing, security, backup and recovery, monitoring, performance-tuning, and automation skills before completing a portfolio-ready DBA capstone.',

  'software-developer-professional-certificate-ibm':
    'This program is for members who want to build real software, not just learn theory. Over four to six months you will work through front-end, back-end, databases, GitHub, React, Node, and deployment-oriented tooling that mirrors how modern software teams operate. Members who complete this track are preparing for junior software developer, web developer, and full-stack support roles where project examples and steady practice matter.',

  'digital-marketing-e-commerce-google':
    'This program fits members who enjoy communication, campaigns, customer behavior, and online business. Over three to five months you will build practical skills in SEO, email marketing, analytics, paid channels, and e-commerce workflows that employers use every day. Members who complete this track are preparing for digital marketing, e-commerce, and growth-support roles where execution and measurement both matter.',

  'ux-design-professional-certificate-google':
    'This program is for members who care about how products feel, flow, and solve real user problems. Over three to five months you will learn user research, wireframing, prototyping, and interface design in a way that builds both creative confidence and structured process. Members who complete this track are preparing for UX, UI, and product design support roles where empathy, communication, and portfolio work all matter.',

  'certified-production-technician-cpt':
    'This program is for members who want a direct path into production and advanced manufacturing environments. You will build practical knowledge in safety, quality control, machining concepts, and shop-floor processes that employers expect in technician roles. Members who complete this track are preparing for production technician, machine operator, and quality-focused roles where reliability and process discipline matter.',

  'certified-logistics-technician-clt':
    'This program fits members who like operations, inventory, movement, and keeping systems organized. You will build skills in supply chain flow, warehouse operations, transportation, and logistics technology that support real employer demand across distribution and manufacturing. Members who complete this track are preparing for logistics coordinator, inventory, warehouse, and supply chain support roles.',

  'core-construction-training-certificate':
    'This program is designed for members who want an on-ramp into construction and skilled-trades work. You will build readiness in jobsite safety, OSHA-10 concepts, blueprint reading, tools, and construction fundamentals so you can step into entry-level roles with more confidence. Members who complete this track are preparing for construction labor, apprenticeship, and site-support roles where safety and consistency come first.',
};

export function getProgramDescription(category: string, slug?: string): string {
  if (slug) {
    const syllabus = getProgramSyllabus(slug);
    if (syllabus) return syllabus.description;
  }
  if (slug && PROGRAM_SLUG_DESCRIPTIONS[slug]) {
    return PROGRAM_SLUG_DESCRIPTIONS[slug];
  }
  return PROGRAM_CATEGORY_DESCRIPTIONS[category] ?? 'This program prepares you for an in-demand career with industry-recognized training and certification.';
}
