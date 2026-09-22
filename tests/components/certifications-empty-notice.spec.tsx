import type { AnchorHTMLAttributes } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a>,
}));

import en from '@/messages/en.json';
import CertificationsEmptyNotice, { CERTIFICATES_ADD_FORM_ID } from '@/components/portal/CertificationsEmptyNotice';
import { MemberCertificatesKit } from '@/components/portal/kit/pages/member/MemberCertificatesKit';
import { MEMBER_PROGRAM_HREF } from '@/lib/member/memberProgramHref';

afterEach(cleanup);

const intl = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="en" messages={en}>{ui}</NextIntlClientProvider>);

/**
 * Review 2026-09-22: My Certificates first said Coursera certificates "sync
 * automatically" when nothing did (#2471 made the copy truthful), and since
 * item 4 a Coursera-reported completion does create a pending certificate
 * (lib/certifications/pendingFromCompletion.ts). Every empty state (legacy
 * mobile row and desktop records panel through CertificationsEmptyNotice, the
 * default kit view) is now one KitEmptyState `first` fed by
 * `empty.certificates` and must describe that behaviour exactly: pending on
 * report, verified by the team before it counts, self-add still available
 * where a form exists, and no claim that a certificate is earned or synced on
 * its own.
 */
describe('My Certificates empty state', () => {
  it('legacy notice is a first-kind KitEmptyState with the truthful sentence, an add anchor and the My program link', () => {
    intl(<CertificationsEmptyNotice />);
    const empty = document.querySelector<HTMLElement>('.wa-kit-empty')!;
    expect(empty.dataset.kind).toBe('first');
    expect(empty.dataset.tone).toBe('muted');
    expect(within(empty).getByRole('heading', { level: 3 })).toHaveTextContent('No certificates yet');
    const notice = screen.getByText(/No certificates are recorded yet/);
    expect(notice.className).toContain('wa-kit-lede');
    expect(notice).toHaveTextContent(/When Coursera reports a completed course we add it here as a pending certificate/);
    expect(notice).toHaveTextContent(/our team verifies it before it counts as earned/);
    expect(notice).toHaveTextContent(/you can also add a certificate you earned elsewhere/);
    expect(notice).not.toHaveTextContent(/automatically/i);
    expect(notice).not.toHaveTextContent(/sync/i);
    const add = screen.getByRole('link', { name: 'Add a certificate' });
    expect(add).toHaveAttribute('href', `#${CERTIFICATES_ADD_FORM_ID}`);
    expect(add.className).toContain('wa-kit-cta');
    expect(add.className).not.toContain('wa-kit-cta--ghost');
    const program = screen.getByRole('link', { name: 'My program' });
    expect(program).toHaveAttribute('href', MEMBER_PROGRAM_HREF);
    expect(program.className).toContain('wa-kit-cta--ghost');
  });

  it('desktop layout can title itself deeper and anchor to its own add form', () => {
    intl(<CertificationsEmptyNotice headingAs="h4" addFormId="add-certificate-desktop" />);
    expect(screen.getByRole('heading', { level: 4, name: 'No certificates yet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add a certificate' })).toHaveAttribute('href', '#add-certificate-desktop');
  });

  it('kit view uses the same pending-then-verified sentence without promising a self-add form it does not have', () => {
    intl(<MemberCertificatesKit earned={[]} inProgress={[]} />);
    const empty = document.querySelector<HTMLElement>('.wa-kit-empty')!;
    expect(empty.dataset.kind).toBe('first');
    const description = within(empty).getByText(/appears here as a pending certificate/);
    expect(description).toHaveTextContent(/our team verifies it before it counts as earned/);
    expect(description).toHaveTextContent(/Completed Coursera courses show in My program/);
    expect(description).not.toHaveTextContent(/add a certificate/i);
    expect(description).not.toHaveTextContent(/automatically|sync/i);
    expect(within(empty).getByRole('link', { name: 'Message counselor' })).toHaveAttribute('href', '/dashboard/messages');
    expect(within(empty).getByRole('link', { name: 'My program' })).toHaveAttribute('href', MEMBER_PROGRAM_HREF);
    expect(within(empty).queryByRole('link', { name: 'Add a certificate' })).toBeNull();
  });
});
