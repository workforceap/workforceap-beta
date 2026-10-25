import { notFound } from 'next/navigation';
import {
  VoiceStudioKit,
  type VoiceStudioAgentKey,
} from '@/components/portal/kit/pages/VoiceStudioKit';

/**
 * Credential-free proof for the live Career Studio hub
 * (`/dashboard/ai-tools` → VoiceStudioKit). Voice coaches, live practice,
 * Resume Studio, and the AI toolkit stay in one place — do not swap this
 * for a destination tool list.
 */
export const dynamic = 'force-dynamic';

const STUDIO_TABS = ['coaches', 'session', 'studio', 'toolkit'] as const;
type StudioTab = (typeof STUDIO_TABS)[number];
const STUDIO_AGENTS: VoiceStudioAgentKey[] = ['readiness', 'resume', 'mock', 'counselor', 'business'];

const FIXTURE_DESTINATION_HREFS = {
  'resume-coach': '/dev/member/resume-studio?view=coach',
  'career-business-coach': '/dev/member/career-business-coach',
  'elevator-pitch': '/dev/member/elevator-pitch',
  'resume-studio': '/dev/member/resume-studio',
  'resume-rewriter': '/dev/member/resume-rewriter',
  'cover-letter': '/dev/member/cover-letter',
  // The full interview chooser still links into signed-in routes; send the
  // fixture's directory shortcut to the existing safe practice proof instead.
  interviews: '/dev/member/interview-practice',
  'interview-practice': '/dev/member/interview-practice',
  'interview-coach': '/dev/member/interview-coach',
  'job-match-scorer': '/dev/member/job-match',
  'skill-mapper': '/dev/member/skill-mapper',
  'linkedin-headline': '/dev/member/linkedin-headline',
  'linkedin-about': '/dev/member/linkedin-about',
  'gap-analyzer': '/dev/member/gap-analyzer',
  'salary-negotiation': '/dev/member/salary-negotiation',
  'benefits-cliff': '/dev/member/benefits-cliff',
  'human-messages': '/dev/member/messages',
} as const;

export default async function DevMemberToolkitPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string; agent?: string }>;
}) {
  if (process.env.VERCEL_ENV === 'production') notFound();

  const params = await searchParams;
  const requestedTab = typeof params?.tab === 'string' ? params.tab : '';
  const requestedAgent = typeof params?.agent === 'string' ? params.agent : '';
  const initialTab: StudioTab = (STUDIO_TABS as readonly string[]).includes(requestedTab)
    ? (requestedTab as StudioTab)
    : 'coaches';
  const initialAgent: VoiceStudioAgentKey | undefined = STUDIO_AGENTS.includes(
    requestedAgent as VoiceStudioAgentKey,
  )
    ? (requestedAgent as VoiceStudioAgentKey)
    : undefined;

  return <VoiceStudioKit initialTab={initialTab} initialAgent={initialAgent} destinationHrefs={FIXTURE_DESTINATION_HREFS} />;
}
