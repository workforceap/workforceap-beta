/** Keep the blended course estimate visible while disclosing incomplete provider reads. */
export default function CourseraProgressCoverageNotice({
  coverage,
}: {
  coverage?: 'complete' | 'capped' | 'unavailable' | 'unknown';
}) {
  if (coverage !== 'capped' && coverage !== 'unavailable') return null;

  return (
    <p className="wa-kit-training-notice" role="status">
      {coverage === 'capped'
        ? 'Your latest Coursera progress is still syncing.'
        : 'Progress may be a few hours behind.'}{' '}
      Progress shown uses available course records.
    </p>
  );
}
