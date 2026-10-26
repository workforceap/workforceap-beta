import ResumeClient from '@/app/(portal)/dashboard/resume/ResumeClient';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { ResumeStudioKit } from '@/components/portal/kit/pages/member/ResumeStudioKit';
import type { ResumeScorePayload } from '@/components/portal/tools/ResumeScoreBreakdown';

/**
 * Credential-free proofs for resume studio (toolkit destination).
 *   /dev/member/resume-studio                 — separate original/revised fixture files
 *   /dev/member/resume-studio?view=score&state=filled — score + analysis
 *   /dev/member/resume-studio?view=rewrite    — rewrite form
 *   /dev/member/resume-studio?view=rewrite&state=filled
 *   /dev/member/resume-studio?view=coach      — honest coach empty
 *   /dev/member/resume-studio?view=score&state=unavailable — retry with a retained draft
 *   /dev/member/resume-studio?view=score&state=audit-suppressed — no storage retry
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
  const { state } = await searchParams;
  const filled = state === 'filled';
  const loadStatus = state === 'unavailable' || state === 'audit-suppressed' || state === 'absent'
    ? state : 'available';

  return (
    <Suspense fallback={null}>
      <ResumeStudioKit
        preview
        hasResume={loadStatus === 'available'}
        loadStatus={loadStatus}
        filesSlot={
          loadStatus === 'available' ? (
          <ResumeClient
            completeness={75}
            witData={{ name: 'Jordan Reyes', email: 'jordan@example.test', phone: '', recentEmployer: '', targetJob: 'Cloud Support Associate', skills: 'Support, troubleshooting' }}
            hasOriginal
            hasEnhanced
            layout="side-by-side"
            previewData={{ originalText: SEED_RESUME, enhancedText: REWRITE }}
            toolHrefs={{
              rewrite: '/dev/member/resume-studio?view=rewrite',
              jobMatch: '/dev/member/job-match',
              score: '/dev/member/resume-studio?view=score',
            }}
          />
          ) : undefined
        }
        backHref="/dev/member/toolkit"
        basePath="/dev/member/resume-studio"
        initialResume={filled ? SEED_RESUME : ''}
        initialRewriteResume={SEED_RESUME}
        initialJobTarget="Cloud Support Associate"
        previewScoreOutput={filled ? SCORE_OUTPUT : undefined}
        previewScorePayload={filled ? SCORE_PAYLOAD : undefined}
        previewRewriteOutput={filled ? REWRITE : undefined}
      />
    </Suspense>
  );
}
