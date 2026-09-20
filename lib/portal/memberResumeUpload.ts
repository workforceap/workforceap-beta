'use client';

import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import {
  MEMBER_REQUEST_TIMEOUT_MS,
  describeMemberRequestException,
  readMemberRequestFailure,
} from '@/lib/portal/memberRequestFailure';

const MAX_SIZE = 5 * 1024 * 1024;

export const RESUME_UPLOAD_ACCEPT = '.pdf,.docx,.txt';
export const RESUME_UPLOAD_FORMAT_LABEL = 'PDF, DOCX, or TXT';

export function getResumeUploadFileError(file: File): string | null {
  if (!file || file.size > MAX_SIZE) {
    return 'File too large (max 5MB)';
  }

  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'doc') {
    return 'Legacy .doc files are not supported. Save or export the file as PDF, DOCX, or TXT, then try again.';
  }
  if (!['pdf', 'docx', 'txt'].includes(ext || '')) {
    return 'Only PDF, DOCX, or TXT files are supported';
  }

  return null;
}

export async function uploadMemberResumeFile(
  file: File
): Promise<{ ok: true; warning: string | null } | { ok: false; error: string }> {
  const validationError = getResumeUploadFileError(file);
  if (validationError) return { ok: false, error: validationError };

  const formData = new FormData();
  formData.append('file', file);

  try {
    // A hung, non-JSON or 5xx answer must surface as a sentence the member can
    // act on, never as an unchanged page (member audit 7c).
    const res = await fetchWithTimeout(
      '/api/member/resume/upload',
      { method: 'POST', body: formData },
      MEMBER_REQUEST_TIMEOUT_MS,
    );

    if (!res.ok) {
      return { ok: false, error: await readMemberRequestFailure(res) };
    }

    const data = (await res.json().catch(() => ({}))) as {
      extractionWarning?: unknown;
      enhancedInvalidated?: unknown;
    };

    return {
      ok: true,
      warning: [
        typeof data.extractionWarning === 'string' ? data.extractionWarning.trim() : '',
        data.enhancedInvalidated
          ? 'Your prior enhanced draft was archived because the source resume changed. Generate or save a new enhanced draft when ready.'
          : '',
      ].filter(Boolean).join(' ') || null,
    };
  } catch (err) {
    return { ok: false, error: describeMemberRequestException(err) };
  }
}
