import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import TwoStageBillingCase from '@/app/admin/members/[id]/billing/TwoStageBillingCase';
import type { CaseSummaryDto, FreezeDto } from '@/lib/billing/twoStage/dto';
import {
  CASE_ID,
  GATE_TEXT,
  HASH_A,
  J5_RECORD_ID,
  MEMBER_ID,
  VOUCHER_ID,
  VOUCHER_SHA,
  emptyCaseSummary,
  j5Draft,
  j5DraftSummary,
  jsonResponse,
  openGates,
  signerTasks,
  waitingOnMichaelSummary,
} from '../fixtures/billing/twoStageSummary';

/**
 * Freeze / sign / send / voucher / Michael's steps against mocked M3 routes.
 * A click only sends the request; the server's answer is what shows.
 */

type Call = { method: string; url: string; body: unknown };
const BASE = `/api/admin/members/${MEMBER_ID}/billing/two-stage`;
const CASE = `${BASE}/cases/${CASE_ID}`;
const caseItem = { id: CASE_ID, programSlug: 'google-it-support-professional-certificate', className: 'Google IT Support Professional Certificate', createdAt: '2026-09-28T14:00:00.000Z', progress: emptyCaseSummary().progress };

function mockCase(summary: () => CaseSummaryDto, routes: (call: Call) => Response | undefined = () => undefined) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
      const call = { method, url, body };
      calls.push(call);
      if (url === `${BASE}/cases` && method === 'GET') return jsonResponse({ cases: [caseItem] });
      if (url === CASE && method === 'GET') return jsonResponse(summary());
      return routes(call) ?? jsonResponse({ code: 'NOT_FOUND', error: 'This item was not found.' }, 404);
    }),
  );
  return calls;
}

function renderCase() {
  return render(
    <TwoStageBillingCase
      memberId={MEMBER_ID}
      memberName="Sam Student"
      memberEmail="sam.student@example.test"
      counselor={null}
      enrolledPrograms={[{ slug: 'google-it-support-professional-certificate', title: 'Google IT Support Professional Certificate' }]}
    />,
  );
}

