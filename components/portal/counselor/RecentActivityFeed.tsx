'use client';

import Link from 'next/link';

type ActivityItem = {
  memberId: string;
  type: 'course_completed' | 'certification_earned' | 'placement_recorded';
  date: string;
  metadata: Record<string, unknown> | null;
};

type Props = {
  items: ActivityItem[];
};

const ACTIVITY_CONFIG: Record<
  ActivityItem['type'],
  { icon: string; label: string; color: string }
> = {
  course_completed: { icon: 'school', label: 'Course completed', color: 'var(--color-blue)' },
  certification_earned: { icon: 'verified', label: 'Certification earned', color: 'var(--color-green)' },
  placement_recorded: { icon: 'work', label: 'Placement recorded', color: 'var(--color-gold)' },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffM = Math.floor(diffMs / (60 * 1000));
  if (diffM < 60) return diffM <= 1 ? 'Just now' : `${diffM}m ago`;
  const diffH = Math.floor(diffMs / (60 * 60 * 1000));
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString();
}

export default function RecentActivityFeed({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <div
      style={{
        background: 'var(--surface-container-low)',
        borderRadius: '0.875rem',
        padding: '1.25rem',
        border: '1px solid var(--outline-variant)',
      }}
    >
      <h3
        style={{
          fontSize: '0.9rem',
          fontWeight: 700,
          color: 'var(--color-on-surface)',
          margin: '0 0 1rem',
        }}
      >
        Recent Activity
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {items.map((item, i) => {
          const cfg = ACTIVITY_CONFIG[item.type];
          const meta = item.metadata ?? {};
          const detail =
            (meta.courseName as string) ??
            (meta.certificationName as string) ??
            (meta.employerName as string) ??
            (meta.employer as string) ??
            '';
          return (
            <Link
              key={`${item.memberId}-${i}`}
              href={`/counselor/students/${item.memberId}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.625rem 0.75rem',
                borderRadius: '0.5rem',
                background: 'var(--surface-container-lowest)',
                textDecoration: 'none',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '1.1rem', color: cfg.color, flexShrink: 0 }}
                aria-hidden="true"
              >
                {cfg.icon}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: 'var(--color-on-surface)',
                  }}
                >
                  {cfg.label}
                </p>
                {detail ? (
                  <p
                    style={{
                      margin: '0.1rem 0 0',
                      fontSize: '0.8125rem',
                      color: 'var(--color-on-surface-variant)',
                    }}
                  >
                    {detail}
                  </p>
                ) : null}
              </div>
              <span
                style={{
                  fontSize: '0.8125rem',
                  color: 'var(--color-on-surface-variant)',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {formatDate(item.date)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
