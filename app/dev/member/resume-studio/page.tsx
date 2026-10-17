import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { ResumeStudioKit } from '@/components/portal/kit/pages/member/ResumeStudioKit';
import type { ResumeScorePayload } from '@/components/portal/tools/ResumeScoreBreakdown';

/**
 * Credential-free proofs for resume studio (toolkit destination).
 *   /dev/member/resume-studio                 — score form
 *   /dev/member/resume-studio?state=filled    — score + analysis
 *   /dev/member/resume-studio?view=rewrite    — rewrite form
 *   /dev/member/resume-studio?view=rewrite&state=filled
 *   /dev/member/resume-studio?view=coach      — honest coach empty
 * Analyze/rewrite POSTs, resume hydrate, file extract, and voice skip in preview.
 */
export const dynamic = 'force-dynamic';

const SEED_RESUME = `Jordan Reyes
Austin, TX
IT support graduate. VPN triage, runbooks, AWS lab hours.

Experience
WorkforceAP — Cloud support lab
- Triaged VPN tickets
- Logged AWS lab hours against Cost Explorer

Education
IT Support certificate — CompTIA A+ track`;

const SCORE_OUTPUT = `OVERALL SCORE: 72%

STRENGTHS:
• AWS lab hours named against Cost Explorer.
• VPN triage on a real queue.

PRIORITY IMPROVEMENTS:
• Add dollar or ticket-volume metrics to the Cost Explorer line.
• Name the on-call rotation and hours covered.

QUICK WINS:
• Lead each bullet with an action verb and a number.`;

const SCORE_PAYLOAD: ResumeScorePayload = {
  composite: 72,
  pillars: {
    structural: { score: 74, label: 'Structure & ATS basics' },
    onetCoverage: { score: 68, label: 'O*NET coverage' },
    marketCoverage: { score: 71, label: 'Market keywords' },
  },
  structural: {
    composite: 74,
    breakdown: {
      structure: { score: 80, weight: 0.25, notes: [] },
      quantification: { score: 62, weight: 0.25, notes: ['Add a metric to the Cost Explorer bullet.'] },
      actionVerbs: { score: 78, weight: 0.2, notes: [] },
      bulletLength: { score: 74, weight: 0.15, notes: [] },
      contact: { score: 79, weight: 0.15, notes: [] },
    },
  },
  occupations: [
    { onetCode: '15-1232.00', title: 'Computer User Support Specialists', confidence: 0.81 },
  ],
  onetCoverage: [
    {
      onetCode: '15-1232.00',
      title: 'Computer User Support Specialists',
      coverageScore: 68,
      topGaps: [
        { skill: 'On-call rotation', importance: 82, bestSimilarity: 0.21 },
        { skill: 'Azure Cost Management', importance: 74, bestSimilarity: 0.18 },
      ],
    },
  ],
  marketCoverage: [
    {
      postingCount: 42,
      source: 'cache',
      coverageScore: 71,
      mustHaveMissing: [
        { phrase: 'on-call', frequency: 0.78 },
        { phrase: 'Azure', frequency: 0.71 },
      ],
      mustHavePresent: [
        { phrase: 'AWS', frequency: 0.84 },
        { phrase: 'VPN', frequency: 0.66 },
      ],
    },
  ],
};

const REWRITE = `JORDAN REYES
Austin, TX | Cloud Support Associate

SUMMARY
IT support graduate targeting hybrid Austin cloud support. Isolates Cost Explorer spikes and writes the runbook the on-call rotation uses next.

EXPERIENCE
WorkforceAP — Cloud support lab
- Triaged VPN tickets and logged AWS lab hours against Cost Explorer, runbooks, and ticket queues named in hybrid Austin cloud-support postings.

EDUCATION
IT Support certificate — CompTIA A+ track`;

export default async function DevMemberResumeStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; view?: string }>;
}) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const { state, view } = await searchParams;
  const filled = state !== 'empty';
  const isRewrite = view === 'rewrite';
  const seeded = filled || isRewrite;

  return (
    <Suspense fallback={null}>
      <ResumeStudioKit
        preview
        hasResume={seeded}
        backHref="/dev/member/ai-tools"
        basePath="/dev/member/resume-studio"
        initialResume={seeded ? SEED_RESUME : ''}
        initialJobTarget="Cloud Support Associate"
        previewScoreOutput={filled && !isRewrite ? SCORE_OUTPUT : undefined}
        previewScorePayload={filled && !isRewrite ? SCORE_PAYLOAD : undefined}
        previewRewriteOutput={filled && isRewrite ? REWRITE : undefined}
        advisor={{ name: 'Dana Reyes', firstName: 'Dana', messagingHref: '/dev/member/messages' }}
        score={72}
        targetListing="Cloud Support Associate"
        keywordPct={84}
        coachName="Dana Reyes"
        clarityPct={88}
        metricsPct={64}
        keywordsPct={72}
        fixes={[
          { title: 'Add metrics to 4 bullet points', body: 'Quantifiable outcomes on ticket resolution, uptime improvements, and user satisfaction provide verifiable competency.', tag: 'highImpact' },
          { title: 'Align skills for Cloud Support Associate', body: 'Missing keywords: Active Directory, Bash scripting basics, and incident triage protocol.', tag: 'keywordGap' },
          { title: 'Shorten the summary to 3 concise lines', body: 'Tighten the narrative to highlight foundational systems administration strengths and immediate regional readiness.', tag: 'formatting' },
        ]}
        versions={[
          { title: 'Cloud Support Associate', saved: 'Saved · Oct 14', score: 72, href: '/dev/member/resume-studio' },
          { title: 'IT Support Specialist', saved: 'Saved · Oct 9', score: 68, href: '/dev/member/resume-studio' },
          { title: 'Core master profile', saved: 'Saved · Oct 2', score: 62, href: '/dev/member/resume-studio' },
        ]}
        rewritePreview={{
          targetEmployer: 'Brightline Credit Union',
          targetRole: 'Cloud Support Associate',
          previous: 'Assisted internal staff with technical tickets and reset passwords in enterprise accounts.',
          suggested: 'Resolved 45+ weekly support tickets, including account and password issues.',
          points: 14,
          summary: 'Target-oriented IT technician trained in cloud infrastructure support, Active Directory user permissions, and rapid triage workflows for high-availability environments.',
        }}
      />
    </Suspense>
  );
}
