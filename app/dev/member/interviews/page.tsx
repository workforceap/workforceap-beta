import { notFound } from 'next/navigation';
import { MessagesSquare } from 'lucide-react';
import InterviewWorkspaceClient from '@/components/portal/InterviewWorkspaceClient';
import { ToolkitToolChrome } from '@/components/portal/kit/pages/member/ToolkitToolChrome';

export const dynamic = 'force-dynamic';
export default function InterviewsProofPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return (
    <ToolkitToolChrome title="Interviews" icon={<MessagesSquare size={20} aria-hidden="true" />} lede="QA fixture using the actual interview chooser. The four links lead to their full signed-in tools. Choosing or editing a role does not start microphone, camera, recording, or email." backHref="/dev/member/toolkit">
      <InterviewWorkspaceClient initialRole="Cloud support specialist" />
    </ToolkitToolChrome>
  );
}
