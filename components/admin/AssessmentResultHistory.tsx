import { previousAssessmentResults } from '@/lib/assessment/attempts';
import { formatPortalDate } from '@/lib/formatDate';

/** Only score/date leave the retained answer history for this compact recap. */
export default function AssessmentResultHistory({ history }: { history: unknown }) {
  const results = previousAssessmentResults(history);
  if (!results.length) return null;
  return <section aria-label="Previous preassessment results">
    <h3>Previous results</h3>
    <ul>{results.map((result, index) => <li key={index}>
      Attempt {index + 1}: {result.scorePct === null ? 'Score unavailable' : `${result.scorePct}%`}
      {result.completedAt && !Number.isNaN(Date.parse(result.completedAt)) ? ` · ${formatPortalDate(new Date(result.completedAt))}` : ''}
    </li>)}</ul>
  </section>;
}
