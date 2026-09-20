import type { MemberSkillsetProgressRow } from '@/lib/coursera/memberSkillsetProgress';

type Props = {
  rows: MemberSkillsetProgressRow[];
  /** Tone of the surrounding view. Member portal uses 'member' (full card chrome);
   *  counselor/partner detail pages use 'compact' (inline section). */
  variant?: 'member' | 'compact';
  emptyHint?: string;
};

function formatRelative(date: Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default function SkillsetProgressList({ rows, variant = 'member', emptyHint }: Props) {
  if (!rows.length) {
    if (!emptyHint) return null;
    return (
      <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0.5rem 0 0' }}>
        {emptyHint}
      </p>
    );
  }

  const lastSync = rows.reduce<Date | null>((acc, r) => {
    if (!acc) return r.lastSyncedAt;
    return r.lastSyncedAt > acc ? r.lastSyncedAt : acc;
  }, null);

  const isMember = variant === 'member';
  const containerStyle: React.CSSProperties = isMember
    ? { marginTop: '1rem' }
    : { marginTop: '0.75rem' };

  return (
    <div style={containerStyle}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: '0.5rem',
          gap: '0.5rem',
          flexWrap: 'wrap',
        }}
      >
        <h4
          style={{
            fontSize: isMember ? '0.9375rem' : '0.8125rem',
            fontWeight: 700,
            color: 'var(--color-on-surface)',
            margin: 0,
            textTransform: isMember ? 'none' : 'uppercase',
            letterSpacing: isMember ? undefined : '0.06em',
          }}
        >
          {isMember ? 'Skillset progress' : 'Coursera skillsets'}
        </h4>
        {lastSync ? (
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
            Synced {formatRelative(lastSync)}
          </span>
        ) : null}
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
        {rows.map((row) => (
          <li
            key={row.skillsetId}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: '0.25rem 0.75rem',
              padding: '0.5rem 0.75rem',
              border: '1px solid var(--outline-variant)',
              borderRadius: '0.5rem',
              background: 'var(--surface-container-lowest)',
            }}
          >
            <span
              style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'var(--color-on-surface)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {row.skillsetName}
            </span>
            <span
              style={{
                fontSize: '0.875rem',
                fontWeight: 700,
                color: row.progressPct >= 100 ? 'var(--color-green)' : 'var(--color-accent)',
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {row.progressPct}%
            </span>
            <div
              aria-hidden="true"
              style={{
                gridColumn: '1 / -1',
                height: 4,
                borderRadius: 999,
                background: 'var(--surface-container-highest)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.max(0, Math.min(100, row.progressPct))}%`,
                  height: '100%',
                  background:
                    row.progressPct >= 100 ? 'var(--color-green)' : 'var(--color-accent)',
                  transition: 'width 240ms ease',
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
