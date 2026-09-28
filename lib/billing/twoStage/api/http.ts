import 'server-only';

/**
 * HTTP plumbing shared by the two-stage J5/J6 routes: the error envelope,
 * response headers, the same-origin mutation check and bounded body readers
 * that refuse an oversized request before buffering it.
 */
import type { ApiErrorBody, Blocker, DraftField, DraftFieldError, ErrorCode, HoldReason } from '../dto';

export const NO_STORE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
});

/** JSON bodies: 64 KiB. */
export const MAX_JSON_BYTES = 64 * 1024;
/**
 * Multipart uploads: 4 MiB for the whole request, safely under Vercel's
 * ~4.5 MB request body limit, so the route (not the platform) refuses it
 * with a clear code. The file part gets the rest after a 64 KiB allowance for
 * the multipart framing and the attestation part.
 */
export const MAX_MULTIPART_BYTES = 4 * 1024 * 1024;
export const MAX_UPLOAD_FILE_BYTES = MAX_MULTIPART_BYTES - 64 * 1024;

export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody;
  constructor(status: number, code: ErrorCode, message: string, extra: Omit<ApiErrorBody, 'code' | 'error'> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = { code, error: message, ...extra };
  }
}

export function json<T>(body: T, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...NO_STORE_HEADERS, ...headers },
  });
}

export function errorResponse(error: ApiError): Response {
  return json(error.body, error.status);
}

export function apiError(
  status: number,
  code: ErrorCode,
  message: string,
  extra: { blockers?: Blocker[]; holds?: HoldReason[]; field?: string; fields?: Partial<Record<DraftField, DraftFieldError>> } = {},
): ApiError {
  return new ApiError(status, code, message, extra);
}

export const INTERNAL_ERROR_MESSAGE = 'Something went wrong before anything was changed. Reload and try again.';
export const OUTCOME_UNCERTAIN_MESSAGE =
  'Something went wrong and the result is not known. Reload the case and check its status; a copy may already have been signed, stored or sent and must be reconciled before you try again.';

/**
 * Tracks whether a request may already have caused a side effect (storage
 * write, provider call, database write). An unexpected error before the first
 * mark is INTERNAL_ERROR ("before anything was changed"); after it, the only
 * honest answer is OUTCOME_UNCERTAIN.
 */
export class SideEffects {
  private started = false;
  private kept = false;
  /** A side effect may start now (call before the storage write, provider call or first database write). */
  mark(): void {
    this.started = true;
  }
  /**
   * Something outside any still-open transaction has been stored or sent (a
   * storage write returned, a provider call was made, a statement or
   * transaction committed). A later billing-rule refusal rolls back only its
   * own transaction, so after this the request is no longer a clean refusal.
   */
  committed(): void {
    this.started = true;
    this.kept = true;
  }
  get any(): boolean {
    return this.started;
  }
  get anyCommitted(): boolean {
    return this.kept;
  }
}

export const REFUSED_AFTER_EFFECTS_MESSAGE =
  'Part of this request may already have been stored or sent (for a send, copies may already have been sent). Reload the case and reconcile any copy that may have gone out before retrying.';

export function unexpectedErrorResponse(route: string, error: unknown, effects: SideEffects | null): Response {
  console.error(`[billing/two-stage ${route}]`, error);
  return effects?.any
    ? json<ApiErrorBody>({ code: 'OUTCOME_UNCERTAIN', error: OUTCOME_UNCERTAIN_MESSAGE }, 500)
    : json<ApiErrorBody>({ code: 'INTERNAL_ERROR', error: INTERNAL_ERROR_MESSAGE }, 500);
}

/**
 * CSRF for mutations: the Origin header must be present and equal to this
 * request's origin, and the browser must not report a cross-site fetch.
 * Same rule as requireLabMutationOrigin (lib/member/labApi.ts).
 */
export function requireSameOriginMutation(request: Request): void {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw apiError(403, 'ORIGIN_REJECTED', 'This request must come from the WorkforceAP admin site.');
  }
}

function declaredLength(request: Request): number | null {
  const raw = request.headers.get('content-length');
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Read at most `limit` bytes of the body. Refuses from Content-Length before
 * reading anything, and counts bytes while streaming when the header is
 * missing or wrong, so an oversized body is never buffered whole.
 */
export async function readBodyBytes(request: Request, limit: number): Promise<Uint8Array> {
  const declared = declaredLength(request);
  if (declared !== null && declared > limit) throw apiError(413, 'PAYLOAD_TOO_LARGE', 'The request is too large.');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      throw apiError(413, 'PAYLOAD_TOO_LARGE', 'The request is too large.');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function readJsonBody(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw apiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send this request as JSON.');
  }
  const bytes = await readBodyBytes(request, MAX_JSON_BYTES);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw apiError(400, 'INVALID_JSON', 'The request could not be read. Reload and try again.');
  }
}

export type MultipartUpload = { fields: Map<string, string>; file: { bytes: Uint8Array; fileName: string; declaredType: string } | null };

/** Parse a bounded multipart body. The size check happens before FormData ever sees the bytes. */
export async function readMultipartBody(request: Request): Promise<MultipartUpload> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    throw apiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send this request as a file upload.');
  }
  const bytes = await readBodyBytes(request, MAX_MULTIPART_BYTES);
  let form: FormData;
  try {
    form = await new Response(new Blob([new Uint8Array(bytes)]), { headers: { 'content-type': contentType } }).formData();
  } catch {
    throw apiError(400, 'INVALID_JSON', 'The upload could not be read. Reload and try again.');
  }
  const fields = new Map<string, string>();
  let file: MultipartUpload['file'] = null;
  for (const [name, value] of form.entries()) {
    if (typeof value === 'string') fields.set(name, value);
    else if (name === 'file' && !file) {
      file = { bytes: new Uint8Array(await value.arrayBuffer()), fileName: value.name, declaredType: value.type };
    }
  }
  return { fields, file };
}

export function parseJsonField(fields: Map<string, string>, name: string): unknown {
  const raw = fields.get(name);
  if (raw === undefined) throw apiError(422, 'VALIDATION_FAILED', `The ${name} part is missing.`, { field: name });
  try {
    return JSON.parse(raw);
  } catch {
    throw apiError(400, 'INVALID_JSON', 'The request could not be read. Reload and try again.', { field: name });
  }
}
