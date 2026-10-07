import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import TwoStageStageEditor from '@/app/admin/members/[id]/billing/TwoStageStageEditor';
import type { DraftReviewDto } from '@/lib/billing/twoStage/dto';
import { CASE_ID, HASH_A, MEMBER_ID, j5Draft, jsonResponse } from '../fixtures/billing/twoStageSummary';

const BASE = `/api/admin/members/${MEMBER_ID}/billing/two-stage/cases/${CASE_ID}/j5/draft/review`;
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
const createUrl = vi.fn(() => 'blob:mock-j5');
const revokeUrl = vi.fn();
const onSaved = vi.fn();
const onClose = vi.fn();

function review(overrides: Partial<DraftReviewDto> = {}): DraftReviewDto {
  const field = (value: string) => ({ value, source: 'draft' as const, error: null });
  return {
    stage: 'j5', current: null, complete: true, blockers: [], holds: [], versionHashIfSaved: HASH_A,
    fields: {
      boardName: field('Initial Board'),
      'student.name': field('Sam Student'), 'student.email': field('sam@example.test'),
      'counselor.name': field('Initial Counselor'), 'counselor.email': field('counselor@example.test'),
      'counselor.phone': field('512-555-0100'),
    }, ...overrides,
  };
}

type Call = { url: string; method: string; body: Record<string, unknown>; signal?: AbortSignal | null };
function mockNetwork(mockResponse: (call: Call) => Response | Promise<Response> = () => new Response('%PDF-mock', { headers: { 'Content-Type': 'application/pdf' } }), dto = review()) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = { url: String(input), method: init?.method ?? 'GET', body: JSON.parse(String(init?.body ?? '{}')), signal: init?.signal };
    calls.push(call);
    return call.url.endsWith('?mode=mock') ? mockResponse(call) : jsonResponse(dto);
  }));
  return calls;
}

function editor(caseId = CASE_ID, stage: 'j5' | 'j6' = 'j5') {
  return <TwoStageStageEditor memberId={MEMBER_ID} caseId={caseId} stage={stage} canSaveDraft={false} onSaved={onSaved} onClose={onClose} />;
}

