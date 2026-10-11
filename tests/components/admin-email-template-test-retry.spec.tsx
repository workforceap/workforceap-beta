import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EmailTemplatesClient from '@/components/admin/EmailTemplatesClient';

const originalTime = Date.parse('2026-10-11T08:00:00Z');
const template = {
  id: 'template-a', key: 'application-confirmation', name: 'Synthetic confirmation',
  subject: 'Hello {firstName}', body: '<p>Hi {firstName}</p>', variables: ['firstName'],
  active: true, createdAt: '2026-10-10T00:00:00.000Z', updatedAt: '2026-10-10T00:00:00.000Z',
};
const otherTemplate = { ...template, id: 'template-b', name: 'Synthetic invitation', key: 'invitation' };
const props = { templates: [template, otherTemplate], adminUserId: 'actor-a', adminEmail: 'synthetic-admin@workforceap.org' };
const storageKey = 'wap:admin-email-template-tests:actor-a';
const fetchMock = vi.fn();
let requests: string[];
let respond: (body: string) => Promise<Response>;

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  vi.spyOn(Date, 'now').mockReturnValue(originalTime);
  let serial = 0;
  vi.stubGlobal('crypto', { randomUUID: () => `00000000-0000-4000-8000-${String(++serial).padStart(12, '0')}` });
  requests = [];
  respond = async () => Response.json({ ok: true, providerMessageId: 'synthetic-accepted-message' });
  fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
    if (url.endsWith('/preview')) return Response.json({ subject: 'Synthetic preview', html: '<p>Synthetic preview</p>', sampleData: { firstName: 'Original' } });
    if (url.endsWith('/test')) { const body = String(init.body); requests.push(body); return respond(body); }
    throw new Error('Unexpected external request');
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

async function mount(customProps = props) {
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<EmailTemplatesClient {...customProps} />); });
  return view;
}
async function select(name = template.name) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: new RegExp(name) })); });
}
async function click(name: string) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })); });
}
const changeVariable = (value: string) => fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value } });

