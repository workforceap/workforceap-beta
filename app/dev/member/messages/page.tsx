import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { KitEmptyState } from '@/components/portal/kit';
import { MemberMessagesFrame, MemberMessagesKit } from '@/components/portal/kit/pages/member/MemberMessagesKit';

/**
 * Storybook-lite showcase — MemberMessagesKit (unread conversation list +
 * an open thread). No `memberUserId`/`threadId`/`onSend` are passed, so the
 * kit stays fully local (no Supabase realtime, no /api/member/messages POST).
 *   /dev/member/messages            — populated inbox
 *   /dev/member/messages?state=empty — provisioning empty (live no-member-row guard)
 *   /dev/member/messages?state=thread-empty — open thread with no messages yet
 * Preview-only, no auth/DB. See app/dev/dashboard/page.tsx for the pattern.
 */
export const dynamic = 'force-dynamic';

export default async function DevMemberMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const { state } = await searchParams;
  if (state === 'empty') {
    const te = await getTranslations('empty');
    return (
      <MemberMessagesFrame>
        <div className="wa-kit-card">
          <KitEmptyState
            kind="unavailable"
            headingAs="h2"
            title={te('inboxProvisioning.title')}
            description={te('inboxProvisioning.body')}
            primaryAction={{ label: te('inboxProvisioning.action'), href: 'mailto:info@workforceap.org' }}
            secondaryAction={{ label: te('inboxProvisioning.secondary'), href: '/dashboard' }}
          />
        </div>
      </MemberMessagesFrame>
    );
  }
  if (state === 'thread-empty') {
    // `memberUserId` enables the composer (kit `first` state with its action) without a live thread — no realtime, no read marker.
    return <MemberMessagesKit conversations={[]} activeName="Counselor" activeRole="Career counselor" activeInitials="CS" messages={[]} memberUserId="preview-member" />;
  }

  return (
    <MemberMessagesKit
      conversations={[
        {
          id: 'counselor',
          name: 'Counselor',
          role: 'Career counselor',
          preview: 'Reply here about training, jobs, or your next session.',
          unread: true,
          active: true,
        },
        {
          id: 'team',
          name: 'WorkforceAP Team',
          role: 'Support',
          preview: 'Workspace email and Coursera access questions go here.',
        },
      ]}
      activeName="Counselor"
      activeRole="Career counselor"
      activeInitials="CS"
      activeOnline
      messages={[
        {
          id: 'm1',
          from: 'other',
          author: 'CS',
          text: 'This thread is with your counselor. Send a question about training, jobs, or your next session.',
        },
        { id: 'm2', from: 'self', text: 'Will do.' },
        { id: 'm3', from: 'other', author: 'CS', text: 'I will reply on this thread.' },
      ]}
    />
  );
}
