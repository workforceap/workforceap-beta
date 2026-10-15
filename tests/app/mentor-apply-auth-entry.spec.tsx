import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/components/LocalizedLink', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock('@/app/mentor/apply/MentorApplyForm', () => ({ default: () => <form aria-label="Mentor application" /> }));

import MentorApplyPage from '@/app/mentor/apply/page';
import { getUser } from '@/lib/auth/server';

beforeEach(() => vi.clearAllMocks());
describe('mentor application account entry', () => {
  it('offers sign-in and direct signup with the mentor destination before showing an anonymous form', async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    render(await MentorApplyPage());
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?redirectTo=%2Fmentor%2Fapply');
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/signup?redirectTo=%2Fmentor%2Fapply');
  });
  it('allows a signed-in prospective mentor to fill out the existing form', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'prospective-mentor' } as never);
    render(await MentorApplyPage());
    expect(screen.getByRole('form', { name: 'Mentor application' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  });
});
