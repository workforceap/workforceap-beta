import Link from 'next/link';
import { WIOA_REVIEW_LABELS, WIOA_REVIEW_STATUSES } from '@/lib/wioa/wioaReview';

export default function WioaReviewFilterBar({ active, legacy = false }: { active: string | null; legacy?: boolean }) {
  const baseHref = legacy ? '/admin/wioa-screening?ui=legacy' : '/admin/wioa-screening';
  return (
    <div
      role="toolbar"
      aria-label="Filter by review status"
      style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem', alignItems: 'center' }}
    >
      <Link
        href={baseHref}
        className={`btn btn-sm ${active == null ? 'btn-primary' : 'btn-outline'}`}
      >
        All
      </Link>
      {WIOA_REVIEW_STATUSES.map((s) => (
        <Link
          key={s}
          href={`${baseHref}${legacy ? '&' : '?'}review=${encodeURIComponent(s)}`}
          className={`btn btn-sm ${active === s ? 'btn-primary' : 'btn-outline'}`}
        >
          {WIOA_REVIEW_LABELS[s]}
        </Link>
      ))}
    </div>
  );
}
