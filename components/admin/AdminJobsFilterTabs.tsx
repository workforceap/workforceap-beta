'use client';

import Link from 'next/link';

type Tab = { value: string; label: string; count: number };

type Props = {
  currentFilter: string;
  tabs: Tab[];
};

export default function AdminJobsFilterTabs({ currentFilter, tabs }: Props) {
  return (
    <div
      className="admin-jobs-filter-tabs"
      style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}
    >
      {tabs.map(({ value, label, count }) => {
        const isActive = currentFilter === value;
        return (
          <Link
            key={value}
            href={`/admin/jobs${value === 'all' ? '?filter=all' : `?filter=${value}`}`}
            className={`btn btn-ghost btn-sm ${isActive ? 'active' : ''}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            {label}
            {count > 0 && (
              <span
                style={{
                  padding: '0.15rem 0.4rem',
                  borderRadius: '999px',
                  fontSize: '0.8125rem',
                  background: value === 'pending' ? 'rgba(255, 165, 0, 0.25)' : 'var(--outline-variant)',
                }}
              >
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
