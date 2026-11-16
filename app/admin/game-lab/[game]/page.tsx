import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getUser } from '@/lib/auth/server';
import { canUseGameLab } from '@/lib/game-lab/access';
import { getGameLabGame } from '@/lib/game-lab/manifest';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import GameLabPlayer from '@/components/admin/game-lab/GameLabPlayer';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Game Lab (pre-release)', robots: { index: false, follow: false } };

export default async function GameLabPlayPage({ params }: { params: Promise<{ game: string }> }) {
  const { game: slug } = await params;
  const user = await getUser();
  if (!user) redirect(`/login?redirectTo=${encodeURIComponent(`/admin/game-lab/${slug}`)}`);
  if (!(await canUseGameLab(user.id))) notFound();
  const game = getGameLabGame(slug);
  if (!game) notFound();

  return (
    <PortalPageFrame
      title={game.title}
      subtitle="Pre-release sandbox. Original WAP Practice lesson; not course credit; progress stays in this browser."
      action={<Link className="btn btn-ghost btn-sm" href="/admin/game-lab">Back to Game Lab</Link>}
    >
      <GameLabPlayer slug={game.slug} title={game.title} />
    </PortalPageFrame>
  );
}
