import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import PageHeader from '@/components/portal/PageHeader';
import CoachChat from '@/components/portal/CoachChat';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { sanitizeCoachMemoryFields } from '@/lib/coach/memorySafety';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'AI Career Coach',
    description:
      'Chat with your persistent AI career coach. Get help with your job search, resumes, interviews, and career planning — it remembers where you left off.',
    path: '/coach',
  });
}

export default async function CoachPage() {
  const user = await getUser();
  if (!user) {
    redirect('/login?redirectTo=/coach');
  }

  // Read display name + persistent coach memory for a warm, memory-aware
  // greeting. These reads are best-effort: a slow/missing row must never
  // block the chat surface from rendering.
  const [dbUser, memoryRow] = await Promise.all([
    prisma.user
      .findUnique({ where: { id: user.id }, select: { fullName: true } })
      .catch(() => null),
    prisma.coachMemory
      .findUnique({
        where: { userId: user.id },
        select: { summary: true, lastTopic: true, lastAction: true },
      })
      .catch(() => null),
  ]);

  const memory = memoryRow ? sanitizeCoachMemoryFields(memoryRow) : null;
  const firstName = dbUser?.fullName?.trim().split(/\s+/)[0] || 'there';
  const returning = Boolean(memory?.summary?.trim() || memory?.lastTopic?.trim());

  return (
    <div style={{ background: 'var(--wa-bg)', minHeight: '100vh' }}>
      <div
        style={{
          padding: '1.25rem 2rem 1.5rem',
          borderBottom: '1px solid var(--surface-container-high)',
          background: 'var(--surface-container-low)',
        }}
      >
        <PageHeader
          title="AI Career Coach"
          subtitle="Chat with a coach that remembers your journey — job search, resumes, interviews, and next steps."
          breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'AI Career Coach' }]}
          action={
            <Link
              href="/dashboard/ai-tools/career-business-coach"
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '1.1rem' }}>
                graphic_eq
              </span>
              Prefer to talk? Try the voice coach
            </Link>
          }
        />
      </div>

      <div style={{ maxWidth: 980, margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
        <CoachChat
          greeting={{
            firstName,
            returning,
            lastTopic: memory?.lastTopic ?? null,
            lastAction: memory?.lastAction ?? null,
          }}
        />
      </div>
    </div>
  );
}
