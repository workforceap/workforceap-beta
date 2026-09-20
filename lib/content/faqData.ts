/**
 * FAQ data — single source of truth shared between the client-rendered
 * FAQContent component and the server-rendered JsonLdFAQPage schema.
 * Extracting it to a plain `.ts` lets us import from both contexts
 * without a 'use client' boundary leak.
 */

export type FaqItem = {
  q: string;
  a: string;
  link?: { text: string; href: string };
};

export type FaqCategoryKey =
  | 'General Questions'
  | 'Applying & Eligibility'
  | 'Cost & Funding'
  | 'Programs & Training'
  | 'Job Placement'
  | 'For Members'
  | 'For Employers';

export const FAQ_CATEGORIES: { key: FaqCategoryKey; icon: string }[] = [
  { key: 'General Questions', icon: 'help_outline' },
  { key: 'Applying & Eligibility', icon: 'how_to_reg' },
  { key: 'Cost & Funding', icon: 'payments' },
  { key: 'Programs & Training', icon: 'school' },
  { key: 'Job Placement', icon: 'work' },
  { key: 'For Members', icon: 'person' },
  { key: 'For Employers', icon: 'business' },
];

export const FAQ_DATA: Record<FaqCategoryKey, FaqItem[]> = {
  'General Questions': [
    {
      q: 'What is Workforce Advancement Project (WorkforceAP)?',
      a: 'Workforce Advancement Project (WorkforceAP) is a national nonprofit and 501(c)(3) that helps members explore career training, industry credentials, and next-step support. Programs are offered through WorkforceAP and partner-backed pathways.',
      link: { text: 'Learn About Our Mission', href: '/what-we-do' },
    },
    { q: 'How is training funded for members?', a: 'Programs are offered through Workforce Funded Training for qualified members. Exact eligibility and funding path can vary by program and situation, and WorkforceAP will walk you through the right next step during intake.', link: { text: 'View Programs', href: '/programs' } },
    { q: 'Who qualifies?', a: "Eligibility depends on the program, funding path, location, and your situation. If you're unsure, start with the application and WorkforceAP can help you understand the best next step.", link: { text: 'Start the application', href: '/apply' } },
    { q: 'How long do programs take?', a: 'Most programs take 3–5 months at roughly 10 hours per week. Digital Literacy is shorter at about 6 weeks and roughly 30 total hours. Everything is designed so you can participate while working, parenting, or managing other commitments.', link: { text: 'View Programs', href: '/programs' } },
    { q: 'Can I talk to someone before I apply?', a: 'Yes. If you have questions or want to talk through whether this is a good fit, reach out. WorkforceAP can help you understand your options before you commit to anything.', link: { text: 'Contact Us', href: '/contact' } },
  ],
  'Applying & Eligibility': [
    { q: 'What if I\'m not technical?', a: "That's exactly who we built this for. Our programs start from zero — no coding background, no IT history, no prior tech experience required. We've helped career-changers, people re-entering the workforce, and adults who've never worked in tech land roles in IT, cybersecurity, and data analytics. What matters most is your commitment to showing up and finishing.", link: { text: 'Take the Career Quiz', href: '/find-your-path' } },
    { q: "What if I'm starting over?", a: "Starting over is one of the most common reasons people come to us. Whether you left a job, got laid off, are leaving a difficult situation, or are just ready for a different path — we work with you from where you are now. Your advisor will help you pick the right program, set a realistic pace, and stay on track through the whole process.", link: { text: 'Find Your Path', href: '/find-your-path' } },
    { q: 'What are the eligibility requirements?', a: 'Requirements vary by pathway and funding source. WorkforceAP reviews your goals, location, readiness, and any funding options that may apply, then helps you understand the right next step.', link: { text: 'View All Programs', href: '/programs' } },
    { q: 'What happens after I apply?', a: 'After you apply, WorkforceAP reviews your information, follows up if more context is needed, and helps you understand the next step for your pathway. That may include a conversation, documentation review, or program guidance.', link: { text: 'Start Your Application', href: '/apply' } },
    { q: 'Is there an application fee?', a: 'No. There is no application fee. We review your goals, confirm fit, and share next steps. Applying does not cost anything, and qualifying pathways are offered through Workforce Funded Training for qualified members.' },
    { q: 'When do programs start?', a: 'Program timing depends on the pathway, partner schedule, and available cohorts. WorkforceAP will help you understand what is currently open and what the next available start looks like.', link: { text: 'See How It Works', href: '/how-it-works' } },
  ],
  'Cost & Funding': [
    { q: 'How much does the program cost?', a: 'Our programs are offered through Workforce Funded Training for qualified members. There are no hidden fees, textbook costs, or application charges. This is made possible through WIOA, grants, employer partnerships, and community funding.', link: { text: 'View Programs', href: '/programs' } },
    { q: "What does 'qualifying' mean?", a: 'It means eligibility is reviewed based on the pathway, funding source, and your situation. If you are not sure, apply and WorkforceAP can help clarify your options.', link: { text: 'Start the application', href: '/apply' } },
    { q: 'Do I need to pay anything back?', a: 'No. This is not a loan. Training is funded through grants and partnerships. WorkforceAP does not use income-sharing agreements (ISAs) or member loans for these pathways.', link: { text: 'Read Success Stories', href: '/blog' } },
    { q: 'Are certification exam fees included?', a: 'Certification support can vary by program and funding path. WorkforceAP can explain what is included for the pathway you are considering.', link: { text: 'View Programs', href: '/programs' } },
  ],
  'Programs & Training': [
    { q: 'How long do programs take?', a: 'Most programs take 3–5 months at roughly 10 hours per week. Digital Literacy is shorter at about 6 weeks and roughly 30 total hours. All programs are designed to be completed while working part-time or managing family responsibilities.', link: { text: 'View Program Details', href: '/programs' } },
    { q: 'Is this online?', a: "Yes. All training is delivered virtually — you can participate from home, a library, or anywhere with a reliable internet connection. You do not need to commute, relocate, or take time off work to attend. Some programs include optional in-person events and local career fairs if you want them.", link: { text: 'See Available Programs', href: '/programs' } },
    { q: 'Do I need a laptop?', a: 'You need access to a computer and reliable internet to participate. If you do not have a laptop, apply anyway. WorkforceAP can talk through available support options, including laptop help when a pathway or funding source allows it.', link: { text: 'Learn About Support', href: '/what-we-do' } },
    { q: 'What certifications will I earn?', a: "You'll earn industry-recognized certificates from partners like Google, IBM, Microsoft, Amazon, and CompTIA. These are the same credentials employers hire against.", link: { text: 'View Certification Paths', href: '/salary-guide' } },
    { q: 'What if I fail a certification exam?', a: 'Many certification providers allow retakes. We work with you to prepare for exams and, when available, support retake options. Your advisor can help you understand the specific retake policy for your program.', link: { text: 'See How It Works', href: '/how-it-works' } },
  ],
  'Job Placement': [
    { q: 'Do you help members find jobs?', a: 'Yes. WorkforceAP provides support like resume help, interview prep, career guidance, and employer-facing support as members move toward job readiness.', link: { text: 'Explore Career Outcomes', href: '/salary-guide' } },
    { q: 'What kind of jobs will I qualify for?', a: 'Entry-level to mid-level roles in IT, cybersecurity, data analytics, project management, healthcare, and skilled trades. Pay varies by role and region; the salary guide links to occupational research for each track.', link: { text: 'See Salary Guide', href: '/salary-guide' } },
    { q: 'How soon after completing the program can I get hired?', a: 'Hiring timelines vary by market, role, location, and the path you choose. Many members begin preparing and applying during training so they are ready for the next step as they finish.', link: { text: 'Read Career Tips', href: '/blog' } },
  ],
  'For Members': [
    { q: 'What support do I get during training?', a: 'You receive a dedicated advisor, access to our member portal with career readiness tools (resume help, interview practice), and job-search guidance as you move toward job readiness.', link: { text: 'Learn About Our Mission', href: '/what-we-do' } },
    { q: 'Is there a counselor or advisor assigned to me?', a: 'Yes. Each member is assigned an advisor who supports you from intake through training and job-search preparation. Your advisor helps with program pacing, career goals, and connecting you to resources.', link: { text: 'Meet the Team', href: '/leadership' } },
    { q: 'Can I work while enrolled?', a: 'Yes. Programs are designed to be flexible for working adults. Most programs are paced for about 10 hours per week, and Digital Literacy is lighter at roughly 5 hours per week.', link: { text: 'Check Program Flexibility', href: '/programs' } },
    { q: 'What if I fall behind?', a: "Your advisor will work with you to adjust your pace. We're invested in your completion — not just your enrollment. Life happens, and we'll help you get back on track.", link: { text: 'Meet the Team', href: '/leadership' } },
    { q: 'Is this too good to be true?', a: "We get it. Funded career training can feel hard to trust at first. We're funded through WIOA, grants, employer partnerships, and community support. Our success metric is your employment, not collecting fees from members.", link: { text: 'Meet the Team', href: '/leadership' } },
  ],
  'For Employers': [
    { q: 'How do employer partnerships work?', a: 'We train and support candidates in high-demand fields, and we help employers connect with members whose training paths align with their hiring needs. Partnership structures can vary based on role type, timing, and employer needs.', link: { text: 'Partner With Us', href: '/partners' } },
    { q: 'What certifications do your graduates hold?', a: "Graduates earn industry-recognized certifications from Google, IBM, Microsoft, Amazon, and CompTIA. These are the same credentials you'd see on any qualified candidate's resume.", link: { text: 'View Programs', href: '/programs' } },
    { q: 'Can I refer someone from my community?', a: 'Yes. We serve communities nationwide. Refer anyone who could benefit — we intake, assess, and connect them with the right program. No harm in applying.', link: { text: 'Refer Someone', href: '/partners' } },
    { q: 'Is this legitimate?', a: "Yes. WorkforceAP is a nonprofit and 501(c)(3) with public-facing leadership, real contact paths, and partner-backed training pathways. If you want to talk through fit or partnership questions, our team can help.", link: { text: 'Partner With Us', href: '/partners' } },
  ],
};
