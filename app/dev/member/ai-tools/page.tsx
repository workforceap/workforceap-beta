import { notFound } from 'next/navigation';
import { MemberAiToolsHubKit } from '@/components/portal/kit/pages/member/MemberAiToolsHubKit';
import {
  DEV_ADVISOR,
  DEV_AI_DRAFTS,
  DEV_CURRENT_MODULE_NUMBER,
  DEV_CURRENT_MODULE_TITLE,
  DEV_INTERVIEW_WHEN,
  DEV_MEMBER_FIRST_NAME,
  DEV_NEXT_CHECK_IN,
  DEV_RESUME_SCORE,
  DEV_STREAK,
  DEV_TARGET_ROLE,
  employerShortName,
} from '@/app/dev/member/devMemberFixtures';

/** Credential-free Stitch C proof for the AI Career Tools hub. */
export const dynamic = 'force-dynamic';

export default function DevMemberAiToolsPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const targetEmployer = DEV_TARGET_ROLE.meta.split(' · ')[0] ?? '';
  return (
    <MemberAiToolsHubKit
      hubHref="/dev/member/toolkit"
      advisor={DEV_ADVISOR}
      firstName={DEV_MEMBER_FIRST_NAME}
      currentStreak={DEV_STREAK}
      longestStreak={DEV_STREAK}
      targetRole={DEV_TARGET_ROLE.title}
      targetEmployer={employerShortName(targetEmployer)}
      currentModuleNumber={DEV_CURRENT_MODULE_NUMBER}
      currentModuleTitle={DEV_CURRENT_MODULE_TITLE}
      resumeScore={DEV_RESUME_SCORE}
      mockQuestion={2}
      mockTotal={5}
      interviewWhen={DEV_INTERVIEW_WHEN}
      nextCheckIn={DEV_NEXT_CHECK_IN}
      jobsHref="/dev/member/jobs"
      drafts={[...DEV_AI_DRAFTS]}
    />
  );
}
