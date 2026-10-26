import { buildApplicationReport } from '@/lib/apply/applicationReport';

/** Synthetic only: never use real applicant screenshots as test fixtures. */
export function applicationReportFixture() {
  return buildApplicationReport({
    capturedAt: new Date('2026-10-22T15:30:00Z'), submittedAt: new Date('2026-10-22T15:30:00Z'),
    name: 'Alex O’Connell García', email: 'alex+training@example.test', phone: '15125550123',
    address: '123 Example Street, Apt 4', city: 'Austin', state: 'TX', zip: '78701', county: 'Travis', ageGroup: '25_50',
    programInterest: 'AI Practitioner Professional Certificate (AWS) (preferences: IT Support Professional Certificate (IBM), Digital Literacy)',
    recommendedCareer: 'Computer support specialist', barriers: ['employment_gap', 'seeking_skills_training'],
    computerHelp: true, smsOptIn: false, referral: 'Example Community Center',
    screening: { q1: 'yes', q2: 'no', q3: 'yes', qualifies: true, yesCount: 2, receivingUnemployment: 'no', exhaustedUnemployment: 'yes', layoffCompany: 'Example Company', snapWic: 'yes', publicAssistancePrograms: ['snap', 'wic'], publicAssistanceHelpRequested: 'no', hearAbout: 'Community event', hearAboutOther: 'Career fair', partnerAmbassadorReferral: 'Example Ambassador' },
  });
}
