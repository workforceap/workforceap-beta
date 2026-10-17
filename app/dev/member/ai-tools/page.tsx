import { notFound } from 'next/navigation';
import { MemberAiToolsHubKit } from '@/components/portal/kit/pages/member/MemberAiToolsHubKit';

/** Credential-free Stitch C proof for the AI Career Tools hub. */
export const dynamic = 'force-dynamic';

export default function DevMemberAiToolsPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return (
    <MemberAiToolsHubKit
      hubHref="/dev/member/toolkit"
      advisor={{ name: 'Dana Reyes', firstName: 'Dana', messagingHref: '/dev/member/messages' }}
      resumeScore={72}
      mockQuestion={2}
      mockTotal={5}
      nextSync="Thursday"
    />
  );
}
