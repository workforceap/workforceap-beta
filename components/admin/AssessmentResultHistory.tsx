import { previousAssessmentResults } from '@/lib/assessment/attempts';
import { formatPortalDate } from '@/lib/formatDate';
import { wapatForHistory } from '@/lib/assessment/reviewRows';
import { formatWapatPct } from '@/lib/assessment/wapat';

/** Only score/date leave the retained answer history for this compact recap. */
export default function AssessmentResultHistory({ history }: { history: unknown }) {
  const results = previousAssessmentResults(history);
  if (!results.length) return null;
  // Aligned with `results`: both skip the same non-object entries.
  const wapat = wapatForHistory(history);
  return <section aria-label="Previous preassessment results">
    <h3>Previous results</h3>
    <ul>{results.map((result, index) => <li key={index}>
      Attempt {index + 1}: {wapat[index]?.total.available
        ? `WAPAT ${formatWapatPct(wapat[index].total)} (${wapat[index].sections.map((s) => `${s.label} ${formatWapatPct(s)}`).join(' · ')})`
        : `WAPAT unavailable (answers not retained)${result.scorePct === null ? '' : ` · points score ${result.scorePct}%`}`}
      {result.completedAt && !Number.isNaN(Date.parse(result.completedAt)) ? ` · ${formatPortalDate(new Date(result.completedAt))}` : ''}
    </li>)}</ul>
  </section>;
}
