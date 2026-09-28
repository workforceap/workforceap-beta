/**
 * Browser calls to the two-stage J5/J6 routes (docs/BILLING-PACKETS.md,
 * "Two-stage API contract (M3)"). Every request and response body is typed
 * from `lib/billing/twoStage/dto.ts`; nothing here decides whether an action
 * is allowed. A click only sends the request: the server re-runs every check
 * and its answer (or its error body) is what the page shows.
 */
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import type {
  ApiErrorBody,
  AttestationDto,
  BillingStage,
  CancelSendDto,
  CancelSendRequest,
  CaseSummaryDto,
  ClassStartedDto,
  ClassStartedRequest,
  CloseDto,
  CloseRequest,
  DraftPatch,
  DraftReviewDto,
  DraftSaveDto,
  DraftSaveRequest,
  FreezeDto,
  FreezeRequest,
  J5ReadinessRequest,
  ListCasesDto,
  OpenCaseDto,
  OpenCaseRequest,
  PaymentDto,
  PaymentReceivedRequest,
  ReconcileDto,
  ReconcileRequest,
  SendDto,
  SendRequest,
  SignDto,
  SignRequestDto,
  VoucherAttestationPart,
  VoucherReceiptAttestationDto,
  VoucherReceiptAttestationRequest,
  VoucherReceiptStatementDto,
  VoucherUploadDto,
} from '@/lib/billing/twoStage/dto';

export type ApiFailure = {
  ok: false;
  /** HTTP status, or 0 when no response arrived (network failure or timeout). */
  status: number;
  /** The route's error envelope, when the response carried one. */
  body: ApiErrorBody | null;
  /** The sentence to show: the server's own `error`, or honest client copy. */
  message: string;
  /** A mutation whose result is not known (no response, a non-JSON 5xx, OUTCOME_UNCERTAIN, `outcomeUncertain`). */
  uncertain: boolean;
};
export type ApiResult<T> = { ok: true; status: number; data: T } | ApiFailure;

const DEFAULT_TIMEOUT_MS = 30_000;
/** The send route may take up to its 60 s maxDuration. */
const SEND_TIMEOUT_MS = 65_000;

export const READ_UNREACHABLE_MESSAGE = 'The billing service could not be reached. Reload to try again.';
export const MUTATION_UNKNOWN_MESSAGE =
  'The request did not finish, so its result is not known. Reload the case and check its status before trying again.';

function isErrorBody(value: unknown): value is ApiErrorBody {
  const v = value as { code?: unknown; error?: unknown } | null;
  return Boolean(v && typeof v === 'object' && typeof v.code === 'string' && typeof v.error === 'string');
}

type RequestOptions = { method?: 'GET' | 'POST' | 'PUT'; json?: unknown; form?: FormData; timeoutMs?: number; signal?: AbortSignal };

