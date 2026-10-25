import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// JSDOM lacks native <dialog> methods. Keep the actual Astryx dialog, its
// events and focus handling; only emulate opening/closing (same shim as
// admin-subgroup-members-table).
const dialogMethods = ['showModal', 'close'] as const;
const originalMethods = dialogMethods.map((name) => Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name));
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open'); } });
});
afterAll(() => {
  dialogMethods.forEach((name, index) => {
    const original = originalMethods[index];
    if (original) Object.defineProperty(HTMLDialogElement.prototype, name, original);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  });
});

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import AtRiskDetailModal from '@/components/portal/counselor/AtRiskDetailModal';

const member = {
  userId: 'member-1',
  alertId: 'alert-1',
  name: 'Jordan Rivera',
  email: 'jordan@example.com',
  phone: '555-0100',
  score: 72,
  riskLevel: 'HIGH' as const,
  status: 'open' as const,
  factors: [{ name: 'inactivity', weight: 40, description: 'No login in 14 days' }],
  enrolledProgram: 'it-support',
  enrolledAt: '2026-01-10T00:00:00.000Z',
  memberSince: '2025-12-01T00:00:00.000Z',
  profile: null,
  alertCreatedAt: '2026-09-01T00:00:00.000Z',
  alertUpdatedAt: '2026-09-01T00:00:00.000Z',
};

const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ events: [], notes: [] }) }));

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  // Astryx Button/Spinner read a reduced-motion media query; jsdom has no matchMedia.
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, media: '', onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AtRiskDetailModal on the kit dialog primitive', () => {
  it('is a native dialog labelled by the member heading, which takes focus on open', async () => {
    render(<AtRiskDetailModal member={member} onClose={vi.fn()} onStatusChange={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.tagName).toBe('DIALOG');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const heading = screen.getByRole('heading', { level: 2, name: 'Jordan Rivera' });
    expect(dialog).toHaveAttribute('aria-labelledby', heading.id);
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByText(/jordan@example.com/)).toBeInTheDocument();
    expect(screen.getByText('No login in 14 days')).toBeInTheDocument();
  });

  it('closes on Escape and on the Close button', () => {
    const onClose = vi.fn();
    render(<AtRiskDetailModal member={member} onClose={onClose} onStatusChange={vi.fn()} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('keeps the status actions and routes them through onStatusChange', () => {
    const onStatusChange = vi.fn(async () => {});
    render(<AtRiskDetailModal member={member} onClose={vi.fn()} onStatusChange={onStatusChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    expect(onStatusChange).toHaveBeenCalledWith('alert-1', 'acknowledged');
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Escalate' })).toBeInTheDocument();
  });

  it('hands focus back to the row that opened it when closed', async () => {
    function Harness() {
      const [open, setOpen] = useState<typeof member | null>(null);
      return (
        <>
          <button type="button" onClick={() => setOpen(member)}>Open Jordan Rivera</button>
          <AtRiskDetailModal member={open} onClose={() => setOpen(null)} onStatusChange={vi.fn()} />
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open Jordan Rivera' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('open');
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Jordan Rivera' })).toHaveFocus());

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    // Stays mounted with isOpen=false so the primitive can restore focus.
    expect(dialog).not.toHaveAttribute('open');
    expect(document.activeElement).toBe(trigger);
  });

  it('renders nothing until it has ever been given a member', () => {
    render(<AtRiskDetailModal member={null} onClose={vi.fn()} onStatusChange={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('AtRiskDetailModal activity and notes loading', () => {
  const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
  const route = (handlers: { timeline: () => unknown; notes: () => unknown }) => {
    fetchMock.mockImplementation((async (url: string) => {
      const result = String(url).includes('activity-timeline') ? handlers.timeline() : handlers.notes();
      if (result instanceof Error) throw result;
      return result;
    }) as never);
  };

  it('says nothing is recorded only after a successful, empty answer', async () => {
    route({ timeline: () => json({ events: [] }), notes: () => json([]) });
    render(<AtRiskDetailModal member={member} onClose={vi.fn()} onStatusChange={vi.fn()} />);
    expect(await screen.findByText('No recent activity recorded.')).toBeInTheDocument();
    expect(await screen.findByText('No notes yet.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows an honest error with a retry when both requests fail, never the empty copy', async () => {
    route({ timeline: () => json({ error: 'boom' }, 500), notes: () => new TypeError('Failed to fetch') });
    render(<AtRiskDetailModal member={member} onClose={vi.fn()} onStatusChange={vi.fn()} />);
    const timelineAlert = await screen.findByTestId('at-risk-timeline-error');
    const notesAlert = await screen.findByTestId('at-risk-notes-error');
    expect(timelineAlert).toHaveAttribute('role', 'alert');
    expect(timelineAlert).toHaveTextContent('Couldn’t load recent activity.');
    expect(timelineAlert).toHaveTextContent('temporarily unavailable');
    expect(notesAlert).toHaveTextContent('Couldn’t load notes.');
    expect(notesAlert).toHaveTextContent('could not reach WorkforceAP');
    expect(screen.queryByText('No recent activity recorded.')).toBeNull();
    expect(screen.queryByText('No notes yet.')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(2);
  });

  it('retries only the failed section and swaps the error for the loaded rows', async () => {
    let notesCalls = 0;
    route({
      timeline: () => json({ events: [{ id: 'e1', eventName: 'lesson_completed', sourcePage: '/learn', metadata: null, createdAt: '2026-10-01T15:00:00.000Z' }] }),
      notes: () => (++notesCalls === 1
        ? json({ error: 'nope' }, 500)
        : json([{ id: 'n1', content: 'Left a voicemail', createdAt: '2026-10-02T15:00:00.000Z', author: { fullName: 'Casey Counselor', email: 'casey@example.com' } }])),
    });
    render(<AtRiskDetailModal member={member} onClose={vi.fn()} onStatusChange={vi.fn()} />);
    expect(await screen.findByText('lesson_completed')).toBeInTheDocument();
    expect(screen.queryByTestId('at-risk-timeline-error')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    // The real route returns a bare array of rows with an author object.
    expect(await screen.findByText('Left a voicemail')).toBeInTheDocument();
    expect(screen.getByText(/Casey Counselor · Oct 2, 2026/)).toBeInTheDocument();
    expect(screen.queryByTestId('at-risk-notes-error')).toBeNull();
    expect(notesCalls).toBe(2);
  });

  it('adds a saved note from the created-row response', async () => {
    route({ timeline: () => json({ events: [] }), notes: () => json([]) });
    render(<AtRiskDetailModal member={member} onClose={vi.fn()} onStatusChange={vi.fn()} />);
    await screen.findByText('No notes yet.');
    fetchMock.mockImplementationOnce((async () => json({ id: 'n2', content: 'Called back', createdAt: '2026-10-03T15:00:00.000Z', author: { fullName: null, email: 'casey@example.com' }, canDelete: true }, 201)) as never);
    fireEvent.change(screen.getByPlaceholderText('Add a note…'), { target: { value: 'Called back' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Called back')).toBeInTheDocument();
    expect(screen.getByText(/casey@example.com · Oct 3, 2026/)).toBeInTheDocument();
  });
});
