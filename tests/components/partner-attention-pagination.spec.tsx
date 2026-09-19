import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PartnerAttentionClient from '@/components/partner/PartnerAttentionClient';
const h = vi.hoisted(() => ({ fetch: vi.fn(), replace: vi.fn(), params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: h.replace }), useSearchParams: () => h.params, usePathname: () => '/partner/needs-attention' }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
const member = (id = 'old-member') => ({ memberId: id, fullName: `Member ${id}`, stage: 'applied', stageLabel: 'Applied', programTitle: 'No program', staleDays: 60, riskTier: 'high', nextBestAction: 'Check in', assignedPartnerUserId: null, assignedToName: null, lastTouchName: null });
const counts = { all: 604, high: 504, medium: 50, low: 30, watch: 20 };
const envelope = (id = 'old-member', nextCursor: string | null = 'next-page') => ({ members: [member(id)], counts, total: 504, nextCursor, asOf: '2026-09-19T12:00:00.000Z' });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const getCalls = () => h.fetch.mock.calls.filter(([, init]) => !init?.method).map(([url]) => String(url));
function loads(action: (url: string, init: RequestInit) => Promise<Response> = async () => json({}, 500)) {
 h.fetch.mockImplementation(async (input: string, init: RequestInit = {}) => {
  const url = String(input);
  if (init.method) return action(url, init);
  if (url.includes('needs-attention')) return json(envelope(url.includes('cursor=') ? 'page-two' : 'old-member', url.includes('cursor=') ? null : 'next-page'));
  if (url.endsWith('/outreach')) return json({ logs: [] });
  if (url.endsWith('/referral-members')) return json({ members: [] });
  if (url.endsWith('/team-assign')) return json({ users: [{ id: 'owner-1', fullName: 'Owner One', email: 'owner@example.invalid' }] });
  return json({},404);
 });
}
beforeEach(() => { vi.clearAllMocks(); h.params = new URLSearchParams(); vi.stubGlobal('fetch', h.fetch); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('partner attention pages and local updates', () => {
 it('shows full cohort tier counts and fetches only queue pages when paging or changing tier', async () => {
  loads(); render(<PartnerAttentionClient />);
  await screen.findByLabelText('Assign owner for Member old-member');
  expect(screen.getByRole('tab', { name: /high.*504/ })).toBeVisible();
  expect(screen.getByText('Page 1 · 1 of 504 members in this tier')).toBeVisible();
  expect(getCalls()).toHaveLength(4);
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await screen.findByLabelText('Assign owner for Member page-two');
  expect(getCalls()).toHaveLength(5); expect(getCalls().at(-1)).toContain('cursor=next-page');
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
  await screen.findByLabelText('Assign owner for Member old-member');
  fireEvent.click(screen.getByRole('tab', { name: /medium/ }));
  await waitFor(() => expect(getCalls().at(-1)).toContain('tier=medium'));
  expect(getCalls().filter(url => url.endsWith('/outreach'))).toHaveLength(1);
 });

 it('updates a confirmed owner without reloading resources or erasing an outreach draft', async () => {
  loads(async (_url, init) => { expect(JSON.parse(init.body as string)).toEqual({ assignedPartnerUserId: 'owner-1' }); return json({ ok: true, assignedPartnerUserId: 'owner-1', assignedToName: 'Owner One' }); });
  render(<PartnerAttentionClient />);
  const select = await screen.findByLabelText('Assign owner for Member old-member');
  await waitFor(() => expect(select).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Keep this draft' } });
  fireEvent.change(select, { target: { value: 'owner-1' } });
  await waitFor(() => expect(select).toHaveValue('owner-1'));
  expect(screen.getByLabelText('Note')).toHaveValue('Keep this draft'); expect(getCalls()).toHaveLength(4);
 });

 it('logs outreach for an older queue member absent from the limited member-choice list and updates local rows', async () => {
  loads(async (_url, init) => { expect(JSON.parse(init.body as string)).toEqual({ memberId: 'old-member', channel: 'email', note: 'Called today' }); return json({ id: 'log-1', memberId: 'old-member', memberName: 'Member old-member', channel: 'email', note: 'Called today', createdAt: '2026-09-19T12:00:00.000Z' }); });
  render(<PartnerAttentionClient />);
  await screen.findByLabelText('Assign owner for Member old-member');
  fireEvent.click(screen.getByRole('button', { name: 'Log outreach' }));
  expect(screen.getByLabelText('Member')).toHaveValue('old-member');
  fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Called today' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save log' }));
  await screen.findByText('Outreach logged.');
  expect(screen.getByText('Last touch: You')).toBeVisible(); expect(screen.getByText('Called today')).toBeVisible();
  expect(screen.getByLabelText('Note')).toHaveValue(''); expect(getCalls()).toHaveLength(4);
 });

 it('retains drafts and saved owner when mutation responses fail', async () => {
  loads(async () => json({ error: 'Could not save this change.' }, 503)); render(<PartnerAttentionClient />);
  const select = await screen.findByLabelText('Assign owner for Member old-member');
  await waitFor(() => expect(select).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Log outreach' }));
  fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Keep after failure' } });
  fireEvent.change(select, { target: { value: 'owner-1' } });
  await screen.findByRole('alert'); expect(select).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: 'Save log' }));
  await screen.findByRole('status'); expect(screen.getByLabelText('Note')).toHaveValue('Keep after failure');
 });

 it('keeps the queue visible when a supporting resource fails and retries that resource alone', async () => {
  loads(); const original = h.fetch.getMockImplementation()!;
  h.fetch.mockImplementation(async (url, init) => String(url).endsWith('/outreach') ? json({},503) : original(url, init));
  render(<PartnerAttentionClient />);
  await screen.findByLabelText('Assign owner for Member old-member');
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load recent outreach');
  expect(screen.queryByText('No logs yet.')).not.toBeInTheDocument();
  h.fetch.mockImplementation(original);
  fireEvent.click(screen.getByRole('button', { name: 'Retry recent outreach' }));
  await screen.findByText('No logs yet.'); expect(getCalls()).toHaveLength(5);
  expect(getCalls().filter(url => url.includes('needs-attention'))).toHaveLength(1);
 });

 it('keeps the selected member and draft while paging away from that member', async () => {
  loads(); render(<PartnerAttentionClient />);
  await screen.findByLabelText('Assign owner for Member old-member');
  fireEvent.change(screen.getByLabelText('Member'), { target: { value: 'old-member' } });
  fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Unfinished note' } });
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await screen.findByLabelText('Assign owner for Member page-two');
  expect(screen.getByLabelText('Member')).toHaveValue('old-member');
  expect(screen.getByLabelText('Note')).toHaveValue('Unfinished note');
 });

 it('keeps a newer draft typed while an earlier note is saving', async () => {
  let finish!: (response: Response) => void;
  loads(() => new Promise(resolve => { finish = resolve; }));
  render(<PartnerAttentionClient />);
  await screen.findByLabelText('Assign owner for Member old-member');
  fireEvent.click(screen.getByRole('button', { name: 'Log outreach' }));
  fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'First saved note' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save log' }));
  fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'New unsaved draft' } });
  finish(json({ id: 'saved-1', memberId: 'old-member', memberName: 'Member old-member', channel: 'email', note: 'First saved note', createdAt: '2026-09-19T12:00:00.000Z' }));
  await screen.findByText('Outreach logged.');
  expect(screen.getByLabelText('Note')).toHaveValue('New unsaved draft');
 });

 it('ignores an older aborted queue response after a tier change', async () => {
  loads(); const original = h.fetch.getMockImplementation()!;
  let resolveFirst!: (response: Response) => void;
  const first = new Promise<Response>(resolve => { resolveFirst = resolve; });
  h.fetch.mockImplementation((url, init) => String(url).includes('tier=high') ? first : original(url, init));
  render(<PartnerAttentionClient />);
  fireEvent.click(screen.getByRole('tab', { name: 'medium' }));
  await screen.findByLabelText('Assign owner for Member old-member');
  resolveFirst(json(envelope('obsolete')));
  await waitFor(() => expect(screen.queryByLabelText('Assign owner for Member obsolete')).not.toBeInTheDocument());
  expect(screen.getByLabelText('Assign owner for Member old-member')).toBeVisible();
 });
 it.each(['initial', 'retry'])('retains a confirmed note when an earlier %s supporting GET resolves afterward', async (requestKind) => {
  loads(async () => json({ id: 'saved-1', memberId: 'old-member', memberName: 'Member old-member', channel: 'email', note: 'Confirmed note', createdAt: '2026-09-19T12:00:00.000Z' }));
  const original = h.fetch.getMockImplementation()!;
  let finishOldLogs!: (response: Response) => void;
  const oldLogs = new Promise<Response>(resolve => { finishOldLogs = resolve; });
  let logRequests = 0;
  h.fetch.mockImplementation((url, init) => {
   if (!init?.method && String(url).endsWith('/outreach')) {
    logRequests += 1;
    return requestKind === 'retry' && logRequests === 1 ? Promise.resolve(json({}, 503)) : oldLogs;
   }
   return original(url, init);
  });
  render(<PartnerAttentionClient />);
  await screen.findByLabelText('Assign owner for Member old-member');
  if (requestKind === 'retry') fireEvent.click(await screen.findByRole('button', { name: 'Retry recent outreach' }));
  fireEvent.click(screen.getByRole('button', { name: 'Log outreach' }));
  fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Confirmed note' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save log' }));
  await screen.findByText('Outreach logged.');
  expect(screen.getByText('Confirmed note')).toBeVisible();
  await act(async () => { finishOldLogs(json({ logs: [] })); });
  expect(screen.getByText('Confirmed note')).toBeVisible();
 });

 it('does not clear a draft after its member selection changes during the save', async () => {
  let finishSave!: (response: Response) => void;
  loads(() => new Promise(resolve => { finishSave = resolve; }));
  const original = h.fetch.getMockImplementation()!;
  h.fetch.mockImplementation((url, init) => !init?.method && String(url).endsWith('/referral-members')
    ? Promise.resolve(json({ members: [{ id: 'other-member', fullName: 'Other member' }] })) : original(url, init));
  render(<PartnerAttentionClient />);
  await screen.findByLabelText('Assign owner for Member old-member');
  fireEvent.click(screen.getByRole('button', { name: 'Log outreach' }));
  fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Check on access' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save log' }));
  fireEvent.change(screen.getByLabelText('Member'), { target: { value: 'other-member' } });
  finishSave(json({ id: 'saved-1', memberId: 'old-member', memberName: 'Member old-member', channel: 'email', note: 'Check on access', createdAt: '2026-09-19T12:00:00.000Z' }));
  await screen.findByText('Outreach logged.');
  expect(screen.getByLabelText('Member')).toHaveValue('other-member');
  expect(screen.getByLabelText('Note')).toHaveValue('Check on access');
 });
 it('retains the draft when its channel changes and changes back during a save', async () => {
  let finish!: (response: Response) => void;
  loads(() => new Promise(resolve => { finish = resolve; }));
  render(<PartnerAttentionClient />);
  await screen.findByLabelText('Assign owner for Member old-member');
  fireEvent.click(screen.getByRole('button', { name: 'Log outreach' }));
  fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Same text, revised draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save log' }));
  fireEvent.change(screen.getByLabelText('Channel'), { target: { value: 'call' } });
  fireEvent.change(screen.getByLabelText('Channel'), { target: { value: 'email' } });
  finish(json({ id: 'saved-1', memberId: 'old-member', memberName: 'Member old-member', channel: 'email', note: 'Same text, revised draft', createdAt: '2026-09-19T12:00:00.000Z' }));
  await screen.findByText('Outreach logged.');
  expect(screen.getByLabelText('Note')).toHaveValue('Same text, revised draft');
 });

 it('preserves a confirmed outreach last-touch against an older queue refresh', async () => {
  let finishSave!: (response: Response) => void;
  loads(() => new Promise(resolve => { finishSave = resolve; }));
  const original = h.fetch.getMockImplementation()!;
  let finishQueue!: (response: Response) => void;
  const oldQueue = new Promise<Response>(resolve => { finishQueue = resolve; });
  let queueReads = 0;
  h.fetch.mockImplementation((url, init) => {
    if (!init?.method && String(url).includes('needs-attention') && ++queueReads > 1) return oldQueue;
    return original(url, init);
  });
  render(<PartnerAttentionClient />);
  await screen.findByLabelText('Assign owner for Member old-member');
  fireEvent.click(screen.getByRole('button', { name: 'Log outreach' }));
  fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Confirmed after refresh began' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save log' }));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh queue' }));
  finishSave(json({ id: 'saved-2', memberId: 'old-member', memberName: 'Member old-member', channel: 'email', note: 'Confirmed after refresh began', createdAt: '2026-09-19T12:00:00.000Z' }));
  await screen.findByText('Outreach logged.');
  await act(async () => { finishQueue(json(envelope())); });
  expect(screen.getByText('Confirmed after refresh began')).toBeVisible();
  expect(screen.getByText('Last touch: You')).toBeVisible();
 });


 it('keeps a confirmed owner over an in-flight queue snapshot but accepts a later authoritative owner', async () => {
  let finishSave!: (response: Response) => void;
  loads(() => new Promise(resolve => { finishSave = resolve; }));
  const original = h.fetch.getMockImplementation()!;
  let finishQueue!: (response: Response) => void;
  const oldQueue = new Promise<Response>(resolve => { finishQueue = resolve; });
  let queueReads = 0;
  h.fetch.mockImplementation((url, init) => !init?.method && String(url).includes('needs-attention') && ++queueReads === 2 ? oldQueue : original(url, init));
  render(<PartnerAttentionClient />);
  const owner = await screen.findByLabelText('Assign owner for Member old-member');
  await waitFor(() => expect(owner).toBeEnabled());
  fireEvent.change(owner, { target: { value: 'owner-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh queue' }));
  await act(async () => { finishSave(json({ ok: true, assignedPartnerUserId: 'owner-1', assignedToName: 'Owner One' })); });
  await act(async () => { finishQueue(json(envelope())); });
  expect(screen.getByLabelText('Assign owner for Member old-member')).toHaveValue('owner-1');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh queue' }));
  await waitFor(() => expect(screen.getByLabelText('Assign owner for Member old-member')).toHaveValue(''));
 });

});
