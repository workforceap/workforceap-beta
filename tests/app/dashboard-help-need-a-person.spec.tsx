import type { AnchorHTMLAttributes } from 'react';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

/**
 * WAP-188 Phase A: Request help (POST /api/member/request-help) and Share
 * feedback (POST /api/member/feedback) rendered only on the legacy home. They
 * now live in a "Need a person?" card on the default /dashboard/help, which
 * says who is emailed — the assigned counselor by saved name, or the team
 * inbox when there is none — what the email carries, and what feedback is
 * (saved, read by WorkforceAP staff, not a message). No reply time is
 * promised. Confirmations go through the kit announcer, not a live region that
 * mounts already filled.
 */

const { announceMock } = vi.hoisted(() => ({ announceMock: vi.fn() }));
vi.mock('@/components/portal/kit/hooks/useAnnounce', () => ({
  useAnnounce: () => announceMock,
  announce: announceMock,
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a>,
}));
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn(async (input: unknown) => input) }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/member/helpRequestRecipient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/member/helpRequestRecipient')>()),
  resolveHelpRequestRecipient: vi.fn(),
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/components/portal/PageHeader', () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

import DashboardHelpPage from '@/app/(portal)/dashboard/help/page';
import NeedAPersonCard from '@/app/(portal)/dashboard/help/NeedAPersonCard';
import { getUser } from '@/lib/auth/server';
import { resolveHelpRequestRecipient } from '@/lib/member/helpRequestRecipient';

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const TIME_PROMISE = /\b(within|hours?|business days?|minutes?|asap|right away)\b/i;
const card = () => screen.getByRole('region', { name: 'Need a person?' });

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(getUser).mockResolvedValue({ id: 'member-1' } as never);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('/dashboard/help (default view)', () => {
  it('leads with "Need a person?" naming the assigned counselor, then benefits and quick links', async () => {
    vi.mocked(resolveHelpRequestRecipient).mockResolvedValue({ kind: 'counselor', email: 'dana@workforceap.org', name: 'Dana Reyes' });

    const { container } = render(await DashboardHelpPage());

    expect(resolveHelpRequestRecipient).toHaveBeenCalledWith('member-1');
    const region = card();
    expect(region).toHaveTextContent(
      'Ask your counselor, Dana Reyes, to get in touch with you. We email them your name, email address and program.',
    );
    // The counselor's address is server-side only.
    expect(container).not.toHaveTextContent('dana@workforceap.org');
    expect(within(region).getByRole('button', { name: 'Request help' })).toBeInTheDocument();
    expect(within(region).getByRole('link', { name: 'Send a message' })).toHaveAttribute('href', '/dashboard/messages');
    expect(within(region).getByRole('button', { name: 'Share feedback' })).toBeInTheDocument();
    // Only the admin-only /admin/feedback page reads feedback: the counselor is not named as a reader.
    expect(region).toHaveTextContent('WorkforceAP staff can read what you send.');
    expect(region).not.toHaveTextContent(/counselor can read/i);
    expect(region).not.toHaveTextContent(TIME_PROMISE);
    // With a counselor, the quick link and benefit copy still point at them.
    expect(container).toHaveTextContent('Talk to your counselor');
    expect(container).toHaveTextContent('contact your WorkforceAP counselor or email info@workforceap.org');

    // First section after the header; the old "Still need help?" footer is folded in.
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings[0]).toBe('Need a person?');
    expect(container).not.toHaveTextContent('Still need help?');
    expect(container).not.toHaveTextContent(/fastest path/i);
    expect(container.querySelector('.material-symbols-outlined')).toBeNull();
  });

  it('with no counselor, the card, the quick link and the benefit copy all point at the team', async () => {
    vi.mocked(resolveHelpRequestRecipient).mockResolvedValue({ kind: 'team', email: 'info@workforceap.org', name: null });

    const { container } = render(await DashboardHelpPage());

    expect(card()).toHaveTextContent(
      'You do not have a counselor yet, so the request goes to the WorkforceAP team at info@workforceap.org.',
    );
    expect(card()).toHaveTextContent('WorkforceAP staff can read what you send.');
    // Nothing below the card tells the member to contact a counselor they do not have.
    expect(screen.getByRole('heading', { level: 3, name: 'Message the WorkforceAP team' })).toBeInTheDocument();
    expect(container).toHaveTextContent('Message the WorkforceAP support team from the Messages page for any support.');
    expect(container).toHaveTextContent('message the WorkforceAP team from the Messages page or email info@workforceap.org');
    expect(container).not.toHaveTextContent('Talk to your counselor');
    expect(container).not.toHaveTextContent(/your counselor is your main point of contact/i);
    expect(container).not.toHaveTextContent(/contact your WorkforceAP counselor/i);
  });

  it('a failed recipient lookup still renders the page and names both possibilities', async () => {
    vi.mocked(resolveHelpRequestRecipient).mockRejectedValue(new Error('db down'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(await DashboardHelpPage());

    expect(card()).toHaveTextContent('If you do not have a counselor yet, the request goes to the WorkforceAP team instead.');
    expect(within(card()).getByRole('button', { name: 'Request help' })).toBeInTheDocument();
    expect(screen.getByText('Talk to your counselor')).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('signed out: redirects to login before any lookup', async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    await expect(DashboardHelpPage()).rejects.toThrow('REDIRECT:/login?redirectTo=/dashboard/help');
    expect(resolveHelpRequestRecipient).not.toHaveBeenCalled();
  });
});

describe('Need a person? actions', () => {
  it('Request help posts once, confirms who the route emailed and stays sent', async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true, sentTo: 'counselor', sentToName: 'Dana Reyes' }));
    render(<NeedAPersonCard audience={{ kind: 'counselor', name: 'Dana Reyes' }} />);

    const button = screen.getByRole('button', { name: 'Request help' });
    expect(button.className).toContain('wa-kit-cta');
    expect(button.className).not.toContain('wa-kit-cta--ghost');
    fireEvent.click(button);

    expect(await screen.findByText('Request sent. We emailed Dana Reyes.')).toBeInTheDocument();
    // Spoken through the kit announcer; the visible line is not its own live region.
    expect(announceMock).toHaveBeenCalledWith('Request sent. We emailed Dana Reyes.');
    expect(screen.queryByRole('status')).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/member/request-help', expect.objectContaining({ method: 'POST' }));
    const sent = screen.getByRole('button', { name: 'Request sent' });
    expect(sent).toBeDisabled();
    fireEvent.click(sent);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("the route's sentTo wins when the assignment changed after the page rendered", async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true, sentTo: 'team', sentToName: null }));
    render(<NeedAPersonCard audience={{ kind: 'counselor', name: 'Dana Reyes' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Request help' }));
    expect(await screen.findByText('Request sent. We emailed the WorkforceAP team.')).toBeInTheDocument();
  });

  it('reassigned to another counselor after the page rendered: does not name the old one', async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true, sentTo: 'counselor', sentToName: 'Sam Ortiz' }));
    render(<NeedAPersonCard audience={{ kind: 'counselor', name: 'Dana Reyes' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Request help' }));
    expect(await screen.findByText('Request sent. We emailed your counselor.')).toBeInTheDocument();
    expect(screen.queryByText(/We emailed Dana Reyes/)).toBeNull();
    expect(announceMock).toHaveBeenCalledWith('Request sent. We emailed your counselor.');
  });

  it('a 429 says why and offers Messages, without claiming a minute is enough', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'Too many requests. Please try again later.' }, 429));
    render(<NeedAPersonCard audience={{ kind: 'team' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Request help' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('We could not send another request right now. Try again later, or send a message instead.');
    expect(alert).not.toHaveTextContent(/minute/i);
    expect(within(alert).getByRole('link', { name: 'Send a message' })).toHaveAttribute('href', '/dashboard/messages');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('a failed send (email not configured) stays on screen with the Messages fallback', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'Email not configured' }, 500));
    render(<NeedAPersonCard audience={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Request help' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not send your request. Try again later, or send a message instead.');
  });

  it('a dropped connection is described as one', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<NeedAPersonCard audience={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Request help' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not reach WorkforceAP. Check your connection and try again.');
  });

  it('Share feedback opens the kit dialog that says feedback is not a message', () => {
    const { container } = render(<NeedAPersonCard audience={{ kind: 'team' }} />);
    const trigger = screen.getByRole('button', { name: 'Share feedback' });
    expect(trigger.className).toContain('wa-kit-cta--ghost');
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Share feedback' });
    expect(dialog).toHaveTextContent('It is not a message, so it does not ask anyone to contact you.');
    expect(dialog).toHaveTextContent('WorkforceAP staff can read it.');
    expect(dialog).not.toHaveTextContent(/counselor .*can read/i);
    expect(within(dialog).getByRole('radiogroup', { name: 'Rating' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Send feedback' }).className).toContain('wa-kit-cta');
    expect(container.ownerDocument.querySelector('.material-symbols-outlined')).toBeNull();
  });

  it('feedback submits to the existing route, confirms it was saved and keeps focus in the dialog', async () => {
    fetchMock.mockResolvedValueOnce(json({ feedback: { id: 'fb-1' } }));
    const previousPath = window.location.pathname;
    window.history.pushState({}, '', '/dashboard/help');
    onTestFinished(() => window.history.replaceState({}, '', previousPath));
    render(<NeedAPersonCard audience={{ kind: 'team' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Share feedback' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Rate 4 out of 5' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));

    expect(await screen.findByText('We saved your feedback.')).toBeInTheDocument();
    expect(announceMock).toHaveBeenCalledWith('We saved your feedback.');
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/member/feedback');
    // WAP-197: the event records the page the feedback came from.
    expect(JSON.parse(String(init?.body))).toEqual({ type: 'general', rating: 4, sourcePage: '/dashboard/help' });
  });
});
