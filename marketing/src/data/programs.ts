/**
 * Plain program data for the Astro marketing site (no Next/server deps).
 *
 * Source of truth: lib/content/programs.ts (PROGRAMS), lib/content/programDescriptions.ts,
 * lib/content/programExtras.ts, lib/content/programSalaryOutcomes.ts.
 * Copy is VERBATIM (truth-lock). Slugs, titles, durations, salary strings,
 * partners, funding sources, skills, course names, descriptions, and extras
 * are reproduced exactly as in the Next app so the static [slug] pages match.
 *
 * The Next data module imports Coursera catalog + cache helpers (server-only),
 * so the plain data is mirrored here rather than imported.
 */

import {
  getProgramSyllabus,
  type ProgramSyllabus,
} from '../../../shared/programSyllabi';
import {
  getProgramCurriculum,
  type ProgramCurriculum,
} from '../../../shared/programCurricula';
import {
  DIGITALLEARN_PROVIDER_NAME,
  DIGITAL_LITERACY_DESCRIPTION,
  DIGITAL_LITERACY_DURATION_LABEL,
  DIGITAL_LITERACY_PROGRAM_TITLE,
  digitalLiteracyCatalogCourses,
} from '../../../shared/digitalLiteracyPathway';
import {
  DISCOVERED_COURSERA_PROGRAMS,
  type CourseraDiscoveredCourse,
} from '../../../lib/content/courseraDiscoveredCatalog';

export type LanguageSupportLevel = 'full' | 'subtitles' | 'ai-subtitles' | 'none';
export interface LanguageSupport {
  es: LanguageSupportLevel;
  pt: LanguageSupportLevel;
  fr: LanguageSupportLevel;
}

export interface ProgramCourse {
  slug: string;
  name: string;
  estimatedHours: number;
  description?: string;
  kind?: 'coursera' | 'workforceap';
  courseraSlug?: string;
  /** In-platform module content (Digital Literacy): attributed provider destinations. */
  lessons?: ReadonlyArray<{
    title: string;
    minutes: number;
    url: string;
    destinationKind?: 'verified-course' | 'course-materials-fallback' | 'course-details-with-materials-fallback';
    verificationLabel?: string;
    fallbackUrl?: string;
    fallbackLabel?: string;
  }>;
  topics?: readonly string[];
  provider?: {
    name: string;
    url: string;
    verifiedOn?: string;
    accessNote?: string;
    languageNote?: string;
    attribution?: string;
    license?: { name: string; url: string; termsUrl?: string };
  };
}

export interface ProgramExtra {
  bestFor: string;
  jobOutcomes: string[];
  difficulty?: 1 | 2 | 3;
  rampNote?: string;
}

export interface Program {
  slug: string;
  title: string;
  category: string;
  categoryLabel: string;
  categoryColor: string;
  icon: string;
  duration: string;
  salary: string;
  skills: string[];
  courses: ProgramCourse[];
  partner: string;
  fundingSource?: string;
  languagesSupported?: LanguageSupport;
  /** Resolved 2–3 sentence description (slug override or category fallback). */
  description: string;
  /** Decision-quality extras (best-for, job outcomes, difficulty, ramp). */
  extra?: ProgramExtra;
  /** Exact TWC syllabus transcription when one has been supplied. */
  syllabus?: ProgramSyllabus;
  /**
   * WorkforceAP-authored class content for programs outside the TWC
   * submission (CPT, CLT). Never set at the same time as `syllabus`.
   */
  curriculum?: ProgramCurriculum;
  /**
   * Direct link to a one-stop external course. When set, the program's
   * enroll CTAs open this URL instead of the apply form.
   */
  externalCourseUrl?: string;
}

// ── External partners whose credential gets a "<Partner> certified" badge ──
// (matches externalPartners in the Next detail page)
const EXTERNAL_PARTNERS = ['Google', 'IBM', 'Amazon Web Services', 'Microsoft', 'CompTIA'];

export function partnerBadge(program: Program): string {
  if (program.syllabus) return program.syllabus.providers;
  if (program.curriculum) return program.curriculum.providers;
  return EXTERNAL_PARTNERS.includes(program.partner)
    ? `${program.partner} certified`
    : program.partner;
}

// ── Salary parsing (verbatim from programSalaryOutcomes.ts) ──
export function salaryRangeDisplay(program: Program): string {
  const m = program.salary.match(/\$(\d+)K\s*[-–]\s*\$(\d+)K/i);
  if (m) return `$${parseInt(m[1], 10)}K–$${parseInt(m[2], 10)}K`;
  return program.salary.replace(/^Starting salary:\s*/i, '').trim();
}

const DIGITAL_LITERACY_PROGRAM_DURATION = DIGITAL_LITERACY_DURATION_LABEL;

// Helper to build course objects from verbatim course-name lists, matching the
// Next slug scheme `${slug}-course-${i+1}` and default estimated hours.
function courses(slug: string, names: string[], hours = 10): ProgramCourse[] {
  return names.map((name, i) => ({ slug: `${slug}-course-${i + 1}`, name, estimatedHours: hours }));
}