describe('admin template test browser retry state', () => {
  it('keeps the frozen operation across accepted-response loss, variable edits, and reload', async () => {
    const accepted = new Set<string>();
    respond = async (body) => {
      accepted.add(JSON.parse(body).attemptId);
      if (requests.length === 1) throw new TypeError('HTTP response lost after acceptance');
      return Response.json({ ok: true, providerMessageId: 'synthetic-accepted-message' });
    };
    await mount(); await select();
    await act(async () => { changeVariable('Frozen value'); });
    await click('Test Send');
    expect(screen.getByRole('alert')).toHaveTextContent(/not confirmed|unknown/i);
    const firstBody = requests[0];
    expect(JSON.parse(firstBody)).toMatchObject({ actorId: props.adminUserId, templateId: template.id, templateUpdatedAt: template.updatedAt, variables: { firstName: 'Frozen value' } });
    await act(async () => { changeVariable('Later edit'); });
    cleanup(); await mount(); await select();
    await click('Retry Same Test');
    expect(requests).toEqual([firstBody, firstBody]);
    expect(accepted.size).toBe(1);
    expect(screen.getByRole('status')).toHaveTextContent(/accepted by the email provider/i);
    expect(sessionStorage.getItem(storageKey)).not.toContain(JSON.parse(firstBody).attemptId);
  });

  it('does not overwrite an unknown attempt when another template is selected and tested', async () => {
    respond = async () => { throw new TypeError('Lost response'); };
    await mount(); await select(); await click('Test Send');
    const first = requests[0];
    await select(otherTemplate.name); await click('Test Send');
    expect(JSON.parse(requests[1]).templateId).toBe(otherTemplate.id);
    await select(); await click('Retry Same Test');
    expect(requests[2]).toBe(first);
    expect(Object.keys(JSON.parse(sessionStorage.getItem(storageKey)!))).toHaveLength(2);
  });

  it('keeps a changed/reloaded template from silently becoming a new test', async () => {
    respond = async () => { throw new TypeError('Lost response'); };
    await mount(); await select(); await click('Test Send');
    const first = requests[0];
    cleanup();
    await mount({ ...props, templates: [{ ...template, subject: 'Changed', updatedAt: '2026-10-11T08:01:00.000Z' }] });
    await select();
    respond = async () => Response.json({ code: 'template_changed', deliveryStatus: 'unknown', error: 'Template changed; check the previous test before sending a new one.' }, { status: 409 });
    await click('Retry Same Test');
    expect(requests[1]).toBe(first);
    expect(screen.getByRole('alert')).toHaveTextContent(/Template changed/);
    expect(screen.getByRole('button', { name: 'Retry Same Test' })).toBeEnabled();
  });

  it('creates a different attempt only through the explicit new-test action', async () => {
    respond = async () => { throw new TypeError('Lost response'); };
    await mount(); await select(); await click('Test Send');
    expect(screen.getByText(/may send a second message/i)).toBeVisible();
    await act(async () => { changeVariable('New intentional payload'); });
    await click('Send a New Test');
    expect(JSON.parse(requests[1]).attemptId).not.toBe(JSON.parse(requests[0]).attemptId);
    expect(JSON.parse(requests[1]).variables).toEqual({ firstName: 'New intentional payload' });
  });

  it.each([
    { label: 'malformed JSON', response: () => new Response('not-json') },
    { label: 'missing receipt', response: () => Response.json({ ok: true }) },
    { label: 'blank receipt', response: () => Response.json({ ok: true, providerMessageId: '  ' }) },
    { label: 'unacknowledged receipt', response: () => Response.json({ providerMessageId: 'synthetic-id' }) },
  ])('retains the operation and unknown outcome after $label', async ({ response }) => {
    respond = async () => response();
    await mount(); await select(); await click('Test Send');
    expect(screen.getByRole('alert')).toHaveTextContent(/not confirmed|unknown/i);
    expect(screen.getByRole('button', { name: 'Retry Same Test' })).toBeEnabled();
    expect(sessionStorage.getItem(storageKey)).toContain(JSON.parse(requests[0]).attemptId);
    expect(screen.queryByText(/Test accepted by the email provider/i)).not.toBeInTheDocument();
  });

  it('blocks a test before egress when its retry state cannot be persisted', async () => {
    await mount(); await select();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Storage disabled'); });
    await click('Test Send');
    expect(requests).toEqual([]);
    expect(screen.getByRole('alert')).toHaveTextContent(/No test was sent/);
  });

  it('blocks egress when saved retry state cannot be read safely', async () => {
    sessionStorage.setItem(storageKey, 'corrupt state');
    await mount(); await select();
    expect(screen.getByRole('button', { name: 'Test Send' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/saved test state|saved retry state/i);
    expect(requests).toEqual([]);
  });

  it('scopes restored operations to stable user ID even if login emails match', async () => {
    respond = async () => { throw new TypeError('Lost response'); };
    await mount(); await select(); await click('Test Send');
    const old = requests[0];
    cleanup(); await mount({ ...props, adminUserId: 'actor-b' }); await select();
    await click('Test Send');
    expect(JSON.parse(requests[1]).actorId).toBe('actor-b');
    expect(JSON.parse(requests[1]).attemptId).not.toBe(JSON.parse(old).attemptId);
    expect(sessionStorage.getItem(storageKey)).toContain(JSON.parse(old).attemptId);
  });

  it('rejects an actor-mismatched record copied into the current user’s storage', async () => {
    respond = async () => { throw new TypeError('Lost response'); };
    await mount(); await select(); await click('Test Send');
    cleanup();
    sessionStorage.setItem('wap:admin-email-template-tests:actor-b', sessionStorage.getItem(storageKey)!);
    await mount({ ...props, adminUserId: 'actor-b' }); await select();
    expect(screen.getByRole('button', { name: 'Test Send' })).toBeDisabled();
    expect(requests).toHaveLength(1);
  });

  it('blocks automatic retry at 23h while retaining the unresolved operation', async () => {
    respond = async () => { throw new TypeError('Lost response'); };
    await mount(); await select(); await click('Test Send');
    cleanup(); vi.spyOn(Date, 'now').mockReturnValue(originalTime + 23 * 60 * 60 * 1_000);
    await mount(); await select();
    expect(screen.getByRole('button', { name: 'Retry Same Test' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/expired|retry window/i);
    expect(requests).toHaveLength(1);
    expect(sessionStorage.getItem(storageKey)).toContain(JSON.parse(requests[0]).attemptId);
  });

  it('prevents same-tick double clicks before React commits the disabled state', async () => {
    let complete!: (response: Response) => void;
    respond = () => new Promise(resolve => { complete = resolve; });
    await mount(); await select();
    const button = screen.getByRole('button', { name: 'Test Send' });
    await act(async () => { fireEvent.click(button); fireEvent.click(button); });
    expect(requests).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Send a New Test' })).toBeDisabled();
    await act(async () => { complete(Response.json({ ok: true, providerMessageId: 'synthetic-accepted-message' })); });
  });

  it('cannot clear or relabel actor B’s saved operation when actor A’s late response arrives', async () => {
    let complete!: (response: Response) => void;
    respond = () => new Promise(resolve => { complete = resolve; });
    const view = await mount(); await select();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Test Send' })); });
    const savedA = sessionStorage.getItem(storageKey)!;
    const savedB = JSON.stringify({ [template.id]: { ...JSON.parse(requests[0]), actorId: 'actor-b', attemptId: `${originalTime}-00000000-0000-4000-8000-000000000099` } });
    sessionStorage.setItem('wap:admin-email-template-tests:actor-b', savedB);
    await act(async () => { view.rerender(<EmailTemplatesClient {...props} adminUserId="actor-b" />); });
    await select();
    await act(async () => { complete(Response.json({ ok: true, providerMessageId: 'synthetic-actor-a-receipt' })); });
    expect(sessionStorage.getItem('wap:admin-email-template-tests:actor-b')).toBe(savedB);
    expect(sessionStorage.getItem(storageKey)).toBe(savedA);
    expect(screen.getByRole('button', { name: 'Retry Same Test' })).toBeEnabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/previous test outcome is not confirmed/i);
    expect(screen.queryByText(/Test accepted by the email provider/i)).not.toBeInTheDocument();
  });

  it('does not label the selected template B with template A’s late receipt', async () => {
    let complete!: (response: Response) => void;
    respond = () => new Promise(resolve => { complete = resolve; });
    await mount(); await select();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Test Send' })); });
    await select(otherTemplate.name);
    await act(async () => { complete(Response.json({ ok: true, providerMessageId: 'synthetic-template-a-receipt' })); });
    expect(screen.queryByText(/Test accepted by the email provider/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Test Send' })).toBeEnabled();
  });

  it('keeps the known receipt if clearing saved state fails after provider acceptance', async () => {
    await mount(); await select();
    const original = Storage.prototype.setItem;
    let writes = 0;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (++writes > 1) throw new DOMException('Storage became unavailable');
      return original.call(this, key, value);
    });
    await click('Test Send');
    expect(screen.getByText(/Test accepted by the email provider/i)).toHaveAttribute('role', 'status');
    expect(screen.getByText(/Test accepted by the email provider/i)).toHaveTextContent(/retry state|saved state/i);
    expect(requests).toHaveLength(1);
  });
});
