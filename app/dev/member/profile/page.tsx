import { notFound } from 'next/navigation';
import { MemberProfileKit } from '@/components/portal/kit/pages/member/MemberProfileKit';

/**
 * Storybook-lite showcase — MemberProfileKit, fully populated.
 * `live` is left at its default (false) so Save/toggles stay local-only —
 * no PATCH calls to /api/member/dashboard-profile or /api/member/settings.
 * Preview-only, no auth/DB. See app/dev/dashboard/page.tsx for the pattern.
 */
export const dynamic = 'force-dynamic';

export default async function DevMemberProfilePage({
  searchParams,
}: {
  searchParams?: Promise<{ live?: string }>;
}) {
  if (process.env.VERCEL_ENV === 'production') notFound();

  const params = await searchParams;
  const live = params?.live === '1';

  return (
    <MemberProfileKit
      live={live}
      name="Alex Rivera"
      initials="AR"
      headline="AWS Cloud Practitioner candidate · Austin, TX"
      email="alex.rivera@example.test"
      location="Austin, TX"
      programInterest="Cloud & IT"
      programOptions={['Cloud & IT', 'Data & AI', 'Healthcare', 'Skilled Trades']}
      badges={[
        { label: '2 certs', bg: 'var(--wa-gold-soft)', color: 'var(--wa-gold-dark)' },
        { label: '84 readiness', bg: 'var(--wa-success-soft)', color: 'var(--wa-success-dark)' },
        { label: '12-day streak', bg: 'var(--wa-accent-soft)', color: 'var(--wa-accent-text)' },
      ]}
      notifications={[
        { key: 'jobs', label: 'Job matches', enabled: true },
        { key: 'counselor', label: 'Counselor messages', enabled: true },
        { key: 'reminders', label: 'Course reminders', enabled: false },
        { key: 'recap', label: 'Weekly recap email', enabled: true },
      ]}
    />
  );
}
