import { useState } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import BulkEmailModal from '@/components/admin/BulkEmailModal';
import BulkUpdateModal from '@/components/admin/BulkUpdateModal';

// JSDOM lacks native dialog methods. Keep the actual Astryx dialog, events, and
// focus restoration; only emulate opening/closing. Browser tab containment is
// deliberately left to the browser acceptance check.
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

const memberIds = ['member-1', 'member-2'];
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const callbacks = { close: vi.fn(), sent: vi.fn(), updated: vi.fn() };
type Kind = 'email' | 'update';

function Harness({ kind }: { kind: Kind }) {
  const [open, setOpen] = useState(false);
  const onClose = () => { callbacks.close(); setOpen(false); };
  return <>
    <button onClick={() => setOpen(true)}>Open batch</button>
    {kind === 'email'
      ? <BulkEmailModal open={open} memberIds={memberIds} onClose={onClose} onSent={callbacks.sent} />
      : <BulkUpdateModal open={open} memberIds={memberIds} programs={[{ slug: 'fixture-program', title: 'Fixture program' }]} onClose={onClose} onUpdated={callbacks.updated} />}
  </>;
}

function openDialog(kind: Kind) {
  render(<Harness kind={kind} />);
  const trigger = screen.getByRole('button', { name: 'Open batch' });
  trigger.focus();
  fireEvent.click(trigger);
  return { trigger, dialog: screen.getByRole('dialog', { name: kind === 'email' ? 'Bulk Email' : 'Bulk Update' }) };
}

function fill(kind: Kind) {
  if (kind === 'email') {
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Hello {firstName}' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Your draft message.' } });
  } else {
    fireEvent.change(screen.getByLabelText('Member Status'), { target: { value: 'active' } });
    fireEvent.change(screen.getByLabelText('Counselor'), { target: { value: '__null' } });
  }
}

