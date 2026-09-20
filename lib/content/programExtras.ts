/**
 * Decision-quality extras: best-for, job outcomes.
 * Used on cards and detail pages to help people choose confidently.
 */

export type ProgramExtra = {
  bestFor: string;
  jobOutcomes: string[];
  /** Difficulty: 1–3 stars. Affects comparison framing. */
  difficulty?: 1 | 2 | 3;
  /** Short note on ramp/effort. E.g. "Assumes basic computer comfort." */
  rampNote?: string;
};

export const PROGRAM_EXTRAS: Record<string, ProgramExtra> = {
  'digital-literacy-empowerment-class': {
    bestFor: 'Members who are new to computers and the internet — no tech background required. If you already use email and browse the web daily, a program like IT Support or Cybersecurity may be a stronger fit.',
    jobOutcomes: ['Office Support Specialist', 'Customer Service Representative', 'Administrative Assistant'],
    difficulty: 1,
    rampNote: 'No tech background required. Six weeks, beginner pace. Start here if technology feels unfamiliar.',
  },
  'ai-practitioner-professional-certificate-aws': {
    bestFor: 'Career changers with some coding interest. Best if you can invest 3–5 months consistently.',
    jobOutcomes: ['AI / ML Engineer', 'Software Developer', 'Applications Engineer'],
    difficulty: 3,
    rampNote: 'Intermediate track. Best if you enjoy problem-solving, structured learning, and tech.',
  },
  'ai-professional-developer-certificate-ibm': {
    bestFor: 'Career changers with some coding interest. Best if you can invest 3–5 months consistently.',
    jobOutcomes: ['AI / ML Engineer', 'Software Developer', 'Applications Engineer'],
    difficulty: 3,
    rampNote: 'Intermediate track. Best if you enjoy problem-solving, structured learning, and tech.',
  },
  'aws-cloud-technology-amazon': {
    bestFor: 'Tech-curious learners ready to explore cloud infrastructure.',
    jobOutcomes: ['Cloud Engineer', 'Solutions Architect', 'DevOps Engineer'],
    difficulty: 3,
    rampNote: 'Assumes comfort with computers. Higher ceiling, steeper ramp.',
  },
  'comptia-a-professional-certificate': {
    bestFor: 'First certification in IT. Entry point to help desk, support, and networking.',
    jobOutcomes: ['IT Support Specialist', 'Help Desk Technician', 'Desktop Support'],
    difficulty: 2,
    rampNote: 'Good first IT credential. Builds from basics.',
  },
  'comptia-network-professional-certificate': {
    bestFor: 'Building on A+ or networking interest. Next step after IT fundamentals.',
    jobOutcomes: ['Network Administrator', 'Network Technician', 'Systems Administrator'],
    difficulty: 2,
    rampNote: 'Builds on IT basics. Best taken after A+ or equivalent experience.',
  },
  'comptia-security-professional-certificate': {
    bestFor: 'Moving into security. Builds on networking knowledge.',
    jobOutcomes: ['Security Analyst', 'Security Administrator', 'Compliance Analyst'],
    difficulty: 2,
    rampNote: 'Assumes networking fundamentals. Strong credential for security roles.',
  },
  'cybersecurity-professional-certificate-google': {
    bestFor: 'Career changers ready to enter the security field. You do not need a security background, but comfort with computers helps — members new to technology entirely should complete Digital Literacy or IT Support first.',
    jobOutcomes: ['Cybersecurity Analyst', 'SOC Analyst', 'Security Operations Specialist'],
    difficulty: 3,
    rampNote: 'Assumes basic computer comfort. Compare related job requirements with your existing skills and experience.',
  },
  'data-analytics-professional-certificate-google': {
    bestFor: 'Learners who want to turn business problems and data into recommendations for management.',
    jobOutcomes: ['Management Analyst', 'Business Intelligence Analyst', 'Market Research Analyst'],
    difficulty: 2,
    rampNote: 'No prior consulting background required. Builds from business analysis and strategy into dashboards, applied AI, and a consulting capstone.',
  },
  'data-science-professional-certificate-ibm': {
    bestFor: 'Learners who want to operate, secure, automate, and improve production database systems.',
    jobOutcomes: ['Database Administrator', 'Junior Database Administrator', 'Database Operations Specialist', 'Database Architect (adjacent path)'],
    difficulty: 3,
    rampNote: 'Technical track with SQL, Python, Linux, ETL, backup and recovery, security, and performance tuning.',
  },
  'project-management-professional-certificate-microsoft': {
    bestFor: 'Organizers and coordinators. Agile, Scrum — transferable across industries.',
    jobOutcomes: ['Project Coordinator', 'Project Manager', 'Scrum Master'],
    difficulty: 2,
    rampNote: 'No tech background required. Strong for career changers from any field.',
  },
  'digital-marketing-e-commerce-google': {
    bestFor: 'Creative, marketing-minded. SEO, analytics, e-commerce.',
    jobOutcomes: ['Digital Marketing Specialist', 'E-commerce Coordinator', 'Marketing Analyst'],
    difficulty: 1,
    rampNote: 'Beginner-friendly. Good fit if you enjoy content, creative, or social media work.',
  },
  'ux-design-professional-certificate-google': {
    bestFor: 'Design-minded, user-focused. Figma, prototyping, research.',
    jobOutcomes: ['UX Designer', 'UI Designer', 'Product Designer'],
    difficulty: 2,
    rampNote: 'No design background needed. Builds from research to high-fidelity Figma prototypes.',
  },
  'it-support-professional-certificate-ibm': {
    bestFor: 'First IT credential. Help desk, hardware, customer support.',
    jobOutcomes: ['IT Support Specialist', 'Help Desk Technician', 'Technical Support'],
  },
  'it-automation-with-python-google': {
    bestFor: 'Automation and scripting. Builds on basic IT or Python knowledge.',
    jobOutcomes: ['IT Automation Specialist', 'DevOps Engineer', 'Systems Engineer'],
    difficulty: 2,
    rampNote: 'Some Python comfort helps. Good next step after IT Support or A+.',
  },
  'health-information-technology-mchit': {
    bestFor: 'Members drawn to healthcare who want an administrative role rather than a clinical one. No prior medical background needed — this program starts from fundamentals. If your interest is more in tech than healthcare, an IT or data track may be a better path.',
    jobOutcomes: ['Medical Coder', 'Health Information Technician', 'Billing Specialist'],
    difficulty: 2,
    rampNote: 'Starts from healthcare fundamentals. No prior clinical experience required.',
  },
  'certified-production-technician-cpt': {
    bestFor: 'Hands-on learners. CNC, manufacturing, quality control.',
    jobOutcomes: ['Manufacturing Technician', 'CNC Operator', 'Quality Inspector'],
    difficulty: 2,
    rampNote: 'Hands-on pathway focused on production, safety, and shop-floor fundamentals.',
  },
  'certified-logistics-technician-clt': {
    bestFor: 'Supply chain, inventory, logistics. SAP and operations.',
    jobOutcomes: ['Logistics Coordinator', 'Supply Chain Analyst', 'Inventory Manager'],
    difficulty: 2,
    rampNote: 'Good fit if you like process, movement, inventory systems, and operations work.',
  },
  'core-construction-training-certificate': {
    bestFor: 'Construction industry entry. OSHA-10, blueprint reading, safety.',
    jobOutcomes: ['Construction Laborer', 'Apprentice', 'Site Coordinator'],
    difficulty: 1,
    rampNote: 'Shorter construction-readiness track focused on safety, tools, and jobsite basics.',
  },
  'software-developer-professional-certificate-ibm': {
    bestFor: 'Full-stack and AI software development. HTML, JavaScript, Python, React, cloud.',
    jobOutcomes: ['Software Developer', 'Full-Stack Developer', 'Web Developer'],
    difficulty: 3,
    rampNote: 'Build-focused path for members ready to code consistently over 3–5 months.',
  },
};

export function getProgramExtra(slug: string): ProgramExtra | undefined {
  return PROGRAM_EXTRAS[slug];
}