const lifecycle = (stage: 'J5' | 'J6') => screen.getByRole('group', { name: `${stage} signing and delivery` });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('two-stage billing actions', () => {
  it('sign and send are disabled with the closed gate’s own message', async () => {
    mockCase(() => j5DraftSummary());
    renderCase();
    await screen.findByRole('region', { name: 'Release gates' });
    const group = lifecycle('J5');
    const sign = within(group).getByRole('button', { name: 'Sign J5' });
    const send = within(group).getByRole('button', { name: 'Send J5' });
    expect(sign).toBeDisabled();
    expect(sign).toHaveAccessibleDescription(GATE_TEXT.signing);
    expect(send).toBeDisabled();
    expect(send).toHaveAccessibleDescription(GATE_TEXT.email);
    // The checkpoint writes nothing and stays available.
    expect(within(group).getByRole('button', { name: 'Review for signature' })).toBeEnabled();
  });

  it('freeze then sign: the frozen versionHash is sent as contentSha256 with the exact intent text', async () => {
    const summary = j5DraftSummary({ gates: openGates(), viewer: { isExecutiveSigner: true, isDesignatedSigner: true } });
    summary.j5 = { ...summary.j5, canSign: true, blockers: [] };
    const frozen: FreezeDto = {
      recordId: J5_RECORD_ID,
      version: 1,
      versionHash: HASH_A,
      documentTitle: 'Quote / Voucher Request',
      documentNumber: 'WAP-Q-2026-0001',
      intentText: 'I, Michael A. Brown, PMP, ChE, sign Quote / Voucher Request WAP-Q-2026-0001 (sha256 aaaaaaaaaaaa).',
      previewPath: `${CASE}/j5/draft/preview?recordId=${J5_RECORD_ID}&versionHash=${HASH_A}`,
      holds: [],
    };
    const calls = mockCase(
      () => summary,
      (c) => {
        if (c.url === `${CASE}/j5/freeze`) return jsonResponse(frozen);
        if (c.url === `${CASE}/j5/sign`) return jsonResponse({ code: 'SIGNED_RENDERER_UNAVAILABLE', error: GATE_TEXT.signedRenderer }, 503);
        return undefined;
      },
    );
    renderCase();
    await screen.findByRole('region', { name: 'Release gates' });
    const group = lifecycle('J5');
    expect(within(group).getByRole('button', { name: 'Sign J5' })).toHaveAccessibleDescription('Review this exact version for signature first.');
    fireEvent.click(within(group).getByRole('button', { name: 'Review for signature' }));
    expect(await within(group).findByText(frozen.intentText)).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith('/freeze'))?.body).toEqual({ recordId: J5_RECORD_ID, versionHash: HASH_A });
    expect(within(group).getByRole('button', { name: 'Sign J5' })).toBeDisabled();
    fireEvent.click(within(group).getByLabelText('I have reviewed this exact version and make this statement.'));
    fireEvent.click(within(group).getByRole('button', { name: 'Sign J5' }));
    // The server still decides: its refusal is shown as-is.
    expect(await within(group).findByText(GATE_TEXT.signedRenderer)).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith('/sign'))?.body).toEqual({
      recordId: J5_RECORD_ID,
      version: 1,
      contentSha256: HASH_A,
      intentConfirmed: true,
      intentText: frozen.intentText,
    });
  });

  it('send posts the signed version and shows each role’s outcome', async () => {
    const summary = j5DraftSummary({ gates: openGates() });
    summary.j5 = { ...summary.j5, current: j5Draft({ status: 'signed' }), canSend: true, blockers: [] };
    const calls = mockCase(
      () => summary,
      (c) =>
        c.url === `${CASE}/j5/send`
          ? jsonResponse({
              recordId: J5_RECORD_ID,
              stageStatus: 'signed',
              complete: false,
              sentAt: null,
              payment: null,
              roles: [
                { role: 'counselor', name: 'Casey Counselor', email: 'casey.counselor@example.test', outcome: 'ACCEPTED', sendId: 's1', attemptNo: 1, status: 'provider_accepted', providerMessageId: 'm1', message: 'Sent to counselor.' },
                { role: 'student', name: 'Sam Student', email: 'sam.student@example.test', outcome: 'AMBIGUOUS', sendId: 's2', attemptNo: 1, status: 'ambiguous', providerMessageId: null, message: 'The student copy may or may not have been sent.' },
              ],
            })
          : undefined,
    );
    renderCase();
    await screen.findByRole('region', { name: 'Release gates' });
    fireEvent.click(within(lifecycle('J5')).getByRole('button', { name: 'Send J5' }));
    expect(await screen.findByText('The student copy may or may not have been sent.')).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith('/send'))?.body).toEqual({ recordId: J5_RECORD_ID, versionHash: HASH_A });
  });

  it('voucher upload sends the file and shows the PDF-only refusal', async () => {
    const calls = mockCase(
      () => j5DraftSummary(),
      (c) => (c.url === `${CASE}/voucher` ? jsonResponse({ code: 'VOUCHER_PDF_ONLY', error: 'Upload the signed voucher as a PDF.', field: 'file' }, 415) : undefined),
    );
    renderCase();
    await screen.findByRole('region', { name: 'Release gates' });
    const input = screen.getByLabelText('Voucher PDF');
    const upload = screen.getByRole('button', { name: 'Upload voucher' });
    expect(upload).toHaveAccessibleDescription('Choose the board-signed voucher PDF first.');
    fireEvent.change(input, { target: { files: [new File(['not a pdf'], 'voucher.jpg', { type: 'image/jpeg' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload voucher' }));
    expect(await screen.findByText('Upload the signed voucher as a PDF.')).toBeInTheDocument();
    const post = calls.find((c) => c.url === `${CASE}/voucher`)!;
    expect(post.method).toBe('POST');
    expect((post.body as FormData).get('file')).toBeInstanceOf(File);
  });

  it('Michael records the voucher data with the M3 body', async () => {
    const summary = waitingOnMichaelSummary(true);
    summary.gates = openGates();
    const calls = mockCase(
      () => summary,
      (c) => (c.url === `${CASE}/voucher/${VOUCHER_ID}/attestation` ? jsonResponse({ artifact: summary.j6.voucher!.artifact, attestation: null, current: true, receiptAttestation: null, matches: null, holds: [], waitingOnDesignatedSigner: [] }, 201) : undefined),
    );
    renderCase();
    const tasks = await screen.findByLabelText('Waiting on Michael A. Brown');
    fireEvent.change(within(tasks).getByLabelText('Board name'), { target: { value: 'Workforce Solutions Synthetic Area' } });
    fireEvent.change(within(tasks).getByLabelText('Voucher / PO reference'), { target: { value: 'SYN-V-0001' } });
    fireEvent.change(within(tasks).getByLabelText('Date received'), { target: { value: '2026-09-28' } });
    fireEvent.change(within(tasks).getByLabelText('Authorized amount (USD)'), { target: { value: '7,500.00' } });
    fireEvent.change(within(tasks).getByLabelText('Authorized period start'), { target: { value: '2026-10-05' } });
    fireEvent.change(within(tasks).getByLabelText('Authorized period end'), { target: { value: '2027-03-05' } });
    fireEvent.change(within(tasks).getByLabelText('Evidence reference'), { target: { value: 'SYN-EVIDENCE-2' } });
    fireEvent.click(within(tasks).getByLabelText('The board’s signed voucher shows a receiving signature.'));
    fireEvent.click(within(tasks).getByLabelText('I confirm these voucher details match the uploaded file.'));
    fireEvent.click(within(tasks).getByRole('button', { name: 'Record voucher details' }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/attestation'))).toBe(true));
    expect(calls.find((c) => c.url.endsWith('/attestation'))?.body).toEqual({
      boardName: 'Workforce Solutions Synthetic Area',
      voucherReference: 'SYN-V-0001',
      receivedOn: '2026-09-28',
      authorizedAmountCents: 750000,
      authorizedProgramSlug: 'google-it-support-professional-certificate',
      authorizedClassName: 'Google IT Support Professional Certificate',
      authorizedStartDate: '2026-10-05',
      authorizedEndDate: '2027-03-05',
      receivingSignaturePresent: true,
      evidenceReference: 'SYN-EVIDENCE-2',
      confirmed: true,
    });
  });

  it('Michael attests his receiving signature on the exact hash with the server’s statement', async () => {
    const summary = waitingOnMichaelSummary(true);
    summary.gates = openGates();
    summary.waitingOnDesignatedSigner = [{ ...signerTasks(true)[1], ready: true }];
    const statementText = 'I, Michael A. Brown, PMP, ChE, confirm that my receiving signature is on board voucher SYN-V-0001 exactly as uploaded (sha256 c0ffee000000).';
    const calls = mockCase(
      () => summary,
      (c) => {
        if (c.url === `${CASE}/voucher/${VOUCHER_ID}/receipt-attestation` && c.method === 'GET') return jsonResponse({ artifactId: VOUCHER_ID, sha256: VOUCHER_SHA, statementText });
        if (c.url === `${CASE}/voucher/${VOUCHER_ID}/receipt-attestation` && c.method === 'POST') return jsonResponse({ code: 'SIGNER_NOT_CONFIGURED', error: GATE_TEXT.signing }, 503);
        return undefined;
      },
    );
    renderCase();
    const tasks = await screen.findByLabelText('Waiting on Michael A. Brown');
    fireEvent.click(within(tasks).getByRole('button', { name: 'Review the receiving-signature statement' }));
    expect(await within(tasks).findByText(statementText)).toBeInTheDocument();
    const attest = within(tasks).getByRole('button', { name: 'Attest my receiving signature' });
    expect(attest).toHaveAccessibleDescription('Confirm the statement first.');
    fireEvent.click(within(tasks).getByLabelText('This statement is true.'));
    fireEvent.click(within(tasks).getByRole('button', { name: 'Attest my receiving signature' }));
    expect(await within(tasks).findByText(GATE_TEXT.signing)).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/receipt-attestation'))?.body).toEqual({
      expectedSha256: VOUCHER_SHA,
      method: 'present_on_original',
      statementConfirmed: true,
      statementText,
    });
  });

  it('staff viewing a waiting case get no Michael actions at all', async () => {
    mockCase(() => waitingOnMichaelSummary(false));
    renderCase();
    const tasks = await screen.findByLabelText('Waiting on Michael A. Brown');
    expect(within(tasks).queryByRole('button')).toBeNull();
    expect(within(tasks).queryByRole('textbox')).toBeNull();
  });
});
