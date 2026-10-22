import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import { pickPortalClientMessages } from '@/lib/i18n/pickRootClientMessages';
import { MemberHomeKit } from '@/components/portal/kit/pages/member/MemberHomeKit';
import { VoiceStudioKit } from '@/components/portal/kit/pages/VoiceStudioKit';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/dashboard/ai-tools',
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

describe('member AI Career Tools discovery', () => {
  it('keeps an actionable introduction on Home even without a recommended tool', () => {
    render(
      <NextIntlClientProvider locale="en" messages={pickPortalClientMessages(en)}>
        <MemberHomeKit recommendedTool={null} />
      </NextIntlClientProvider>,
    );
    const tools = screen.getByRole('region', { name: 'AI Career Tools' });
    expect(within(tools).getByRole('link', { name: 'Explore AI Career Tools' }))
      .toHaveAttribute('href', '/dashboard/ai-tools');
    expect(tools.compareDocumentPosition(screen.getByText('Certification path')) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
  });

  it('retains the stage-specific action alongside the full tools destination', () => {
    render(
      <NextIntlClientProvider locale="en" messages={pickPortalClientMessages(en)}>
        <MemberHomeKit
          toolkitHref="/dev/member/toolkit"
          recommendedTool={{
            slug: 'interview-prep',
            title: 'Get ready for your interview',
            body: 'Review your practice answers before your interview.',
            href: '/dashboard/ai-tools/interview-prep',
            cta: 'Open interview prep',
          }}
        />
      </NextIntlClientProvider>,
    );
    const tools = within(screen.getByRole('region', { name: 'AI Career Tools' }));
    expect(tools.getByRole('link', { name: 'Open interview prep' }))
      .toHaveAttribute('href', '/dashboard/ai-tools/interview-prep');
    expect(tools.getByRole('link', { name: 'Explore all AI Career Tools' }))
      .toHaveAttribute('href', '/dev/member/toolkit');
  });

  it('preserves every tool family through the consolidated directory', () => {
    render(<NextIntlClientProvider locale="en" messages={pickPortalClientMessages(en)}><VoiceStudioKit initialTab="toolkit" /></NextIntlClientProvider>);
    const tools = within(screen.getByRole('region', { name: 'All career tools' }));
    const paths = ['/dashboard/resume', '/dashboard/ai-tools/cover-letter', '/dashboard/ai-tools/skill-checkpoints', '/dashboard/ai-tools/interviews', '/dashboard/ai-tools/job-match-scorer', '/dashboard/ai-tools/skill-mapper', '/dashboard/ai-tools/training-bridge', '/dashboard/ai-tools/linkedin-headline', '/dashboard/ai-tools/linkedin-about', '/dashboard/ai-tools/gap-analyzer', '/dashboard/ai-tools/salary-negotiation', '/dashboard/ai-tools/benefits-cliff'];
    const hrefs = tools.getAllByRole('link').map(link => link.getAttribute('href'));
    for (const path of paths) expect(hrefs).toContain(path);
    expect(tools.getByRole('link', { name: /Interviews\s*Prepare answers, practice with AI/ })).toHaveAttribute('href', '/dashboard/ai-tools/interviews');
  });

  it('offers direct task starting points on the default hub without starting a voice session', () => {
    render(<NextIntlClientProvider locale="en" messages={pickPortalClientMessages(en)}><VoiceStudioKit /></NextIntlClientProvider>);
    const start = within(screen.getByRole('region', { name: 'Start with one task' }));
    expect(start.getByRole('link', { name: 'Improve my resume' }))
      .toHaveAttribute('href', '/dashboard/resume');
    expect(start.getByRole('link', { name: 'Interviews' }))
      .toHaveAttribute('href', '/dashboard/ai-tools/interviews');
    expect(start.getByRole('link', { name: 'Write a cover letter' }))
      .toHaveAttribute('href', '/dashboard/ai-tools/cover-letter');
    expect(screen.getByRole('region', { name: 'Coaches' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Practice' })).not.toBeInTheDocument();
  });
});