const BASE_PROGRAMS: Program[] = [
  {
    slug: 'digital-literacy-empowerment-class',
    title: DIGITAL_LITERACY_PROGRAM_TITLE,
    category: 'digital-literacy',
    categoryLabel: 'Digital Literacy',
    categoryColor: '#666',
    icon: '💻',
    duration: DIGITAL_LITERACY_PROGRAM_DURATION,
    salary: 'Starting salary: $38K-$52K',
    skills: ['Digital literacy', 'Email', 'Online safety', 'Video meetings', 'Cloud storage', 'Microsoft Word', 'Online job applications'],
    courses: digitalLiteracyCatalogCourses('digital-literacy-empowerment-class'),
    partner: DIGITALLEARN_PROVIDER_NAME,
    fundingSource: 'Grant',
    languagesSupported: { es: 'full', pt: 'none', fr: 'none' },
    description: DIGITAL_LITERACY_DESCRIPTION,
    extra: {
      bestFor: 'Members who are new to computers and the internet — no tech background required. If you already use email and browse the web daily, a program like IT Support or Cybersecurity may be a stronger fit.',
      jobOutcomes: ['Office Support Specialist', 'Customer Service Representative', 'Administrative Assistant'],
      difficulty: 1,
      rampNote: 'No tech background required. Ten short online modules (about 4 hours of linked learning), self-paced, with an English/Español control. Start here if technology feels unfamiliar.',
    },
  },
  {
    slug: 'it-support-professional-certificate-ibm',
    title: 'IT Support Professional Certificate (IBM)',
    category: 'it-cyber',
    categoryLabel: 'IT & Cybersecurity',
    categoryColor: '#ad2c4d',
    icon: '💻',
    duration: '3-5 months, 10 hrs/week',
    salary: 'Starting salary: $55K-$72K',
    skills: ['Help desk', 'Hardware', 'Software', 'Customer service'],
    courses: courses('it-support-professional-certificate-ibm', ['Introduction to Technical Support', 'Introduction to Hardware and Operating Systems', 'Introduction to Software, Programming, and Databases', 'Introduction to Networking and Storage', 'Introduction to Cybersecurity Essentials', 'Introduction to Cloud Computing', 'Technical Support Case Studies and Capstone Project']),
    partner: 'IBM',
    fundingSource: 'WIOA',
    languagesSupported: { es: 'ai-subtitles', pt: 'full', fr: 'ai-subtitles' },
    description: 'Prepare for a career in IT support, networking, or cybersecurity with hands-on training and an industry-recognized certification. Our programs cover hardware, software, and security fundamentals employers look for.',
    extra: {
      bestFor: 'First IT credential. Help desk, hardware, customer support.',
      jobOutcomes: ['IT Support Specialist', 'Help Desk Technician', 'Technical Support'],
    },
  },
  {
    slug: 'it-support-and-entry-level-cyber-security-certificate',
    title: 'IT Support and Entry-level Cybersecurity Certificate (IBM)',
    category: 'it-cyber-entry',
    categoryLabel: 'IT & Cybersecurity',
    categoryColor: '#ad2c4d',
    icon: '🛡️',
    duration: '3-5 months, 10 hrs/week',
    salary: 'Starting salary: $60K-$88K',
    skills: ['Help desk', 'Networking', 'Security fundamentals', 'Incident response'],
    courses: courses('it-support-and-entry-level-cyber-security-certificate', ['IT Support Foundations', 'Computer Hardware and Operating Systems', 'Networking Fundamentals', 'Cybersecurity Essentials', 'Entry-Level Security Operations', 'Career Preparation for IT and Cybersecurity']),
    partner: 'IBM',
    fundingSource: 'WIOA',
    languagesSupported: { es: 'ai-subtitles', pt: 'ai-subtitles', fr: 'ai-subtitles' },
    description: 'This program prepares you for an in-demand career with industry-recognized training and certification.',
  },
  {
    slug: 'ai-practitioner-professional-certificate-aws',
    title: 'AI Practitioner Professional Certificate (AWS)',
    category: 'ai-software',
    categoryLabel: 'AI & Software Dev',
    categoryColor: '#8b4a9b',
    icon: '🤖',
    duration: '3-5 months, 10 hrs/week',
    salary: 'Starting salary: $85K-$135K',
    skills: ['AI/ML', 'Generative AI', 'AI ethics', 'NLP'],
    courses: courses('ai-practitioner-professional-certificate-aws', ['Introduction to Artificial Intelligence (AI)', 'Artificial Intelligence: An Overview', 'Introduction to Digital Transformation Part 1', 'AI For All', 'AI Concepts and Strategy', 'Generative AI for Everyone', 'Machine Learning for All', 'AI Ethics and Governance', 'Natural Language Processing', 'Computer Vision Fundamentals', 'AI for Healthcare', 'AI Product Management', 'Reinforcement Learning', 'AI Capstone Project', 'AI Practitioner Cert Prep', 'Emerging AI Technologies']),
    partner: 'Amazon Web Services',
    fundingSource: 'WIOA',
    languagesSupported: { es: 'ai-subtitles', pt: 'full', fr: 'none' },
    description: "Learn the tools, languages, and frameworks powering today's AI-driven software industry. From Python and machine learning to full-stack development, these programs prepare you for in-demand tech roles.",
    extra: {
      bestFor: 'Career changers with some coding interest. Best if you can invest 3–5 months consistently.',
      jobOutcomes: ['AI / ML Engineer', 'Software Developer', 'Applications Engineer'],
      difficulty: 3,
      rampNote: 'Intermediate track. Best if you enjoy problem-solving, structured learning, and tech.',
    },
  },
  {
    slug: 'software-developer-professional-certificate-ibm',
    title: 'AI and Software Developer Professional Certificate (IBM)',
    category: 'ai-software',
    categoryLabel: 'AI & Software Dev',
    categoryColor: '#8b4a9b',
    icon: '🤖',
    duration: '3-5 months, 10 hrs/week',
    salary: 'Starting salary: $85K-$135K',
    skills: ['Software engineering', 'Python', 'React', 'Cloud'],
    courses: courses('software-developer-professional-certificate-ibm', ['Introduction to Software Engineering', 'Introduction to HTML, CSS, & JavaScript', 'Getting Started with Git and GitHub', 'Python for Data Science, AI & Development', 'Developing Front-End Apps with React', 'Developing Back-End Apps with Node.js and Express', 'Django Application Development with SQL and Databases', 'Introduction to Containers w/ Docker, Kubernetes & OpenShift', 'Application Development using Microservices and Serverless', 'Software Developer Career Guide and Interview Preparation']),
    partner: 'IBM',
    fundingSource: 'WIOA',
    languagesSupported: { es: 'ai-subtitles', pt: 'full', fr: 'none' },
    description: "Learn the tools, languages, and frameworks powering today's AI-driven software industry. From Python and machine learning to full-stack development, these programs prepare you for in-demand tech roles.",
    extra: {
      bestFor: 'Career changers ready to build software. Best if you can invest 3–5 months consistently.',
      jobOutcomes: ['Software Developer', 'Full-Stack Developer', 'Web Developer'],
      difficulty: 3,
      rampNote: 'Intermediate track. Builds from fundamentals through React, Node, and cloud-native apps.',
    },
  },
  {
    slug: 'project-management-professional-certificate-microsoft',
    title: 'Project Management Professional Certificate (Microsoft)',
    category: 'business',
    categoryLabel: 'Business',
    categoryColor: '#a47f38',
    icon: '💼',
    duration: '3-5 months, 10 hrs/week',
    salary: 'Starting salary: $82K-$112K',
    skills: ['Agile', 'Scrum', 'MS Project', 'Risk management'],
    courses: courses('project-management-professional-certificate-microsoft', ['Project Management Foundations', 'Initiating and Planning Projects', 'Project Scheduling and Cost Management', 'Managing Project Risks, Changes and Stakeholders', 'Project Leadership, Communication and Stakeholder Management', 'Agile Project Management', 'Microsoft Project & Power BI for Project Managers', 'Project Management Capstone']),
    partner: 'Microsoft',
    fundingSource: 'WIOA',
    languagesSupported: { es: 'full', pt: 'ai-subtitles', fr: 'ai-subtitles' },
    description: 'This program is built for organizers, coordinators, and career changers who want a structured path into project-based work. Over three to five months you will learn project planning, stakeholder communication, Agile methods, scheduling, budgeting, and the delivery habits employers expect. Members who complete this track move into project coordinator, operations, and junior project management roles across tech, healthcare, logistics, and business teams.',
    extra: {
      bestFor: 'Organizers and coordinators. Agile, Scrum — transferable across industries.',
      jobOutcomes: ['Project Coordinator', 'Project Manager', 'Scrum Master'],
      difficulty: 2,
      rampNote: 'No tech background required. Strong for career changers from any field.',
    },
  },
  {
    slug: 'data-analytics-professional-certificate-google',
    title: 'Management Analyst & Business Intelligence Professional Certificate',
    category: 'cloud-data',
    categoryLabel: 'Cloud & Data',
    categoryColor: '#2b7bb9',
    icon: '📊',
    duration: '3-5 months, 10 hrs/week',
    salary: 'Starting salary: $72K-$102K',
    skills: ['Management consulting', 'Business analysis', 'Strategy', 'Financial analysis', 'Data-driven decisions'],
    courses: courses('data-analytics-professional-certificate-google', ['Introduction to Management Consulting', 'Introduction to Business Analysis', 'Project, Stakeholder, and Requirements Management Fundamentals', 'Business Strategy: Creating Competitive Advantage', 'Financial Analysis and Modeling', 'Foundations: Data, Data, Everywhere', 'Ask Questions to Make Data-Driven Decisions', 'Data Visualization and Dashboards with Excel and Cognos', 'Generative AI: Transform Your Management Consulting', 'Capstone: Integrated Management Consulting Project', 'Management & Data Analytics Lab and Workforce Readiness']),
    partner: 'Google & IBM',
    fundingSource: 'WIOA',
    languagesSupported: { es: 'full', pt: 'ai-subtitles', fr: 'ai-subtitles' },
    description: 'This 160-hour professional certificate prepares learners for careers as management analysts and business intelligence professionals. Learners build management consulting, business analysis, strategy, financial analysis, data analytics, and dashboarding skills, then apply them in an integrated consulting capstone and professional portfolio.',
    extra: {
      bestFor: 'Learners who want to turn business problems and data into recommendations for management.',
      jobOutcomes: ['Management Analyst', 'Business Intelligence Analyst', 'Market Research Analyst'],
      difficulty: 2,
      rampNote: 'No prior consulting background required. Builds from business analysis and strategy into dashboards, applied AI, and a consulting capstone.',
    },
  },
  {
    slug: 'data-science-professional-certificate-ibm',
    title: 'Database Administrator (DBA) Professional Certificate (IBM)',
    category: 'cloud-data',
    categoryLabel: 'Cloud & Data',
    categoryColor: '#2b7bb9',
    icon: '📊',
    duration: '3-5 months, 10 hrs/week',
    salary: 'Starting salary: $88K-$130K',
    skills: ['SQL', 'Database administration', 'Data engineering', 'Backup & recovery'],
    courses: courses('data-science-professional-certificate-ibm', ['Introduction to Data Engineering', 'Introduction to Relational Databases (RDBMS)', 'Databases and SQL for Data Science with Python', 'Python for Data Science, AI & Development', 'Hands-on Introduction to Linux Commands and Shell Scripting', 'ETL and Data Pipelines with Shell, Airflow and Kafka', 'Data Warehouse Fundamentals', 'Relational Database Administration (DBA)', 'Relational Database Administration Capstone Project']),
    partner: 'IBM',
    fundingSource: 'WIOA',
    languagesSupported: { es: 'ai-subtitles', pt: 'full', fr: 'ai-subtitles' },
    description: 'This 160-hour professional certificate prepares learners for database-administration careers. Learners build relational database, SQL, Python, Linux, ETL, warehousing, security, backup and recovery, monitoring, performance-tuning, and automation skills before completing a portfolio-ready DBA capstone.',
    extra: {
      bestFor: 'Learners who want to operate, secure, automate, and improve production database systems.',
      jobOutcomes: ['Database Administrator', 'Junior Database Administrator', 'Database Operations Specialist', 'Database Architect (adjacent path)'],
      difficulty: 3,
      rampNote: 'Technical track with SQL, Python, Linux, ETL, backup and recovery, security, and performance tuning.',
    },
  },
  {
    slug: 'aws-cloud-technology-amazon',
    title: 'AWS Cloud Technology Certificate',
    category: 'cloud-data',
    categoryLabel: 'Cloud & Data',
    categoryColor: '#2b7bb9',
    icon: '☁️',
    duration: '3-5 months, 10 hrs/week',
    salary: 'Starting salary: $95K-$145K',
    skills: ['AWS', 'Cloud architecture', 'DevOps', 'Python'],
    courses: courses('aws-cloud-technology-amazon', ['Introduction to Information Technology and AWS Cloud', 'Providing Technical Support for AWS Workloads', 'Developing Applications in Python on AWS', 'Skills for Working as an AWS Cloud Consultant', 'DevOps on AWS and Project Management', 'Automation in the AWS Cloud', 'Data Analytics and Databases on AWS', 'Capstone: Following the AWS Well Architected Framework']),
    partner: 'Amazon Web Services',
    fundingSource: 'WIOA',
    languagesSupported: { es: 'ai-subtitles', pt: 'ai-subtitles', fr: 'ai-subtitles' },
    description: 'Build skills in cloud architecture, data analytics, and DevOps. These programs connect you with certifications from Google, IBM, and Amazon that employers hire against.',
    extra: {
      bestFor: 'Tech-curious learners ready for cloud. Strong demand, higher salary ceiling.',
      jobOutcomes: ['Cloud Engineer', 'Solutions Architect', 'DevOps Engineer'],
      difficulty: 3,
      rampNote: 'Assumes comfort with computers. Higher ceiling, steeper ramp.',
    },
  },
  {
    slug: 'it-automation-with-python-google',
    title: 'IT Automation with Python Certificate (Google)',
    category: 'it-cyber',
    categoryLabel: 'IT & Cybersecurity',
    categoryColor: '#ad2c4d',
    icon: '💻',
    duration: '3-5 months, 10 hrs/week',
    salary: 'Starting salary: $78K-$98K',
    skills: ['Python', 'Git', 'Bash', 'APIs', 'IT automation'],
    courses: courses('it-automation-with-python-google', ['Crash Course on Python', 'Using Python to Interact with the Operating System', 'Introduction to Git and GitHub', 'Troubleshooting and Debugging Techniques', 'Configuration Management and the Cloud', 'Automating Real-World Tasks with Python']),
    partner: 'Google',
    fundingSource: 'WIOA',
    languagesSupported: { es: 'full', pt: 'full', fr: 'ai-subtitles' },
    description: 'Prepare for a career in IT support, networking, or cybersecurity with hands-on training and an industry-recognized certification. Our programs cover hardware, software, and security fundamentals employers look for.',
    extra: {
      bestFor: 'Automation and scripting. Builds on basic IT or Python knowledge.',
      jobOutcomes: ['IT Automation Specialist', 'DevOps Engineer', 'Systems Engineer'],
      difficulty: 2,
      rampNote: 'Some Python comfort helps. Good next step after IT Support or A+.',
    },
  },
  {
    slug: 'comptia-a-professional-certificate',
    title: 'CompTIA A+ Professional Certificate (CompTIA A+)',
    category: 'it-cyber',
    categoryLabel: 'IT & Cybersecurity',
    categoryColor: '#ad2c4d',
    icon: '🛡️',
    duration: '3-5 months, 10 hrs/week',
    salary: 'Starting salary: $55K-$78K',
    skills: ['Hardware', 'Networking', 'Security', 'OS'],
    courses: courses('comptia-a-professional-certificate', ['IT Fundamentals and Hardware Essentials', 'Networking, Peripherals, and Wireless Technologies', 'Advanced Networking, Virtualization, and IT Security', 'Foundations of Computer Hardware and Storage', 'Operating Systems and Networking Fundamentals', 'Advanced Networking, Security, and IT Operations', 'Practice Exams for CompTIA A+ Core 1 & Core 2']),
    partner: 'CompTIA',
    fundingSource: 'WIOA',
    languagesSupported: { es: 'subtitles', pt: 'ai-subtitles', fr: 'ai-subtitles' },
    description: 'Prepare for a career in IT support, networking, or cybersecurity with hands-on training and an industry-recognized certification. Our programs cover hardware, software, and security fundamentals employers look for.',
    extra: {
      bestFor: 'First certification in IT. Entry point to help desk, support, and networking.',
      jobOutcomes: ['IT Support Specialist', 'Help Desk Technician', 'Desktop Support'],
      difficulty: 2,
      rampNote: 'Good first IT credential. Builds from basics.',
    },
  },
  {
    slug: 'comptia-network-professional-certificate',
    title: 'CompTIA Net+ Professional Certificate (CompTIA Net+)',
    category: 'it-cyber',
    categoryLabel: 'IT & Cybersecurity',
    categoryColor: '#ad2c4d',
    icon: '🛡️',
    duration: '3-5 months, 10 hrs/week',
    salary: 'Starting salary: $60K-$88K',
    skills: ['Networking', 'TCP/IP', 'Cisco', 'Wireless'],
    courses: courses('comptia-network-professional-certificate', ['Introduction to Networking', 'Networking Fundamentals', 'Introduction to Contemporary Operating Systems and Hardware', 'Introduction to Networking and Storage', 'Basics of Cisco Networking', 'CCNA Foundations', 'TCP/IP and Advanced Topics', 'Operating Systems and Networking Fundamentals', 'Network Foundations and Addressing']),
    partner: 'CompTIA',
    fundingSource: 'WIOA',
    languagesSupported: { es: 'ai-subtitles', pt: 'ai-subtitles', fr: 'ai-subtitles' },
    description: 'Prepare for a career in IT support, networking, or cybersecurity with hands-on training and an industry-recognized certification. Our programs cover hardware, software, and security fundamentals employers look for.',
    extra: {
      bestFor: 'Building on A+ or networking interest. Next step after IT fundamentals.',
      jobOutcomes: ['Network Administrator', 'Network Technician', 'Systems Administrator'],
      difficulty: 2,
      rampNote: 'Builds on IT basics. Best taken after A+ or equivalent experience.',
    },
  },
  {
    slug: 'comptia-security-professional-certificate',
    title: 'CompTIA Sec+ Professional Certificate (CompTIA Sec+)',
    category: 'it-cyber',
    categoryLabel: 'IT & Cybersecurity',
    categoryColor: '#ad2c4d',
    icon: '🛡️',
    duration: '3-5 months, 10 hrs/week',
    salary: 'Starting salary: $72K-$108K',
    skills: ['Network security', 'Risk management', 'Cryptography'],
    courses: courses('comptia-security-professional-certificate', ['Network Security', 'Introduction to Network Security', 'System and Network Security', 'Computer Networks and Network Security']),
    partner: 'CompTIA',
    fundingSource: 'WIOA',
    languagesSupported: { es: 'ai-subtitles', pt: 'ai-subtitles', fr: 'ai-subtitles' },
    description: 'Prepare for a career in IT support, networking, or cybersecurity with hands-on training and an industry-recognized certification. Our programs cover hardware, software, and security fundamentals employers look for.',
    extra: {
      bestFor: 'Moving into security. Builds on networking knowledge.',
      jobOutcomes: ['Security Analyst', 'Security Administrator', 'Compliance Analyst'],
      difficulty: 2,
      rampNote: 'Assumes networking fundamentals. Strong credential for security roles.',
    },
  },
  {
    slug: 'cybersecurity-professional-certificate-google',
    title: 'Networking and Cybersecurity Professional Certificate (CompTIA Net+, Sec+)',
    category: 'it-cyber',
    categoryLabel: 'IT & Cybersecurity',
    categoryColor: '#ad2c4d',
    icon: '🛡️',
    duration: '3-5 months, 10 hrs/week (164 contact hours total)',
    salary: 'Starting salary: $75K-$112K',
    skills: ['Networking', 'Network security', 'Incident response', 'SIEM'],
    // Course names + contact hours are verbatim from the submitted TWC/ETPL
    // syllabus (A+ → Network+ → Security+ progression, 164 hours total).
    courses: [
      { slug: 'cybersecurity-professional-certificate-google-course-1', name: 'Introduction to Networking', estimatedHours: 2 },
      { slug: 'cybersecurity-professional-certificate-google-course-2', name: 'Networking Fundamentals', estimatedHours: 22 },
      { slug: 'cybersecurity-professional-certificate-google-course-3', name: 'Network Foundations and Addressing', estimatedHours: 7 },
      { slug: 'cybersecurity-professional-certificate-google-course-4', name: 'CCNA Foundations: Networking Basics and Cisco IOS Essentials', estimatedHours: 8 },
      { slug: 'cybersecurity-professional-certificate-google-course-5', name: 'TCP/IP and Advanced Topics', estimatedHours: 15 },
      { slug: 'cybersecurity-professional-certificate-google-course-6', name: 'Basics of Cisco Networking', estimatedHours: 10 },
      { slug: 'cybersecurity-professional-certificate-google-course-7', name: 'Networking, Peripherals, and Wireless Technologies', estimatedHours: 6 },
      { slug: 'cybersecurity-professional-certificate-google-course-8', name: 'Networking in Google Cloud: Network Security', estimatedHours: 9 },
      { slug: 'cybersecurity-professional-certificate-google-course-9', name: 'Foundations of Cybersecurity', estimatedHours: 10 },
      { slug: 'cybersecurity-professional-certificate-google-course-10', name: 'Connect and Protect: Networks and Network Security', estimatedHours: 12 },
      { slug: 'cybersecurity-professional-certificate-google-course-11', name: 'Play It Safe: Manage Security Risks', estimatedHours: 9 },
      { slug: 'cybersecurity-professional-certificate-google-course-12', name: 'Assets, Threats, and Vulnerabilities', estimatedHours: 19 },
      { slug: 'cybersecurity-professional-certificate-google-course-13', name: 'Sound the Alarm: Detection and Response', estimatedHours: 18 },
      { slug: 'cybersecurity-professional-certificate-google-course-14', name: 'Put It to Work: Prepare for Cybersecurity Jobs', estimatedHours: 11 },
      { slug: 'cybersecurity-professional-certificate-google-course-15', name: 'CompTIA Network+ and Security+ Exam Practice', estimatedHours: 6 },
    ],
    partner: 'Google',
    fundingSource: 'WIOA',
    languagesSupported: { es: 'full', pt: 'ai-subtitles', fr: 'ai-subtitles' },
    description: 'This program is designed for members who are serious about entering the security field and are ready to commit three to five months of focused effort. You will build hands-on skills in Linux, SQL, Python scripting, network security, and incident response — the exact toolkit that Security Operations Center (SOC) roles require. The Google Cybersecurity Certificate is widely recognized and signals job-readiness to employers. Members who succeed here typically start as Cybersecurity Analysts, SOC Analysts, or Security Operations Specialists earning $75K–$112K. If you have never used a computer for work before, we recommend starting with Digital Literacy or IT Support first to build a foundation. Ready to move forward? Apply now or use the comparison tool to see how this program stacks up against other IT tracks.',
    extra: {
      bestFor: 'Career changers ready to enter the security field. You do not need a security background, but comfort with computers helps — members new to technology entirely should complete Digital Literacy or IT Support first.',
      jobOutcomes: ['Cybersecurity Analyst', 'SOC Analyst', 'Security Operations Specialist'],
      difficulty: 3,
      rampNote: 'Assumes basic computer comfort. Strong employer demand and higher salary ceiling than most entry tracks.',
    },
  },
  {
    slug: 'digital-marketing-e-commerce-google',
    title: 'Digital Marketing & E-Commerce Professional Certificate (Google)',
    category: 'business',
    categoryLabel: 'Business',
    categoryColor: '#a47f38',
    icon: '💼',
    duration: '3-5 months, 10 hrs/week',
    salary: 'Starting salary: $62K-$78K',
    skills: ['SEO', 'SEM', 'Email marketing', 'Analytics'],
    courses: courses('digital-marketing-e-commerce-google', ['Foundations of Digital Marketing and E-commerce', 'Attract and Engage Customers with Digital Marketing', 'From Likes to Leads: Interact with Customers Online', 'Think Outside the Inbox: Email Marketing', 'Assess for Success: Marketing Analytics and Measurement', 'Make the Sale: Build, Launch, and Manage E-commerce Stores', 'Satisfaction Guaranteed: Develop Customer Loyalty Online']),
    partner: 'Google',
    fundingSource: 'WIOA',
    languagesSupported: { es: 'full', pt: 'ai-subtitles', fr: 'ai-subtitles' },
    description: 'This program fits members who enjoy communication, campaigns, customer behavior, and online business. Over three to five months you will build practical skills in SEO, email marketing, analytics, paid channels, and e-commerce workflows that employers use every day. Members who complete this track are preparing for digital marketing, e-commerce, and growth-support roles where execution and measurement both matter.',
    extra: {
      bestFor: 'Creative, marketing-minded. SEO, analytics, e-commerce.',
      jobOutcomes: ['Digital Marketing Specialist', 'E-commerce Coordinator', 'Marketing Analyst'],
      difficulty: 1,
      rampNote: 'Beginner-friendly. Good fit if you enjoy content, creative, or social media work.',
    },
  },
  {
    slug: 'ux-design-professional-certificate-google',
    title: 'User Experience & Interface Design Professional Certificate',
    category: 'business',
    categoryLabel: 'Business',
    categoryColor: '#a47f38',
    icon: '💼',
    duration: '3-5 months, 10 hrs/week',
    salary: 'Starting salary: $88K-$120K',
    skills: ['User research', 'Wireframing', 'Figma', 'Prototyping'],
    courses: courses('ux-design-professional-certificate-google', ['Foundations of User Experience (UX) Design', 'Start the UX Design Process: Empathize, Define, and Ideate', 'Build Wireframes and Low-Fidelity Prototypes', 'Conduct UX Research and Test Early Concepts', 'Create High-Fidelity Designs and Prototypes in Figma', 'Build Dynamic User Interfaces (UI) for Websites', 'Design a User Experience for Social Good & Prepare for Jobs', 'Lab, Project, and Test Preparation']),
    partner: 'Google',
    fundingSource: 'WIOA',
    languagesSupported: { es: 'full', pt: 'ai-subtitles', fr: 'ai-subtitles' },
    description: 'This program is for members who care about how products feel, flow, and solve real user problems. Over three to five months you will learn user research, wireframing, prototyping, and interface design in a way that builds both creative confidence and structured process. Members who complete this track are preparing for UX, UI, and product design support roles where empathy, communication, and portfolio work all matter.',
    extra: {
      bestFor: 'Design-minded, user-focused. Figma, prototyping, research.',
      jobOutcomes: ['UX Designer', 'UI Designer', 'Product Designer'],
      difficulty: 2,
      rampNote: 'No design background needed. Builds from research to high-fidelity Figma prototypes.',
    },
  },
  {
    slug: 'health-information-technology-mchit',
    title: 'Medical Billing, Coding, and Health Information Technician Certificate (MBCHIT)',
    category: 'healthcare',
    categoryLabel: 'Healthcare',
    categoryColor: '#4a9b4f',
    icon: '❤️',
    duration: '3-5 months, 10 hrs/week',
    salary: 'Starting salary: $52K-$72K',
    skills: ['Medical coding', 'EHR', 'HIPAA', 'ICD-10'],
    courses: courses('health-information-technology-mchit', ['Medical Terminology, Anatomy, and Physiology Fundamentals', 'Register Patients & Validate Data', 'Revenue Cycle, Billing, and Coding', 'The Billing and Collection Process', 'Medical Billing and Coding Essentials', 'Healthcare Communication and Compliance', 'Health Information Management', 'Medical Coding: ICD-10-CM', 'Medical Coding: CPT & HCPCS', 'Healthcare Reimbursement', 'Electronic Health Records', 'Medical Coding Capstone', 'Healthcare Privacy and Security', 'Medical Office Administration', 'Medical Billing & Coding Practicum']),
    partner: 'Healthcare Career Pathway',
    fundingSource: 'WIOA',
    languagesSupported: { es: 'none', pt: 'none', fr: 'none' },
    description: 'This program is the right fit for members drawn to healthcare administration — people who want to work in a clinical setting without a clinical role. Over three to five months you will learn medical coding (ICD-10 and CPT), electronic health records (EHR), HIPAA compliance, and revenue cycle management. These are the skills hospitals, clinics, and billing offices hire for directly. Members who complete this program move into roles as Medical Coders, Health Information Technicians, and Billing Specialists earning $52K–$72K. If you are newer to healthcare concepts, this program starts from fundamentals — no prior medical background is needed. If you are deciding between Health IT and a tech track, the pathfinder quiz or our program comparison tool can help clarify which direction fits your goals.',
    extra: {
      bestFor: 'Members drawn to healthcare who want an administrative role rather than a clinical one. No prior medical background needed — this program starts from fundamentals. If your interest is more in tech than healthcare, an IT or data track may be a better path.',
      jobOutcomes: ['Medical Coder', 'Health Information Technician', 'Billing Specialist'],
      difficulty: 2,
      rampNote: 'Starts from healthcare fundamentals. No prior clinical experience required.',
    },
  },
  {
    slug: 'certified-production-technician-cpt',
    title: 'Certified Production Technician (CPT)',
    category: 'manufacturing',
    categoryLabel: 'Manufacturing',
    categoryColor: '#1a1a1a',
    icon: '🏭',
    duration: '3-5 months, 10 hrs/week',
    salary: 'Starting salary: $48K-$70K',
    skills: ['Safety', 'Quality practices', 'Manufacturing processes', 'Maintenance awareness'],
    courses: courses('certified-production-technician-cpt', ['Introduction to Manufacturing', 'Blueprint Reading and Technical Drawing', 'Machining and CNC Operations', 'Welding Fundamentals', 'Quality Control and Inspection', 'Safety and OSHA Compliance', 'Lean Manufacturing Principles', 'Production Technology Capstone']),
    partner: 'MSSC / NAM',
    fundingSource: 'WIOA',
    languagesSupported: { es: 'none', pt: 'none', fr: 'none' },
    description: 'This program is for members who want a direct path into production and advanced manufacturing environments. You will build practical knowledge in safety, quality control, machining concepts, and shop-floor processes that employers expect in technician roles. Members who complete this track are preparing for production technician, machine operator, and quality-focused roles where reliability and process discipline matter.',
    extra: {
      bestFor: 'Hands-on learners. CNC, manufacturing, quality control.',
      jobOutcomes: ['Manufacturing Technician', 'CNC Operator', 'Quality Inspector'],
      difficulty: 2,
      rampNote: 'Hands-on pathway focused on production, safety, and shop-floor fundamentals.',
    },
  },
  {
    slug: 'certified-logistics-technician-clt',
    title: 'Certified Logistics Technician (CLT)',
    category: 'manufacturing',
    categoryLabel: 'Manufacturing',
    categoryColor: '#1a1a1a',
    icon: '🏭',
    duration: '3-5 months, 10 hrs/week',
    salary: 'Starting salary: $55K-$78K',
    skills: ['Logistics fundamentals', 'Safety', 'Inventory', 'Material handling', 'Transportation'],
    courses: courses('certified-logistics-technician-clt', ['Introduction to Supply Chain Management', 'Inventory Management and Control', 'Transportation and Distribution', 'Warehouse Operations', 'Procurement and Vendor Management', 'Supply Chain Technology and SAP', 'Global Supply Chain and Trade', 'CLT Certification Preparation']),
    partner: 'MSSC / NAM',
    fundingSource: 'WIOA',
    languagesSupported: { es: 'none', pt: 'none', fr: 'none' },
    description: 'This program fits members who like operations, inventory, movement, and keeping systems organized. You will build skills in supply chain flow, warehouse operations, transportation, and logistics technology that support real employer demand across distribution and manufacturing. Members who complete this track are preparing for logistics coordinator, inventory, warehouse, and supply chain support roles.',
    extra: {
      bestFor: 'Supply chain, inventory, logistics. SAP and operations.',
      jobOutcomes: ['Logistics Coordinator', 'Supply Chain Analyst', 'Inventory Manager'],
      difficulty: 2,
      rampNote: 'Good fit if you like process, movement, inventory systems, and operations work.',
    },
  },
  {
    slug: 'core-construction-training-certificate',
    title: 'Core Construction',
    category: 'manufacturing',
    categoryLabel: 'Construction & Trades',
    categoryColor: '#1a1a1a',
    icon: '🏗️',
    duration: '5 hours per section',
    salary: 'Starting salary: $48K-$68K',
    skills: ['OSHA-10', 'Blueprint reading', 'Construction fundamentals'],
    courses: courses('core-construction-training-certificate', ['Introduction to Construction Industry', 'Blueprint Reading and Construction Math', 'Construction Safety and OSHA-10', 'Hand and Power Tools', 'Concrete and Masonry Fundamentals', 'Carpentry and Framing Basics', 'Electrical and Plumbing Basics', 'Construction Readiness Capstone']),
    partner: 'OSHA-10 / Grant',
    fundingSource: 'WIOA',
    languagesSupported: { es: 'none', pt: 'none', fr: 'none' },
    description: 'This program is designed for members who want an on-ramp into construction and skilled-trades work. You will build readiness in jobsite safety, OSHA-10 concepts, blueprint reading, tools, and construction fundamentals so you can step into entry-level roles with more confidence. Members who complete this track are preparing for construction labor, apprenticeship, and site-support roles where safety and consistency come first.',
    extra: {
      bestFor: 'Construction industry entry. OSHA-10, blueprint reading, safety.',
      jobOutcomes: ['Construction Laborer', 'Apprentice', 'Site Coordinator'],
      difficulty: 1,
      rampNote: 'Shorter construction-readiness track focused on safety, tools, and jobsite basics.',
    },
  },
];

