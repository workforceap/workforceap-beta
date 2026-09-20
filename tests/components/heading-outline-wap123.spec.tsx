import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SkillMissionEmpty } from '@/components/portal/SkillMissionEmpty';
import InterviewPrepBundle from '@/components/portal/InterviewPrepBundle';
import VoiceAgentSurface from '@/components/portal/VoiceAgentSurface';
import { MemberProfilePhotoEditor } from '@/components/portal/kit/MemberProfilePhotoEditor';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => cleanup());

// WAP-123 item 4: the first heading under a page h1 must be an h2, never an h3.
describe('member routes do not skip from h1 to h3', () => {
  it('missions empty state titles itself at h2 directly under the page opener', () => {
    render(<SkillMissionEmpty programSlug="fixture-program" programTitle="Fixture program" />);
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.textContent?.trim().length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  });

  it('interview-prep empty state titles itself at h2 before the tools section', () => {
    render(<InterviewPrepBundle preview items={[]} />);
    const levels = screen.getAllByRole('heading').map((h) => Number(h.tagName.slice(1)));
    expect(levels[0]).toBe(2);
    expect(screen.getByRole('heading', { level: 2, name: 'No prep materials yet' })).toBeInTheDocument();
  });

  it('voice surfaces keep h3 by default and accept h2 when they follow the h1', () => {
    const view = render(<VoiceAgentSurface badge="Coach" headline="Talk it through" icon={<span />} glowColor="#000" gradient="none">{null}</VoiceAgentSurface>);
    expect(screen.getByRole('heading', { level: 3, name: 'Talk it through' })).toBeInTheDocument();
    view.rerender(<VoiceAgentSurface badge="Coach" headline="Talk it through" headlineAs="h2" icon={<span />} glowColor="#000" gradient="none">{null}</VoiceAgentSurface>);
    expect(screen.getByRole('heading', { level: 2, name: 'Talk it through' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  });

  it('profile photo dialog uses an h2 title so no h3 precedes the profile name h2', () => {
    render(<MemberProfilePhotoEditor initials="MB" photoUrl={null} live />);
    const title = screen.getByRole('heading', { level: 2, name: 'Profile photo', hidden: true });
    expect(title.closest('dialog')).not.toBeNull();
    expect(title.closest('dialog')).toHaveAttribute('aria-labelledby', title.id);
    expect(screen.queryByRole('heading', { level: 3, hidden: true })).not.toBeInTheDocument();
  });
});
