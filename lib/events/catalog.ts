import { JOB_POSTING_STATUS_WORDS } from '@/lib/status/jobPostingStatusVocabulary';

export type FunnelDefinition = {
  audience: 'employer' | 'applicant' | 'member' | 'admin';
  funnel: string;
  steps: string[];
  outcomes: string[];
  confusionSignals: string[];
  falseConfidenceSignals: string[];
};

export const FUNNEL_DEFINITIONS: FunnelDefinition[] = [
  {
    audience: 'employer',
    funnel: 'Employer import / create / edit / review',
    steps: [
      'Import started',
      'Import succeeded or fallback used',
      'Review opened',
      'Draft saved',
      'Submit for review',
      'Admin approval / rejection',
    ],
    // The middle outcome is the posting status the employer sees after "Submit for review" (lib/status/jobPostingStatusVocabulary.ts).
    outcomes: ['Draft created', JOB_POSTING_STATUS_WORDS.employer.pending, 'Live posting'],
    confusionSignals: [
      'Import started but no extracted draft',
      'Fallback used after low field coverage',
      'Repeated draft saves without submit',
      'Validation errors on review submit',
    ],
    falseConfidenceSignals: [
      'High auto-fill count but admin rejects posting',
      'AI/import provider succeeded with missing salary/location/requirements',
    ],
  },
  {
    audience: 'applicant',
    funnel: 'Apply / signup flow',
    steps: ['Eligibility step completed', 'Results viewed', 'Program selected', 'Signup started', 'Signup completed'],
    outcomes: ['Qualified lead captured', 'Account created', 'Application record created'],
    confusionSignals: [
      'Results page missing session state',
      'Program selected without signup completion',
      'Signup validation / existing-account errors',
    ],
    falseConfidenceSignals: [
      'Applicant looks qualified but abandons before account creation',
      'Applicant continues after mismatch but never submits signup',
    ],
  },
  {
    audience: 'member',
    funnel: 'Member dashboard engagement',
    steps: ['Dashboard viewed', 'Primary CTA clicked', 'Resource / learning hub opened', 'AI tool run', 'Application tracker opened'],
    outcomes: ['Repeated weekly engagement', 'Readiness progress', 'Job-seeking action taken'],
    confusionSignals: [
      'Dashboard viewed with no CTA clicks',
      'Repeated AI tool opens without run completion',
      'Resource open without completion/download/save follow-up',
    ],
    falseConfidenceSignals: [
      'High AI tool usage without application tracking or readiness actions',
      'Dashboard engagement spikes but no pathway completions',
    ],
  },
  {
    audience: 'admin',
    funnel: 'Admin review queues',
    steps: ['Queue viewed', 'Job review opened', 'AI matches loaded', 'Recommendation sent or review decision made'],
    outcomes: ['Approve / reject decision', 'Employer suggestions sent'],
    confusionSignals: [
      'Queue view with no job review follow-up',
      'Matches loaded repeatedly for same job',
      'Suggest matches attempt with zero results',
    ],
    falseConfidenceSignals: [
      'High match scores with employer non-action',
      'Recommendation success after cached low-signal matches only',
    ],
  },
];
