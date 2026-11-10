'use client';

import { createBrowserClient } from '@supabase/ssr';
import { FINANCE_MULTIPART_FILE_MAX_BYTES, MAX_UPLOAD_BYTES } from './constants';
import type { VoucherDirectPrepareDto, VoucherUploadDto } from './dto';
import type { ApiResult } from '@/app/admin/members/[id]/billing/twoStageClient';

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function voucherUrl(memberId: string, caseId: string): string {
  return `/api/admin/members/${encodeURIComponent(memberId)}/billing/two-stage/cases/${encodeURIComponent(caseId)}/voucher`;
}

export async function uploadVoucherFile(
  memberId: string,
  caseId: string,
  file: File,
  request: <T>(path: string, opts?: { method?: 'POST'; json?: unknown; form?: FormData }) => Promise<ApiResult<T>>,
): Promise<ApiResult<VoucherUploadDto>> {
  if (file.size === 0) {
    return { ok: false, status: 422, body: null, message: 'The file is empty.', uncertain: false };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      status: 413,
      body: null,
      message: `The file is larger than ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`,
      uncertain: false,
    };
  }

  if (file.size <= FINANCE_MULTIPART_FILE_MAX_BYTES) {
    const form = new FormData();
    form.append('file', file, file.name);
    return request<VoucherUploadDto>(voucherUrl(memberId, caseId), { method: 'POST', form });
  }

  const sha256 = await sha256Hex(file);
  const descriptor = { sha256, byteLength: file.size, fileName: file.name };
  const prepare = await request<VoucherDirectPrepareDto>(voucherUrl(memberId, caseId), {
    method: 'POST',
    json: { action: 'prepare', ...descriptor },
  });

  // Content-addressed storage is insert-only. A retry after a completed PUT
  // (or a prepare that finds the object already verified) must still call
  // complete so the billing artifact row can be written.
  let uploadError: string | null = null;
  if (prepare.ok && prepare.data.token) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) {
      return { ok: false, status: 0, body: null, message: 'App configuration error.', uncertain: true };
    }
    const supabase = createBrowserClient(url, anon);
    const { error: upErr } = await supabase.storage.from(prepare.data.bucket).uploadToSignedUrl(
      prepare.data.path,
      prepare.data.token,
      file,
      { contentType: 'application/pdf', upsert: false },
    );
    if (upErr) uploadError = upErr.message || 'Upload to storage failed.';
  }

  const complete = await request<VoucherUploadDto>(voucherUrl(memberId, caseId), {
    method: 'POST',
    json: { action: 'complete', ...descriptor },
  });
  if (complete.ok) return complete;
  if (uploadError) {
    return { ok: false, status: complete.status || 0, body: complete.body, message: uploadError, uncertain: true };
  }
  if (!prepare.ok) return prepare;
  return complete;
}
