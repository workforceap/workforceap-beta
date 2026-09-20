import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InvitePartnerUserButton, { inviteFailureText } from '@/components/admin/InvitePartnerUserButton';
import AdminCounselorsClient from '@/components/admin/AdminCounselorsClient';
import WalkInSessionClient from '@/components/portal/sessions/WalkInSessionClient';
import SubgroupForm from '@/components/admin/SubgroupForm';
import NewPartnerForm from '@/app/admin/partners/new/NewPartnerForm';
import OrgWideChangeNotice from '@/components/admin/OrgWideChangeNotice';
import { RequiredFieldsHint } from '@/components/portal/forms/RequiredFieldsHint';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/portal/PageHeader', () => ({ default: ({ title }: { title: string }) => <h1>{title}</h1> }));

const fetchMock = vi.fn<typeof fetch>();
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(jsonResponse({ counselors: [] }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Audit 2026-09-20 §5 — functional defects on admin/counselor click-through. */
describe('partner invite box says when the invite was not sent', () => {
  it('renders "Invite not sent: <reason>" as an alert on a 500 that carries no reason', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Internal server error' }, 500));
    const user = userEvent.setup();
    render(<InvitePartnerUserButton partnerId="p1" />);
    await user.type(screen.getByLabelText('Partner user email'), 'new@partner.org');
    await user.click(screen.getByRole('button', { name: 'Invite Partner User' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Invite not sent: internal server error');
    expect(screen.getByLabelText('Partner user email')).toHaveAttribute('aria-describedby', alert.id);
  });

  it('passes an API reason through verbatim when it already starts with the prefix', () => {
    expect(inviteFailureText('Invite not sent: the sign-in provider is unavailable right now.', 503))
      .toBe('Invite not sent: the sign-in provider is unavailable right now.');
    expect(inviteFailureText(null, 502)).toMatch(/^Invite not sent: the server hit an unexpected error/);
    expect(inviteFailureText(null, 400)).toMatch(/^Invite not sent: the request was rejected/);
    expect(inviteFailureText('User already belongs to another organization', 409))
      .toBe('Invite not sent: user already belongs to another organization');
  });
});

describe('counselor add form labels', () => {
  it('associates USER ID, TITLE and AFFILIATION with their controls', async () => {
    render(<AdminCounselorsClient partners={[{ id: 'pa', name: 'Partner A' }]} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByLabelText('User ID (UUID)')).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByLabelText('Title (optional)')).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByLabelText('Affiliation')).toBeInstanceOf(HTMLSelectElement);
  });
});

describe('disabled submits explain what is missing', () => {
  it('walk-in intake names the blocking fields and points the button at the hint', async () => {
    const user = userEvent.setup();
    render(<WalkInSessionClient counselorName="Dana" />);
    const button = screen.getByRole('button', { name: /Create account & start session/ });
    expect(button).toBeDisabled();
    const hint = screen.getByRole('status');
    expect(hint).toHaveTextContent('Before you can create the account: First name, Email.');
    expect(button).toHaveAttribute('aria-describedby', hint.id);

    await user.type(screen.getByLabelText(/First name/), 'Jordan');
    await user.type(screen.getByLabelText(/^Email/), 'jordan@');
    expect(screen.getByRole('status')).toHaveTextContent('Before you can create the account: A valid email.');

    await user.type(screen.getByLabelText(/^Email/), 'example.com');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('aria-describedby');
  });

  it('subgroup form lists the empty required fields inline on a blocked submit instead of a browser tooltip', () => {
    render(<SubgroupForm users={[{ id: 'u1', fullName: 'Lee', email: 'lee@example.org' }]} partners={[]} />);
    const form = document.querySelector('form') as HTMLFormElement;
    expect(form).toHaveAttribute('novalidate');
    fireEvent.submit(form);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Before you can save this subgroup: Name, Leader.');
    expect(screen.getByRole('button', { name: /^(Create|Update|Save)/ })).toHaveAttribute('aria-describedby', alert.id);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('RequiredFieldsHint renders nothing once every field is satisfied', () => {
    const { container, rerender } = render(<RequiredFieldsHint id="h" labels={['Email']} />);
    expect(container).toHaveTextContent('Still needed: Email.');
    rerender(<RequiredFieldsHint id="h" labels={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('partner slug pattern', () => {
  it('compiles under the v flag that Chromium 141 applies to pattern attributes', () => {
    render(<NewPartnerForm programs={[]} />);
    const pattern = screen.getByLabelText(/Slug/).getAttribute('pattern') ?? '';
    expect(pattern).toBe('[a-z0-9\\-]+');
    expect(() => new RegExp(`^(?:${pattern})$`, 'v')).not.toThrow();
    expect(new RegExp(`^(?:${pattern})$`, 'v').test('workforce-solutions-austin')).toBe(true);
    expect(new RegExp(`^(?:${pattern})$`, 'v').test('Bad Slug')).toBe(false);
  });
});

describe('org-wide change notice for non-super admins', () => {
  it('names the surface and the blast radius', () => {
    render(<OrgWideChangeNotice surface="feature-flags" />);
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent('Changes here affect the whole organization.');
    expect(note).toHaveTextContent('Feature flags apply to every member, counselor, employer and partner portal');
  });
});