async function request<T>(path: string, opts: RequestOptions = {}): Promise<ApiResult<T>> {
  const method = opts.method ?? 'GET';
  const mutation = method !== 'GET';
  const init: RequestInit = { method, credentials: 'same-origin', cache: 'no-store', signal: opts.signal };
  if (opts.json !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(opts.json);
  } else if (opts.form) {
    init.body = opts.form; // the browser sets the multipart boundary
  }
  let res: Response;
  try {
    res = await fetchWithTimeout(path, init, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  } catch (error) {
    if (opts.signal?.aborted) throw error; // a cancelled read is not a failure to show
    return { ok: false, status: 0, body: null, message: mutation ? MUTATION_UNKNOWN_MESSAGE : READ_UNREACHABLE_MESSAGE, uncertain: mutation };
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  if (res.ok) {
    if (parsed === null) {
      return { ok: false, status: res.status, body: null, message: mutation ? MUTATION_UNKNOWN_MESSAGE : READ_UNREACHABLE_MESSAGE, uncertain: mutation };
    }
    return { ok: true, status: res.status, data: parsed as T };
  }
  if (isErrorBody(parsed)) {
    const uncertain = parsed.code === 'OUTCOME_UNCERTAIN' || parsed.outcomeUncertain === true;
    return { ok: false, status: res.status, body: parsed, message: parsed.error, uncertain };
  }
  // A platform error page or an empty body: say only what is known.
  const uncertain = mutation && res.status >= 500;
  return {
    ok: false,
    status: res.status,
    body: null,
    message: uncertain ? MUTATION_UNKNOWN_MESSAGE : `The billing service answered with an unexpected error (${res.status}). Reload to try again.`,
    uncertain,
  };
}

export function twoStageBase(memberId: string): string {
  return `/api/admin/members/${encodeURIComponent(memberId)}/billing/two-stage`;
}

function caseBase(memberId: string, caseId: string): string {
  return `${twoStageBase(memberId)}/cases/${encodeURIComponent(caseId)}`;
}

/** The DRAFT PDF of one exact saved version (GET, never archived). */
export function draftPreviewPath(memberId: string, caseId: string, stage: BillingStage, recordId: string, versionHash: string): string {
  const q = new URLSearchParams({ recordId, versionHash });
  return `${caseBase(memberId, caseId)}/${stage}/draft/preview?${q.toString()}`;
}

function pdfForm(file: File): FormData {
  const form = new FormData();
  form.append('file', file, file.name);
  return form;
}

export const twoStageApi = {
  listCases: (memberId: string, signal?: AbortSignal) => request<ListCasesDto>(`${twoStageBase(memberId)}/cases`, { signal }),
  openCase: (memberId: string, body: OpenCaseRequest) => request<OpenCaseDto>(`${twoStageBase(memberId)}/cases`, { method: 'POST', json: body }),
  getCase: (memberId: string, caseId: string, signal?: AbortSignal) => request<CaseSummaryDto>(caseBase(memberId, caseId), { signal }),

  attestJ5Readiness: (memberId: string, caseId: string, body: J5ReadinessRequest) =>
    request<AttestationDto>(`${caseBase(memberId, caseId)}/attestations/j5-readiness`, { method: 'POST', json: body }),
  attestClassStarted: (memberId: string, caseId: string, body: ClassStartedRequest) =>
    request<ClassStartedDto>(`${caseBase(memberId, caseId)}/attestations/class-started`, { method: 'POST', json: body }),

  reviewDraft: <S extends BillingStage>(memberId: string, caseId: string, stage: S, body: DraftPatch<S>, signal?: AbortSignal) =>
    request<DraftReviewDto>(`${caseBase(memberId, caseId)}/${stage}/draft/review`, { method: 'POST', json: body, signal }),
  saveDraft: <S extends BillingStage>(memberId: string, caseId: string, stage: S, body: DraftSaveRequest<S>) =>
    request<DraftSaveDto>(`${caseBase(memberId, caseId)}/${stage}/draft`, { method: 'PUT', json: body }),

  uploadVoucher: (memberId: string, caseId: string, file: File) =>
    request<VoucherUploadDto>(`${caseBase(memberId, caseId)}/voucher`, { method: 'POST', form: pdfForm(file) }),
  attestVoucherData: (memberId: string, caseId: string, artifactId: string, body: VoucherAttestationPart) =>
    request<Omit<VoucherUploadDto, 'reused'>>(`${caseBase(memberId, caseId)}/voucher/${encodeURIComponent(artifactId)}/attestation`, { method: 'POST', json: body }),
  receiptStatement: (memberId: string, caseId: string, artifactId: string) =>
    request<VoucherReceiptStatementDto>(`${caseBase(memberId, caseId)}/voucher/${encodeURIComponent(artifactId)}/receipt-attestation`),
  attestReceipt: (memberId: string, caseId: string, artifactId: string, body: VoucherReceiptAttestationRequest) =>
    request<VoucherReceiptAttestationDto>(`${caseBase(memberId, caseId)}/voucher/${encodeURIComponent(artifactId)}/receipt-attestation`, { method: 'POST', json: body }),

  freeze: (memberId: string, caseId: string, stage: BillingStage, body: FreezeRequest) =>
    request<FreezeDto>(`${caseBase(memberId, caseId)}/${stage}/freeze`, { method: 'POST', json: body }),
  sign: (memberId: string, caseId: string, stage: BillingStage, body: SignRequestDto) =>
    request<SignDto>(`${caseBase(memberId, caseId)}/${stage}/sign`, { method: 'POST', json: body }),
  send: (memberId: string, caseId: string, stage: BillingStage, body: SendRequest) =>
    request<SendDto>(`${caseBase(memberId, caseId)}/${stage}/send`, { method: 'POST', json: body, timeoutMs: SEND_TIMEOUT_MS }),
  reconcile: (memberId: string, caseId: string, stage: BillingStage, sendId: string, body: ReconcileRequest) =>
    request<ReconcileDto>(`${caseBase(memberId, caseId)}/${stage}/sends/${encodeURIComponent(sendId)}/reconcile`, { method: 'POST', json: body }),
  close: (memberId: string, caseId: string, stage: BillingStage, recordId: string, body: CloseRequest) =>
    request<CloseDto>(`${caseBase(memberId, caseId)}/${stage}/versions/${encodeURIComponent(recordId)}/close`, { method: 'POST', json: body }),
  cancelSend: (memberId: string, caseId: string, stage: BillingStage, recordId: string, body: CancelSendRequest) =>
    request<CancelSendDto>(`${caseBase(memberId, caseId)}/${stage}/versions/${encodeURIComponent(recordId)}/cancel-send`, { method: 'POST', json: body }),
  paymentReceived: (memberId: string, caseId: string, body: PaymentReceivedRequest) =>
    request<PaymentDto>(`${caseBase(memberId, caseId)}/payment/received`, { method: 'POST', json: body }),
};
