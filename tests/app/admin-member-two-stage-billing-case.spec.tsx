import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import TwoStageBillingCase from '@/app/admin/members/[id]/billing/TwoStageBillingCase';
import type { ContactSource, DraftFieldError, DraftReviewDto, DraftSaveDto } from '@/lib/billing/twoStage/dto';
import { CASE_ID, HASH_A, MEMBER_ID, emptyCaseSummary, j5Draft, j5DraftSummary, jsonResponse } from '../fixtures/billing/twoStageSummary';

/**
 * Route integration of the M4 container: fetch is mocked at the network
 * boundary and every request is checked against the M3 route contract
 * (paths, methods, bodies), including the honest "not enabled" state.
 */

type Call = { method: string; url: string; body: unknown };

function mockRoutes(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
      const call = { method, url, body };
      calls.push(call);
      return handler(call);
    }),
  );
  return calls;
}

const BASE = `/api/admin/members/${MEMBER_ID}/billing/two-stage`;
const CASE = `${BASE}/cases/${CASE_ID}`;
const caseItem = { id: CASE_ID, programSlug: 'google-it-support-professional-certificate', className: 'Google IT Support Professional Certificate', createdAt: '2026-09-28T14:00:00.000Z', progress: emptyCaseSummary().progress };
const programs = [{ slug: 'google-it-support-professional-certificate', title: 'Google IT Support Professional Certificate' }];

function renderCase(enrolledPrograms = programs) {
  return render(
    <TwoStageBillingCase
      memberId={MEMBER_ID}
      memberName="Sam Student"
      memberEmail="sam.student@example.test"
      counselor={{ name: 'Assigned Counselor', email: 'assigned.counselor@example.test' }}
      enrolledPrograms={enrolledPrograms}
    />,
  );
}

async function openEditor(stage: 'j5' | 'j6' = 'j5') {
  const name = stage === 'j5' ? 'Create J5 Quote / Voucher Request' : 'Create J6 Invoice / Voucher Cover Letter';
  await waitFor(() => expect(screen.getByRole('button', { name })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name }));
  return screen.findByRole('region', { name: `${stage.toUpperCase()} draft` });
}

const field = (value: string | null, source: ContactSource, error: DraftFieldError | null = null) => ({ value, source, error });

