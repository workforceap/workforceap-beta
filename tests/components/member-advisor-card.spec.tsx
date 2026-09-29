import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

import MemberAdvisorCard from '@/components/portal/kit/pages/member/MemberAdvisorCard';

describe('MemberAdvisorCard', () => {
  it('renders nothing without an active assignment', () => {
    expect(renderToStaticMarkup(<MemberAdvisorCard advisor={null} />)).toBe('');
  });

  it('names the advisor and links the member thread', () => {
    const html = renderToStaticMarkup(
      <MemberAdvisorCard advisor={{ name: 'Sample Advisor', firstName: 'Sample', messagingHref: '/dashboard/messages' }} />,
    );
    expect(html).toContain('Your career advisor');
    expect(html).toContain('Sample Advisor');
    expect(html).toContain('href="/dashboard/messages"');
    expect(html).toContain('Message Sample');
    // No invented presence signal.
    expect(html).not.toMatch(/active|online|ago/i);
  });
});
