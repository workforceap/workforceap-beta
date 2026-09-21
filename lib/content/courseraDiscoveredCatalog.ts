// Course IDs are resolved against Coursera public `onDemandCourses` metadata
// and/or B4B `listContents` when the enterprise catalog differs. If a new
// program adds courses without IDs, run:
//   node scripts/backfill-coursera-courseids.cjs --write
// (requires `COURSERA_B4B_CLIENT_ID` / `SECRET`). See docs/COURSERA-INTEGRATION-TEST.md.
const DISCOVERED_COURSERA_PROGRAMS_INNER = {
  "comptia-a-plus": {
    courseraProgramId: "TpIlAogTQ8-SJQKIE8PP9w",
    learningPathId: "C-5mIgyaSLGuZiIMmrixWg",
    title: "CompTIA A+ Professional Certificate",
    courses: [
      { courseId: "7sBiclFIEeetjQ5ppGVTyA", slug: "technical-support-fundamentals", name: "Technical Support Fundamentals", partner: "Google" },
      { courseId: "ySI6pmchEe--dw7PPVphLw", slug: "packt-it-fundamentals-and-hardware-essentials-yqged", name: "IT Fundamentals and Hardware Essentials", partner: "Packt" },
      { courseId: "DRKQhcn7EfCGDQr_wTYZuQ", slug: "packt-foundations-of-it-and-core-hardware-components-gavrv", name: "Foundations of IT and Core Hardware Components", partner: "Packt" },
      { courseId: "J6uAMWcgEe-ZVAr_5CUYPw", slug: "packt-foundations-of-computer-hardware-and-storage-fneta", name: "Foundations of Computer Hardware and Storage", partner: "Packt" },
      { courseId: "RP5nqGeBEe-ZVAr_5CUYPw", slug: "packt-operating-systems-and-networking-fundamentals-bokjh", name: "Operating Systems and Networking Fundamentals", partner: "Packt" },
      { courseId: "S3G1qWbiEe-EPwr_9XyAcQ", slug: "packt-networking-peripherals-and-wireless-technologies-fhkx1", name: "Networking, Peripherals, and Wireless Technologies", partner: "Packt" },
      { courseId: "XnYYsmbgEe-WbhKfqhh3sw", slug: "packt-advanced-networking-security-and-it-operations-fgrrb", name: "Advanced Networking, Security, and IT Operations", partner: "Packt" },
      { courseId: "pG5HkGelEe--dw7PPVphLw", slug: "packt-advanced-networking-virtualization-and-it-security-pzolo", name: "Advanced Networking, Virtualization, and IT Security", partner: "Packt" },
      { courseId: "uOyjBdflEeqckg5GnG0pSw", slug: "comptia-practice", name: "CompTIA Practice", partner: "CompTIA" },
      { courseId: "bbLUnmLQEe66xBLRCmM3Cw", slug: "practice-exam-for-comptia-a", name: "Practice Exams for CompTIA A+ Certification: Core 1 & Core 2", partner: "CompTIA" },
    ],
  },
  "project-management-professional-certificate-microsoft": {
    courseraProgramId: "TpIlAogTQ8-SJQKIE8PP9w",
    learningPathId: "vaH4UkrHSKSh-FJKxxik4Q",
    title: "Project Management Professional Certificate (Microsoft)",
    courses: [
      // courseId reverse-engineered from coursera_xapi_events.raw_payload —
      // first real Coursera courseId seen for a Workforce Advancement learner
      // (Drew Harris, 2026-05-06, all 130 events under this courseId).
      // Confirmed identical in lp_mapping.json (2026-07-02 regeneration).
      { courseId: "lgy789C8Ee6SjxKHxThXWw", slug: "project-management-fundamentals-microsoft", name: "Project Management Fundamentals", partner: "Microsoft" },
      { courseId: "ETzWTdC9Ee6SjxKHxThXWw", slug: "team-building-and-leadership-in-project-management", name: "Team Building and Leadership in Project Management", partner: "Microsoft" },
      { courseId: "YbrDRtC9Ee6SjxKHxThXWw", slug: "project-manager-engagement-with-stakeholders", name: "Project Manager Engagement with Stakeholders", partner: "Microsoft" },
      { courseId: "KQ6GstDAEe6P2wphYfoNOQ", slug: "process-groups-and-processes-in-project-management", name: "Process Groups and Processes in Project Management", partner: "Microsoft" },
      { courseId: "vuAsldC-Ee6P2wphYfoNOQ", slug: "project-management-principles", name: "Project Management Principles", partner: "Microsoft" },
      { courseId: "u3rsKNC_Ee6SjxKHxThXWw", slug: "project-management-performance-domains", name: "Project Management Performance Domains", partner: "Microsoft" },
      { courseId: "MLjf49C-Ee6SjxKHxThXWw", slug: "pmp-formulas", name: "PMP Formulas", partner: "Microsoft" },
      { courseId: "ocXG5O4OEe6cohJOlykk1Q", slug: "pm4r-agile-5-steps-for-hybrid-management-of-projects", name: "PM4R Agile: 5 steps for hybrid management of projects", partner: "Microsoft" },
      { courseId: "NGstiiJNEe-qLxJFbw2Hbw", slug: "pm4r-agile-mindset-in-development-projects", name: "PM4R Agile: Agile Mindset in Development Projects", partner: "Microsoft" },
      { courseId: "ByqSENDBEe6SjxKHxThXWw", slug: "pmp-application-process-and-practice-exam", name: "PMP Application Process and Practice Exam", partner: "Microsoft" },
    ],
  },
  "it-support-professional-certificate-ibm": {
    courseraProgramId: "TpIlAogTQ8-SJQKIE8PP9w",
    learningPathId: "o9PJJ-ReQ_KTySfkXuPyHw",
    title: "IT Support Professional Certificate (IBM)",
    courses: [
      { courseId: "rNyuLa-pEeytqw64hz8ZCw", slug: "introduction-to-technical-support", name: "Introduction to Technical Support", partner: "IBM" },
      { courseId: "wtYRSE1kEeyLIRLL9niz0w", slug: "introduction-to-hardware-and-operating-systems", name: "Introduction to Hardware and Operating Systems", partner: "IBM" },
      { courseId: "mFu9FE1kEeyLIRLL9niz0w", slug: "introduction-software-programming-and-databases", name: "Introduction to Software, Programming, and Databases", partner: "IBM" },
      { courseId: "P0ciGZT0EeyHuA5cIqn4NQ", slug: "introduction-to-networking-and-storage", name: "Introduction to Networking and Storage", partner: "IBM" },
      { courseId: "P6EH-AfjEeqBYw5XkWz7vw", slug: "introduction-to-cloud", name: "Introduction to Cloud Computing", partner: "IBM" },
      { courseId: "YlfzdXJKEeyKjA79ESMRTQ", slug: "introduction-to-cybersecurity-essentials", name: "Introduction to Cybersecurity Essentials", partner: "IBM" },
      { courseId: "873t-sJ3EeyZlw5yhMZTYQ", slug: "technical-support-case-studies", name: "Technical Support (IT) Case Studies and Capstone", partner: "IBM" },
      { courseId: "tYQTkiDCEe6zFgoHXpnxeQ", slug: "practice-exam-for-comptia-itf-plus-certification", name: "Practice Exam for CompTIA Tech+ Certification", partner: "IBM" },
      { courseId: "R56tWWBoEe2TzA7_9n9MNw", slug: "tech-support-career-guide-and-interview-preparation", name: "Tech Support Career Guide and Interview Preparation", partner: "IBM" },
    ],
  },
  "health-information-technology-mchit": {
    courseraProgramId: "TpIlAogTQ8-SJQKIE8PP9w",
    learningPathId: "iMhjZsGTRkSIY2bBk-ZEhA",
    title: "Medical Billing, Coding, and Health Information Technician Certificate (MBCHIT)",
    courses: [
      { courseId: "NRbkx_ZREe2OqwqhrYNGhQ", slug: "medical-terminology-anatomy-physiology-fundamentals", name: "Medical Terminology, Anatomy, and Physiology Fundamentals", partner: "MedCerts" },
      { courseId: "kyfEm7DIEfCsnQ73ldDVQw", slug: "register-patients--validate-data", name: "Register Patients & Validate Data", partner: "Coursera" },
      { courseId: "jb0fG5ClEe-KjBKlSS1PLQ", slug: "revenue-cycle-billing-and-coding", name: "Revenue Cycle, Billing, and Coding", partner: "Johns Hopkins University" },
      { courseId: "4vJ2DufMEe-ccQr_xjRSew", slug: "the-billing-and-collection-process", name: "The Billing and Collection Process", partner: "AAPC" },
      { courseId: "ORD0I55eEe2a0hItqNBhjQ", slug: "medical-billing-coding-essentials", name: "Medical Billing and Coding Essentials", partner: "MedCerts" },
      { courseId: "kYlX_qm0EfCZ0RJy-KWDlw", slug: "medical-billing-code-claim-collect", name: "Medical Billing: Code, Claim, Collect", partner: "Coursera" },
      { courseId: "6JQCyKqNEfCK2RJYz7KGmw", slug: "medical-billing-code-and-claim-cleanly", name: "Medical Billing: Code and Claim Cleanly", partner: "Coursera" },
      { courseId: "6y4eyrMCEfCVOAr_-ssqDQ", slug: "medical-coding-for-max-reimbursement", name: "Medical Coding for Max Reimbursement", partner: "Coursera" },
      { courseId: "Se-fZQWhEfG28A6LLakGFQ", slug: "reconciliation-billing-and-collections-optimization", name: "Reconciliation, Billing, and Collections Optimization", partner: "Coursera" },
      { courseId: "q5bxtK88EfCvhhJvy8XwzQ", slug: "medical-records-protect-patient-privacy", name: "Medical Records: Protect Patient Privacy", partner: "Coursera" },
      { courseId: "dj1_WJClEe-jlw4NkAElrw", slug: "data-and-electronic-health-records", name: "Data and Electronic Health Records", partner: "Coursera" },
      { courseId: "Z1XEYB-eEeulXwp2iaqDJw", slug: "health-it-fundamentals", name: "Health Information Technology Fundamentals", partner: "Coursera" },
      { courseId: "1-6HgCIEEey-7g6YTy-Atw", slug: "telehealth", name: "Foundations of Telehealth", partner: "Coursera" },
      { courseId: "CUOh2pFrEe-KjBKlSS1PLQ", slug: "medical-administrative-assistants-and-office-procedures", name: "Medical Administrative Assistants and Office Procedures", partner: "Coursera" },
      { courseId: "uDMpp-fMEe-mrRK-FPQYAw", slug: "introduction-to-certified-professional-biller", name: "Introduction to Certified Professional Biller", partner: "Coursera" },
    ],
  },
  "ai-practitioner-professional-certificate-aws": {
    courseraProgramId: "TpIlAogTQ8-SJQKIE8PP9w",
    learningPathId: "vjCRy6uOReCwkcurjsXg3Q",
    title: "AI Practitioner Professional Certificate (AWS)",
    courses: [
      { courseId: "mR7MlUaTEemuHQ4HpHozrA", slug: "introduction-to-ai", name: "Introduction to Artificial Intelligence (AI)", partner: "IBM" },
      { courseId: "h5dcezicEeyZlQoNyXy15Q", slug: "artificial-intelligence-an-overview", name: "Artificial Intelligence: An Overview", partner: "Politecnico di Milano" },
      { courseId: "GCTyHE2LEeyLIRLL9niz0w", slug: "introduction-to-digital-transformation-part-1", name: "Introduction to Digital Transformation Part 1", partner: "University of Virginia Darden School Foundation" },
      { courseId: "hVwck3epEfC1jRJm2R_Okw", slug: "ai-foundations-for-all", name: "AI For All", partner: "AI CERTs" },
      { courseId: "954g6F1WEe6iARI3FlRl8w", slug: "ai-strategy", name: "AI Concepts and Strategy", partner: "Rutgers the State University of New Jersey" },
      { courseId: "z-d7VBReEe-r_Ar_6dbL9Q", slug: "ai-for-professional-communication", name: "AI for Professional Communication", partner: "Coursera" },
      { courseId: "SOTCddsLEfC1UxIkq1JqIw", slug: "understand-apply-artificial-intelligence-fundamentals", name: "Understand and Apply Artificial Intelligence Fundamentals", partner: "Coursera" },
      { courseId: "CQXkoGIKEe6yuQ41HILERQ", slug: "ai-for-business-generation-and-prediction", name: "AI for Business: Generation & Prediction", partner: "Coursera" },
      { courseId: "YUfX_FFcEemHkRLmf0JQJA", slug: "ai-ethics", name: "Artificial Intelligence: Ethics & Societal Challenges", partner: "Coursera" },
      { courseId: "w1jkc9spEfCQRRIzUgLPlQ", slug: "packt-chatgpt-foundations-amzvj", name: "ChatGPT - Foundations", partner: "Packt" },
      { courseId: "SaiktYS1Ee66wg5jL1EOqw", slug: "chatgpt-for-beginners-market-research-ai", name: "ChatGPT for Beginners: Using AI for Market Research", partner: "Coursera" },
      { courseId: "ZruIud55Ee-L_Q47HwVgtw", slug: "ai-for-everyone-ai-fundamentals-with-claude", name: "AI Fundamentals with Claude", partner: "Coursera" },
      { courseId: "oc80ZNm-EfCZihIC4LWgUw", slug: "sales-with-ai", name: "Sales with AI", partner: "Coursera" },
      { courseId: "tQhqTtzuEfC6bA4wlNz8zQ", slug: "ai-for-marketing", name: "AI for Marketing", partner: "Coursera" },
      { courseId: "Ci-CgAWfEfCd-gr_6GMchQ", slug: "packt-salesforce-certified-ai-associate-certification-a3r1f", name: "Salesforce Certified AI Associate Certification", partner: "Packt" },
      { courseId: "MvVSdbBHEfCsnQ73ldDVQw", slug: "aws-artificial-intelligence-practitioner", name: "AWS Artificial Intelligence Practitioner", partner: "Coursera" },
    ],
  },
  "ai-professional-developer-certificate-ibm": {
    courseraProgramId: "TpIlAogTQ8-SJQKIE8PP9w",
    learningPathId: "vjCRy6uOReCwkcurjsXg3Q",
    title: "AI Practitioner Professional Certificate (AWS)",
    courses: [
      { courseId: "mR7MlUaTEemuHQ4HpHozrA", slug: "introduction-to-ai", name: "Introduction to Artificial Intelligence (AI)", partner: "IBM" },
      { courseId: "h5dcezicEeyZlQoNyXy15Q", slug: "artificial-intelligence-an-overview", name: "Artificial Intelligence: An Overview", partner: "Politecnico di Milano" },
      { courseId: "GCTyHE2LEeyLIRLL9niz0w", slug: "introduction-to-digital-transformation-part-1", name: "Introduction to Digital Transformation Part 1", partner: "University of Virginia Darden School Foundation" },
      { courseId: "hVwck3epEfC1jRJm2R_Okw", slug: "ai-foundations-for-all", name: "AI For All", partner: "AI CERTs" },
      { courseId: "954g6F1WEe6iARI3FlRl8w", slug: "ai-strategy", name: "AI Concepts and Strategy", partner: "Rutgers the State University of New Jersey" },
      { courseId: "z-d7VBReEe-r_Ar_6dbL9Q", slug: "ai-for-professional-communication", name: "AI for Professional Communication", partner: "Coursera" },
      { courseId: "SOTCddsLEfC1UxIkq1JqIw", slug: "understand-apply-artificial-intelligence-fundamentals", name: "Understand and Apply Artificial Intelligence Fundamentals", partner: "Coursera" },
      { courseId: "CQXkoGIKEe6yuQ41HILERQ", slug: "ai-for-business-generation-and-prediction", name: "AI for Business: Generation & Prediction", partner: "Coursera" },
      { courseId: "YUfX_FFcEemHkRLmf0JQJA", slug: "ai-ethics", name: "Artificial Intelligence: Ethics & Societal Challenges", partner: "Coursera" },
      { courseId: "w1jkc9spEfCQRRIzUgLPlQ", slug: "packt-chatgpt-foundations-amzvj", name: "ChatGPT - Foundations", partner: "Packt" },
      { courseId: "SaiktYS1Ee66wg5jL1EOqw", slug: "chatgpt-for-beginners-market-research-ai", name: "ChatGPT for Beginners: Using AI for Market Research", partner: "Coursera" },
      { courseId: "ZruIud55Ee-L_Q47HwVgtw", slug: "ai-for-everyone-ai-fundamentals-with-claude", name: "AI Fundamentals with Claude", partner: "Coursera" },
      { courseId: "oc80ZNm-EfCZihIC4LWgUw", slug: "sales-with-ai", name: "Sales with AI", partner: "Coursera" },
      { courseId: "tQhqTtzuEfC6bA4wlNz8zQ", slug: "ai-for-marketing", name: "AI for Marketing", partner: "Coursera" },
      { courseId: "Ci-CgAWfEfCd-gr_6GMchQ", slug: "packt-salesforce-certified-ai-associate-certification-a3r1f", name: "Salesforce Certified AI Associate Certification", partner: "Packt" },
      { courseId: "MvVSdbBHEfCsnQ73ldDVQw", slug: "aws-artificial-intelligence-practitioner", name: "AWS Artificial Intelligence Practitioner", partner: "Coursera" },
    ],
  },
  "data-science-professional-certificate-ibm": {
    courseraProgramId: "TpIlAogTQ8-SJQKIE8PP9w",
    learningPathId: "Wj6KdjQrQfm-inY0K6H5xg",
    title: "Data Science Professional Certificate (IBM)",
    courses: [
      { courseId: "r0GnHOZaEees-Q6jQMxlrg", slug: "what-is-datascience", name: "What is Data Science?", partner: "IBM" },
      { courseId: "oCBU5_VYEeeBQA7SG0nILA", slug: "open-source-tools-for-data-science", name: "Tools for Data Science", partner: "IBM" },
      { courseId: "OFt7o_8IEee1YxLCJ0cSDA", slug: "data-science-methodology", name: "Data Science Methodology", partner: "IBM" },
      { courseId: "ejOz7RDUEei99hK0xs-tsg", slug: "python-for-applied-data-science-ai", name: "Python for Data Science, AI & Development", partner: "IBM" },
      { courseId: "aOsrKiujEe6mDAo3fVlzHw", slug: "python-data-science", name: "Python for Data Science", partner: "Fractal Analytics" },
      { courseId: "GDQMSxDWEeitFhJL4G-A_g", slug: "sql-data-science", name: "Databases and SQL for Data Science with Python", partner: "IBM" },
      { courseId: "fYuElDEgEeiCvhLLCIZW_A", slug: "data-analysis-with-python", name: "Data Analysis with Python", partner: "IBM" },
      { courseId: "ORAIlTLtEeizIBKbQHnlqg", slug: "python-for-data-visualization", name: "Data Visualization with Python", partner: "IBM" },
      { courseId: "8UjeMk-mEeit4g4GsxE4dg", slug: "machine-learning-with-python", name: "Machine Learning with Python", partner: "IBM" },
      { courseId: "uZZCOk-0Eei5shJ0GHcv-g", slug: "applied-data-science-capstone", name: "Applied Data Science Capstone", partner: "IBM" },
      { courseId: "hIyjm5CKEe63Ww6tPe9iow", slug: "generative-ai-elevate-your-data-science-career", name: "Generative AI: Elevate Your Data Science Career", partner: "IBM" },
      { courseId: "tI6I6GHOEeyipgpI5l_HwQ", slug: "career-guide-and-interview-prep-for-data-science-pc", name: "Data Scientist Career Guide and Interview Preparation", partner: "IBM" },
    ],
  },
  "digital-marketing-e-commerce-professional-certificate-google": {
    courseraProgramId: "TpIlAogTQ8-SJQKIE8PP9w",
    learningPathId: "Xvd7I_wBSNO3eyP8AXjTfA",
    title: "Digital Marketing & E-Commerce Professional Certificate",
    courses: [
      { courseId: "g-0dF3JpEeys9RJMWW48Yw", slug: "foundations-of-digital-marketing-and-e-commerce", name: "Foundations of Digital Marketing and E-commerce", partner: "Google" },
      { courseId: "dG13cHJKEeys9RJMWW48Yw", slug: "attract-and-engage-customers", name: "Attract and Engage Customers with Digital Marketing", partner: "Google" },
      { courseId: "HjlVBHJLEeys9RJMWW48Yw", slug: "from-likes-to-leads", name: "From Likes to Leads: Interact with Customers Online", partner: "Google" },
      { courseId: "MBqC4XJLEeys9RJMWW48Yw", slug: "think-outside-the-inbox", name: "Think Outside the Inbox: Email Marketing", partner: "Google" },
      { courseId: "FOu5AXsIEeynSxJpnIcphQ", slug: "assess-for-success", name: "Assess for Success: Marketing Analytics and Measurement", partner: "Google" },
      { courseId: "uRHCCWFiEeuu-xLe1JcYrQ", slug: "social-media-digital-marketing-fundamentals", name: "Social Media and Digital Marketing Fundamentals", partner: "Google" },
      { courseId: "0FyJ84IeEe-uPQ6cY8b-gw", slug: "social-media-content-and-strategy", name: "Social Media Content and Strategy", partner: "Google" },
      { courseId: "SsanZuvgEfCEtA75x5Rx3w", slug: "digital-marketing-channels", name: "Strategic Digital Marketing: Digital Marketing Channels", partner: "Google" },
      { courseId: "UK7yonsIEey1tgpUmO8AYQ", slug: "satisfaction-guaranteed", name: "Satisfaction Guaranteed: Develop Customer Loyalty Online", partner: "Google" },
      { courseId: "gtaaAQWpEfGgHhL0Iuu-6Q", slug: "seo-and-content-optimization-for-digital-marketing", name: "SEO and Content Optimization for Digital Marketing", partner: "Google" },
      { courseId: "RekNoB1LEfGuBw5BLqxbOQ", slug: "digital-marketing-with-genai", name: "Digital Marketing with AI", partner: "Google" },
    ],
  },
  "data-analytics-professional-certificate-google": {
    courseraProgramId: "TpIlAogTQ8-SJQKIE8PP9w",
    learningPathId: "Dz4BBgGAS1i-AQYBgLtYgA",
    title: "Data Analytics Professional Certificate (Google)",
    courses: [
      { courseId: "ZWYBq9zVEeqMbw6VbjEnNw", slug: "introduction-to-data-analytics", name: "Introduction to Data Analytics", partner: "IBM" },
      { courseId: "kvb6uMbTEeqZOA5eKDHL-w", slug: "foundations-data", name: "Foundations: Data, Data, Everywhere", partner: "Google" },
      { courseId: "ZEB-Lgp9Eeun_RJEc0KNDw", slug: "ask-questions-make-decisions", name: "Ask Questions to Make Data-Driven Decisions", partner: "Google" },
      { courseId: "bN9fcgp9Eeu0VAqNda9Xjw", slug: "data-preparation", name: "Prepare Data for Exploration", partner: "Google" },
      { courseId: "MYbEugyHEfGWGg5tlkdcvw", slug: "retrieve--prep-data", name: "Retrieve & Prep Data", partner: "Coursera" },
      { courseId: "c9dt2Qp9Eeuf7w5EwYPThw", slug: "process-data", name: "Process Data from Dirty to Clean", partner: "Google" },
      { courseId: "gawUVgp9EeuyHQ758rw-Yw", slug: "analyze-data", name: "Analyze Data to Answer Questions", partner: "Google" },
      { courseId: "iLNlSQp9Eeun_RJEc0KNDw", slug: "visualize-data", name: "Share Data Through the Art of Visualization", partner: "Google" },
      { courseId: "fYuElDEgEeiCvhLLCIZW_A", slug: "data-analysis-with-python", name: "Data Analysis with Python", partner: "Google" },
      { courseId: "r8RBMXEzEe-uqRL6e5om0w", slug: "data-privacy-security-governance-risk-and-compliance", name: "Data Privacy, Security, Governance, Risk and Compliance", partner: "Google" },
      { courseId: "OUTGOrvTEeWuCAqiwoZfSw", slug: "excel-data-analysis", name: "Introduction to Data Analysis Using Excel", partner: "Google" },
      { courseId: "aqZafM_BEfCL0wr__9J4Qw", slug: "power-bi-data-analysis-reporting-connecting-lo095214", name: "Power BI: Data Analysis, Reporting, and Connecting", partner: "Google" },
      { courseId: "m0fACXB0EeulIxJCZb_vVQ", slug: "google-data-analytics-capstone", name: "Google Data Analytics Capstone: Complete a Case Study", partner: "Google" },
    ],
  },
  "ux-design-professional-certificate-google": {
    courseraProgramId: "TpIlAogTQ8-SJQKIE8PP9w",
    learningPathId: "rrX4ZPagR5K1-GT2oGeS9Q",
    title: "UX Design Professional Certificate (Google)",
    courses: [
      { courseId: "aDPeKsbTEeqqzg7nmRt_BQ", slug: "foundations-user-experience-design", name: "Foundations of User Experience (UX) Design", partner: "Google" },
      { courseId: "R-r2uwp-Eeuf7w5EwYPThw", slug: "start-ux-design-process", name: "Start the UX Design Process: Empathize, Define, and Ideate", partner: "Google" },
      { courseId: "TjOLkAp-EeubJBIM7h4jow", slug: "wireframes-low-fidelity-prototypes", name: "Build Wireframes and Low-Fidelity Prototypes", partner: "Google" },
      { courseId: "W5kcLAp-Eeua7xKR7OK1aw", slug: "high-fidelity-designs-prototype", name: "Create High-Fidelity Designs and Prototypes in Figma", partner: "Google" },
      { courseId: "U7e_Lgp-EeubJBIM7h4jow", slug: "conduct-ux-research", name: "Conduct UX Research and Test Early Concepts", partner: "Google" },
      // Dropped by Coursera: the 2026-09-17 Curriculum download's UX Design
      // collection (h0Rk9) no longer carries "Build Dynamic User Interfaces
      // (UI) for Websites" (YLwdQgp-Eeu0VAqNda9Xjw). The regulated syllabus
      // still names the course and carries its own `courseraSlug`
      // ("responsive-web-design-adobe-xd"), so the WAP course key and the
      // eight-course denominator are unchanged and stored progress on that
      // slug still credits by slug; only the catalog's claim that Coursera
      // delivers it is removed. See WAP-76.
      { courseId: "coP2hgp-Eeuh2QpCvqFzYQ", slug: "ux-design-jobs", name: "Design a User Experience for Social Good & Prepare for Jobs", partner: "Google" },
    ],
  },
  "aws-cloud-technology-amazon": {
    courseraProgramId: "TpIlAogTQ8-SJQKIE8PP9w",
    learningPathId: "q5z39pYDSM6c9_aWA4jOLw",
    title: "AWS Cloud Technology Professional Certificate (AWS)",
    courses: [
      { courseId: "gRUEQ0kLEe68aRLfH8OQLw", slug: "information-technology-and-aws", name: "Introduction to Information Technology and AWS Cloud", partner: "Amazon Web Services" },
      { courseId: "dQdSvWdUEeuI4Aqy1at7YQ", slug: "aws-cloud-technical-essentials", name: "AWS Cloud Technical Essentials", partner: "Amazon Web Services" },
      { courseId: "gEIVp0wWEe68aRLfH8OQLw", slug: "technical-support-for-aws-workloads", name: "Providing Technical Support for AWS Workloads", partner: "Amazon Web Services" },
      { courseId: "oQrDBkwiEe6XUQp7mwOjCw", slug: "aws-cloud-consultant-skills", name: "Skills for Working as an AWS Cloud Consultant", partner: "Amazon Web Services" },
      { courseId: "-N8vIjSrEeuqnBLYBE3j1Q", slug: "aws-cloud-practitioner-essentials", name: "AWS Cloud Practitioner Essentials", partner: "Amazon Web Services" },
      { courseId: "WyjQhRE-Ee63NRKAiQUvxw", slug: "developing-applications-in-python-on-aws", name: "Developing Applications in Python on AWS", partner: "Amazon Web Services" },
      { courseId: "FaV_7UwmEe6XUQp7mwOjCw", slug: "devops-and-project-management-aws", name: "DevOps on AWS and Project Management", partner: "Amazon Web Services" },
      { courseId: "_wAorUwnEe6XUQp7mwOjCw", slug: "automation-in-aws", name: "Automation in the AWS Cloud", partner: "Amazon Web Services" },
      { courseId: "9rSF60wpEe6pFg5BQAqraQ", slug: "data-analytics-and-databases-aws", name: "Data Analytics and Databases on AWS", partner: "Amazon Web Services" },
      { courseId: "_cJKmEwqEe6pFg5BQAqraQ", slug: "aws-well-architected-framework", name: "Capstone: Following the AWS Well Architected Framework", partner: "Amazon Web Services" },
    ],
  },
  "software-developer-professional-certificate-ibm": {
    courseraProgramId: "TpIlAogTQ8-SJQKIE8PP9w",
    learningPathId: "fT-1P-CkT6q_tT_gpM-qJw",
    title: "AI and Software Developer Professional Certificate (IBM)",
    courses: [
      { courseId: "FkAMrrwEEey8ogoy0lwspQ", slug: "introduction-to-software-engineering", name: "Introduction to Software Engineering", partner: "IBM" },
      { courseId: "mR7MlUaTEemuHQ4HpHozrA", slug: "introduction-to-ai", name: "Introduction to Artificial Intelligence (AI)", partner: "IBM" },
      { courseId: "I3MKFTq0Ee6PABLgKXk5yQ", slug: "generative-ai-introduction-and-applications", name: "Generative AI: Introduction and Applications", partner: "IBM" },
      { courseId: "nI__WUzdEe64qQ7qqom4Rw", slug: "generative-ai-prompt-engineering-for-everyone", name: "Generative AI: Prompt Engineering Basics", partner: "IBM" },
      { courseId: "yI8fAUhFEe6cKg41IVwGGw", slug: "introduction-html-css-javascript", name: "Introduction to HTML, CSS, & JavaScript", partner: "IBM" },
      { courseId: "qpVajkliEeyq9Q4Bl6meLw", slug: "getting-started-with-git-and-github", name: "Getting Started with Git and GitHub", partner: "IBM" },
      { courseId: "ejOz7RDUEei99hK0xs-tsg", slug: "python-for-applied-data-science-ai", name: "Python for Data Science, AI & Development", partner: "IBM" },
      { courseId: "naTKYx_OEe2BPRI-bktxDQ", slug: "developing-frontend-apps-with-react", name: "Developing Front-End Apps with React", partner: "IBM" },
      { courseId: "wWKidiPbEe2Psg5YTxx2NQ", slug: "developing-backend-apps-with-nodejs-and-express", name: "Developing Back-End Apps with Node.js and Express", partner: "IBM" },
      { courseId: "RRhnJTQqEeuGxw6YZU0gNQ", slug: "developing-applications-with-sql-databases-and-django", name: "Django Application Development with SQL and Databases", partner: "IBM" },
      { courseId: "GGlYeNHJEeq7SQ7kpEztwQ", slug: "ibm-containers-docker-kubernetes-openshift", name: "Introduction to Containers w/ Docker, Kubernetes & OpenShift", partner: "IBM" },
      { courseId: "ZhjmFVU3Eeibyw6mhOxdLA", slug: "applications-development-microservices-serverless-openshift", name: "Application Development using Microservices and Serverless", partner: "IBM" },
      { courseId: "R8T6cD8QEeuWjxL2VTBhwQ", slug: "python-project-for-ai-application-development", name: "Developing AI Applications with Python and Flask", partner: "IBM" },
      { courseId: "gdzwYpiAEe6Yvg6sv84HSQ", slug: "building-gen-ai-powered-applications", name: "Building Generative AI-Powered Applications with Python", partner: "IBM" },
      { courseId: "FTSm_5CLEe63Ww6tPe9iow", slug: "generative-ai-elevate-software-development-career", name: "Generative AI: Elevate your Software Development Career", partner: "IBM" },
      { courseId: "gQ_b82HOEeyipgpI5l_HwQ", slug: "software-developer-career-guide-and-interview-preparation", name: "Software Developer Career Guide and Interview Preparation", partner: "IBM" },
    ],
  },
  "it-automation-with-python-google": {
    courseraProgramId: "TpIlAogTQ8-SJQKIE8PP9w",
    learningPathId: "QnQ2KKmHTmu0Niiphy5rsQ",
    title: "IT Automation with Python Certificate (Google)",
    courses: [
      { courseId: "8D3R5HiaEeioIg7r4jw_PA", slug: "python-crash-course", name: "Crash Course on Python", partner: "Google" },
      { courseId: "3XMnuVFsEemYkgoCaF1HCg", slug: "python-operating-system", name: "Using Python to Interact with the Operating System", partner: "Google" },
      { courseId: "-qIqP1FsEemNmQ6a3syMJg", slug: "introduction-git-github", name: "Introduction to Git and GitHub", partner: "Google" },
      { courseId: "EId6wlFtEemX4g642wIuAg", slug: "troubleshooting-debugging-techniques", name: "Troubleshooting and Debugging Techniques", partner: "Google" },
      { courseId: "HuWcu1FtEemShQpcsklh7g", slug: "configuration-management-cloud", name: "Configuration Management and the Cloud", partner: "Google" },
      { courseId: "K2Ns8esJEemSygq9dtZBMw", slug: "automating-real-world-tasks-python", name: "Automating Real-World Tasks with Python", partner: "Google" },
    ],
  },
  "comptia-network-plus-professional-certificate": {
    courseraProgramId: "TpIlAogTQ8-SJQKIE8PP9w",
    learningPathId: "Qkse5-KHSUyLHufih3lMPg",
    title: "CompTIA Network+ Professional Certificate (CompTIA Net+)",
    courses: [
      { courseId: "N0l8fiV4Ee6DuxLo8f8SVQ", slug: "introduction-to-networking-nvidia", name: "Introduction to Networking", partner: "NVIDIA" },
      { courseId: "YEzwgUUYEe2WggqTpXEoiw", slug: "akamai-networking", name: "Networking Fundamentals", partner: "Akamai Technologies, Inc." },
      { courseId: "_Z744wFBEe6-2RLGGJPzEw", slug: "intro-to-os-and-hardware-1b", name: "Introduction to Contemporary Operating Systems and Hardware 1b", partner: "Illinois Tech" },
      { courseId: "P0ciGZT0EeyHuA5cIqn4NQ", slug: "introduction-to-networking-and-storage", name: "Introduction to Networking and Storage", partner: "IBM" },
      { courseId: "kVrMZeXIEe2dBg70uMCUbw", slug: "basics-of-cisco-networking", name: "Basics of Cisco Networking", partner: "LearnQuest" },
      { courseId: "PwpVaWbaEe-99A4YM4NoOw", slug: "packt-fundamentals-of-networking-and-cisco-devices-gvjwp", name: "CCNA Foundations – Networking Basics and Cisco IOS Essentials", partner: "Packt" },
      { courseId: "KfuykmTsEeeqbxLIz9M6nA", slug: "tcp-ip-advanced", name: "TCP/IP and Advanced Topics", partner: "University of Colorado System" },
      { courseId: "RP5nqGeBEe-ZVAr_5CUYPw", slug: "packt-operating-systems-and-networking-fundamentals-bokjh", name: "Operating Systems and Networking Fundamentals", partner: "Packt" },
      { courseId: "DZbN0Xc6Ee-cBRK_mZB3Bw", slug: "packt-network-foundation-and-addressing-zkkwy", name: "Network Foundations and Addressing", partner: "Packt" },
    ],
  },
  "comptia-security-plus-professional-certificate": {
    courseraProgramId: "TpIlAogTQ8-SJQKIE8PP9w",
    learningPathId: "p4o8q6jBSOOKPKuowQjjFw",
    title: "CompTIA Security+ Professional Certificate",
    // "System and Network Security" not found in Coursera catalog — skipped
    courses: [
      { courseId: "a9kCXv7xEeyQqQ4ISkSP3Q", slug: "network-security", name: "Network Security", partner: "Cisco Learning and Certifications" },
      { courseId: "A7g7jrgWEe2Qygqta7KH5Q", slug: "introduction-to-network-security", name: "Introduction to Network Security", partner: "University of London" },
      { courseId: "3pCB7HgGEem9bArpYNDHGA", slug: "network-security-database-vulnerabilities", name: "Computer Networks and Network Security", partner: "IBM" },
    ],
  },
  "cybersecurity-professional-certificate-google": {
    courseraProgramId: "TpIlAogTQ8-SJQKIE8PP9w",
    learningPathId: "gCtwKvPFS36rcCrzxSt-Yg",
    title: "Networking and Cybersecurity Professional Certificate (CompTIA Net+,Sec+)",
    courses: [
      { courseId: "N0l8fiV4Ee6DuxLo8f8SVQ", slug: "introduction-to-networking-nvidia", name: "Introduction to Networking", partner: "NVIDIA" },
      { courseId: "mHhLzQN2EfCttRIgtBdAwQ", slug: "packt-networking-fundamentals-3mbff", name: "Networking Fundamentals", partner: "Packt" },
      { courseId: "DZbN0Xc6Ee-cBRK_mZB3Bw", slug: "packt-network-foundation-and-addressing-zkkwy", name: "Network Foundations and Addressing", partner: "Packt" },
      { courseId: "PwpVaWbaEe-99A4YM4NoOw", slug: "packt-fundamentals-of-networking-and-cisco-devices-gvjwp", name: "CCNA Foundations – Networking Basics and Cisco IOS Essentials", partner: "Packt" },
      { courseId: "KfuykmTsEeeqbxLIz9M6nA", slug: "tcp-ip-advanced", name: "TCP/IP and Advanced Topics", partner: "University of Colorado System" },
      { courseId: "kVrMZeXIEe2dBg70uMCUbw", slug: "basics-of-cisco-networking", name: "Basics of Cisco Networking", partner: "LearnQuest" },
      { courseId: "S3G1qWbiEe-EPwr_9XyAcQ", slug: "packt-networking-peripherals-and-wireless-technologies-fhkx1", name: "Networking, Peripherals, and Wireless Technologies", partner: "Packt" },
      { courseId: "SCCkqlPwEe-mywr_6bZvLw", slug: "networking-in-google-cloud-network-security", name: "Networking in Google Cloud: Network Security", partner: "Google Cloud" },
      { courseId: "f6gZrWUIEe2piwrmyBNtEQ", slug: "foundations-of-cybersecurity", name: "Foundations of Cybersecurity", partner: "Google" },
      { courseId: "PeAVvmUJEe2NnA4jep2fLw", slug: "networks-and-network-security", name: "Connect and Protect: Networks and Network Security", partner: "Google" },
      { courseId: "y6mmi2UIEe21jBLFGcIQ1w", slug: "manage-security-risks", name: "Play It Safe: Manage Security Risks", partner: "Google" },
      { courseId: "7LHOTGUJEe21jBLFGcIQ1w", slug: "automate-cybersecurity-tasks-with-python", name: "Automate Cybersecurity Tasks with Python", partner: "Google" },
      { courseId: "h_qSTmUJEe21jBLFGcIQ1w", slug: "linux-and-sql", name: "Tools of the Trade: Linux and SQL", partner: "Google" },
      { courseId: "z5Fx9mUJEe2piwrmyBNtEQ", slug: "assets-threats-and-vulnerabilities", name: "Assets, Threats, and Vulnerabilities", partner: "Google" },
      { courseId: "3obxa2UJEe2NnA4jep2fLw", slug: "detection-and-response", name: "Sound the Alarm: Detection and Response", partner: "Google" },
      { courseId: "-TDPq2UJEe2piwrmyBNtEQ", slug: "prepare-for-cybersecurity-jobs", name: "Put It to Work: Prepare for Cybersecurity Jobs", partner: "Google" },
      { courseId: "_jlsu7N_EfChNw6iIZDwyw", slug: "comptia-network", name: "CompTIA Network+", partner: "Infosec" },
      { courseId: "bfGb13eJEe-cBRK_mZB3Bw", slug: "comptia-security-701", name: "CompTIA Security+ 701", partner: "Infosec" },
    ],
  },
  "it-support-and-entry-level-cyber-security-certificate": {
    courseraProgramId: "TpIlAogTQ8-SJQKIE8PP9w",
    // learningPathId not yet captured from Coursera admin URL.
    // learningPathId: null,
    title: "IT Support and Entry-Level Cybersecurity Professional Certificate (IBM)",
    courses: [
      { courseId: "76WGD1CXEe6T2Q7n3ko4Dw", slug: "introduction-to-cybersecurity-careers", name: "Introduction to Cybersecurity Careers", partner: "IBM" },
      { courseId: "R6HowJ7zEfCQWhJnHfeigQ", slug: "packt-cyber-security-professional-beginners-career-guide-avsuq", name: "Cyber Security Professional – Beginner’s Career Guide", partner: "Packt" },
      { courseId: "zKDPJ53-EfCozQ6GZcbqBQ", slug: "packt-cyber-security-for-absolute-beginners-part-1-rgokz", name: "The Absolute Beginner's Guide to Cyber Security 2026 - Part 1", partner: "Packt" },
      { courseId: "YlfzdXJKEeyKjA79ESMRTQ", slug: "introduction-to-cybersecurity-essentials", name: "Introduction to Cybersecurity Essentials", partner: "IBM" },
      { courseId: "sgUmXKaiEfCPbwr_73Z1yw", slug: "packt-cybersecurity-essentials-from-zero-to-secure-iexc7", name: "Cybersecurity Essentials - From Zero to Secure", partner: "Packt" },
      { courseId: "f6gZrWUIEe2piwrmyBNtEQ", slug: "foundations-of-cybersecurity", name: "Foundations of Cybersecurity", partner: "Google" },
      { courseId: "PeAVvmUJEe2NnA4jep2fLw", slug: "networks-and-network-security", name: "Connect and Protect: Networks and Network Security", partner: "Google" },
      { courseId: "0FMl8S8GEemvsQrYkluC5g", slug: "introduction-cybersecurity-cyber-attacks", name: "Introduction to Cybersecurity Tools & Cyberattacks", partner: "IBM" },
      { courseId: "ZTCxCE0jEfGWtRJ02S6Hnw", slug: "gen-ai-cybersecurity", name: "Fundamentals of Gen AI Cybersecurity", partner: "SkillsBooster Academy" },
      { courseId: "Ns_65Av8EfGaeQr_0lkuzQ", slug: "packt-hack-the-cybersecurity-interview", name: "Hack the Cybersecurity Interview", partner: "Packt" },
      { courseId: "dkcUhxxaEfGQ2w5GCXwtVw", slug: "packt-cybersecurity-fundamentals-isc2-certification-prep-fibdm", name: "Cybersecurity Fundamentals – ISC2 Certification Prep", partner: "Packt" },
      { courseId: "J_dVmgTOEfCd-gr_6GMchQ", slug: "packt-cyber-security-projects-for-your-dream-job-plgum", name: "Cyber Security Projects for Your Dream Job", partner: "Packt" },
    ],
  },
};

