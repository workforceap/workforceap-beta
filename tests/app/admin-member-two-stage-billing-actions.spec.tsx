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
  SIGNATURE_STATEMENT,
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

  it('shows the signature upload step only to the designated signer while the server reports it missing', async () => {
    const withBlocker = (viewer: CaseSummaryDto['viewer']) => {
      const summary = j5DraftSummary({ viewer });
      summary.j5 = {
        ...summary.j5,
        blockers: [...summary.j5.blockers, { code: 'SIGNATURE_ASSET_MISSING' as const, message: 'Upload your signature image before signing.', hardHold: false }],
      };
      return summary;
    };
    mockCase(() => withBlocker({ isExecutiveSigner: true, isDesignatedSigner: true }));
    const { unmount } = renderCase();
    await screen.findByRole('region', { name: 'Release gates' });
    const slot = within(lifecycle('J5')).getByRole('group', { name: 'Your signature' });
    expect(within(slot).getByText('Upload your signature image before signing.')).toBeInTheDocument();
    expect(within(slot).getByRole('button', { name: 'Upload your signature (PNG)' })).toHaveAccessibleDescription('Choose your signature image (a PNG).');
    unmount();
    vi.unstubAllGlobals();

    mockCase(() => withBlocker({ isExecutiveSigner: false, isDesignatedSigner: false }));
    renderCase();
    await screen.findByRole('region', { name: 'Release gates' });
    expect(within(lifecycle('J5')).queryByRole('group', { name: 'Your signature' })).toBeNull();
    // Staff still see why signing waits.
    expect(within(screen.getByRole('region', { name: 'Quote / Voucher Request' })).getByText('Upload your signature image before signing.')).toBeInTheDocument();
  });
});


