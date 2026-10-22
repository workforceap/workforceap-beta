import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ findUser: vi.fn(), getCourses: vi.fn(), getUser: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (href: string) => { throw new Error(`redirect:${href}`); } }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { user: { findUnique: mocks.findUser }, pathwayStepProgress: { findMany: async () => [] } } }));
vi.mock('@/lib/content/learningPathways', () => ({ getPathwayForProgram: () => null }));
vi.mock('@/lib/content/programs', () => ({ getProgramBySlug: (slug: string) => ({ slug, title: slug, courses: [] }) }));
vi.mock('@/lib/member/curriculumAssignment', () => ({ getProgramCoursesForCurriculumVersion: mocks.getCourses }));
vi.mock('@/lib/member/skillMissions', () => ({ loadSkillMissionSummary: async () => null }));
vi.mock('@/lib/coursera/memberSkillsetProgress', () => ({ loadMemberSkillsetProgress: async () => [] }));
vi.mock('@/components/portal/LearningHubEnrolledCourses', () => ({ default: () => null }));
vi.mock('@/components/portal/SkillMissionPanel', () => ({ default: () => null }));
vi.mock('@/components/portal/FindYourCareerSection', () => ({ default: () => null }));
vi.mock('@/components/portal/VoiceCoachLauncherCard', () => ({ default: () => null }));
vi.mock('@/components/portal/LearningHubDestinationCards', () => ({ default: () => null }));
import LearningPage from '@/app/(portal)/dashboard/learning/page';
import LearningHubEnrolledCourses from '@/components/portal/LearningHubEnrolledCourses';
import { MemberTrainingNav } from '@/components/portal/MemberCareerSteps';
import StudioRedirect from '@/app/(portal)/dashboard/ai-tools/resume-studio/page';
import ScoreRedirect from '@/app/(portal)/dashboard/ai-tools/resume-analysis/page';
import RewriteRedirect from '@/app/(portal)/dashboard/ai-tools/resume-rewriter/page';
import CoachRedirect from '@/app/(portal)/dashboard/ai-tools/resume-coach/page';

const primary = 'it-support-professional-certificate-ibm';
const secondary = 'data-analytics-professional-certificate-google';
function findProps(node: React.ReactNode, type: unknown): Record<string, unknown> | undefined {
  if (!React.isValidElement(node)) return undefined;
  const props = node.props as { children?: React.ReactNode };
  if (node.type === type) return props;
  for (const child of React.Children.toArray(props.children)) {
    const found = findProps(child, type); if (found) return found;
  }
}
beforeEach(() => {
  mocks.getUser.mockResolvedValue({ id: 'owned-member' });
  mocks.getCourses.mockReset().mockReturnValue([]);
  mocks.findUser.mockReset().mockResolvedValue({ enrolledProgram: primary, assessmentCompleted: true, courseraEnrollmentApproved: true, courseProgress: [], courseraCourseProgress: [], courseEnrollments: [
    { id: 'primary', programSlug: primary, isPrimary: true, curriculumVersion: 'primary-v1', enrolledAt: new Date('2026-01-01') },
    { id: 'secondary', programSlug: secondary, isPrimary: false, curriculumVersion: 'secondary-v2', enrolledAt: new Date('2026-02-01') },
  ] });
});

describe('member workspace route context', () => {
  it('passes the selected owned secondary enrollment and its pinned curriculum through the Learning Hub', async () => {
    const page = await LearningPage({ searchParams: Promise.resolve({ program: secondary }) });
    expect(mocks.findUser).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'owned-member' } }));
    expect(mocks.getCourses).toHaveBeenCalledWith(expect.objectContaining({ slug: secondary }), 'secondary-v2');
    expect(findProps(page, LearningHubEnrolledCourses)).toEqual(expect.objectContaining({ programSlug: secondary, assessmentCompleted: true, eligibilityApproved: true }));
    expect(findProps(page, MemberTrainingNav)).toEqual(expect.objectContaining({ current: 'learning', programSlug: secondary }));
  });
  it('never renders a program outside the member’s owned enrollments from a URL suggestion', async () => {
    const page = await LearningPage({ searchParams: Promise.resolve({ program: 'foreign-program' }) });
    expect(mocks.getCourses).toHaveBeenCalledWith(expect.objectContaining({ slug: primary }), 'primary-v1');
    expect(findProps(page, LearningHubEnrolledCourses)).toEqual(expect.objectContaining({ programSlug: primary }));
  });
  it.each([[ScoreRedirect, 'score'], [RewriteRedirect, 'rewrite'], [CoachRedirect, 'coach']] as const)('preserves legacy resume route context for %s', async (page, view) => {
    await expect(page({ searchParams: Promise.resolve({ regenerateFrom: 'saved-old', role: 'Support', tag: ['a', 'b'] }) })).rejects.toThrow(`redirect:/dashboard/resume?regenerateFrom=saved-old&role=Support&tag=a&tag=b&view=${view}`);
  });
  it('preserves the legacy Studio default and a selected coach view', async () => {
    await expect(StudioRedirect({})).rejects.toThrow('redirect:/dashboard/resume?view=score');
    await expect(StudioRedirect({ searchParams: Promise.resolve({ view: 'coach', source: 'history' }) })).rejects.toThrow('redirect:/dashboard/resume?view=coach&source=history');
  });
});