export type CourseraProgramSlug = keyof typeof DISCOVERED_COURSERA_PROGRAMS_INNER;
type CourseraDiscoveredProgramInner = (typeof DISCOVERED_COURSERA_PROGRAMS_INNER)[CourseraProgramSlug];
type CourseraDiscoveredCourseInner = CourseraDiscoveredProgramInner['courses'][number];

/** Optional fields referenced by launch URLs and program builders; not all rows define them. */
export type CourseraDiscoveredProgram = CourseraDiscoveredProgramInner & {
  courseraCollectionTitle?: string;
  publicProgramUrl?: string;
  /** Coursera Learning Path identifier — distinct from `courseraProgramId`
   *  (which is the Coursera *Program* container; one per org) and from
   *  course-level IDs. Captured from the admin URL pattern
   *  `/o/<org>/admin/content/<programSlug>/learning-path/<learningPathId>`.
   *  Used for cross-checks against the live Coursera LP catalog and as the
   *  join key for any future Coursera Business API calls scoped to a
   *  specific Learning Path. */
  learningPathId?: string;
};
export type CourseraDiscoveredCourse = CourseraDiscoveredCourseInner & { estimatedHours?: number };

/** WAP `programs.ts` slug → key in `DISCOVERED_COURSERA_PROGRAMS_INNER` (single object, no duplicate curriculum). */
const WAP_PROGRAM_DISCOVERED_ALIASES: Record<string, CourseraProgramSlug> = {
  'comptia-a-professional-certificate': 'comptia-a-plus',
  'comptia-network-professional-certificate': 'comptia-network-plus-professional-certificate',
  'comptia-security-professional-certificate': 'comptia-security-plus-professional-certificate',
  'digital-marketing-e-commerce-google': 'digital-marketing-e-commerce-professional-certificate-google',
  // Same MBCHIT Learning Path; without this alias the program built 14
  // synthetic course slugs that can never match xAPI completions.
  'medical-billing-and-coding-certificate': 'health-information-technology-mchit',
};

function mergeDiscoveredWithWapAliases(
  inner: Record<CourseraProgramSlug, CourseraDiscoveredProgram>,
  aliases: Record<string, CourseraProgramSlug>,
): Record<string, CourseraDiscoveredProgram> {
  const out: Record<string, CourseraDiscoveredProgram> = { ...inner };
  for (const [wapSlug, innerKey] of Object.entries(aliases)) {
    out[wapSlug] = inner[innerKey];
  }
  return out;
}

export const DISCOVERED_COURSERA_PROGRAMS: Record<string, CourseraDiscoveredProgram> =
  mergeDiscoveredWithWapAliases(DISCOVERED_COURSERA_PROGRAMS_INNER, WAP_PROGRAM_DISCOVERED_ALIASES);
