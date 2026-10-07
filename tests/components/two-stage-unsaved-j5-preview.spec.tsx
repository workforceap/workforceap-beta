import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import TwoStageStageEditor from '@/app/admin/members/[id]/billing/TwoStageStageEditor';
import type { DraftReviewDto } from '@/lib/billing/twoStage/dto';
import { CASE_ID, HASH_A, MEMBER_ID, j5Draft, jsonResponse } from '../fixtures/billing/twoStageSummary';

const BASE = `/api/admin/members/${MEMBER_ID}/billing/two-stage`;
const REVIEW = `${BASE}/cases/${CASE_ID}/j5/draft/review`;
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
    return call.url.endsWith('/preview') ? mockResponse(call) : jsonResponse(dto);
  }));
  return calls;
}

function editor(caseId = CASE_ID, stage: 'j5' | 'j6' = 'j5') {
  return <TwoStageStageEditor memberId={MEMBER_ID} caseId={caseId} stage={stage} canSaveDraft={false} onSaved={onSaved} onClose={onClose} />;
}

async function startPreview() {
  const button = await screen.findByRole('button', { name: 'Preview J5 PDF' });
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

describe('editor PDF preview', () => {
  it('previews current typed values without a draft save, even when saving is unavailable', async () => {
    const calls = mockNetwork();
    render(editor());
    fireEvent.change(await screen.findByLabelText('Workforce Solutions board'), { target: { value: 'Unsaved Board' } });
    fireEvent.change(screen.getByLabelText('Counselor name'), { target: { value: 'Unsaved Counselor' } });
    expect(screen.getByRole('button', { name: 'Preview J5 PDF' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    await startPreview();
    expect(await screen.findByTitle('Unsaved J5 PDF preview')).toHaveAttribute('src', 'blob:mock-j5');
    expect(calls.find((call) => call.url === `${BASE}/j5/preview`)).toMatchObject({
      method: 'POST', body: {
        boardName: 'Unsaved Board', student: { name: 'Sam Student', email: 'sam@example.test' },
        counselor: { name: 'Unsaved Counselor', email: 'counselor@example.test', phone: '512-555-0100' },
        caseId: CASE_ID,
      },
    });
    expect(calls.every((call) => call.method === 'POST' && [REVIEW, `${BASE}/j5/preview`].includes(call.url))).toBe(true);
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Download J5 PDF' })).toHaveAttribute('download', 'J5-PREVIEW.pdf');
    expect(screen.getByRole('link', { name: 'Open J5 PDF in a new tab' })).toHaveAttribute('href', 'blob:mock-j5');
    expect(screen.getByRole('region', { name: 'J5 preview' })).toHaveTextContent('including unsaved changes');
    fireEvent.change(screen.getByLabelText('Workforce Solutions board'), { target: { value: 'Changed again' } });
    expect(revokeUrl).toHaveBeenCalledWith('blob:mock-j5');
    expect(screen.queryByTitle('Unsaved J5 PDF preview')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Download J5 PDF' })).toBeNull();
  });

  it('uses the selected case without requiring the saved version hash', async () => {
    const calls = mockNetwork(undefined, review({ current: j5Draft() }));
    render(editor());
    await startPreview();
    await screen.findByTitle('Unsaved J5 PDF preview');
    expect(calls.find((call) => call.url.endsWith('/preview'))?.body.caseId).toBe(CASE_ID);
    expect(calls.find((call) => call.url.endsWith('/preview'))?.body).not.toHaveProperty('expectedVersionHash');
  });

  it('aborts and ignores a late PDF when inputs change during rendering', async () => {
    let resolvePdf!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => { resolvePdf = resolve; });
    const calls = mockNetwork(() => response);
    render(editor());
    await startPreview();
    const request = calls.find((call) => call.url.endsWith('/preview'))!;
    fireEvent.change(screen.getByLabelText('Counselor name'), { target: { value: 'New value' } });
    expect(request.signal?.aborted).toBe(true);
    await act(async () => { resolvePdf(new Response('%PDF-old', { headers: { 'Content-Type': 'application/pdf' } })); });
    expect(createUrl).not.toHaveBeenCalled();
    expect(screen.queryByTitle('Unsaved J5 PDF preview')).toBeNull();
  });

  it('ignores a late PDF after switching cases', async () => {
    let resolvePdf!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => { resolvePdf = resolve; });
    const calls = mockNetwork(() => response);
    const view = render(editor());
    await startPreview();
    const request = calls.find((call) => call.url.endsWith('/preview'))!;
    view.rerender(editor('other-case'));
    expect(request.signal?.aborted).toBe(true);
    await act(async () => { resolvePdf(new Response('%PDF-old', { headers: { 'Content-Type': 'application/pdf' } })); });
    expect(createUrl).not.toHaveBeenCalled();
    expect(screen.queryByTitle('Unsaved J5 PDF preview')).toBeNull();
  });

  it.each(['preview', 'editor', 'unmount', 'case'] as const)('revokes the PDF when closing %s', async (close) => {
    mockNetwork();
    const view = render(editor());
    await startPreview();
    await screen.findByTitle('Unsaved J5 PDF preview');
    if (close === 'preview') fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
    else if (close === 'editor') fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
    else if (close === 'case') await act(async () => { view.rerender(editor('other-case')); });
    else view.unmount();
    expect(revokeUrl).toHaveBeenCalledWith('blob:mock-j5');
    expect(screen.queryByTitle('Unsaved J5 PDF preview')).toBeNull();
    if (close === 'editor') expect(onClose).toHaveBeenCalledOnce();
  });

  it.each([
    [403, { code: 'ADMIN_REQUIRED', error: 'Administrator access is required.' }],
    [503, { code: 'RENDERER_UNAVAILABLE', error: 'The PDF could not be produced. Try again.' }],
  ])('shows the server refusal (%i) without creating a PDF or saving', async (status, body) => {
    mockNetwork(() => jsonResponse(body, status));
    render(editor());
    await startPreview();
    const mockSection = within(screen.getByRole('region', { name: 'J5 preview' }));
    expect(await mockSection.findByRole('alert')).toHaveTextContent(body.error);
    expect(createUrl).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it.each(['j5', 'j6'] as const)('previews incomplete %s fields without waiting for readiness or field review', async (stage) => {
    const dto = review({ stage, complete: false, fields: { ...review().fields, boardName: { value: '', source: 'none', error: { code: 'FIELD_REQUIRED', message: 'Required to save.' } } } });
    const calls = mockNetwork(undefined, dto);
    render(editor(CASE_ID, stage));
    const button = await screen.findByRole('button', { name: `Preview ${stage.toUpperCase()} PDF` });
    expect(button).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Counselor name'), { target: { value: 'Still editing' } });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await screen.findByTitle(`Unsaved ${stage.toUpperCase()} PDF preview`);
    expect(calls.find((call) => call.url === `${BASE}/${stage}/preview`)?.body).toMatchObject({
      boardName: '', caseId: CASE_ID, counselor: { name: 'Still editing' },
    });
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
  });
});
