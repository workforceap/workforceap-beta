import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { DesignSurface, KitEmptyState, PageOpener } from '@/components/portal/kit';
import SkillMissionPanel, { type SkillMissionSummary } from '@/components/portal/SkillMissionPanel';
import { SkillMissionChallengePreview } from '@/components/portal/SkillMissionChallenge';
import SkillMissionTeaserCard from '@/components/portal/SkillMissionTeaserCard';
import {
  skillMissionEmptyState,
  skillMissionHeaderSentence,
  type SkillMissionTranslate,
} from '@/lib/member/skillMissionEmptyState';

/**
 * Credential-free proofs for Skill Missions.
 * Superadmin switcher lives in WorkspaceShell (DevMemberShell passes
 * `superAdmin`) — do not render a second workspace-shell-header here.
 *   /dev/member/missions              — unenrolled ("Choose program")
 *   /dev/member/missions?state=enrolled — enrolled program with no catalog missions
 *   /dev/member/missions?state=active   — populated journey (passed / ready / retry / locked)
 *   /dev/member/missions?state=challenge — kit challenge overlay (preview, no POST)
 *   /dev/member/missions?state=passed    — quiet pass overlay (resume bullet saved)
 *   /dev/member/missions?state=teaser    — teaser card (Home links to missions with a shortcut and does not render it)
 */
export const dynamic = 'force-dynamic';

const DEV_HREF: Record<string, string> = {
  '/dashboard/program': '/dev/member/program',
  '/dashboard/training': '/dev/member/program',
};

const QUIZ = {
  text: 'Which well-architected pillar covers cost?',
  options: ['Security', 'Cost Optimization', 'Reliability', 'Performance'] as [string, string, string, string],
};

const ACTIVE_SUMMARY: SkillMissionSummary = {
  programSlug: 'aws-cloud-technology-amazon',
  programTitle: 'AWS Cloud Technology Certificate',
  totalMissions: 5,
  passedCount: 2,
  readyCount: 1,
  retryCount: 1,
  streak: 2,
  careerReadinessPct: 40,
  demonstratedSkills: ['AWS fundamentals', 'Cost awareness', 'Compute choices'],
  missions: [
    {
      key: 'aws-cloud-concepts',
      courseSlug: 'cloud-concepts',
      programSlug: 'aws-cloud-technology-amazon',
      programTitle: 'AWS Cloud Technology Certificate',
      courseTitle: 'Cloud Concepts',
      missionName: 'Explain the cloud to a hiring manager',
      missionTagline: 'Turn the first module into a 30-second pitch.',
      primaryAxis: 'communication',
      skillLabels: ['AWS fundamentals', 'Storytelling'],
      scenarioPrompt: '',
      evidenceHint: '',
      quizQuestions: [QUIZ],
      estimatedMinutes: 12,
      status: 'passed',
      completedAt: new Date('2026-07-18T12:00:00.000Z'),
      latestResult: {
        verdict: 'passed',
        coachingNote: '',
        starStory: '',
        resumeBullet: 'Explained AWS shared-responsibility tradeoffs to a non-technical hiring manager.',
        skillsUnlocked: ['AWS fundamentals', 'Cost awareness'],
      },
      aiToolResultId: 'preview-resume',
    },
    {
      key: 'aws-core-services',
      courseSlug: 'core-services',
      programSlug: 'aws-cloud-technology-amazon',
      programTitle: 'AWS Cloud Technology Certificate',
      courseTitle: 'Core Services',
      missionName: 'Pick the right compute option',
      missionTagline: 'Match a workload to the service that fits it.',
      primaryAxis: 'judgment',
      skillLabels: ['Compute choices'],
      scenarioPrompt: '',
      evidenceHint: '',
      quizQuestions: [QUIZ],
      estimatedMinutes: 14,
      status: 'passed',
      completedAt: new Date('2026-07-25T12:00:00.000Z'),
      latestResult: {
        verdict: 'passed',
        coachingNote: '',
        starStory: '',
        resumeBullet: 'Matched three workloads to the AWS compute service that fit their traffic pattern.',
        skillsUnlocked: ['Compute choices'],
      },
      aiToolResultId: null,
    },
    {
      key: 'aws-security',
      courseSlug: 'security-compliance',
      programSlug: 'aws-cloud-technology-amazon',
      programTitle: 'AWS Cloud Technology Certificate',
      courseTitle: 'Security & Compliance',
      missionName: 'Defend a least-privilege decision',
      missionTagline: 'Prove you can say no to a risky IAM request.',
      primaryAxis: 'judgment',
      skillLabels: ['IAM', 'Security'],
      scenarioPrompt:
        'A teammate asks you to attach AdministratorAccess so a vendor can “just get unblocked.” Walk the hiring manager through what you do instead.',
      evidenceHint: '',
      quizQuestions: [QUIZ],
      estimatedMinutes: 15,
      status: 'ready',
      completedAt: null,
      latestResult: null,
      aiToolResultId: null,
    },
    {
      key: 'aws-billing',
      courseSlug: 'billing-pricing',
      programSlug: 'aws-cloud-technology-amazon',
      programTitle: 'AWS Cloud Technology Certificate',
      courseTitle: 'Billing & Pricing',
      missionName: 'Catch a runaway bill',
      missionTagline: 'Show how you would investigate a cost spike.',
      primaryAxis: 'analysis',
      skillLabels: ['Cost Explorer', 'FinOps'],
      scenarioPrompt: '',
      evidenceHint: '',
      quizQuestions: [QUIZ],
      estimatedMinutes: 18,
      status: 'needs_retry',
      completedAt: null,
      latestResult: {
        verdict: 'needs_retry',
        coachingNote: 'Name the service and the 24-hour window before you recommend a fix. Hiring managers want the evidence trail.',
        starStory: '',
        resumeBullet: '',
        skillsUnlocked: [],
      },
      aiToolResultId: null,
    },
    {
      key: 'aws-exam',
      courseSlug: 'exam-readiness',
      programSlug: 'aws-cloud-technology-amazon',
      programTitle: 'AWS Cloud Technology Certificate',
      courseTitle: 'Exam Readiness',
      missionName: 'Walk through a practice exam miss',
      missionTagline: 'Turn a wrong answer into a teaching moment.',
      primaryAxis: 'learning',
      skillLabels: ['Exam strategy'],
      scenarioPrompt: '',
      evidenceHint: '',
      quizQuestions: [QUIZ],
      estimatedMinutes: 20,
      status: 'locked',
      completedAt: null,
      latestResult: null,
      aiToolResultId: null,
    },
  ],
};

