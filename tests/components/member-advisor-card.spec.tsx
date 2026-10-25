import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import es from '@/messages/es.json';

vi.mock('next/link', () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

import MemberAdvisorCard from '@/components/portal/kit/pages/member/MemberAdvisorCard';

const render = (ui: React.ReactElement, locale: 'en' | 'es' = 'en') =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={(locale === 'es' ? es : en) as typeof en}>{ui}</NextIntlClientProvider>,
  );

describe('MemberAdvisorCard', () => {
  it('renders nothing without an active assignment', () => {
    expect(render(<MemberAdvisorCard advisor={null} />)).toBe('');
  });

  it('names the advisor and links the member thread', () => {
    const html = render(
      <MemberAdvisorCard advisor={{ name: 'Sample Advisor', firstName: 'Sample', messagingHref: '/dashboard/messages' }} />,
    );
    expect(html).toContain('Your career advisor');
    expect(html).toContain('Sample Advisor');
    expect(html).toContain('href="/dashboard/messages"');
    expect(html).toContain('Message Sample');
    // No invented presence signal.
    expect(html).not.toMatch(/active|online|ago/i);
  });

  it('reads in the member locale', () => {
    const html = render(
      <MemberAdvisorCard advisor={{ name: 'Sample Advisor', firstName: 'Sample', messagingHref: '/dashboard/messages' }} />,
      'es',
    );
    expect(html).toContain('Tu asesor de carrera');
    expect(html).toContain('Escribir a Sample');
    expect(html).not.toContain('Your career advisor');
  });
});