function applySyllabus(program: Program): Program {
  const syllabus = getProgramSyllabus(program.slug);
  if (!syllabus) return program;

  const normalizeCourseName = (name: string) =>
    name
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/\bw\//g, 'with ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const syllabusCourses = syllabus.courses.map((course, index) => {
    const existing = program.courses.find(
      (candidate) => normalizeCourseName(candidate.name) === normalizeCourseName(course.name),
    );
    return {
      slug: existing?.slug ?? course.courseraSlug ?? `${program.slug}-course-${index + 1}`,
      name: course.name,
      estimatedHours: course.hours,
      description: course.description,
      courseraSlug: course.courseraSlug,
    };
  });

  return {
    ...program,
    title: syllabus.title,
    duration: `${syllabus.totalHours} hours • ${syllabus.deliveryFormat}`,
    description: syllabus.description,
    courses: syllabusCourses,
    syllabus,
  };
}

/**
 * Overlay in-house class content (CPT, CLT). Unlike `applySyllabus` this
 * deliberately leaves `title` and `description` alone — those are truth-locked
 * member-facing copy, not a regulated transcription. Draft hours remain in
 * the internal curriculum record but are not presented as verified public
 * duration/contact-hour facts until the owner verifies the record.
 */
function applyCurriculum(program: Program): Program {
  if (program.syllabus) return program;
  const curriculum = getProgramCurriculum(program.slug);
  if (!curriculum) return program;

  const curriculumCourses = curriculum.courses.map((course, index) => {
    return {
      slug: `${program.slug}-course-${index + 1}`,
      name: course.name,
      estimatedHours: course.hours,
      description: course.description,
      kind: course.kind,
    };
  });

  return {
    ...program,
    duration: curriculum.status === 'owner-verified'
      ? `${curriculum.totalHours} hours • ${curriculum.deliveryFormat}`
      : 'Hours and delivery format pending owner verification',
    courses: curriculumCourses,
    curriculum,
  };
}

