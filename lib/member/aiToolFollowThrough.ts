export type AIToolFollowThrough = {
  title: string;
  body: string;
  href: string;
  cta: string;
};

function isElevatorPitch(toolType: string, inputSummary?: string | null, output?: string | null) {
  if (toolType !== 'career_counselor') return false;
  const haystack = `${inputSummary ?? ''} ${output ?? ''}`.toLowerCase();
  return haystack.includes('elevator');
}

export function getAIToolFollowThrough(params: {
  toolType: string;
  inputSummary?: string | null;
  output?: string | null;
}): AIToolFollowThrough {
  const { toolType, inputSummary, output } = params;

  if (toolType === 'resume_rewriter' || toolType === 'resume_analysis') {
    return {
      title: 'Put your updated resume to work',
      body: 'Use what you just built to apply for roles, tailor future applications, or prep for counselor feedback.',
      href: '/dashboard/job-applications',
      cta: 'Open application tracker',
    };
  }

  if (toolType === 'cover_letter') {
    return {
      title: 'Use this cover letter on a real application',
      body: 'The fastest way to keep momentum is to pair this draft with a saved job and submit or track the application.',
      href: '/dashboard/job-applications',
      cta: 'Track an application',
    };
  }

  if (
    toolType === 'interview_practice' ||
    toolType === 'interview_coach' ||
    toolType === 'voice_interview_video'
  ) {
    return {
      title: 'Turn practice into a repeatable interview plan',
      body: 'Capture what to improve, then keep your resume, stories, and interview prep moving together.',
      href: '/dashboard/readiness',
      cta: 'Open readiness plan',
    };
  }

  if (toolType === 'linkedin_headline' || toolType === 'linkedin_about') {
    return {
      title: 'Use this on your public profile next',
      body: 'Copy the strongest version into LinkedIn, then keep your job search materials aligned across every employer touchpoint.',
      href: '/dashboard/jobs',
      cta: 'Browse jobs',
    };
  }

  if (toolType === 'job_match_scorer' || toolType === 'gap_analyzer') {
    return {
      title: 'Close the gap with one concrete next step',
      body: 'Use this feedback to target your next course, resume update, or application instead of letting the result sit idle.',
      href: '/dashboard/program',
      cta: 'Open My Program',
    };
  }

  if (toolType === 'skill_assessment') {
    return {
      title: 'Use your assessment to guide training',
      body: 'Your assessment is most useful when it changes what you study next and how you prepare for job outcomes.',
      href: '/dashboard/program',
      cta: 'Open My Program',
    };
  }

  if (isElevatorPitch(toolType, inputSummary, output) || toolType === 'elevator_pitch') {
    return {
      title: 'Practice this pitch where it counts',
      body: 'Use your elevator introduction with counselors, interviews, and networking so it becomes natural before employer conversations.',
      href: '/dashboard/ai-tools/voice-interview',
      cta: 'Practice with voice interview',
    };
  }

  if (toolType === 'salary_negotiation') {
    return {
      title: 'Use this strategy in real conversations',
      body: 'Salary conversations work best when you rehearse your talking points before the actual offer discussion.',
      href: '/dashboard/ai-tools/interview-practice',
      cta: 'Practice negotiating',
    };
  }

  if (toolType === 'application_tracker') {
    return {
      title: 'Keep applications organized',
      body: 'Track every application so follow-ups and deadlines do not slip through the cracks.',
      href: '/dashboard/job-applications',
      cta: 'Open job applications',
    };
  }

  if (toolType === 'career_business_coach') {
    return {
      title: 'Turn coaching into action',
      body: 'The best coaching result is a clear next step. Connect this advice to training, job search, or counselor check-in.',
      href: '/dashboard/guide',
      cta: 'View your guide',
    };
  }

  if (toolType === 'skill_mapper') {
    return {
      title: 'Use your skill map to target training',
      body: 'Your mapped skills show where you are strong and where a course or project can close the gap.',
      href: '/dashboard/program',
      cta: 'Open My Program',
    };
  }

  if (toolType === 'readiness_coach') {
    return {
      title: 'Turn readiness into real applications',
      body: 'Readiness means you are prepared to apply. Use this momentum to submit applications or get counselor feedback.',
      href: '/dashboard/jobs',
      cta: 'Browse jobs',
    };
  }

  if (toolType === 'voice_interview') {
    return {
      title: 'Move from practice to real interviews',
      body: 'Voice interview practice builds confidence. Next step: apply the same answers in real employer conversations.',
      href: '/dashboard/jobs',
      cta: 'Browse jobs',
    };
  }

  return {
    title: 'Keep the momentum going',
    body: 'The best next move is to connect this AI result to training, readiness, or a real application so it leads somewhere.',
    href: '/dashboard/guide',
    cta: 'View guide',
  };
}
