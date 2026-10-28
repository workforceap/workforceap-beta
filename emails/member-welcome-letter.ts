/**
 * Canonical Workforce Advancement Project welcome letter for people who
 * apply and receive a membership.
 *
 * Source: "Welcome and Member Instruction Letter-To everyone who applies and
 * gets a membership", received 2026-10-27. Keep the supplied wording.
 */

export const MEMBER_WELCOME_LETTER_TITLE =
  'Welcome to Workforce Advancement Project — Your Next Steps';

const INFO_EMAIL = 'info@WorkforceAP.org';
const SITE_URL = 'https://www.workforceap.org/';
const BOOKING_URL = 'https://calendar.app.google/1cq9rmTXgJkGTx83A';
const ONE_STOP_URL =
  'https://www.careeronestop.org/localhelp/americanjobcenters/find-american-job-centers.aspx';
const WIOA_DOL_URL = 'https://www.dol.gov/agencies/eta/wioa';
const WIOA_TEXAS_URL = 'https://www.twc.texas.gov/programs/wioa';

function bullets(items: string[]): string {
  return `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
}

function orderedSteps(items: string[]): string {
  return `<ol>${items.map((item) => `<li>${item}</li>`).join('')}</ol>`;
}

/**
 * Letter body HTML (no greeting). Callers may prefix a first-name line and
 * append operational bits such as eligibility answers when applicable.
 */
export function memberWelcomeLetterHtml(): string {
  return `
    <p><strong>${MEMBER_WELCOME_LETTER_TITLE}</strong></p>
    <p>Thank you for becoming a member of Workforce Advancement Project!</p>
    <p>We are pleased to welcome you to a community committed to helping individuals strengthen their skills, advance their careers, and improve their economic opportunities.</p>
    <p>Our goal is to provide access to:</p>
    ${bullets([
      'Complimentary AI-powered workforce and job-readiness tools',
      'Career and skills assessments',
      'Personalized career guidance',
      'Assistance identifying grants, and scholarships that cover training costs',
      'Occupational training and professional certification programs',
    ])}
    <p><strong>Our Two-Platform Process</strong></p>
    <p><strong>1. AI Workforce and Job-Readiness Platform</strong></p>
    <p>You have successfully registered for our complimentary member platform. This platform provides AI-powered tools to help you:</p>
    ${bullets([
      'Basic Digital Literacy Online Training Course',
      'Explore career pathways',
      'Improve your résumé',
      'Prepare for interviews',
      'Assess your career interests and skills',
      'Develop a personalized job-search strategy',
      'Identify training programs that may support your goals',
    ])}
    <p>Access to these tools is provided through the support of grants, scholarships, sponsors, and donors they cover the Administration of Workforce Advancement Project.</p>
    <p><strong>2. Occupational Training and Professional Certification Platform</strong></p>
    <p>Registration as a Workforce Advancement Project member does not automatically enroll you in an occupational training or professional certification course.</p>
    <p>Before enrollment, a Workforce Advancement Project Career Advisor will:</p>
    ${bullets([
      'Review your résumé and professional background and discuss your career goals',
      'Evaluate your foundational skills and readiness',
      'Review your career and technical assessments',
      'Determine whether an available program aligns with your abilities and goals',
      'Discuss possible funding options',
    ])}
    <p>If we mutually determine that a program is appropriate, we will explain the next steps for enrollment. Many of our professional certification programs include approximately 160-200 hours of training.</p>
    <p><strong>Training Funding Opportunities</strong></p>
    <p>Workforce Advancement Project individually reviews each application to identify possible grants, scholarships, or sponsorships that may help cover training costs. Funding is not guaranteed and is subject to eligibility requirements and availability.</p>
    <p>You may qualify for assistance through the Workforce Innovation and Opportunity Act (WIOA) if you have been laid off, are unemployed or underemployed, or meet certain income or public-assistance guidelines.</p>
    <p>Eligibility decisions are made by your local Workforce Solutions office or <a href="${ONE_STOP_URL}">Department of Labor (DOL) American Job Center</a>. Find your local One Stop Center by using this link and putting in your zip code. If you believe you may qualify, contact your local office and ask about <a href="${WIOA_DOL_URL}">WIOA Adult or Dislocated Worker training assistance</a>.  If you are specifically in <a href="${WIOA_TEXAS_URL}">Texas here is the link</a>. If you have any questions we can discuss this with you in our 1-on-1 meeting.</p>
    <p><strong>Your Next Steps</strong></p>
    <p>Before scheduling your career consultation, please complete the following:</p>
    ${orderedSteps([
      `Email your current résumé to <a href="mailto:${INFO_EMAIL}">${INFO_EMAIL}</a> and load your resume on the WorkforceAP site.`,
      'Complete the WorkforceAP Pre assessment which you will see once you log in.',
      'Use the AI Tool section with AI career counselors and resources on the member platform to explore the career direction you would like to pursue and why.',
      'Review the available training programs and course syllabi to determine which program may best support your career goals.',
      'Be prepared to discuss whether your desired career transition is realistic, what preparation may be required, and the steps necessary to achieve your goal.',
      'Use the Book an Appointment link below to schedule a 30-minute consultation with a Workforce Advancement Project Career Advisor.',
      'Be prepared to do some work and create a better future for yourself and family.',
    ])}
    <p>We look forward to learning more about your goals and helping you identify the best path forward.</p>
    <p>Respectfully,</p>
    <p>Michael A. Brown, PMP, ChE<br />Executive Director<br />Workforce Advancement Project<br />Empowering People. Advancing Futures.</p>
    <p><a href="${SITE_URL}">www.WorkforceAP.org</a><br />(512) 825-2896<br /><a href="${BOOKING_URL}">Book a Career Consultation</a></p>
  `.trim();
}
