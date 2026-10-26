import { notFound } from 'next/navigation';
import { MemberJobsKit } from '@/components/portal/kit/pages/member/MemberJobsKit';

/**
 * Storybook-lite — tracked applications with no AI matches (the live state
 * that truncated empty-recommendation copy).
 */
export const dynamic = 'force-dynamic';

export default function DevMemberJobsEmptyPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();

  return (
    <MemberJobsKit
      saved={1}
      applied={1}
      interviewing={1}
      offers={0}
      syncedLabel="2 active applications"
      browseHref="/dev/member/jobs?state=board"
      profileHref="/dev/member/profile"
      messagesHref="/dev/member/messages"
      jobHref={(id) => `/dev/member/jobs?state=detail&job=${id}`}
      applications={[
        { id: 'a1', role: 'Account Executive', company: 'Salesforce', location: 'Location not listed', applied: 'Apr 16', stage: 'Accepted', tone: 'ok' },
        { id: 'a2', role: 'IT Support Technician', company: 'Dell Technologies', location: 'Location not listed', applied: 'Mar 16', stage: 'Applied', tone: 'muted' },
      ]}
      recommended={[]}
    />
  );
}