export default async function DevMemberMissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.VERCEL_ENV === 'production') notFound();

  const { state } = await searchParams;
  const view =
    state === 'enrolled' || state === 'active' || state === 'challenge' || state === 'passed' || state === 'teaser'
      ? state
      : 'empty';

  const t = await getTranslations('skillMissions');

  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--wa-pad-sm)' }} className="wa-space-y-6">
        <PageOpener
          title={t('title')}
          meta={skillMissionHeaderSentence(view === 'active' ? ACTIVE_SUMMARY : null, t)}
        />
        {view === 'teaser' ? (
          <SkillMissionTeaserCard
            href="/dev/member/missions"
            data={{
              careerReadinessPct: 50,
              passedCount: 2,
              totalMissions: 4,
              readyCount: 1,
              retryCount: 0,
              streak: 3,
              nextMissionName: 'Defend a least-privilege decision',
              nextMissionCourse: 'Security & Compliance',
            }}
          />
        ) : view === 'passed' ? (
          <SkillMissionChallengePreview mission={ACTIVE_SUMMARY.missions[2]!} state="passed" />
        ) : view === 'challenge' ? (
          <SkillMissionChallengePreview mission={ACTIVE_SUMMARY.missions[2]!} />
        ) : view === 'active' ? (
          <SkillMissionPanel
            summary={ACTIVE_SUMMARY}
            hideTitle
            preview
            resumeStudioHref="#"
          />
        ) : (
          <DevMissionsEmpty enrolled={view === 'enrolled'} t={t} />
        )}
      </div>
    </DesignSurface>
  );
}

/** Same shell as the live page: kit card + KitEmptyState at h2, hrefs remapped to the proofs. */
function DevMissionsEmpty({ enrolled, t }: { enrolled: boolean; t: SkillMissionTranslate }) {
  const empty = skillMissionEmptyState(
    {
      programSlug: enrolled ? 'ai-professional-practitioner-certificate' : null,
      programTitle: enrolled ? 'AI Professional Practitioner Certificate' : null,
    },
    t,
  );
  return (
    <div className="wa-kit-card">
      <KitEmptyState
        kind={empty.kind}
        tone={empty.tone}
        headingAs="h2"
        title={empty.title}
        description={empty.description}
        primaryAction={{ href: DEV_HREF[empty.primaryAction.href] ?? empty.primaryAction.href, label: empty.primaryAction.label }}
      />
    </div>
  );
}
