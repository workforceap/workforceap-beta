/**
 * Portal-only enrollment narrative: manual staff enrollment, Coursera access,
 * training, exam/cert costs. Used by Path-to-Cert navigator and admin invite UX.
 */

export type ProgramEnrollmentStep = {
  id: string;
  title: string;
  description: string;
};

const DEFAULT_STEPS: ProgramEnrollmentStep[] = [
  {
    id: 'invite',
    title: 'Accept your invite and set your password',
    description:
      'WorkforceAP sends you an email invite. Open it, create your password, and sign in to the member portal. If you did not get an email, check spam or contact your counselor.',
  },
  {
    id: 'staff_assign',
    title: 'Staff assigns your Coursera track',
    description:
      'A counselor or admin enrolls you in the correct Coursera Professional Certificate for your program. You may receive a WorkforceAP workspace email for Coursera — use the address we give you when you open training links.',
  },
  {
    id: 'first_class',
    title: 'Start your first class in Training',
    description:
      'From My Program, open your current course and work through modules at the pace your counselor recommends.',
  },
  {
    id: 'exam',
    title: 'Exam or vendor certification (if applicable)',
    description:
      'Some programs include a separate vendor exam (for example PMI for PMP or AWS for cloud certifications). Exam fees and scheduling are separate from Coursera tuition — your counselor will outline typical total cost before you commit.',
  },
  {
    id: 'job_support',
    title: 'Job search and employer pipeline',
    description:
      'Use the Job Board, application tracker, and AI toolkit. We provide career and employment assistance — we do not guarantee a job offer.',
  },
];

const PMP_AWS_EXAM_NOTE =
  'Industry exams (PMI PMP, AWS certification exams, etc.) are billed by the vendor. Your counselor shares expected exam fees and prep steps after you are enrolled in the Coursera prep track.';

const STEPS_BY_SLUG: Record<string, ProgramEnrollmentStep[]> = {
  'project-management-professional-certificate-microsoft': [
    DEFAULT_STEPS[0],
    {
      id: 'staff_assign',
      title: 'Staff assigns Microsoft Project Management prep on Coursera',
      description:
        'You will be placed in the multi-course Professional Certificate that aligns with PMP exam prep. This is separate from registering for the PMI.org exam itself.',
    },
    DEFAULT_STEPS[2],
    {
      id: 'exam',
      title: 'PMI PMP exam registration',
      description: PMP_AWS_EXAM_NOTE,
    },
    DEFAULT_STEPS[4],
  ],
  'aws-cloud-technology-amazon': [
    DEFAULT_STEPS[0],
    {
      id: 'staff_assign',
      title: 'Staff assigns AWS Cloud Technology Professional Certificate',
      description:
        'You will receive access to the Amazon Web Services Coursera collection. Use the Coursera login or workspace email WorkforceAP assigns so progress syncs correctly.',
    },
    DEFAULT_STEPS[2],
    {
      id: 'exam',
      title: 'AWS certification exams',
      description: PMP_AWS_EXAM_NOTE,
    },
    DEFAULT_STEPS[4],
  ],
  'comptia-security-professional-certificate': [
    DEFAULT_STEPS[0],
    {
      id: 'staff_assign',
      title: 'Staff assigns CompTIA Security+ prep courses',
      description: 'Coursera courses prepare you for Security+; CompTIA exam registration is a separate step with its own fee.',
    },
    DEFAULT_STEPS[2],
    { id: 'exam', title: 'CompTIA Security+ exam', description: PMP_AWS_EXAM_NOTE },
    DEFAULT_STEPS[4],
  ],
  'data-analytics-professional-certificate-google': [
    DEFAULT_STEPS[0],
    {
      id: 'staff_assign',
      title: 'Staff assigns the Management Analyst & Business Intelligence pathway',
      description: 'Your curated Google and IBM Coursera courses, WorkforceAP lab, consulting capstone, and completion requirements are explained in Training.',
    },
    DEFAULT_STEPS[2],
    {
      id: 'exam',
      title: 'Credentials after the program',
      description:
        'Individual Coursera course certificates may be available. This curated pathway has its own WorkforceAP completion requirements; your counselor can explain any optional credentials.',
    },
    DEFAULT_STEPS[4],
  ],
  'it-support-professional-certificate-ibm': [
    DEFAULT_STEPS[0],
    {
      id: 'staff_assign',
      title: 'Staff assigns IBM IT Support Professional Certificate',
      description: 'Coursera access is provisioned by staff after your program is confirmed.',
    },
    DEFAULT_STEPS[2],
    {
      id: 'exam',
      title: 'CompTIA exams (if pursuing)',
      description:
        'The IBM track aligns with IT support roles. CompTIA exams are optional add-ons with separate fees if you pursue them.',
    },
    DEFAULT_STEPS[4],
  ],
  'digital-literacy-empowerment-class': [
    DEFAULT_STEPS[0],
    {
      id: 'staff_assign',
      title: 'Start your first module right away',
      description:
        'No Coursera provisioning is needed. Your training page lists ten short WorkforceAP modules with attributed DigitalLearn.org course links or clearly labeled course-material fallbacks. DigitalLearn pages can be opened without an account and provide an English/Español control. Return to WorkforceAP to record each completion.',
    },
    DEFAULT_STEPS[2],
    {
      id: 'exam',
      title: 'Completion and next steps',
      description:
        'Mark each module complete in WorkforceAP as you finish it. Your local progress, points, and counselor-visible completion stay in WorkforceAP; DigitalLearn activity and certificates are not synced. Afterwards your team will help you decide whether to move into a professional certificate track.',
    },
    DEFAULT_STEPS[4],
  ],
};

export function getProgramEnrollmentSteps(programSlug: string | null | undefined): ProgramEnrollmentStep[] {
  if (!programSlug) return DEFAULT_STEPS;
  return STEPS_BY_SLUG[programSlug] ?? DEFAULT_STEPS;
}
