/**
 * Canonical transcription of the 12 TWC program syllabi supplied July 2026,
 * including the three EDvera-approved amendments received August 27, 2026.
 *
 * This module is dependency-free so both the Next portal and Astro marketing
 * build consume the same regulatory source. Preserve source wording exactly;
 * resolve source-document inconsistencies with the program owner before edits.
 */

export interface ProgramSyllabusCourse {
  name: string;
  hours: number;
  description: string;
  /** Official Coursera /learn slug from the approved syllabus, when present. */
  courseraSlug?: string;
  /**
   * Explicit Coursera course id when the syllabus title does not match the
   * Coursera catalog title (the regulated wording must be preserved, so the
   * fuzzy name match in `mkProgram` cannot be loosened to cover it).
   */
  courseraCourseId?: string;
}

export interface ProgramSyllabus {
  slug: string;
  title: string;
  providers: string;
  providerLine: string;
  deliveryFormat: string;
  totalHours: number;
  totalHoursLabel: string;
  clockHours: number;
  labHours: number;
  costLabel: string;
  tuitionAndFees: number;
  description: string;
  recommendedPrerequisite?: string;
  courses: ProgramSyllabusCourse[];
  sourceDocument: string;
  sourceSha256: string;
  sourceNotes?: string[];
}

export const PROGRAM_SYLLABI = {
  "it-support-professional-certificate-ibm": {
    "slug": "it-support-professional-certificate-ibm",
    "title": "IT Support Professional Certificate (IBM)",
    "providers": "IBM & Google via Coursera",
    "providerLine": "Powered by IBM & Google via Coursera   |   Delivery Format: Hybrid, Self-Paced",
    "deliveryFormat": "Hybrid, Self-Paced",
    "totalHours": 160,
    "totalHoursLabel": "160 Hours (102 Clock + 58 Lab/Project/Test Prep)",
    "clockHours": 102,
    "labHours": 58,
    "costLabel": "$7500 = $7500 tuition and fees",
    "tuitionAndFees": 7500,
    "description": "Learn the latest skills and tools used by IT support professionals — including hardware and software setup, technical support, customer service, ticketing systems, service level agreements, and troubleshooting. Prepares students for entry-level IT support roles.",
    "courses": [
      {
        "name": "Introduction to Technical Support",
        "hours": 12,
        "description": "Essential tools, customer service skills, and industry certifications."
      },
      {
        "name": "Introduction to Hardware and Operating Systems",
        "hours": 16,
        "description": "Essential hardware and operating system knowledge for a career in IT support, networking, cybersecurity, or software development."
      },
      {
        "name": "Introduction to Software, Programming, and Databases",
        "hours": 18,
        "description": "Basics of software, cloud computing, programming, and databases. Covers software types, the software lifecycle, browser management, and security."
      },
      {
        "name": "Introduction to Networking and Storage",
        "hours": 12,
        "description": "Foundational skills in networking, storage, and system administration. Network types, cables, topologies, and how data moves through networks."
      },
      {
        "name": "Introduction to Cloud Computing",
        "hours": 12,
        "description": "Basics of cloud computing and supporting technologies. Service models like IaaS and SaaS, plus public, private, and hybrid cloud setups."
      },
      {
        "name": "Introduction to Cybersecurity Essentials",
        "hours": 12,
        "description": "Beginner-friendly course on essential cybersecurity skills for anyone using computers and the internet."
      },
      {
        "name": "Technical Support (IT) Case Studies and Capstone",
        "hours": 9,
        "description": "Apply what you've learned in the IT Support Professional Certificate to real-world situations."
      },
      {
        "name": "Practice Exam for CompTIA Tech+ Certification",
        "hours": 3,
        "description": "Prep for the CompTIA ITF+ Certification exam — requirements, format, and key topics like IT concepts, software, infrastructure, databases, and security."
      },
      {
        "name": "Tech Support Career Guide and Interview Preparation",
        "hours": 8,
        "description": "Prepares you for a technical support career — typical job tasks, career paths, resumes, portfolios, cover letters, and elevator pitches."
      },
      {
        "name": "Lab, Project, and Test Preparation",
        "hours": 58,
        "description": "Hands-on labs, project work, and test preparation supporting all program competencies."
      }
    ],
    "sourceDocument": "1-IT_Support_Professional_Certificate_IBM.docx",
    "sourceSha256": "107b080538dbd2b9dbf9a15274a071cbce40cb480092ee96c66f4cee1bf5aeac",
    "sourceNotes": [
      "The course title says CompTIA Tech+ while its description says CompTIA ITF+; both are preserved verbatim."
    ]
  },
  "comptia-a-professional-certificate": {
    "slug": "comptia-a-professional-certificate",
    "title": "CompTIA A+ Professional Certificate (CompTIA A+)",
    "providers": "Microsoft & Google via Coursera",
    "providerLine": "Powered by Microsoft & Google via Coursera   |   Delivery Format: Hybrid, Self-Paced",
    "deliveryFormat": "Hybrid, Self-Paced",
    "totalHours": 160,
    "totalHoursLabel": "160 Hours (83 Clock + 77 Lab/Prep)",
    "clockHours": 83,
    "labHours": 77,
    "costLabel": "$7500 = $7500 tuition and fees",
    "tuitionAndFees": 7500,
    "description": "Build foundational skills in IT, computer hardware, operating systems, networking, and customer service. Prepares students for the CompTIA A+ certification — a renowned credential for entry-level IT professionals seeking helpdesk and computer support roles.",
    "courses": [
      {
        "name": "Technical Support Fundamentals",
        "hours": 18,
        "description": "Introduction to Information Technology — computer hardware, the Internet, computer software, troubleshooting, and customer service."
      },
      {
        "name": "IT Fundamentals and Hardware Essentials",
        "hours": 7,
        "description": "Identify and install key PC hardware components. Understand the role of BIOS, RAM, and CPU and their impact on system performance."
      },
      {
        "name": "Foundations of IT and Core Hardware Components",
        "hours": 9,
        "description": "In-depth understanding of key IT concepts and the critical hardware components that power modern computers — preparing for the CompTIA A+ certification."
      },
      {
        "name": "Foundations of Computer Hardware and Storage",
        "hours": 5,
        "description": "A solid foundation in computer hardware and mass storage technologies, focused on concepts critical to passing the CompTIA A+ exams."
      },
      {
        "name": "Operating Systems and Network Fundamentals",
        "hours": 11,
        "description": "Comprehensive understanding of operating systems and networking essentials, including installations across Windows 10/11, macOS, and Linux."
      },
      {
        "name": "Networking, Peripherals, and Wireless Technologies",
        "hours": 7,
        "description": "Identify and configure essential peripheral devices for optimal system performance, troubleshoot displays, and install graphics cards."
      },
      {
        "name": "Advanced Networking, Security, and IT Operations",
        "hours": 7,
        "description": "Configure wireless access points (WAPs), secure connections with encryption, and troubleshoot wireless issues in home and enterprise environments."
      },
      {
        "name": "CompTIA Practice",
        "hours": 10,
        "description": "Geared towards anyone preparing for the CompTIA A+ exam — focused on computer support and helpdesk learning techniques."
      },
      {
        "name": "Practice Exams for CompTIA A+ Certification",
        "hours": 9,
        "description": "Comprehensively prepare for the exam with expert-designed cheat sheets and two simulated mock exams."
      },
      {
        "name": "Lab, Project, and Test Preparation",
        "hours": 77,
        "description": "Hands-on labs, project work, and test preparation supporting all program competencies."
      }
    ],
    "sourceDocument": "2-CompTIA_A_Professional_Certificate_CompTIA_A.docx",
    "sourceSha256": "e25f11cea5d1fb19078a74a715f0e608fc40d5e82297785f3137323eaea36a9e"
  },
  "cybersecurity-professional-certificate-google": {
    "slug": "cybersecurity-professional-certificate-google",
    "title": "Networking and Cybersecurity Professional Certificate (Net+, Sec+)",
    "providers": "Microsoft, Google & Google Cloud via Coursera",
    "providerLine": "Powered by Microsoft, Google & Google Cloud via Coursera   |   Delivery Format: Hybrid, Self-Paced",
    "deliveryFormat": "Hybrid, Self-Paced",
    "totalHours": 160,
    "totalHoursLabel": "160 Clock Hours",
    "clockHours": 160,
    "labHours": 0,
    "costLabel": "$7500 = $7500 tuition and fees",
    "tuitionAndFees": 7500,
    "description": "A career-launch program designed for learners with a CompTIA A+ foundation who want to add the Network+ and Security+ credentials that modern employers demand. The curriculum follows a deliberate progression: build complete networking fluency (LANs, WANs, TCP/IP, Cisco IOS, wireless, and cloud networking) preparing for the CompTIA Network+ exam, then layer cybersecurity frameworks, network defense, threat and vulnerability analysis, and incident detection-and-response preparing for the CompTIA Security+ exam. Graduates leave dual-credential ready for entry-level roles in network administration, network security, and security operations.",
    "recommendedPrerequisite": "CompTIA A+ Certification (or equivalent foundational IT/hardware/OS knowledge)",
    "courses": [
      {
        "name": "Introduction to Networking",
        "hours": 2,
        "description": "Phase 1 (Net+): Ethernet technology basics and how data is forwarded across an Ethernet network. Establishes shared vocabulary for everything that follows."
      },
      {
        "name": "Networking Fundamentals",
        "hours": 22,
        "description": "Phase 1 (Net+): Master network theory, internet infrastructure, basic network security, management, and structured troubleshooting — the core competencies measured on the CompTIA Network+ exam."
      },
      {
        "name": "Network Foundations and Addressing",
        "hours": 7,
        "description": "Phase 1 (Net+): Design efficient network architectures for both small and enterprise environments. IP addressing, subnetting, and architecture trade-offs."
      },
      {
        "name": "CCNA Foundations: Networking Basics and Cisco IOS Essentials",
        "hours": 8,
        "description": "Phase 1 (Net+): Foundational understanding of the OSI and TCP/IP networking models and how Cisco IOS implements them."
      },
      {
        "name": "TCP/IP and Advanced Topics",
        "hours": 15,
        "description": "Phase 1 (Net+): In-depth study of the TCP/IP protocol suite — ports, services, encapsulation, and protocol-level troubleshooting."
      },
      {
        "name": "Basics of Cisco Networking",
        "hours": 10,
        "description": "Phase 1 (Net+): Hands-on Cisco device configuration — switching, routing fundamentals, and command-line operations on enterprise networking equipment."
      },
      {
        "name": "Networking, Peripherals, and Wireless Technologies",
        "hours": 6,
        "description": "Phase 1 (Net+): Wireless networking standards, peripheral configuration, and the integration points between end-user devices and the network."
      },
      {
        "name": "Networking in Google Cloud: Network Security",
        "hours": 9,
        "description": "Bridge Phase: Modern cloud networking — VPCs, firewall rules, Cloud Armor, Identity-Aware Proxy, and hybrid/multi-cloud connectivity. Transitions the learner from on-prem networking into cloud-era security thinking."
      },
      {
        "name": "Foundations of Cybersecurity",
        "hours": 10,
        "description": "Phase 2 (Sec+): Recognize core cybersecurity analyst competencies, identify how attacks impact business operations, explain security ethics, and identify common analyst tools — including an introduction to SIEM platforms."
      },
      {
        "name": "Connect and Protect: Networks and Network Security",
        "hours": 12,
        "description": "Phase 2 (Sec+): Apply networking knowledge to defense — secure networks against intrusion tactics, apply system hardening, and configure VPNs, firewalls, and segmentation."
      },
      {
        "name": "Play It Safe: Manage Security Risks",
        "hours": 9,
        "description": "Phase 2 (Sec+): Examine how organizations use security frameworks (NIST CSF, ISO 27001) and controls to protect operations. Use SIEM tools and incident-response playbooks."
      },
      {
        "name": "Assets, Threats, and Vulnerabilities",
        "hours": 19,
        "description": "Phase 2 (Sec+): Classify assets, analyze attack surfaces, identify threats (social engineering, malware, web exploits), and summarize threat modeling — including the MITRE ATT&CK framework and cryptography fundamentals."
      },
      {
        "name": "Put It to Work: Prepare for Cybersecurity Jobs",
        "hours": 11,
        "description": "Phase 3: Determine when and how to escalate incidents, engage with the cybersecurity community, and prepare for interviews. Includes AI-augmented workflows for vulnerability analysis and alert triage."
      },
      {
        "name": "CompTIA Network+ and Security+ Exam Practice",
        "hours": 20,
        "description": "Phase 3: Targeted exam preparation for both CompTIA Network+ (N10-009) and CompTIA Security+ (SY0-701). Includes objective-mapped review, practice exams, hands-on labs, and test-taking strategy to maximize first-attempt pass rates."
      }
    ],
    "sourceDocument": "3-Networking_and_Cybersecurity_Professional_Certificate_Net_Sec.pdf",
    "sourceSha256": "22f28a7d1e174054d5d7226b559b7ccaeddd885d8f77cfcf78f7a05289af6da2"
  },
  "project-management-professional-certificate-microsoft": {
    "slug": "project-management-professional-certificate-microsoft",
    "title": "Project Management Professional Certificate (Microsoft)",
    "providers": "Microsoft & Google via Coursera",
    "providerLine": "Powered by Microsoft & Google via Coursera   |   Delivery Format: Hybrid, Self-Paced",
    "deliveryFormat": "Hybrid, Self-Paced",
    "totalHours": 160,
    "totalHoursLabel": "160 Hours (160 Clock)",
    "clockHours": 160,
    "labHours": 0,
    "costLabel": "$7500 = $7500 tuition and fees",
    "tuitionAndFees": 7500,
    "description": "This 10-course certificate program prepares students for a successful career in project management and supports those seeking PMP® certification. Through real-world examples, Agile and hybrid methodologies, and exam prep, students develop practical project leadership skills and familiarity with PMI project standards.",
    "courses": [
      {
        "name": "Project Management Fundamentals",
        "hours": 16,
        "description": "Introduction to key concepts such as scope, schedule, and risk in managing successful projects."
      },
      {
        "name": "Team Building and Leadership in Project Management",
        "hours": 14,
        "description": "Covers leadership styles, motivation, and strategies for building and managing strong project teams."
      },
      {
        "name": "Project Manager Engagement with Stakeholders",
        "hours": 12,
        "description": "Identify stakeholders and build effective communication and engagement strategies."
      },
      {
        "name": "Process Groups and Processes in Project Management",
        "hours": 15,
        "description": "Details PMI's five process groups and their roles in organizing and executing project activities."
      },
      {
        "name": "PMP Formulas",
        "hours": 16,
        "description": "Focus on quantitative PMP exam formulas including cost and schedule performance metrics."
      },
      {
        "name": "Project Management Principles",
        "hours": 14,
        "description": "Reviews ethical and foundational principles that guide decision-making and project leadership."
      },
      {
        "name": "PM4R Agile: Agile Mindset in Development Projects",
        "hours": 21,
        "description": "Introduces Agile values and tools in international development and nonprofit project environments."
      },
      {
        "name": "PM4R Agile: 5 Steps for Hybrid Management of Projects",
        "hours": 19,
        "description": "Teaches a hybrid methodology for blending traditional and Agile practices across sectors."
      },
      {
        "name": "Project Management Performance Domains",
        "hours": 14,
        "description": "Explores PMI-defined domains such as planning, delivery, and stakeholder engagement."
      },
      {
        "name": "PMP Application Process and Practice Exam",
        "hours": 19,
        "description": "Provides step-by-step application support and includes a full-length practice PMP® exam."
      }
    ],
    "sourceDocument": "4-Project_Management_Professional_Certificate_Microsoft.docx",
    "sourceSha256": "d8cf4a5b52674f3c025115b29f59d49b4460eafbdab120e31a35ca395ba4539f"
  },
  "ai-practitioner-professional-certificate-aws": {
    "slug": "ai-practitioner-professional-certificate-aws",
    "title": "AI Practitioner Professional Certificate (AWS)",
    "providers": "IBM, AWS, Anthropic, Packt, Politecnico di Milano, Lund, UVA Darden, Rutgers & Kennesaw State via Coursera",
    "providerLine": "Powered by IBM, AWS, Anthropic, Packt, Politecnico di Milano, Lund, UVA Darden, Rutgers & Kennesaw State via Coursera  Delivery Format: Hybrid, Self-Paced   |",
    "deliveryFormat": "Hybrid, Self-Paced",
    "totalHours": 160,
    "totalHoursLabel": "160 Hours Total=145 Clock Hours + 15 Lab Hours",
    "clockHours": 145,
    "labHours": 15,
    "costLabel": "$7500 = $7500 tuition and fees",
    "tuitionAndFees": 7500,
    "description": "A 16-course pathway for non-technical and business professionals who need to apply Artificial Intelligence in real-world work. Curriculum sourced from leading universities and industry providers covers AI foundations, generative AI and prompt engineering, ethics and responsible AI, AI for business and digital transformation, AI applied across communication, sales, marketing, and CRM (Salesforce), and certification-track content from AWS, Anthropic (Claude), and Packt. Graduates leave practitioner-ready — prepared to deploy AI tools, design effective prompts, evaluate vendor solutions, and lead AI initiatives.",
    "courses": [
      {
        "name": "Introduction to Artificial Intelligence (AI)",
        "hours": 11,
        "description": "AI fundamentals from IBM — prompt engineering, automation, machine learning vs. deep learning, and the AI roles."
      },
      {
        "name": "Artificial Intelligence: An Overview",
        "hours": 8,
        "description": "Politecnico di Milano’s broad overview of AI — historical context, core techniques, neural networks, and how AI systems are designed, evaluated, and deployed."
      },
      {
        "name": "Introduction to Digital Transformation Part 1",
        "hours": 9,
        "description": "UVA Darden’s framework— strategy, customer experience, data, and the organizational capabilities to lead AI-driven change."
      },
      {
        "name": "AI For All",
        "hours": 6,
        "description": "AI CERTs introduction designed for non-technical audiences — what AI is, what it can and cannot do, and how to identify high-value AI opportunities at work."
      },
      {
        "name": "AI Concepts and Strategy",
        "hours": 8,
        "description": "Rutgers University course on translating AI capabilities into business strategy — build vs. buy decisions, ROI framing, and managing AI initiatives."
      },
      {
        "name": "AI for Professional Communication",
        "hours": 9,
        "description": "Course on using AI tools to improve writing, presentations, meetings, and stakeholder communication."
      },
      {
        "name": "Understand and Apply Artificial Intelligence Fundamentals",
        "hours": 8,
        "description": "Course covering applied AI fundamentals — supervised vs. unsupervised learning, model evaluation, and practical deployment considerations."
      },
      {
        "name": "AI for Business: Generation & Prediction",
        "hours": 10,
        "description": "Coursera course on the two foundational AI capabilities — generation (text, images, code) and prediction (forecasts, classifications) — and how to apply each in business workflows."
      },
      {
        "name": "Artificial Intelligence: Ethics & Societal Challenges",
        "hours": 11,
        "description": "Lund University course on AI ethics — bias, fairness, transparency, accountability, privacy, and the societal impact of automated decision-making."
      },
      {
        "name": "ChatGPT — Foundations",
        "hours": 6,
        "description": "Packt course on ChatGPT fundamentals — capabilities, limitations, prompting patterns, and practical use cacross knowledge work."
      },
      {
        "name": "ChatGPT for Beginners: Using AI for Market Research",
        "hours": 2,
        "description": "Hands-on guided project — use ChatGPT to design research questions, synthesize competitive intelligence, and produce market analysis deliverables."
      },
      {
        "name": "AI Fundamentals with Claude",
        "hours": 7,
        "description": "Anthropic course on using Claude — prompt engineering, working with long context, and constitutional AI principles."
      },
      {
        "name": "Sales with AI",
        "hours": 6,
        "description": "AI CERTs course on AI across the sales lifecycle — lead scoring, call analysis, forecasting, and pipeline management."
      },
      {
        "name": "AI for Marketing",
        "hours": 6,
        "description": "AI CERTs course on AI-augmented marketing — audience segmentation, content generation, and campaign optimization."
      },
      {
        "name": "Salesforce Certified AI Associate Certification",
        "hours": 30,
        "description": "Packt certification-track preparation — AI fundamentals applied within the Salesforce platform, Einstein AI, predictive vs. generative AI in CRM, and exam objectives for the Salesforce AI Associate credential."
      },
      {
        "name": "AWS Artificial Intelligence Practitioner",
        "hours": 8,
        "description": "AWS-authored learning plan aligned with the AWS Certified AI Practitioner (AIF-C01) exam — ML/AI concepts, generative AI, AWS AI/ML services (SageMaker, Bedrock), responsible AI, security and governance, and prompt engineering essentials."
      },
      {
        "name": "Lab, Project, and Test Preparation",
        "hours": 15,
        "description": "Hands-on labs, project work, and test preparation supporting all program competencies"
      }
    ],
    "sourceDocument": "5-AI_Practitioner_Professional_Certificate_AWS.docx",
    "sourceSha256": "463235611e3bbdc611e382bbfd6bd19a1c895d5e70ea34f572549e4447f3b3ab",
    "sourceNotes": [
      "The description calls this a 16-course pathway; the source lists 16 topical courses plus one 15-hour lab/project/test-preparation module.",
      "The source phrase 'practical use cacross knowledge work' is preserved verbatim."
    ]
  },
  "data-analytics-professional-certificate-google": {
    "slug": "data-analytics-professional-certificate-google",
    "title": "Management Analyst & Business Intelligence Professional Certificate",
    "providers": "Google & IBM via Coursera",
    "providerLine": "Powered by Google & IBM via Coursera   |   Delivery Format: Hybrid, Self-Paced",
    "deliveryFormat": "Hybrid, Self-Paced",
    "totalHours": 160,
    "totalHoursLabel": "160 Hours",
    "clockHours": 147,
    "labHours": 13,
    "costLabel": "$7500 = $7500 tuition and fees",
    "tuitionAndFees": 7500,
    "description": "This 160-hour professional certificate prepares learners for careers as management analysts and business intelligence professionals. Learners build the core competencies of management consulting and business analysis - problem scoping, stakeholder and requirements management, business strategy, and financial analysis - and combine them with data analytics, visualization, and dashboarding to turn data into recommendations that help organizations operate more efficiently and effectively, culminating in an integrated consulting capstone and a professional portfolio.",
    "courses": [
      {
        "name": "Introduction to Management Consulting",
        "hours": 13,
        "description": "Introduces what management consultants do, the consulting lifecycle, engagement types, and the core skills used to advise organizations.",
        "courseraSlug": "introduction-to-management-consulting"
      },
      {
        "name": "Introduction to Business Analysis",
        "hours": 14,
        "description": "Covers the fundamentals of business analysis and its role in organizations, including analyzing needs and recommending solutions.",
        "courseraSlug": "introduction-to-business-analysis"
      },
      {
        "name": "Project, Stakeholder, and Requirements Management Fundamentals",
        "hours": 11,
        "description": "Builds skills in managing projects, stakeholders, and requirements - eliciting, documenting, prioritizing, and tracking business needs.",
        "courseraSlug": "project-stakeholder-and-requirements-management-fundamentals"
      },
      {
        "name": "Business Strategy: Creating Competitive Advantage",
        "hours": 13,
        "description": "Applies strategic analysis frameworks and tools to assess competitive position and shape future-oriented business strategy.",
        "courseraSlug": "business-strategy-creating-competitive-advantage"
      },
      {
        "name": "Financial Analysis and Modeling",
        "hours": 19,
        "description": "Develops financial analysis and modeling skills to evaluate performance, costs, and options that inform management decisions.",
        "courseraSlug": "financial-analysis-and-modeling"
      },
      {
        "name": "Foundations: Data, Data, Everywhere",
        "hours": 12,
        "description": "Introduces the world of data analytics - the analyst mindset, tools, and the data lifecycle used to support decision-making.",
        "courseraSlug": "foundations-data"
      },
      {
        "name": "Ask Questions to Make Data-Driven Decisions",
        "hours": 15,
        "description": "Builds skills to ask effective questions, work with stakeholders, and use data to make sound, evidence-based decisions.",
        "courseraSlug": "ask-questions-make-decisions"
      },
      {
        "name": "Data Visualization and Dashboards with Excel and Cognos",
        "hours": 16,
        "description": "Creates business visualizations and interactive dashboards with Excel and IBM Cognos to communicate insights to stakeholders.",
        "courseraSlug": "data-visualization-dashboards-excel-cognos"
      },
      {
        "name": "Generative AI: Transform Your Management Consulting",
        "hours": 15,
        "description": "Applies generative AI tools and techniques to accelerate research, analysis, and deliverables across consulting engagements.",
        "courseraSlug": "generative-ai-transform-your-management-consulting"
      },
      {
        "name": "Capstone: Integrated Management Consulting Project",
        "hours": 19,
        "description": "Delivers an end-to-end consulting engagement from problem scoping to executive presentation and implementation planning.",
        "courseraSlug": "capstone-integrated-management-consulting-project"
      },
      {
        "name": "Management & Data Analytics Lab and Workforce Readiness",
        "hours": 13,
        "description": "Hands-on applied lab plus career-readiness activities: resume alignment, portfolio presentation, and interview preparation."
      }
    ],
    "sourceDocument": "6-Management Analyst & Business Intelligence Professional Certificate (IBM).pdf",
    "sourceSha256": "49079c1479a516089f3a374dbcbc35dc2b0b267eb99c22b22db93ea9777a41af",
    "sourceNotes": [
      "Approved EDvera resubmission: O*NET 13-1111 Management Analysts (primary), O*NET 13-1161 Market Research Analysts and Marketing Specialists (secondary), and CIP 52.1301 Management Science, General.",
      "WorkforceAP-curated pathway using selected Google and IBM courses; completion does not by itself confer the separate full IBM Management Consultant or Google Data Analytics professional certificates."
    ]
  },
  "data-science-professional-certificate-ibm": {
    "slug": "data-science-professional-certificate-ibm",
    "title": "Database Administrator (DBA) Professional Certificate (IBM)",
    "providers": "IBM via Coursera",
    "providerLine": "Powered by IBM via Coursera   |   Delivery Format: Online, Self-Paced",
    "deliveryFormat": "Online, Self-Paced",
    "totalHours": 160,
    "totalHoursLabel": "160 Hours",
    "clockHours": 160,
    "labHours": 0,
    "costLabel": "$7500 = $7500 tuition and fees",
    "tuitionAndFees": 7500,
    "description": "This 160-hour professional certificate prepares learners for careers as database administrators. Learners first build relational database and SQL foundations, then develop the operational skills at the center of database administration: installation and configuration, user access and security, backup and recovery, monitoring and performance tuning, automation with Linux and shell scripting, data movement through ETL pipelines, and data warehouse management, culminating in a portfolio-ready database administration capstone.",
    "courses": [
      {
        "name": "Introduction to Data Engineering",
        "hours": 14,
        "description": "Introduces the data engineering lifecycle, data stores, relational and NoSQL systems, ETL/ELT, data pipelines, security, governance, and compliance.",
        "courseraSlug": "introduction-to-data-engineering"
      },
      {
        "name": "Introduction to Relational Databases (RDBMS)",
        "hours": 16,
        "description": "Covers relational database concepts, information and data models, entity-relationship diagrams, schema design and normalization, tables, keys, and getting started with MySQL, PostgreSQL, and IBM Db2.",
        "courseraSlug": "introduction-to-relational-databases"
      },
      {
        "name": "Databases and SQL for Data Science with Python",
        "hours": 18,
        "description": "Covers relational database creation and SQL with DDL/DML, joins, views, transactions, stored procedures, and accessing databases from Python.",
        "courseraSlug": "sql-data-science"
      },
      {
        "name": "Python for Data Science, AI & Development",
        "hours": 24,
        "description": "Builds Python skills in syntax, data structures, functions, and libraries used to script, automate, and interact with databases and data pipelines.",
        "courseraSlug": "python-for-applied-data-science-ai"
      },
      {
        "name": "Hands-on Introduction to Linux Commands and Shell Scripting",
        "hours": 17,
        "description": "Develops Linux and Unix command-line skills and Bash shell scripting to schedule, automate, and manage database and system administration tasks.",
        "courseraSlug": "hands-on-introduction-to-linux-commands-and-shell-scripting"
      },
      {
        "name": "ETL and Data Pipelines with Shell, Airflow and Kafka",
        "hours": 18,
        "description": "Builds ETL and ELT data pipelines using Bash, Apache Airflow, and Apache Kafka for batch and streaming data movement into databases and warehouses.",
        "courseraSlug": "etl-and-data-pipelines-shell-airflow-kafka"
      },
      {
        "name": "Data Warehouse Fundamentals",
        "hours": 16,
        "description": "Covers data warehouse design and implementation, star and snowflake schemas, staging, populating a warehouse, and building analytics-ready data structures.",
        "courseraSlug": "data-warehouse-fundamentals"
      },
      {
        "name": "Relational Database Administration (DBA)",
        "hours": 21,
        "description": "Builds operational DBA skills in configuration, backup and restore, roles and permissions, performance monitoring, troubleshooting, and automation.",
        "courseraSlug": "relational-database-administration"
      },
      {
        "name": "Relational Database Administration Capstone Project",
        "hours": 16,
        "description": "Integrates OLTP and warehouse design, MySQL/PostgreSQL, ETL with Airflow, backup and recovery, access control, encryption, and query optimization.",
        "courseraSlug": "relational-database-administration-capstone-project"
      }
    ],
    "sourceDocument": "7-Database Administrator (DBA) Professional Certificate (IBM).pdf",
    "sourceSha256": "f1c3f8eb3838bc76bc7863b72ab7245ca5f632131cde28775f1b212037a1289f",
    "sourceNotes": [
      "Approved EDvera resubmission: O*NET 15-1245 Database Administrators (primary), O*NET 15-1243 Database Architects (secondary), and CIP 11.0802 Data Modeling/Warehousing and Database Administration.",
      "WorkforceAP-curated pathway using selected IBM courses; completion does not by itself confer the separate full IBM Relational Database Administrator with GenAI professional certificate."
    ]
  },
  "aws-cloud-technology-amazon": {
    "slug": "aws-cloud-technology-amazon",
    "title": "AWS Cloud Technology Professional Certificate (AWS)",
    "providers": "Amazon Web Services via Coursera",
    "providerLine": "Powered by Amazon Web Services via Coursera   |   Delivery Format: Hybrid, Self-Paced",
    "deliveryFormat": "Hybrid, Self-Paced",
    "totalHours": 160,
    "totalHoursLabel": "160 Hours=115 Clock Hours + 45 Lab Hours",
    "clockHours": 115,
    "labHours": 45,
    "costLabel": "$7500 = $7500 tuition and fees",
    "tuitionAndFees": 7500,
    "description": "Prepare for a new career in the fast-growing field of cloud computing and AWS consulting. Built and delivered by Amazon Web Services on Coursera, this 10-course program builds in-demand cloud skills across foundational IT, AWS core services, technical support, consulting, application development on AWS, DevOps, automation, data analytics, and the AWS Well-Architected Framework.",
    "courses": [
      {
        "name": "Introduction to Information Technology and AWS Cloud",
        "hours": 6,
        "description": "Foundational technology context for the cloud — starting from zero technical knowledge. Covers how computers work, modern IT infrastructure, internet-connected networks (web servers, web applications, DNS, IT security), and the basics of Cloud Computing including public, private, and hybrid models, plus the role of APIs."
      },
      {
        "name": "AWS Cloud Technical Essentials",
        "hours": 20,
        "description": "Build a highly available, scalable, and cost-effective application step-by-step on AWS. Make informed decisions about when and how to apply core AWS services for compute (EC2, Lambda, ECS), storage (S3, EBS), and databases (RDS, DynamoDB). Includes AWS shared responsibility model, IAM, and using AWS services to monitor and optimize cloud infrastructure."
      },
      {
        "name": "Providing Technical Support for AWS Workloads",
        "hours": 7,
        "description": "Gain the knowledge and skills to troubleshoot cloud-related issues. Review AWS infrastructure, develop a troubleshooting mindset, and learn AWS Support methods. Troubleshoot scenarios across Amazon EC2, AWS Lambda, and Amazon VPC, and apply controls with Amazon S3, Amazon RDS, AWS IAM, and AWS Organizations."
      },
      {
        "name": "Skills for Working as an AWS Cloud Consultant",
        "hours": 10,
        "description": "Develop the soft skills essential to cloud consulting — critical thinking, analytical problem-solving, customer requirements gathering, solution design, project execution, and stakeholder management. Build professional relationships, establish a personal brand, plan skill development, and prepare resumes and interview techniques."
      },
      {
        "name": "AWS Cloud Practitioner Essentials",
        "hours": 36,
        "description": "A comprehensive 13-module overview preparing learners for the AWS Certified Cloud Practitioner exam. Covers the AWS Global Infrastructure, compute (EC2, Lambda, containers, Elastic Beanstalk), networking (VPC), storage, databases, AI/ML and data analytics on AWS, security, monitoring and governance, pricing and support, migration strategies, and the AWS Well-Architected Framework."
      },
      {
        "name": "Developing Applications in Python on AWS",
        "hours": 10,
        "description": "A thorough introduction to Python programming for AWS applications. Covers Python syntax, variables, functions, and packages; serverless architectures with AWS Lambda, Amazon API Gateway, and Cloud9; AWS databases with Amazon RDS and DynamoDB; and application integration services including Amazon SNS, SQS, and EventBridge — culminating in a hands-on Python and DynamoDB project."
      },
      {
        "name": "DevOps on AWS and Project Management",
        "hours": 9,
        "description": "Understand how software is built, tested, and deployed in modern teams. Define projects and apply project management best practices, then compare Waterfall, Agile, Scrum, and Kanban methodologies. Build a Continuous Integration / Continuous Delivery (CI/CD) pipeline using AWS CodeCommit, CodeBuild, CodeDeploy, and CodePipeline, with hands-on labs in Cloud9."
      },
      {
        "name": "Automation in the AWS Cloud",
        "hours": 8,
        "description": "Simplify processes, enable agility and scalability, and deploy faster through cloud automation. Use the AWS CLI and Bash scripting for automation, apply Infrastructure as Code (IaC) with AWS CloudFormation, manage configuration as code, and use AWS Systems Manager and AWS Config for at-scale resource management."
      },
      {
        "name": "Data Analytics and Databases on AWS",
        "hours": 9,
        "description": "Learn to think and act like a data analyst on AWS. Compare ETL and ELT approaches, explore data types, structures, and metadata, and contrast SQL and NoSQL databases. Apply AWS services for the ETL pipeline — Amazon API Gateway, AWS Lambda, Amazon RDS, Amazon DynamoDB, and Amazon QuickSight — labs."
      },
      {
        "name": "Capstone: Following the AWS Well-Architected Framework",
        "hours": 45,
        "description": "A thorough review of the six pillars of the AWS Well-Architected Framework — Operational Excellence, Security, Reliability, Performance Efficiency, Cost Optimization, and Sustainability. Apply the framework to a real architecture, complete the capstone project document, and prepare for AWS Cloud Consultant interviews with a question bank."
      }
    ],
    "sourceDocument": "8-AWS_Cloud_Technology_Professional_Certificate_AWS.docx",
    "sourceSha256": "91f2848866dc01fd057dccbf66e4afc28b54e2faf473281cb5c77ef7864743c0"
  },
  "ux-design-professional-certificate-google": {
    "slug": "ux-design-professional-certificate-google",
    "title": "User Experience & Interface Design Professional Certificate",
    "providers": "Google via Coursera",
    "providerLine": "Powered by Google via Coursera   |   Delivery Format: Hybrid, Self-Paced",
    "deliveryFormat": "Hybrid, Self-Paced",
    "totalHours": 160,
    "totalHoursLabel": "160 Hours (101 Clock Hours + 59 Lab Hours)",
    "clockHours": 101,
    "labHours": 59,
    "costLabel": "$7500 = $7500 tuition and fees",
    "tuitionAndFees": 7500,
    "description": "This 160-hour professional certificate prepares learners for entry-level careers in user experience (UX) and user interface (UI) design. Built on Google's UX Design curriculum, learners move through the complete design process - empathizing with users, defining problems, ideating, building wireframes and low- and high-fidelity prototypes in Figma, conducting UX research and usability testing, and designing responsive, accessible interfaces for websites and mobile apps - and finish with portfolio-ready projects and job-search preparation.",
    "courses": [
      {
        "name": "Foundations of User Experience (UX) Design",
        "hours": 11,
        "description": "Introduces the essential skills and concepts for entry-level UX design and how UX designers improve user interactions with products such as websites and mobile apps.",
        "courseraSlug": "foundations-user-experience-design"
      },
      {
        "name": "Start the UX Design Process: Empathize, Define, and Ideate",
        "hours": 20,
        "description": "Empathize with users to understand pain points, define user needs with problem statements, and generate ideas for solutions.",
        "courseraSlug": "start-ux-design-process"
      },
      {
        "name": "Build Wireframes and Low-Fidelity Prototypes",
        "hours": 10,
        "description": "Create storyboards, paper and digital wireframes, and low-fidelity prototypes using the design tool Figma.",
        "courseraSlug": "wireframes-low-fidelity-prototypes"
      },
      {
        "name": "Conduct UX Research and Test Early Concepts",
        "hours": 13,
        "description": "Plan and conduct usability studies to gather feedback, then refine low-fidelity designs based on research insights.",
        "courseraSlug": "conduct-ux-research"
      },
      {
        "name": "Create High-Fidelity Designs and Prototypes in Figma",
        "hours": 18,
        "description": "Build high-fidelity designs and interactive prototypes in Figma, collect feedback, and refine designs accordingly.",
        "courseraSlug": "high-fidelity-designs-prototype"
      },
      {
        "name": "Build Dynamic User Interfaces (UI) for Websites",
        "hours": 14,
        "description": "Plan a website design, create wireframes and prototypes, build responsive UI, and participate in design critique sessions.",
        "courseraSlug": "responsive-web-design-adobe-xd"
      },
      {
        "name": "Design a User Experience for Social Good & Prepare for Jobs",
        "hours": 15,
        "description": "Design a mobile app and a responsive website focused on social good, producing a cross-platform capstone for your UX portfolio.",
        "courseraSlug": "ux-design-jobs"
      },
      {
        "name": "Lab, Project, and Test Preparation",
        "hours": 59,
        "description": "Hands-on labs, project work, and test preparation supporting all program competencies and career readiness."
      }
    ],
    "sourceDocument": "9-User Experience & Interface Design Professional Certificate (Google).pdf",
    "sourceSha256": "6ac3ac7d95b30786356fbc702245ac0ea42d5410594aa6add3629bdf2385ff08",
    "sourceNotes": [
      "Approved EDvera resubmission: O*NET 15-1134 Web Developers and O*NET 15-1255.00 Web and Digital Interface Designers, with CIP 11.0105 Human-Centered Technology Design.",
      "Google UX content and the 160-hour total remain unchanged; the display title reflects the approved User Experience & Interface Design name."
    ]
  },
  "digital-marketing-e-commerce-google": {
    "slug": "digital-marketing-e-commerce-google",
    "title": "Digital Marketing & E-Commerce Professional Certificate (Google)",
    "providers": "Google via Coursera",
    "providerLine": "Powered by Google via Coursera   |   Delivery Format: Hybrid, Self-Paced",
    "deliveryFormat": "Hybrid, Self-Paced",
    "totalHours": 160,
    "totalHoursLabel": "160 Hours (102 Clock + 58 Lab/Project/Test Prep)",
    "clockHours": 102,
    "labHours": 58,
    "costLabel": "$7500 = $7500 tuition and fees",
    "tuitionAndFees": 7500,
    "description": "Throughout this program, you will gain in-demand skills that prepare you for an entry-level job and learn how to use tools and platforms like Canva, Constant Contact, Google Ads, Google Analytics, Hootsuite, HubSpot, Mailchimp, Shopify, and Twitter.",
    "courses": [
      {
        "name": "Foundations of Digital Marketing and E-Commerce",
        "hours": 11,
        "description": "Explore entry-level jobs in digital marketing and e-commerce and identify the roles and functions those jobs play within an organization."
      },
      {
        "name": "Attract and Engage Customers with Digital Marketing",
        "hours": 13,
        "description": "Attract and engage customers online using SEO, SEM, and display ads. Explore the marketing funnel and how to guide customers through each stage."
      },
      {
        "name": "From Likes to Leads: Interact with Customers Online",
        "hours": 18,
        "description": "Create effective social media marketing strategies. Build a strong online presence as part of any digital marketing plan."
      },
      {
        "name": "Think Outside the Inbox: Email Marketing",
        "hours": 17,
        "description": "Run a successful email marketing campaign — connect with customers, boost engagement, drive sales, and build loyalty."
      },
      {
        "name": "Assess for Success: Market Analytics and Measurement",
        "hours": 17,
        "description": "Use marketing analytics tools and practices. Analyze data from websites, marketing channels, and online stores to understand customer behavior."
      },
      {
        "name": "Make the Sale: Build, Launch, and Manage E-commerce Stores",
        "hours": 13,
        "description": "How businesses and individuals sell products online — including platforms like Shopify. Walk through creating a mock e-commerce store."
      },
      {
        "name": "Satisfaction Guaranteed: Develop Customer Loyalty Online",
        "hours": 13,
        "description": "Strategies for building customer loyalty in e-commerce, w/ tools to develop client relationships."
      },
      {
        "name": "Lab, Project, and Test Preparation",
        "hours": 58,
        "description": "Hands-on labs, project work, and test preparation supporting all program competencies."
      }
    ],
    "sourceDocument": "10-Digital_Marketing__E-Commerce_Professional_Certificate_Google.docx",
    "sourceSha256": "57396b1b42bbe53ed58b08992c146da9f758585f99e04d4fcd6f6e6f7192c0ca"
  },
  "software-developer-professional-certificate-ibm": {
    "slug": "software-developer-professional-certificate-ibm",
    "title": "AI and Software Developer Professional Certificate (IBM)",
    "providers": "IBM via Coursera",
    "providerLine": "Powered by IBM via Coursera   |   Delivery Format: Hybrid, Self-Paced",
    "deliveryFormat": "Hybrid, Self-Paced",
    "totalHours": 200,
    "totalHoursLabel": "200 Hours= 197 Clock Hours + 4 Lab Hours",
    "clockHours": 197,
    "labHours": 4,
    "costLabel": "$7500 = $7500 tuition and fees",
    "tuitionAndFees": 7500,
    "description": "A merged 16-course pathway combining the IBM Software Developer Professional Certificate with IBM AI Developer content — preparing graduates for the dual demand of modern application development and AI-augmented engineering. Coursework covers the software development lifecycle, full-stack web development with HTML/CSS/JavaScript, React, Node.js/Express, Django, Python, Git/GitHub, containers (Docker, Kubernetes, OpenShift), microservices and serverless, plus generative AI, prompt engineering, AI application development with Flask and Gradio, and the AI-augmented coding tools (ChatGPT, GitHub Copilot, Google Gemini, IBM watsonx) that modern employers expect. No prior AI or programming experience required.",
    "courses": [
      {
        "name": "Introduction to Software Engineering",
        "hours": 15,
        "description": "Software development lifecycle (SDLC), software architecture, and the basic programming and IT career paths."
      },
      {
        "name": "Introduction to Artificial Intelligence",
        "hours": 11,
        "description": "AI fundamentals, prompt engineering, automation, machine learning vs. deep learning, and the roles generative AI plays across industries.",
        "courseraSlug": "introduction-to-ai",
        "courseraCourseId": "mR7MlUaTEemuHQ4HpHozrA"
      },
      {
        "name": "Generative AI: Introduction and Applications",
        "hours": 5,
        "description": "Common AI applications and training techniques. Explore how different industries deploy generative AI for content, code, and decision support."
      },
      {
        "name": "Generative AI: Prompt Engineering",
        "hours": 6,
        "description": "Commonly used prompt patterns and where they apply. Techniques for producing meaningful, reliable outputs from AI models.",
        "courseraSlug": "generative-ai-prompt-engineering-for-everyone",
        "courseraCourseId": "nI__WUzdEe64qQ7qqom4Rw"
      },
      {
        "name": "Introduction to HTML, CSS, and JavaScript",
        "hours": 11,
        "description": "Web application fundamentals and developer terminology. Identify and use developer online editors and apply HTML, CSS, and JavaScript in digital environments."
      },
      {
        "name": "Getting Started with Git and GitHub",
        "hours": 8,
        "description": "Version control with Git, repository management on GitHub, branching, merging, pull requests, and collaborative developer workflows."
      },
      {
        "name": "Python for Data Science, AI & Development",
        "hours": 22,
        "description": "Foundational Python — syntax, data types, expressions, variables, string operations, structures, and Python for development & AI."
      },
      {
        "name": "Developing Front-End Apps with React",
        "hours": 16,
        "description": "Build modern user interfaces with React — functional components, hooks, state management with Redux, useEffect, component composition, and Vite. Capstone: a working React shopping cart application."
      },
      {
        "name": "Developing Back-End Apps with Node.js and Express",
        "hours": 13,
        "description": "Build back-end applications with Node.js and Express — routing, middleware, REST APIs, asynchronous JavaScript, and integration with databases and front-end clients."
      },
      {
        "name": "Django Application Development with SQL and Databases",
        "hours": 17,
        "description": "Develop web applications with the Django framework & ORM. Cover models, views, templates, SQL fundamentals, and databases."
      },
      {
        "name": "Introduction to Containers with Docker, Kubernetes & OpenShift",
        "hours": 13,
        "description": "Containerization fundamentals — Docker images and containers, Kubernetes orchestration, and OpenShift for enterprise container deployment."
      },
      {
        "name": "Application Development using Microservices and Serverless",
        "hours": 13,
        "description": "Build cloud-native applications using microservices architecture and serverless functions. Cover API gateways, service decomposition, and event-driven design."
      },
      {
        "name": "Developing AI Applications with Python and Flask",
        "hours": 10,
        "description": "Create Python applications across the full development lifecycle. Build Python modules, run unit tests, package applications, and ensure PEP8 best practices."
      },
      {
        "name": "Building Generative AI-Powered Applications with Python",
        "hours": 10,
        "description": "Develop web-based AI applications using Python libraries such as Flask and Gradio, integrated with HTML, CSS, and JavaScript front-ends."
      },
      {
        "name": "Generative AI: Elevate Your Software Development Career",
        "hours": 16,
        "description": "Build innovative solutions using generative AI tools — ChatGPT, GitHub Copilot, Google Gemini, and IBM watsonx Code Assistant — for productive AI-augmented coding."
      },
      {
        "name": "Software Developer Career Guide and Interview Preparation",
        "hours": 10,
        "description": "Networking strategies, assessing job listings, and demonstrating readiness across technical challenges, and interview questions."
      },
      {
        "name": "Lab, Project, and Test Preparation",
        "hours": 4,
        "description": "Hands-on labs, project work, and test preparation supporting all program competencies."
      }
    ],
    "sourceDocument": "11-AI_and_Software_Developer_Professional_Certificate_IBM.docx",
    "sourceSha256": "260e264c661fe627d4f963c7b83d687124b94d7a17e73cbc409a1de4ec83197b",
    "sourceNotes": [
      "The source states 200 total hours and lists courses totaling 200 hours, but its stated 197 clock hours plus 4 lab hours equals 201."
    ]
  },
  "health-information-technology-mchit": {
    "slug": "health-information-technology-mchit",
    "title": "Medical Billing, Coding, and Health Information Technician Certificate (MBCHIT)",
    "providers": "MedCerts, Johns Hopkins University, AAPC & Coursera",
    "providerLine": "Powered by MedCerts, Johns Hopkins University, AAPC & Coursera   |   Delivery Format: Hybrid, Self-Paced",
    "deliveryFormat": "Hybrid, Self-Paced",
    "totalHours": 160,
    "totalHoursLabel": "160 Hours=125 Clock Hours + 35 Lab Hours",
    "clockHours": 125,
    "labHours": 35,
    "costLabel": "$7500 = $7500 tuition and fees",
    "tuitionAndFees": 7500,
    "description": "Prepare for a credentialed career in medical billing, coding, and health information management. This 15-course program combines content from MedCerts, Johns Hopkins University, AAPC, and Coursera to deliver foundational anatomy and medical terminology, end-to-end revenue cycle and claims processing, ICD-10/CPT/HCPCS coding, HIPAA-compliant records management, electronic health records, telehealth fundamentals, and front-office administration. Graduates are prepared for entry-level roles and the AAPC Certified Professional Biller (CPB) credential.",
    "courses": [
      {
        "name": "Medical Terminology, Anatomy, and Physiology Fundamentals",
        "hours": 10,
        "description": "Build the medical language essential to working in healthcare. Covers analyzing and building medical terms, prefixes, suffixes, anatomy, physiology, pathology, cells and tissues, organs and organ systems, homeostasis, and diagnostic and procedures."
      },
      {
        "name": "Register Patients & Validate Data",
        "hours": 2,
        "description": "Master the patient intake workflow — collecting accurate demographics, validating identification, capturing insurance information, and verifying coverage before service. Front-end accuracy that drives clean claims and timely reimbursement."
      },
      {
        "name": "Revenue Cycle, Billing, and Coding (Johns Hopkins)",
        "hours": 6,
        "description": "Explore the revenue cycle in ambulatory healthcare. Covers registration, insurance (Medicare, Medicaid, managed care, commercial), CPT and ICD-10-CM and HCPCS coding fundamentals, denials, collections, estimates, and price transparency."
      },
      {
        "name": "The Billing and Collection Process (AAPC)",
        "hours": 30,
        "description": "Comprehensive introduction to medical billing, claim forms, and accounts receivable management. Complete and submit CMS-1500 and UB-04 forms, manage A/R and collections, handle claim adjudication and denial management, and ensure HIPAA."
      },
      {
        "name": "Medical Billing and Coding Essentials (MedCerts)",
        "hours": 8,
        "description": "Foundational knowledge of the Insurance Billing Specialist role. The revenue cycle, basic insurance terminology, HIPAA/HITECH/ACA, the medical record, patient registration,and an introduction to ICD-10-CM, CPT, and HCPCS Level II coding."
      },
      {
        "name": "Medical Billing: Code, Claim, Collect",
        "hours": 2,
        "description": "Recognize common medical billing codes and payer-specific terminology, understand the full claim life-cycle, and apply charge entry guidelines to submit clean electronic claims that get processed quickly and accurately."
      },
      {
        "name": "Medical Billing: Code and Claim Cleanly",
        "hours": 3,
        "description": "Master systematic review of clinical documentation to select correct Evaluation & Management (E&M) office-visit codes, and assemble complete claims with accurate insurance details, modifiers, and charges for first-pass acceptance."
      },
      {
        "name": "Medical Coding for Max Reimbursement",
        "hours": 2,
        "description": "Recognize common diagnostic and procedural codes, understand how documentation quality drives reimbursement, and systematically apply correct procedural codes to encounter forms to maximize revenue and minimize denials."
      },
      {
        "name": "Reconciliation, Billing, and Collections Optimization",
        "hours": 2,
        "description": "Optimize the back-end of the revenue cycle — payment posting, reconciliation, denial follow-up, appeals, and patient collections strategies that reduce days in A/R and improve cash flow for the practice."
      },
      {
        "name": "Medical Records: Protect Patient Privacy",
        "hours": 2,
        "description": "Apply HIPAA Privacy and Security Rules, ACA and HITECH requirements, and confidentiality best practices to medical records. Covers consent, authorized disclosures, breach response, and minimum-necessary standards."
      },
      {
        "name": "Data and Electronic Health Records (Johns Hopkins)",
        "hours": 6,
        "description": "Explore how data flows through ambulatory healthcare via Electronic Health Records (EHRs). Covers EHR structure, data entry standards, interoperability, reporting, quality measures, and using EHR data to support clinical and operational decisions."
      },
      {
        "name": "Health Information Technology Fundamentals (Johns Hopkins)",
        "hours": 6,
        "description": "Foundational health IT — practice management systems, clinical decision support, patient portals, health information exchange, cybersecurity in healthcare, and the regulatory framework that governs healthcare technology adoption."
      },
      {
        "name": "Foundations of Telehealth (Johns Hopkins)",
        "hours": 6,
        "description": "Understand the modalities, workflows, and regulatory considerations of telehealth — synchronous video visits, asynchronous store-and-forward, remote patient monitoring, billing and coding for telehealth services, and patient experience considerations."
      },
      {
        "name": "Medical Administrative Assistants and Office Procedures (MedCerts)",
        "hours": 10,
        "description": "Front-office workflows for medical practices — scheduling, patient communication, phone triage etiquette, mail and correspondence, recordkeeping, office equipment, supply management, and supporting the clinical team."
      },
      {
        "name": "Introduction to Certified Professional Biller (AAPC)",
        "hours": 30,
        "description": "Comprehensive introduction to the U.S. healthcare system and the medical biller role. Examines private, government, and managed care insurance models, patient registration, eligibility verification, and how clean front-end processes support timely reimbursement — preparing learners for the AAPC CPB credential."
      },
      {
        "name": "Lab, Project, and Test Preparation",
        "hours": 35,
        "description": "Hands-on labs, project work, and test preparation supporting all program competencies."
      }
    ],
    "sourceDocument": "12-Medical_Billing_Coding_and_Health_Information_Technician_Certificate_MBCHIT.docx",
    "sourceSha256": "146aed96a69baa289c0956d460d4742b0d89fc8f1c5ea4809bcb572010710778"
  }
} as const satisfies Record<string, ProgramSyllabus>;

export type ProgramSyllabusSlug = keyof typeof PROGRAM_SYLLABI;

export function getProgramSyllabus(slug: string): ProgramSyllabus | undefined {
  return PROGRAM_SYLLABI[slug as ProgramSyllabusSlug];
}