describe('two-stage billing: the designated signer approves his signature image', () => {
  const missingBlocker = { code: 'SIGNATURE_ASSET_MISSING' as const, message: 'Upload your signature image before signing.', hardHold: false };
  const designated: CaseSummaryDto['viewer'] = { isExecutiveSigner: true, isDesignatedSigner: true };
  const activeSignature = {
    id: 'sig-1',
    sha256: 'a'.repeat(64),
    widthPx: 360,
    heightPx: 90,
    byteLength: 1234,
    uploadedAt: '2026-09-29T17:00:00.000Z',
    approvedAt: '2026-09-29T17:00:00.000Z',
  };
  const withoutImage = () => {
    const summary = j5DraftSummary({ viewer: designated, signature: { active: null, approvalStatement: SIGNATURE_STATEMENT, viewerCanUpload: true } });
    summary.j5 = { ...summary.j5, blockers: [...summary.j5.blockers, missingBlocker] };
    return summary;
  };
  const withImage = () => j5DraftSummary({ viewer: designated, signature: { active: activeSignature, approvalStatement: SIGNATURE_STATEMENT, viewerCanUpload: true } });
  const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'my-signature.png', { type: 'image/png' });

  it('uploads only after he picks a PNG and confirms the exact statement, sending the file and that statement', async () => {
    let summary = withoutImage();
    const calls = mockCase(
      () => summary,
      (call) => {
        if (call.method === 'POST' && call.url === `${BASE}/signature`) {
          summary = withImage();
          return jsonResponse({ signature: activeSignature, replaced: null }, 201);
        }
        return undefined;
      },
    );
    renderCase();
    await screen.findByRole('region', { name: 'Release gates' });
    const slot = within(lifecycle('J5')).getByRole('group', { name: 'Your signature' });
    const upload = within(slot).getByRole('button', { name: 'Upload your signature (PNG)' });
    // The statement he confirms is the server's, word for word.
    expect(within(slot).getByText(SIGNATURE_STATEMENT)).toBeInTheDocument();
    expect(upload).toBeDisabled();

    fireEvent.change(within(slot).getByLabelText('Signature image (PNG)'), { target: { files: [png()] } });
    expect(upload).toHaveAccessibleDescription('Confirm the statement first.');
    fireEvent.click(within(slot).getByLabelText('I make this statement.'));
    expect(upload).toBeEnabled();
    fireEvent.click(upload);

    await waitFor(() => expect(calls.some((c) => c.url === `${BASE}/signature`)).toBe(true));
    const sent = calls.find((c) => c.url === `${BASE}/signature`)!;
    expect(sent.method).toBe('POST');
    const form = sent.body as FormData;
    expect((form.get('file') as File).name).toBe('my-signature.png');
    expect(JSON.parse(String(form.get('attestation')))).toEqual({ statementConfirmed: true, statementText: SIGNATURE_STATEMENT });

    // The case reloads: the missing-image slot gives way to the approved image.
    await waitFor(() => expect(within(lifecycle('J5')).getByText(/Approved 2026-09-29/u)).toBeInTheDocument());
    expect(within(lifecycle('J5')).queryByRole('button', { name: 'Upload your signature (PNG)' })).toBeNull();
  });

  it('shows the server’s own refusal and leaves the form as it was', async () => {
    mockCase(
      () => withoutImage(),
      (call) => (call.url === `${BASE}/signature` ? jsonResponse({ code: 'SIGNATURE_IMAGE_INVALID', error: 'Upload the signature as a PNG image.' }, 422) : undefined),
    );
    renderCase();
    await screen.findByRole('region', { name: 'Release gates' });
    const slot = within(lifecycle('J5')).getByRole('group', { name: 'Your signature' });
    fireEvent.change(within(slot).getByLabelText('Signature image (PNG)'), { target: { files: [png()] } });
    fireEvent.click(within(slot).getByLabelText('I make this statement.'));
    fireEvent.click(within(slot).getByRole('button', { name: 'Upload your signature (PNG)' }));
    expect(await within(slot).findByRole('alert')).toHaveTextContent('Upload the signature as a PNG image.');
  });

  it('replacing an approved image needs a reason and sends the replacement flag', async () => {
    const calls = mockCase(
      () => withImage(),
      (call) => (call.url === `${BASE}/signature` ? jsonResponse({ signature: { ...activeSignature, id: 'sig-2' }, replaced: activeSignature }, 201) : undefined),
    );
    renderCase();
    await screen.findByRole('region', { name: 'Release gates' });
    const slot = within(lifecycle('J5')).getByRole('group', { name: 'Your signature' });
    expect(within(slot).getByText(/Approved 2026-09-29/u)).toBeInTheDocument();
    const replace = within(slot).getByRole('button', { name: 'Replace my signature image' });
    fireEvent.change(within(slot).getByLabelText('New signature image (PNG)'), { target: { files: [png()] } });
    fireEvent.click(within(slot).getByLabelText('I make this statement.'));
    expect(replace).toHaveAccessibleDescription('Say why you are replacing your signature image.');
    fireEvent.change(within(slot).getByLabelText('Why are you replacing it?'), { target: { value: '  Cleaner scan  ' } });
    expect(replace).toBeEnabled();
    fireEvent.click(replace);

    await waitFor(() => expect(calls.some((c) => c.url === `${BASE}/signature`)).toBe(true));
    const form = calls.find((c) => c.url === `${BASE}/signature`)!.body as FormData;
    expect(JSON.parse(String(form.get('attestation')))).toEqual({ statementConfirmed: true, statementText: SIGNATURE_STATEMENT, replace: true, revokeReason: 'Cleaner scan' });
  });

  it('renders one upload form per case, not one per stage, and none for staff', async () => {
    const bothMissing = (viewer: CaseSummaryDto['viewer']) => {
      const summary = withoutImage();
      summary.viewer = viewer;
      summary.j6 = { ...summary.j6, blockers: [...summary.j6.blockers, missingBlocker] };
      return summary;
    };
    mockCase(() => bothMissing(designated));
    let view = renderCase();
    await screen.findByRole('region', { name: 'Release gates' });
    expect(screen.getAllByRole('group', { name: 'Your signature' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Upload your signature (PNG)' })).toHaveLength(1);
    expect(within(lifecycle('J5')).getByRole('group', { name: 'Your signature' })).toBeInTheDocument();
    expect(within(lifecycle('J6')).queryByRole('group', { name: 'Your signature' })).toBeNull();
    view.unmount();
    vi.unstubAllGlobals();

    // An approved image is shown (with its replace form) once too.
    mockCase(() => withImage());
    view = renderCase();
    await screen.findByRole('region', { name: 'Release gates' });
    expect(screen.getAllByRole('group', { name: 'Your signature' })).toHaveLength(1);
    view.unmount();
    vi.unstubAllGlobals();

    mockCase(() => bothMissing({ isExecutiveSigner: false, isDesignatedSigner: false }));
    renderCase();
    await screen.findByRole('region', { name: 'Release gates' });
    expect(screen.queryAllByRole('group', { name: 'Your signature' })).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: 'Upload your signature (PNG)' })).toHaveLength(0);
  });

  it('staff other than the designated signer never see the upload or replace controls', async () => {
    mockCase(() => j5DraftSummary({ signature: { active: activeSignature, approvalStatement: SIGNATURE_STATEMENT, viewerCanUpload: false } }));
    renderCase();
    await screen.findByRole('region', { name: 'Release gates' });
    expect(within(lifecycle('J5')).queryByRole('group', { name: 'Your signature' })).toBeNull();
    expect(screen.queryByRole('button', { name: /signature image|Upload your signature/u })).toBeNull();
  });
});
