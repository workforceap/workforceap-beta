import Link from 'next/link';
import { StatTile, type KitTone } from '@/components/portal/kit';
import type { CounselorRosterStat } from '@/lib/counselor/rosterStats';

/** rosterStats speaks the attention model's colour names; the tile speaks KitTone (KIT_GUIDE §4 mapping). */
const ROSTER_STAT_TONE: Record<NonNullable<CounselorRosterStat['tone']>, KitTone> = {
  accent: 'alert',
  gold: 'warn',
  info: 'info',
};

type Props = {
  stats: CounselorRosterStat[];
  className?: string;
};

/**
 * Four stat tiles above the counselor roster, each a link to the page that
 * acts on the number and each captioned with the rule it counts
 * (lib/counselor/rosterStats.ts). Kit `StatTile` on `--wa-*`; the number stays
 * neutral and the tile carries a tone hook only when the state warrants it (WAP-99).
 * One treatment for mobile (2-up) and desktop (4-up).
 */
export default function CounselorRosterStats({ stats, className }: Props) {
  return (
    <div
      className={['wa-grid wa-grid-cols-2 lg:wa-grid-cols-4 wa-gap-3', className].filter(Boolean).join(' ')}
      data-testid="counselor-roster-stats"
    >
      {stats.map((stat) => (
        <Link
          key={stat.key}
          href={stat.href}
          className="wa-kit-focus"
          style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
        >
          <StatTile
            label={stat.label}
            value={stat.value}
            delta={stat.caption}
            deltaTone="muted"
            tone={stat.tone ? ROSTER_STAT_TONE[stat.tone] : undefined}
            data-stat={stat.key}
            style={{ height: '100%' }}
          />
        </Link>
      ))}
    </div>
  );
}