function fetchWithPost(post: (url: string, options: RequestInit) => Promise<Response>) {
  const fetch = vi.fn((url: string, options?: RequestInit) => options?.method === 'POST' ? post(url, options) : Promise.resolve(response({ counselors: [] })));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  fetchWithPost(vi.fn().mockResolvedValue(response({ error: 'Try later' }, 503)));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe.each<Kind>(['email', 'update'])('%s batch dialog', (kind) => {
  it('has a modal accessible name, resists backdrop dismissal, and restores the trigger on Escape', async () => {
    const { dialog, trigger } = openDialog(kind);
    expect(dialog.tagName).toBe('DIALOG');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByRole('heading', { level: 2 })).toHaveFocus();
    fireEvent.click(dialog);
    expect(callbacks.close).not.toHaveBeenCalled();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(callbacks.close).toHaveBeenCalledTimes(1);
    expect(dialog).not.toHaveAttribute('open');
    expect(trigger).toHaveFocus();
    await act(async () => {});
  });

  it('prevents double submit and all dismissal while pending, then keeps failed values visible', async () => {
    let resolve!: (value: Response) => void;
    const post = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
    fetchWithPost(post);
    const { dialog, trigger } = openDialog(kind);
    await act(async () => {});
    fill(kind);
    const form = dialog.querySelector('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(post).toHaveBeenCalledTimes(1);
    expect(form).toHaveAttribute('aria-busy', 'true');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    fireEvent.click(dialog);
    expect(callbacks.close).not.toHaveBeenCalled();

    await act(async () => resolve(response({ error: 'Save could not finish' }, 503)));
    expect(screen.getByRole('alert')).toHaveTextContent('Save could not finish');
    expect(kind === 'email' ? screen.getByLabelText('Subject') : screen.getByLabelText('Member Status')).toHaveValue(kind === 'email' ? 'Hello {firstName}' : 'active');
    expect(form).toHaveAttribute('aria-busy', 'false');
    expect(callbacks.sent).not.toHaveBeenCalled();
    expect(callbacks.updated).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(trigger).toHaveFocus();
  });

  it('validates before sending and preserves the existing success payload', async () => {
    const result = kind === 'email' ? { sent: 2, messagesCreated: 2, total: 2, errors: [] } : { updated: 2, total: 2, errors: [] };
    const post = vi.fn().mockResolvedValue(response(result));
    fetchWithPost(post);
    const { dialog, trigger } = openDialog(kind);
    await act(async () => {});
    fireEvent.submit(dialog.querySelector('form')!);
    expect(screen.getByRole('alert')).toHaveTextContent(kind === 'email' ? 'Subject is required' : 'Select at least one field');
    expect(post).not.toHaveBeenCalled();
    fill(kind);
    fireEvent.click(within(dialog).getByRole('button', { name: kind === 'email' ? 'Send' : 'Update' }));
    await waitFor(() => expect(callbacks.close).toHaveBeenCalledTimes(1));
    const options = post.mock.calls[0][1] as RequestInit;
    expect(options.credentials).toBe('include');
    expect(JSON.parse(options.body as string)).toEqual(kind === 'email'
      ? { memberIds, subject: 'Hello {firstName}', body: 'Your draft message.', sendAsEmail: true, createMessage: true }
      : { memberIds, memberStatus: 'active', counselorUserId: null });
    expect(kind === 'email' ? callbacks.sent : callbacks.updated).toHaveBeenCalledWith(result);
    expect(trigger).toHaveFocus();
  });
});

describe('reported partial delivery', () => {
  it.each([
    { sent: 2, messagesCreated: 1, total: 2, errors: ['Member two: message creation failed'] },
    { sent: 1, messagesCreated: 2, total: 2, errors: [] },
    { sent: 1, messagesCreated: 1, total: 1, errors: [] },
  ])('retains counts and draft without permitting a duplicate send: %j', async (result) => {
    const post = vi.fn().mockResolvedValue(response(result));
    fetchWithPost(post);
    const { dialog } = openDialog('email');
    fill('email');
    fireEvent.submit(dialog.querySelector('form')!);
    const region = await screen.findByRole('region', { name: 'Reported delivery results' });
    expect(region).toHaveTextContent(`Emails reported sent: ${result.sent} of ${result.total}`);
    expect(region).toHaveTextContent(`Portal messages reported created: ${result.messagesCreated} of ${result.total}`);
    if (result.errors.length) expect(region).toHaveTextContent(result.errors[0]);
    expect(screen.getByRole('alert')).toHaveTextContent('This batch cannot be resent here');
    expect(screen.getByLabelText('Message')).toHaveValue('Your draft message.');
    expect(within(dialog).getByRole('button', { name: 'Send' })).toBeDisabled();
    fireEvent.submit(dialog.querySelector('form')!);
    expect(post).toHaveBeenCalledTimes(1);
    expect(callbacks.sent).toHaveBeenCalledWith(result);
    expect(callbacks.close).not.toHaveBeenCalled();
  });

  it('does not require unselected channels to reach the member count', async () => {
    const post = vi.fn().mockResolvedValue(response({ sent: 2, messagesCreated: 0, total: 2, errors: [] }));
    fetchWithPost(post);
    const { dialog } = openDialog('email');
    fill('email');
    fireEvent.click(screen.getByLabelText('Post to member message threads'));
    fireEvent.submit(dialog.querySelector('form')!);
    await waitFor(() => expect(callbacks.close).toHaveBeenCalledTimes(1));
  });

  it('does not claim success or allow resend when a successful response has no result counts', async () => {
    const post = vi.fn().mockResolvedValue(response({}));
    fetchWithPost(post);
    const { dialog } = openDialog('email');
    fill('email');
    fireEvent.submit(dialog.querySelector('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('could not confirm the results');
    fireEvent.submit(dialog.querySelector('form')!);
    expect(post).toHaveBeenCalledTimes(1);
    expect(callbacks.sent).not.toHaveBeenCalled();
    expect(callbacks.close).not.toHaveBeenCalled();
  });

  it('prevents an uncertain network result from resending and requires a fresh explicit action', async () => {
    const post = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    fetchWithPost(post);
    const { dialog } = openDialog('email');
    fill('email');
    fireEvent.submit(dialog.querySelector('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('connection ended before results could be confirmed');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    fireEvent.submit(dialog.querySelector('form')!);
    expect(post).toHaveBeenCalledTimes(1);
    expect(callbacks.sent).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Close' }).at(-1)!);
    fireEvent.click(screen.getByRole('button', { name: 'Open batch' }));
    expect(screen.getByLabelText('Subject')).toHaveValue('');
    expect(screen.getByLabelText('Message')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('keeps a partial update visible with its selected fields', async () => {
    const result = { updated: 1, total: 2, errors: ['Member two changed during review'] };
    fetchWithPost(vi.fn().mockResolvedValue(response(result)));
    const { dialog } = openDialog('update');
    await act(async () => {});
    fill('update');
    fireEvent.submit(dialog.querySelector('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Updated 1 of 2. Member two changed during review');
    expect(screen.getByLabelText('Member Status')).toHaveValue('active');
    expect(callbacks.updated).toHaveBeenCalledWith(result);
    expect(callbacks.close).not.toHaveBeenCalled();
  });
});
