import 'server-only';
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { EnrollmentAgreementError } from './errors';
import { MAX_UPLOAD_BYTES } from './types';

/** A bounded, isolated parser: even a compressed malformed PDF cannot hold a route open. */
type PdfValidationResult = 'valid' | 'invalid' | 'active_content';
function validateAgreementPdf(bytes: Uint8Array): Promise<PdfValidationResult> {
  return new Promise((resolve) => {
    const worker = new Worker(path.join(process.cwd(), 'lib/enrollmentAgreements/pdf-validation-worker.cjs'), {
      workerData: bytes,
      // Parser diagnostics may contain document internals. Drain them privately;
      // only the boolean validation result may cross the worker boundary.
      stdout: true, stderr: true,
      resourceLimits: { maxOldGenerationSizeMb: 96, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
    });
    worker.stdout.resume();
    worker.stderr.resume();
    let settled = false;
    const finish = (result: PdfValidationResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      void worker.terminate();
      resolve(result);
    };
    const timeout = setTimeout(() => finish('invalid'), 5000);
    worker.once('message', (message: unknown) => {
      if (message && typeof message === 'object') {
        if ('valid' in message && message.valid === true) return finish('valid');
        if ('reason' in message && message.reason === 'active_content') return finish('active_content');
      }
      finish('invalid');
    });
    worker.once('error', () => finish('invalid'));
    worker.once('exit', () => finish('invalid'));
  });
}

export async function readAgreementPdf(file: File): Promise<Uint8Array> {
  if (file.size === 0) throw new EnrollmentAgreementError(400, 'EMPTY_PDF', 'The selected PDF is empty.');
  if (file.size > MAX_UPLOAD_BYTES) throw new EnrollmentAgreementError(413, 'PDF_TOO_LARGE', 'Choose a PDF smaller than 4 MB.');
  if (!file.name.toLowerCase().endsWith('.pdf') || (file.type && file.type !== 'application/pdf')) {
    throw new EnrollmentAgreementError(400, 'INVALID_PDF', 'Only PDF files are accepted.');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const header = Buffer.from(bytes.subarray(0, 8)).toString('ascii');
  const tail = Buffer.from(bytes.subarray(Math.max(0, bytes.length - 1024))).toString('ascii');
  if (bytes.length !== file.size || !/^%PDF-1\.[0-9]|^%PDF-2\.0/.test(header) || !tail.includes('%%EOF')) {
    throw new EnrollmentAgreementError(400, 'INVALID_PDF', 'This file could not be read as a PDF. Export or scan it again, then upload the new PDF.');
  }
  const result = await validateAgreementPdf(bytes);
  if (result === 'active_content') {
    throw new EnrollmentAgreementError(400, 'UNSUPPORTED_PDF_CONTENT', 'This PDF contains unsupported attachments, scripts, or interactive actions. Save a separate flattened PDF or scanned copy for upload, and keep your original signed document.');
  }
  if (result !== 'valid') throw new EnrollmentAgreementError(400, 'INVALID_PDF', 'This file could not be read as a PDF. Export or scan it again, then upload the new PDF.');
  return bytes;
}
