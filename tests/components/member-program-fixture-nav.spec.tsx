import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';
import { MemberTrainingNav } from '@/components/portal/MemberCareerSteps';
import { MemberProgramKit } from '@/components/portal/kit/pages/member/MemberProgramKit';
import type { TrainingWorkspace } from '@/lib/member/trainingWorkspace';

vi.mock('@/app/(portal)/dashboard/_actions/analyticsActions', () => ({
  logCourseraLaunchFromPortal: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));

const fixtureHrefs = {
  program: '/dev/member/program',
  learning: '/dev/member/program?state=workspace',
  readiness: '/dev/member/progress',
} as const;

const withIntl = (ui: React.ReactElement) => render(
  <NextIntlClientProvider locale="en" messages={en}>{ui}</NextIntlClientProvider>,
);

const expectFixtureTrainingLinks = () => {
  const navigation = within(screen.getByRole('navigation', { name: 'Training and progress' }));
  expect(navigation.getByRole('link', { name: 'My program' })).toHaveAttribute('href', fixtureHrefs.program);
  expect(navigation.getByRole('link', { name: /learning hub/i })).toHaveAttribute('href', fixtureHrefs.learning);
  expect(navigation.getByRole('link', { name: 'Career readiness' })).toHaveAttribute('href', fixtureHrefs.readiness);
};

afterEach(cleanup);

describe('member program training navigation destinations', () => {
  it('renders fixture-owned routes from the program overview', () => {
    withIntl(
      <MemberProgramKit
        programTitle="AWS Cloud Practitioner Essentials"
        trainingNavHrefs={fixtureHrefs}
      />,
    );

    expectFixtureTrainingLinks();
  });

  it('keeps the owner fixture routes when a workspace supplies its own defaults', () => {
    const workspace = {
      programSlug: 'aws-cloud-practitioner',
      programTitle: 'AWS Certified Cloud Practitioner Certificate',
      curriculumVersion: 'preview-v1',
      weeklyHours: 10,
      planStartDate: '2026-09-01',
      planUpdatedAt: '2026-09-01T12:00:00.000Z',
      totalEstimatedHours: 0,
      publishedSyllabusHours: 0,
      courses: [],
    } as TrainingWorkspace;

    withIntl(
      <MemberProgramKit
        trainingNavHrefs={fixtureHrefs}
        trainingWorkspace={{
          workspace,
          programTitle: workspace.programTitle,
          completedSlugs: [],
          destinations: [],
          trainingNavHrefs: {
            program: '/dashboard/program',
            learning: '/dashboard/learning',
            readiness: '/dashboard/readiness',
          },
        }}
      />,
    );

    expectFixtureTrainingLinks();
  });

  it('keeps production defaults and URL-encodes the selected program slug', () => {
    withIntl(<MemberTrainingNav current="program" programSlug="program & pathway" />);

    expect(screen.getByRole('link', { name: /program/i })).toHaveAttribute('href', '/dashboard/program?program=program%20%26%20pathway');
    expect(screen.getByRole('link', { name: /learning/i })).toHaveAttribute('href', '/dashboard/learning?program=program%20%26%20pathway');
    expect(screen.getByRole('link', { name: /readiness/i })).toHaveAttribute('href', '/dashboard/readiness');
  });
});
