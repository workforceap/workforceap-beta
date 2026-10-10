import 'server-only';
import { EnrollmentAgreementError } from './errors';
import { MAX_UPLOAD_BYTES } from './types';

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== new URL(request.url).origin)) {
    throw new EnrollmentAgreementError(403, 'INVALID_ORIGIN', 'Please submit this form from the WorkforceAP portal.');
  }
}

export async function readBoundedBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw new EnrollmentAgreementError(413, 'BODY_TOO_LARGE', 'This request is too large.');
  if (!request.body) throw new EnrollmentAgreementError(400, 'INVALID_BODY', 'A request body is required.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new EnrollmentAgreementError(413, 'BODY_TOO_LARGE', 'This request is too large.');
      }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  return new Uint8Array(Buffer.concat(chunks));
}

export async function readAgreementMultipart(request: Request): Promise<FormData> {
  const contentType = request.headers.get('content-type');
  if (!contentType?.startsWith('multipart/form-data;')) throw new EnrollmentAgreementError(400, 'INVALID_BODY', 'Choose a PDF to upload.');
  const bytes = await readBoundedBody(request, MAX_UPLOAD_BYTES + 64 * 1024);
  try { return await new Response(Buffer.from(bytes), { headers: { 'Content-Type': contentType } }).formData(); }
  catch { throw new EnrollmentAgreementError(400, 'INVALID_BODY', 'The upload form could not be read.'); }
}

export function agreementJson(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
}
