import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// JSDOM lacks native <dialog> methods. Keep the actual Astryx dialog, events and
// focus restoration; only emulate opening/closing (same shim as bulk-action-dialogs).
const dialogMethods = ['showModal', 'close'] as const;
const originalMethods = dialogMethods.map((name) => Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name));
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
    this.querySelector<HTMLElement>('h2')?.focus();
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

const router = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

import SubgroupMembersTable from '@/components/admin/SubgroupMembersTable';

const member = {
  id: 'm1',
  fullName: 'Alice Example',
  email: 'alice@example.com',
  enrolledProgram: 'IT Support',
  enrolledAt: new Date('2026-09-01T12:00:00.000Z'),
  progressPct: 42,
  stage: 'active',
  assignedAt: new Date('2026-09-02T12:00:00.000Z'),
  assignmentType: 'manual',
  assignedBy: 'admin',
};

/** The trap moves initial focus in a setTimeout(0); let it land. */
async function settleFocus() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function renderTable() {
  return render(<SubgroupMembersTable subgroupId="sg1" members={[member]} />);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SubgroupMembersTable dialog focus management', () => {
  it('returns focus to the Remove trigger after the confirm dialog closes', async () => {
    renderTable();

    // Desktop table trigger (the mobile card renders a second one).
    const trigger = screen.getAllByRole('button', { name: 'Remove' })[0];
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    await settleFocus();

    const dialog = screen.getByRole('dialog', { name: 'Remove from subgroup?' });
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    // Focus must move into the dialog — the accessibility goal of the change.
    // The shared Astryx ConfirmDialog lands it on the dialog title.
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Remove from subgroup?' }));

    fireEvent.click(cancel);
    await settleFocus();

    expect(screen.queryByRole('dialog', { name: 'Remove from subgroup?' })).toBeNull();
    // Regression guard: an in-dialog autoFocus made the trap capture the
    // Cancel button as `previouslyFocused`, so restore hit a detached node
    // and focus fell to <body> instead of coming back here.
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(trigger);
  });

  it('returns focus to the Add member trigger after the add dialog closes', async () => {
    renderTable();

    const trigger = screen.getByRole('button', { name: 'Add member' });
    trigger.focus();
    fireEvent.click(trigger);
    await settleFocus();

    const dialog = screen.getByRole('dialog', { name: 'Add member to subgroup' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    // Astryx Dialog moves initial focus to the title, not the first field.
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Add member to subgroup' }));
    expect(screen.getByPlaceholderText('Search by name or email'));

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await settleFocus();

    expect(screen.queryByRole('dialog', { name: 'Add member to subgroup' })).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(trigger);
  });
});
