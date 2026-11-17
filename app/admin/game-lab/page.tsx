import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getUser } from '@/lib/auth/server';
import { canUseGameLab } from '@/lib/game-lab/access';
import { GAME_LAB_GAMES } from '@/lib/game-lab/manifest';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import GameLabResetProgress from '@/components/admin/game-lab/GameLabResetProgress';
import { StatusTag } from '@/components/portal/kit';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Game Lab (pre-release)', robots: { index: false, follow: false } };

export default async function GameLabPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/game-lab');
  if (!(await canUseGameLab(user.id))) notFound();

  return (
    <PortalPageFrame
      title="Game Lab"
      subtitle="Admin-only practice sandbox. Nothing here is saved to WorkforceAP."
    >
      <p>
        <StatusTag tone="warn" data-testid="game-lab-prerelease-badge">
          Pre-release
        </StatusTag>
      </p>
      <p data-testid="game-lab-disclaimer">
        Original WAP Practice lessons. Not course or Coursera credit, not teaching-reviewed, and no student records, XP, attendance or grades are created.
        Game progress stays in this browser only.
      </p>
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))' }}>
        {GAME_LAB_GAMES.map((game) => (
          <li key={game.slug} style={{ padding: '1rem', border: '1px solid #d0d5dd', borderRadius: 8 }} data-testid={`game-card-${game.slug}`}>
            <h2 style={{ marginTop: 0 }}>{game.title}</h2>
            <p>{game.summary}</p>
            <Link className="btn btn-primary btn-sm" href={`/admin/game-lab/${game.slug}`}>
              Open {game.title}
            </Link>
          </li>
        ))}
      </ul>
      <GameLabResetProgress />
    </PortalPageFrame>
  );
}
