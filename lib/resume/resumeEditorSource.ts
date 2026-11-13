import { sanitizeResumePlainText } from '@/lib/resume/extractionQuality';

/**
 * Editor hydration must use the stored working draft, not a tool-context excerpt.
 * `enhancedText` is the uncropped stored `.txt`; `resumePlainText` is the extracted
 * fallback and must be requested at `RESUME_PLAIN_TEXT_MAX_CHARS`.
 */
export function selectResumeEditorSourceText(payload: {
  enhancedText?: string | null;
  resumePlainText?: string | null;
}): string {
  const enhanced = typeof payload.enhancedText === 'string'
    ? sanitizeResumePlainText(payload.enhancedText)
    : '';
  if (enhanced) return enhanced;
  return sanitizeResumePlainText(payload.resumePlainText ?? '');
}