function reviewDto(overrides: Partial<DraftReviewDto> = {}): DraftReviewDto {
  return {
    stage: 'j5',
    current: null,
    fields: {
      boardName: field(null, 'none', { code: 'FIELD_REQUIRED', message: 'This field is required.' }),
      'student.name': field('Sam Student', 'member_profile'),
      'student.email': field('sam.student@example.test', 'member_profile'),
      'counselor.name': field('Assigned Counselor', 'assigned_counselor'),
      'counselor.email': field('assigned.counselor@example.test', 'assigned_counselor'),
      'counselor.phone': field(null, 'none', { code: 'FIELD_REQUIRED', message: 'This field is required.' }),
    },
    blockers: [],
    complete: false,
    holds: [],
    versionHashIfSaved: null,
    ...overrides,
  };
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

const missingReadiness = { code: 'J5_READINESS_MISSING' as const, message: 'Record the J5 readiness attestation (with the confirmed class start date) first.', hardHold: false };

function validReview(complete = true): DraftReviewDto {
  return reviewDto({
    complete,
    versionHashIfSaved: complete ? HASH_A : null,
    blockers: complete ? [] : [missingReadiness],
    fields: { ...reviewDto().fields, boardName: field('Original Board', 'draft'), 'counselor.phone': field('555', 'draft') },
  });
}

function recordedReadinessSummary() {
  const base = emptyCaseSummary();
  return { ...base, j5: { ...base.j5, readinessAttestation: j5DraftSummary().j5.readinessAttestation } };
}

function recordReadiness() {
  const disclosure = screen.getByText(/^(Record J5 readiness|J5 readiness \(recorded\))$/).closest('details')!;
  disclosure.open = true;
  const panel = within(disclosure);
  fireEvent.change(panel.getByLabelText('Confirmed class start date'), { target: { value: '2026-09-30' } });
  fireEvent.change(panel.getByLabelText('Counselor who requested the quote'), { target: { value: 'Sample Counselor' } });
  fireEvent.change(panel.getByLabelText('Date of the request'), { target: { value: '2026-09-29' } });
  fireEvent.change(panel.getByLabelText('Request reference'), { target: { value: 'SAMPLE-REQUEST' } });
  fireEvent.change(panel.getByLabelText('Evidence reference'), { target: { value: 'SAMPLE-EVIDENCE' } });
  fireEvent.click(panel.getByLabelText('The student is approved and ready for training.'));
  fireEvent.click(panel.getByLabelText('I confirm these facts are recorded accurately.'));
  fireEvent.click(panel.getByRole('button', { name: 'Record readiness' }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('two-stage billing container (route integration)', () => {
  it('refreshes an open J5 review after recording readiness without losing typed fields or requiring another edit', async () => {
    let recorded = false;
    let refreshedReviewRequested = false;
    const refreshedReview = deferredResponse();
    const calls = mockRoutes((c) => {
      if (c.url === `${BASE}/cases`) return jsonResponse({ cases: [caseItem] });
      if (c.url === CASE) return jsonResponse(recorded ? recordedReadinessSummary() : emptyCaseSummary());
      if (c.url === `${CASE}/attestations/j5-readiness`) { recorded = true; return jsonResponse({}); }
      if (c.url.endsWith('/j5/draft/review')) {
        if (recorded) { refreshedReviewRequested = true; return refreshedReview.promise; }
        return jsonResponse(validReview(false));
      }
      throw new Error(`Unexpected request: ${c.method} ${c.url}`);
    });
    renderCase();
    const editor = await openEditor();
    fireEvent.change(await within(editor).findByLabelText('Workforce Solutions board'), { target: { value: 'My unsaved board' } });
    fireEvent.change(within(editor).getByLabelText('Counselor name'), { target: { value: 'My unsaved counselor' } });
    await waitFor(() => expect(calls.filter((c) => c.url.endsWith('/draft/review')).at(-1)?.body).toMatchObject({ boardName: 'My unsaved board' }));
    recordReadiness();
    expect(await screen.findByText('J5 readiness (recorded)')).toBeInTheDocument();
    await waitFor(() => expect(refreshedReviewRequested).toBe(true));
    const save = within(editor).getByRole('button', { name: 'Save draft' });
    expect(save).toBeDisabled();
    expect(calls.filter((c) => c.url.endsWith('/draft/review')).at(-1)?.body).toMatchObject({ boardName: 'My unsaved board', counselor: { name: 'My unsaved counselor' } });
    await act(async () => { refreshedReview.resolve(jsonResponse(validReview())); });
    await waitFor(() => expect(save).toBeEnabled());
    expect(within(editor).getByLabelText('Workforce Solutions board')).toHaveValue('My unsaved board');
    expect(within(editor).getByLabelText('Counselor name')).toHaveValue('My unsaved counselor');
    expect(within(editor).queryByText(missingReadiness.message)).not.toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'PUT' || /\/(sign|send|freeze)$/.test(c.url))).toHaveLength(0);
  });

  it('ignores a late pre-attestation review after the refreshed review clears the readiness blocker', async () => {
    let recorded = false;
    let obsoleteRequested = false;
    let refreshedReviewRequested = false;
    const obsolete = deferredResponse();
    const calls = mockRoutes((c) => {
      if (c.url === `${BASE}/cases`) return jsonResponse({ cases: [caseItem] });
      if (c.url === CASE) return jsonResponse(recorded ? recordedReadinessSummary() : emptyCaseSummary());
      if (c.url === `${CASE}/attestations/j5-readiness`) { recorded = true; return jsonResponse({}); }
      if (c.url.endsWith('/j5/draft/review')) {
        if (recorded) { refreshedReviewRequested = true; return jsonResponse(validReview()); }
        if ((c.body as { boardName?: string }).boardName === 'Unsaved board') { obsoleteRequested = true; return obsolete.promise; }
        return jsonResponse(validReview(false));
      }
      throw new Error(`Unexpected request: ${c.method} ${c.url}`);
    });
    renderCase();
    const editor = await openEditor();
    fireEvent.change(await within(editor).findByLabelText('Workforce Solutions board'), { target: { value: 'Unsaved board' } });
    await waitFor(() => expect(obsoleteRequested).toBe(true));
    recordReadiness();
    await waitFor(() => expect(refreshedReviewRequested).toBe(true));
    const save = within(editor).getByRole('button', { name: 'Save draft' });
    await waitFor(() => expect(save).toBeEnabled());
    // The network mock deliberately ignores AbortSignal and delivers the old response.
    await act(async () => { obsolete.resolve(jsonResponse(validReview(false))); });
    expect(save).toBeEnabled();
    expect(within(editor).queryByText(missingReadiness.message)).not.toBeInTheDocument();
    expect(within(editor).getByLabelText('Workforce Solutions board')).toHaveValue('Unsaved board');
    expect(calls.filter((c) => /\/(sign|send|freeze)$/.test(c.url))).toHaveLength(0);
  });

  it('blocks a previously complete draft when the refreshed review fails and retries with the same inputs', async () => {
    let corrected = false;
    let refreshedReviewRequested = false;
    let failReview = true;
    const refreshedReview = deferredResponse();
    const calls = mockRoutes((c) => {
      if (c.url === `${BASE}/cases`) return jsonResponse({ cases: [caseItem] });
      if (c.url === CASE) return jsonResponse(recordedReadinessSummary());
      if (c.url === `${CASE}/attestations/j5-readiness`) { corrected = true; return jsonResponse({}); }
      if (c.url.endsWith('/j5/draft/review')) {
        if (corrected && failReview) { refreshedReviewRequested = true; return refreshedReview.promise; }
        return jsonResponse(validReview());
      }
      throw new Error(`Unexpected request: ${c.method} ${c.url}`);
    });
    renderCase();
    const editor = await openEditor();
    fireEvent.change(await within(editor).findByLabelText('Workforce Solutions board'), { target: { value: 'Keep this board' } });
    const save = within(editor).getByRole('button', { name: 'Save draft' });
    await waitFor(() => expect(save).toBeEnabled());
    recordReadiness();
    await waitFor(() => expect(refreshedReviewRequested).toBe(true));
    expect(save).toBeDisabled();
    await act(async () => { refreshedReview.resolve(jsonResponse({ code: 'INTERNAL_ERROR', error: 'Review temporarily unavailable.' }, 503)); });
    expect(await within(editor).findByRole('alert')).toHaveTextContent('Review temporarily unavailable.');
    expect(save).toBeDisabled();
    fireEvent.submit(save.closest('form')!);
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
    expect(within(editor).getByLabelText('Workforce Solutions board')).toHaveValue('Keep this board');
    failReview = false;
    fireEvent.click(within(editor).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(save).toBeEnabled());
    expect(calls.filter((c) => c.url.endsWith('/draft/review')).at(-1)?.body).toMatchObject({ boardName: 'Keep this board' });
    expect(within(editor).getByLabelText('Workforce Solutions board')).toHaveValue('Keep this board');
  });

  it('does not let a queued field review cancel an explicit draft reload', async () => {
    let loadCount = 0;
    const reloaded = deferredResponse();
    const calls = mockRoutes((c) => {
      if (c.url === `${BASE}/cases`) return jsonResponse({ cases: [caseItem] });
      if (c.url === CASE) return jsonResponse(recordedReadinessSummary());
      if (c.url.endsWith('/j5/draft/review')) {
        if (Object.keys(c.body as object).length === 0 && ++loadCount === 2) return reloaded.promise;
        return jsonResponse(validReview());
      }
      if (c.method === 'PUT') return jsonResponse({ code: 'DRAFT_CONFLICT', error: 'The draft changed. Reload it first.' }, 409);
      throw new Error(`Unexpected request: ${c.method} ${c.url}`);
    });
    renderCase();
    const editor = await openEditor();
    const save = await within(editor).findByRole('button', { name: 'Save draft' });
    await waitFor(() => expect(calls.filter((c) => c.url.endsWith('/draft/review')).at(-1)?.body).toMatchObject({ boardName: 'Original Board' }));
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    const reload = await within(editor).findByRole('button', { name: 'Reload the draft' });
    fireEvent.change(within(editor).getByLabelText('Workforce Solutions board'), { target: { value: 'Discard on reload' } });
    fireEvent.click(reload);
    await waitFor(() => expect(loadCount).toBe(2));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 400)); });
    expect(calls.filter((c) => c.url.endsWith('/draft/review')).at(-1)?.body).toEqual({});
    expect(save).toBeDisabled();
    // The old fields remain visible while reloading; their cleanup must not cancel it.
    fireEvent.change(within(editor).getByLabelText('Workforce Solutions board'), { target: { value: 'Typed during reload' } });
    const dto = validReview();
    dto.fields.boardName = field('Reloaded Board', 'draft');
    await act(async () => { reloaded.resolve(jsonResponse(dto)); });
    await waitFor(() => expect(within(editor).getByLabelText('Workforce Solutions board')).toHaveValue('Reloaded Board'));
    fireEvent.change(within(editor).getByLabelText('Workforce Solutions board'), { target: { value: 'After reload' } });
    await waitFor(() => expect(save).toBeEnabled());
    expect(calls.filter((c) => c.url.endsWith('/draft/review')).at(-1)?.body).toMatchObject({ boardName: 'After reload' });
  });

  it('retries a failed explicit reload as a load and resumes live review afterward', async () => {
    let loadCount = 0;
    const calls = mockRoutes((c) => {
      if (c.url === `${BASE}/cases`) return jsonResponse({ cases: [caseItem] });
      if (c.url === CASE) return jsonResponse(recordedReadinessSummary());
      if (c.url.endsWith('/j5/draft/review')) {
        if (Object.keys(c.body as object).length === 0) {
          loadCount++;
          if (loadCount === 2) return jsonResponse({ code: 'INTERNAL_ERROR', error: 'Reload temporarily unavailable.' }, 503);
          if (loadCount === 3) {
            const dto = validReview();
            dto.fields.boardName = field('Reloaded Board', 'draft');
            return jsonResponse(dto);
          }
        }
        return jsonResponse(validReview());
      }
      if (c.method === 'PUT') return jsonResponse({ code: 'DRAFT_CONFLICT', error: 'The draft changed. Reload it first.' }, 409);
      throw new Error(`Unexpected request: ${c.method} ${c.url}`);
    });
    renderCase();
    const editor = await openEditor();
    const save = await within(editor).findByRole('button', { name: 'Save draft' });
    await waitFor(() => expect(calls.filter((c) => c.url.endsWith('/draft/review')).at(-1)?.body).toMatchObject({ boardName: 'Original Board' }));
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    fireEvent.click(await within(editor).findByRole('button', { name: 'Reload the draft' }));
    expect(await within(editor).findByRole('alert')).toHaveTextContent('Reload temporarily unavailable.');
    expect(save).toBeDisabled();
    fireEvent.click(within(editor).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(loadCount).toBe(3));
    expect(within(editor).getByLabelText('Workforce Solutions board')).toHaveValue('Reloaded Board');
    fireEvent.change(within(editor).getByLabelText('Workforce Solutions board'), { target: { value: 'After retry' } });
    await waitFor(() => expect(save).toBeEnabled());
    expect(calls.filter((c) => c.url.endsWith('/draft/review')).at(-1)?.body).toMatchObject({ boardName: 'After retry' });
  });

  it('says billing is not enabled yet when the migration gate is closed, and sends nothing else', async () => {
    const message = 'J5/J6 billing is not available in this environment yet (its database migration is not applied).';
    const calls = mockRoutes(() => jsonResponse({ code: 'MIGRATION_NOT_APPLIED', error: message }, 503));
    renderCase();

    expect(await screen.findByRole('heading', { name: 'J5/J6 billing isn’t enabled here yet' })).toBeInTheDocument();
    const j5 = screen.getByRole('button', { name: 'Create J5 Quote / Voucher Request' });
    expect(j5).toBeDisabled();
    expect(j5).toHaveAccessibleDescription(message);
    expect(screen.getByRole('button', { name: 'Create J6 Invoice / Voucher Cover Letter' })).toBeDisabled();
    expect(calls).toEqual([{ method: 'GET', url: `${BASE}/cases`, body: undefined }]);
  });

  it('shows a failed load as a failure with Reload, not as "not enabled"', async () => {
    let fail = true;
    mockRoutes((c) => {
      if (fail) return new Response('<html>502</html>', { status: 502 });
      if (c.url === `${BASE}/cases`) return jsonResponse({ cases: [caseItem] });
      return jsonResponse(emptyCaseSummary());
    });
    renderCase();
    expect(await screen.findByRole('heading', { name: 'The billing case could not be loaded' })).toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(await screen.findByRole('region', { name: 'Release gates' })).toBeInTheDocument();
  });

  it('opens a case for the enrolled program only when asked, then loads its summary', async () => {
    let opened = false;
    const calls = mockRoutes((c) => {
      if (c.url === `${BASE}/cases` && c.method === 'GET') return jsonResponse({ cases: opened ? [caseItem] : [] });
      if (c.url === `${BASE}/cases` && c.method === 'POST') {
        opened = true;
        return jsonResponse({ case: caseItem }, 201);
      }
      if (c.url === CASE) return jsonResponse(emptyCaseSummary());
      return jsonResponse({ code: 'NOT_FOUND', error: 'This item was not found.' }, 404);
    });
    renderCase();

    const open = await screen.findByRole('button', { name: 'Open billing case for Google IT Support Professional Certificate' });
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
    fireEvent.click(open);
    expect(await screen.findByRole('region', { name: 'Release gates' })).toBeInTheDocument();
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([`GET ${BASE}/cases`, `POST ${BASE}/cases`, `GET ${BASE}/cases`, `GET ${CASE}`]);
    expect(calls[1].body).toEqual({ programSlug: 'google-it-support-professional-certificate' });
  });

  it('cannot open a case without an enrolled program', async () => {
    mockRoutes(() => jsonResponse({ cases: [] }));
    renderCase([]);
    expect(await screen.findByText(/no program enrollment on file/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open billing case' })).toBeDisabled();
  });

  it('J5 editor: live review per field, free-text counselor, save only a complete draft, then preview', async () => {
    const saved: DraftSaveDto = { created: true, record: j5Draft(), versionHash: HASH_A, holds: [] };
    let summary = emptyCaseSummary();
    const calls = mockRoutes((c) => {
      if (c.url === `${BASE}/cases`) return jsonResponse({ cases: [caseItem] });
      if (c.url === CASE) return jsonResponse(summary);
      if (c.url === `${CASE}/j5/draft/review`) {
        const b = c.body as { boardName?: string; counselor?: { email?: string; phone?: string } };
        const email = b.counselor?.email ?? 'assigned.counselor@example.test';
        const emailError = email && !email.includes('@') ? { code: 'EMAIL_INVALID' as const, message: 'Enter a valid email address.' } : null;
        const board = b.boardName ?? '';
        const phone = b.counselor?.phone ?? '';
        const dto = reviewDto({
          fields: {
            ...reviewDto().fields,
            boardName: field(board || null, board ? 'draft' : 'none', board ? null : { code: 'FIELD_REQUIRED', message: 'This field is required.' }),
            'counselor.email': field(email, 'draft', emailError),
            'counselor.phone': field(phone || null, phone ? 'draft' : 'none', phone ? null : { code: 'FIELD_REQUIRED', message: 'This field is required.' }),
          },
        });
        dto.complete = Boolean(board && phone && !emailError);
        return jsonResponse(dto);
      }
      if (c.url === `${CASE}/j5/draft` && c.method === 'PUT') {
        summary = j5DraftSummary();
        return jsonResponse(saved, 201);
      }
      return jsonResponse({ code: 'NOT_FOUND', error: 'This item was not found.' }, 404);
    });
    renderCase();

    const editor = await openEditor();
    const counselorName = await within(editor).findByLabelText('Counselor name');
    expect(calls.find((c) => c.url.endsWith('/j5/draft/review'))?.body).toEqual({});
    expect(counselorName).toHaveValue('Assigned Counselor');
    expect(within(editor).getByText(/From the assigned counselor; you can change it/)).toBeInTheDocument();
    const save = within(editor).getByRole('button', { name: 'Save draft' });
    expect(save).toBeDisabled();

    // Any counselor can be entered, and the server checks each field as it changes.
    fireEvent.change(counselorName, { target: { value: 'Custom Counselor' } });
    fireEvent.change(within(editor).getByLabelText('Counselor email'), { target: { value: 'not-an-email' } });
    fireEvent.blur(within(editor).getByLabelText('Counselor email'));
    expect(await within(editor).findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(within(editor).getByLabelText('Counselor email')).toHaveAttribute('aria-invalid', 'true');

    fireEvent.change(within(editor).getByLabelText('Counselor email'), { target: { value: 'custom.counselor@example.test' } });
    fireEvent.change(within(editor).getByLabelText('Counselor phone'), { target: { value: '(512) 555-0199' } });
    fireEvent.change(within(editor).getByLabelText('Workforce Solutions board'), { target: { value: 'Workforce Solutions Synthetic Area' } });
    await waitFor(() => expect(within(editor).getByRole('button', { name: 'Save draft' })).toBeEnabled());
    const lastReview = calls.filter((c) => c.url.endsWith('/j5/draft/review')).at(-1)!;
    expect(lastReview.body).toMatchObject({ boardName: 'Workforce Solutions Synthetic Area', counselor: { name: 'Custom Counselor', email: 'custom.counselor@example.test', phone: '(512) 555-0199' } });

    fireEvent.click(within(editor).getByRole('button', { name: 'Save draft' }));
    const link = await within(editor).findByRole('link', { name: 'Open DRAFT PDF' });
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.url).toBe(`${CASE}/j5/draft`);
    expect(put.body).toEqual({
      boardName: 'Workforce Solutions Synthetic Area',
      student: { name: 'Sam Student', email: 'sam.student@example.test' },
      counselor: { name: 'Custom Counselor', email: 'custom.counselor@example.test', phone: '(512) 555-0199' },
      expectedVersionHash: null,
    });
    expect(link).toHaveAttribute('href', `${CASE}/j5/draft/preview?recordId=${j5Draft().recordId}&versionHash=${HASH_A}`);
    // The summary is reloaded after the save.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit J5 Quote / Voucher Request draft' })).toBeInTheDocument());
  });

  it('J5 editor: shows the fields of a 422 DRAFT_INCOMPLETE and saves nothing locally', async () => {
    mockRoutes((c) => {
      if (c.url === `${BASE}/cases`) return jsonResponse({ cases: [caseItem] });
      if (c.url === CASE) return jsonResponse(emptyCaseSummary());
      if (c.url.endsWith('/j5/draft/review')) return jsonResponse(reviewDto({ complete: true, fields: { ...reviewDto().fields, boardName: field('Board', 'draft'), 'counselor.phone': field('555', 'draft') } }));
      if (c.method === 'PUT')
        return jsonResponse(
          {
            code: 'DRAFT_INCOMPLETE',
            error: 'Complete the highlighted fields and the steps listed before saving this draft. Nothing was saved.',
            fields: { 'counselor.phone': { code: 'TEXT_NOT_PRINTABLE', message: 'The counselor phone contains characters the document cannot print.' } },
            blockers: [{ code: 'J5_READINESS_MISSING', message: 'Record the J5 readiness attestation (with the confirmed class start date) first.', hardHold: false }],
          },
          422,
        );
      return jsonResponse({ code: 'NOT_FOUND', error: 'x' }, 404);
    });
    renderCase();
    const editor = await openEditor();
    await waitFor(() => expect(within(editor).getByRole('button', { name: 'Save draft' })).toBeEnabled());
    fireEvent.click(within(editor).getByRole('button', { name: 'Save draft' }));
    expect(await within(editor).findByText('The counselor phone contains characters the document cannot print.')).toBeInTheDocument();
    expect(within(editor).getByRole('alert')).toHaveTextContent('Nothing was saved.');
    expect(within(editor).getAllByText(/Record the J5 readiness attestation/).length).toBeGreaterThan(0);
    expect(within(editor).queryByRole('link', { name: 'Open DRAFT PDF' })).toBeNull();
  });

  it('J6 editor: finance and board are free text, and an empty counselor starts from the J5', async () => {
    const summary = j5DraftSummary();
    const calls = mockRoutes((c) => {
      if (c.url === `${BASE}/cases`) return jsonResponse({ cases: [caseItem] });
      if (c.url === CASE) return jsonResponse(summary);
      if (c.url.endsWith('/j6/draft/review'))
        return jsonResponse(
          reviewDto({
            stage: 'j6',
            fields: {
              ...reviewDto().fields,
              'counselor.name': field(null, 'none'),
              'counselor.email': field(null, 'none'),
              'finance.name': field(null, 'none'),
              'finance.email': field(null, 'none'),
              boardInvoiceArtifactId: field(null, 'none'),
            },
          }),
        );
      return jsonResponse({ code: 'NOT_FOUND', error: 'x' }, 404);
    });
    renderCase();
    const editor = await openEditor('j6');
    expect(await within(editor).findByLabelText('Counselor name')).toHaveValue('Casey Counselor');
    expect(within(editor).getByLabelText('Counselor phone')).toHaveValue('(512) 555-0100');
    expect(within(editor).getAllByText(/Started from the J5 quote; you can change it/)).toHaveLength(3);
    fireEvent.change(within(editor).getByLabelText('Board finance contact name'), { target: { value: 'Finance Person' } });
    fireEvent.change(within(editor).getByLabelText('Board finance contact email'), { target: { value: 'finance.person@example.test' } });
    await waitFor(() =>
      expect(calls.filter((c) => c.url.endsWith('/j6/draft/review')).at(-1)?.body).toMatchObject({
        counselor: { name: 'Casey Counselor', phone: '(512) 555-0100' },
        finance: { name: 'Finance Person', email: 'finance.person@example.test' },
        boardInvoiceArtifactId: null,
      }),
    );
  });
});