async function startPreview() {
  const button = await screen.findByRole('button', { name: 'Preview mock J5' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
}

beforeEach(() => {
  createUrl.mockClear(); revokeUrl.mockClear(); onSaved.mockClear(); onClose.mockClear();
  URL.createObjectURL = createUrl;
  URL.revokeObjectURL = revokeUrl;
});

afterEach(() => {
  cleanup();
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  vi.unstubAllGlobals();
});

describe('unsaved J5 mock PDF', () => {
  it('previews current typed values without a draft save, even when saving is unavailable', async () => {
    const calls = mockNetwork();
    render(editor());
    fireEvent.change(await screen.findByLabelText('Workforce Solutions board'), { target: { value: 'Unsaved Board' } });
    fireEvent.change(screen.getByLabelText('Counselor name'), { target: { value: 'Unsaved Counselor' } });
    expect(screen.getByRole('button', { name: 'Preview mock J5' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    await startPreview();
    expect(await screen.findByTitle('Unsaved J5 MOCK PDF preview')).toHaveAttribute('src', 'blob:mock-j5');
    expect(calls.find((call) => call.url === `${BASE}?mode=mock`)).toMatchObject({
      method: 'POST', body: {
        boardName: 'Unsaved Board', student: { name: 'Sam Student', email: 'sam@example.test' },
        counselor: { name: 'Unsaved Counselor', email: 'counselor@example.test', phone: '512-555-0100' },
        expectedVersionHash: null,
      },
    });
    expect(calls.every((call) => call.method === 'POST' && call.url.startsWith(BASE))).toBe(true);
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Download mock J5 PDF' })).toHaveAttribute('download', 'J5-MOCK.pdf');
    expect(screen.getByRole('link', { name: 'Open mock J5 in a new tab' })).toHaveAttribute('href', 'blob:mock-j5');
    expect(screen.getByRole('region', { name: 'Mock J5 preview' })).toHaveTextContent('including unsaved changes');
    fireEvent.change(screen.getByLabelText('Workforce Solutions board'), { target: { value: 'Changed again' } });
    expect(revokeUrl).toHaveBeenCalledWith('blob:mock-j5');
    expect(screen.queryByTitle('Unsaved J5 MOCK PDF preview')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Download mock J5 PDF' })).toBeNull();
  });

  it('carries the loaded version hash when an existing draft is present', async () => {
    const calls = mockNetwork(undefined, review({ current: j5Draft() }));
    render(editor());
    await startPreview();
    await screen.findByTitle('Unsaved J5 MOCK PDF preview');
    expect(calls.find((call) => call.url.endsWith('?mode=mock'))?.body.expectedVersionHash).toBe(HASH_A);
  });

  it('aborts and ignores a late PDF when inputs change during rendering', async () => {
    let resolvePdf!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => { resolvePdf = resolve; });
    const calls = mockNetwork(() => response);
    render(editor());
    await startPreview();
    const request = calls.find((call) => call.url.endsWith('?mode=mock'))!;
    fireEvent.change(screen.getByLabelText('Counselor name'), { target: { value: 'New value' } });
    expect(request.signal?.aborted).toBe(true);
    await act(async () => { resolvePdf(new Response('%PDF-old', { headers: { 'Content-Type': 'application/pdf' } })); });
    expect(createUrl).not.toHaveBeenCalled();
    expect(screen.queryByTitle('Unsaved J5 MOCK PDF preview')).toBeNull();
  });

  it('ignores a late PDF after switching cases', async () => {
    let resolvePdf!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => { resolvePdf = resolve; });
    const calls = mockNetwork(() => response);
    const view = render(editor());
    await startPreview();
    const request = calls.find((call) => call.url.endsWith('?mode=mock'))!;
    view.rerender(editor('other-case'));
    expect(request.signal?.aborted).toBe(true);
    await act(async () => { resolvePdf(new Response('%PDF-old', { headers: { 'Content-Type': 'application/pdf' } })); });
    expect(createUrl).not.toHaveBeenCalled();
    expect(screen.queryByTitle('Unsaved J5 MOCK PDF preview')).toBeNull();
  });

  it.each(['preview', 'editor', 'unmount', 'case'] as const)('revokes the PDF when closing %s', async (close) => {
    mockNetwork();
    const view = render(editor());
    await startPreview();
    await screen.findByTitle('Unsaved J5 MOCK PDF preview');
    if (close === 'preview') fireEvent.click(screen.getByRole('button', { name: 'Close mock preview' }));
    else if (close === 'editor') fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
    else if (close === 'case') await act(async () => { view.rerender(editor('other-case')); });
    else view.unmount();
    expect(revokeUrl).toHaveBeenCalledWith('blob:mock-j5');
    expect(screen.queryByTitle('Unsaved J5 MOCK PDF preview')).toBeNull();
    if (close === 'editor') expect(onClose).toHaveBeenCalledOnce();
  });

  it.each([
    [409, { code: 'DRAFT_CONFLICT', error: 'The saved draft changed. Reload before previewing.' }],
    [422, { code: 'DRAFT_INCOMPLETE', error: 'Complete the required fields.', fields: { boardName: { code: 'FIELD_REQUIRED', message: 'Enter the board name.' } } }],
  ])('shows the server refusal (%i) without creating a PDF or saving', async (status, body) => {
    mockNetwork(() => jsonResponse(body, status));
    render(editor());
    await startPreview();
    const mockSection = within(screen.getByRole('region', { name: 'Mock J5 preview' }));
    expect(await mockSection.findByRole('alert')).toHaveTextContent(body.error);
    expect(createUrl).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('keeps preview unavailable until field and readiness review is complete, and keeps it out of J6', async () => {
    mockNetwork(undefined, review({ complete: false }));
    const view = render(editor());
    expect(await screen.findByRole('button', { name: 'Preview mock J5' })).toBeDisabled();
    view.rerender(editor(CASE_ID, 'j6'));
    await screen.findByLabelText('Workforce Solutions board');
    expect(screen.queryByRole('button', { name: 'Preview mock J5' })).toBeNull();
  });
});
