import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import messages from '@/messages/en.json';
import { MemberAiToolsHubKit } from './MemberAiToolsHubKit';
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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/dev/member/ai-tools',
  useSearchParams: () => new URLSearchParams(),
}));

function renderKit(ui: ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>);
}

const employer = employerShortName(DEV_TARGET_ROLE.meta.split(' · ')[0] ?? '');
const hub = messages.dashboard.aiHub;
const home = messages.dashboard.home;

function renderDevHub() {
  return renderKit(
    <MemberAiToolsHubKit
      hubHref="/dev/member/toolkit"
      advisor={DEV_ADVISOR}
      firstName={DEV_MEMBER_FIRST_NAME}
      currentStreak={DEV_STREAK}
      longestStreak={DEV_STREAK}
      targetRole={DEV_TARGET_ROLE.title}
      targetEmployer={employer}
      currentModuleNumber={DEV_CURRENT_MODULE_NUMBER}
      currentModuleTitle={DEV_CURRENT_MODULE_TITLE}
      resumeScore={DEV_RESUME_SCORE}
      interviewWhen={DEV_INTERVIEW_WHEN}
      nextCheckIn={DEV_NEXT_CHECK_IN}
      jobsHref="/dev/member/jobs"
      drafts={[...DEV_AI_DRAFTS]}
    />,
  );
}

describe('MemberAiToolsHubKit journey weave', () => {
  it('uses the Home kicker, streak, advisor chip, and a goal-tied claim', () => {
    renderDevHub();
    expect(screen.getByText(home.workspaceKicker.replace('{name}', DEV_MEMBER_FIRST_NAME))).toBeTruthy();
    expect(screen.getByText(home.streak.replace('{count}', String(DEV_STREAK)))).toBeTruthy();
    expect(screen.getByText(home.advisorChip.replace('{name}', DEV_ADVISOR.name))).toBeTruthy();
    expect(screen.getByRole('heading', {
      name: hub.claim
        .replace('{role}', DEV_TARGET_ROLE.title)
        .replace('{employer}', employer)
        .replace('{n}', String(DEV_CURRENT_MODULE_NUMBER)),
    })).toBeTruthy();
    expect(screen.queryByText(/Eight tools/i)).toBeNull();
  });

  it('lists a weekly plan that links resume, the Brightline job, and Thursday interview prep', () => {
    renderDevHub();
    expect(screen.getByRole('heading', { name: hub.planTitle })).toBeTruthy();
    expect(screen.getByRole('link', { name: new RegExp(`Polish resume for ${DEV_TARGET_ROLE.title}`) }))
      .toHaveAttribute('href', '/dev/member/resume-studio');
    expect(screen.getByRole('link', { name: new RegExp(`Run the scorer on the ${employer} role`) }))
      .toHaveAttribute('href', '/dev/member/jobs');
    expect(screen.getByRole('link', { name: new RegExp(`Practice for ${DEV_INTERVIEW_WHEN}`) }))
      .toHaveAttribute('href', '/dev/member/interview-practice');
  });

  it('ties tools to shared fixtures with Feeds into lines and state tags', () => {
    renderDevHub();
    expect(screen.getAllByText(`Feeds your ${employer} application`).length).toBeGreaterThan(0);
    expect(screen.getByText(new RegExp(`Score ${DEV_RESUME_SCORE} against ${DEV_TARGET_ROLE.title}`))).toBeTruthy();
    expect(screen.getByRole('link', { name: hub.runScorer })).toHaveAttribute('href', '/dev/member/jobs');
    expect(screen.getByText(new RegExp(`Five tailored questions for ${DEV_INTERVIEW_WHEN}`))).toBeTruthy();
    expect(screen.getAllByText(hub.stateNeedsWork).length).toBeGreaterThan(0);
    expect(screen.getAllByText(hub.stateInProgress).length).toBeGreaterThan(0);
    expect(screen.getAllByText(hub.stateDone).length).toBeGreaterThan(0);
    expect(screen.queryByText('72/100')).toBeNull();
    expect(screen.queryByText('60%')).toBeNull();
  });

  it('shows recent drafts and a Home-matching advisor card', () => {
    renderDevHub();
    expect(screen.getByRole('heading', { name: hub.recentActivity })).toBeTruthy();
    expect(screen.getByText('Resume rewrite')).toBeTruthy();
    expect(screen.getByText('Cover letter draft')).toBeTruthy();
    expect(screen.getByText('Elevator pitch')).toBeTruthy();
    expect(screen.getByRole('heading', { name: home.dedicatedSupport })).toBeTruthy();
    expect(screen.getByText(DEV_ADVISOR.name)).toBeTruthy();
    expect(screen.getByText(home.nextCheckIn.replace('{when}', DEV_NEXT_CHECK_IN))).toBeTruthy();
    expect(screen.getByRole('link', { name: home.messageAdvisor.replace('{name}', DEV_ADVISOR.firstName) }))
      .toHaveAttribute('href', DEV_ADVISOR.messagingHref);
    expect(screen.getByRole('link', { name: home.bookCheckIn })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /^Dana$/ })).toBeNull();
  });
});
