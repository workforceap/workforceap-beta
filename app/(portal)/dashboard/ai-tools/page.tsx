import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { getMemberResumePlainText } from '@/lib/member/getMemberResumePlainText';
import { withDbRetry } from '@/lib/db/withDbRetry';
import { scoreStructural } from '@/lib/ai/resumeScore';
import {
  VoiceStudioKit,
  type ResumeStudioData,
  type ResumeStudioIssue,
  type VoiceStudioAgentKey,
} from '@/components/portal/kit/pages/VoiceStudioKit';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';

/**
 * AI Career Tools — the canonical voice-first career-tools workspace.
 * Four internal tabs (Voice Coaches / Live Session / Resume Studio / AI Toolkit),
 * deep-linkable via ?tab=. Ported from docs/mockups/workforceap-voice-studio.html.
 */
const STUDIO_TABS = ['coaches', 'session', 'studio', 'toolkit'] as const;
type StudioTab = (typeof STUDIO_TABS)[number];
const STUDIO_AGENTS: VoiceStudioAgentKey[] = ['readiness', 'resume', 'mock', 'counselor', 'business'];

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'AI Career Tools',
    description:
      'Voice coaching, live mock interviews, the Resume Studio, and the full AI career toolkit — all in one place.',
    path: '/dashboard/ai-tools',
  });
}

export default async function CareerStudioPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string; agent?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/ai-tools');
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());

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

  const resumeStudio =
    initialTab === 'studio'
      ? await loadResumeStudioData(user.id, readOnlyAudit)
      : { hasResume: false };

  return (
    <>
      {readOnlyAudit && initialTab === 'studio' && (
        <span hidden data-portal-audit-suppressed="career-studio-resume-storage-provider" />
      )}
      <VoiceStudioKit initialTab={initialTab} initialAgent={initialAgent} resumeStudio={resumeStudio} />
    </>
  );
}

/** Human labels for each structural dimension surfaced as a "top fix". */
const DIMENSION_LABEL: Record<string, string> = {
  structure: 'Formatting & structure',
  quantification: 'Quantify your impact',
  actionVerbs: 'Lead with stronger verbs',
  bulletLength: 'Tighten bullet length',
  contact: 'Complete your contact info',
};

/**
 * Computes the Resume Studio tab's REAL data from the member's actual resume:
 * a deterministic structural score (instant — no LLM / external calls) plus the
 * real issue notes from the weakest dimensions. Returns hasResume:false when
 * there's nothing on file. Never throws — the tab degrades to the empty state.
 */
async function loadResumeStudioData(
  userId: string,
  readOnlyAudit = false,
): Promise<ResumeStudioData> {
  try {
    const text = await withDbRetry(() =>
      getMemberResumePlainText(userId, 8000, { readOnlyAudit }),
    );
    if (text.trim().length === 0) return { hasResume: false };

    const structural = scoreStructural(text);
    const issues: ResumeStudioIssue[] = Object.entries(structural.breakdown)
      .map(([key, sub]) => ({ key, score: sub.score, detail: sub.notes[0] ?? '' }))
      .filter((d) => d.score < 85 && d.detail)
      .sort((a, b) => a.score - b.score)
      .slice(0, 3)
      .map((d) => ({ title: DIMENSION_LABEL[d.key] ?? 'Resume fix', detail: d.detail }));

    return { hasResume: true, structuralScore: structural.composite, issues };
  } catch (err) {
    console.error('[studio page] resume data load failed', err);
    return { hasResume: false };
  }
}