/**
 * Non-regulated provider tracks use the same existing course snapshot as the
 * member catalog. Supplied syllabi and in-house curricula retain precedence;
 * this does not validate live provider availability or change assignments.
 */
function applyDiscoveredCourses(program: Program): Program {
  if (program.syllabus || program.curriculum) return program;
  const discovered = DISCOVERED_COURSERA_PROGRAMS[program.slug]?.courses;
  if (!discovered?.length) return program;
  const defaultHours = program.courses[0]?.estimatedHours ?? 10;
  const courses = discovered.map((course: CourseraDiscoveredCourse) => ({
    slug: course.slug,
    name: course.name,
    estimatedHours: course.estimatedHours ?? defaultHours,
  }));
  // Keep existing public identifiers when the displayed snapshot already agrees.
  if (courses.length === program.courses.length && courses.every((course, index) =>
    course.name === program.courses[index].name && course.estimatedHours === program.courses[index].estimatedHours
  )) return program;
  return {
    ...program,
    courses,
  };
}

export const PROGRAMS: Program[] = BASE_PROGRAMS
  .map(applySyllabus)
  .map(applyCurriculum)
  .map(applyDiscoveredCourses);

export function getProgramBySlug(slug: string): Program | undefined {
  return PROGRAMS.find((p) => p.slug === slug);
}

export const WORKFORCEAP_PROGRAM_CATALOG_SIZE = PROGRAMS.length;
