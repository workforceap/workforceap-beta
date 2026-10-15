import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/en.json';

vi.mock('next/image', () => ({ default: () => null }));
vi.mock('@/components/LocalizedLink', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
import LoginForm from '@/app/(auth)/login/LoginForm';

describe('mentor login account creation destination', () => {
  it.each(['/mentor/apply', '/es/mentor/apply'])('keeps %s when a new mentor chooses signup from login', (destination) => {
    render(<NextIntlClientProvider locale="en" messages={messages} timeZone="UTC"><LoginForm initialRedirectTo={destination} /></NextIntlClientProvider>);
    const signup = screen.getAllByRole('link').find((link) => link.getAttribute('href')?.startsWith('/signup?'));
    expect(signup).toHaveAttribute('href', `/signup?redirectTo=${encodeURIComponent(destination)}`);
  });
});
