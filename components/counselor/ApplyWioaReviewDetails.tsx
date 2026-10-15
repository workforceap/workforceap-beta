import type { ApplyWioaReviewScreeningDto } from '@/lib/wioa/reviewEvidence';
import { formatPublicAssistancePrograms } from '@/lib/apply/publicAssistance';
import { formatPortalDateTime } from '@/lib/formatDate';

function answer(value: string | null) {
  return value === 'yes' ? 'Yes' : value === 'no' ? 'No' : value || 'Not answered';
}

/** Source-labelled evidence: an apply quick-fit result never establishes WIOA eligibility. */
export default function ApplyWioaReviewDetails({ screening }: { screening: ApplyWioaReviewScreeningDto }) {
  return (
    <section aria-label="Application eligibility screening">
      <h3 className="wa-kit-stat-label">Application eligibility screening</h3>
      <p className="wa-kit-meta">Self-reported application answers, including any unanswered questions. Staff verify intake paperwork; the workforce board determines eligibility.</p>
      <p className="wa-kit-meta">First submitted {formatPortalDateTime(screening.createdAt)}</p>
      <ul className="wa-kit-meta">
        <li>Unemployed or underemployed: {answer(screening.q1)}</li>
        <li>Household income below $60,000: {answer(screening.q2)}</li>
        <li>Authorized to work: {answer(screening.q3)}</li>
        <li>Receiving unemployment: {answer(screening.receivingUnemployment)}</li>
        <li>Exhausted unemployment benefits: {answer(screening.exhaustedUnemployment)}</li>
        <li>Layoff company: {screening.layoffCompany || 'Not answered'}</li>
        <li>Receiving public assistance: {answer(screening.snapWic)}</li>
        <li>Programs named (unverified): {formatPublicAssistancePrograms(screening.publicAssistancePrograms) || 'Not answered'}</li>
        <li>Wants help applying for benefits: {answer(screening.publicAssistanceHelpRequested)}</li>
      </ul>
    </section>
  );
}
