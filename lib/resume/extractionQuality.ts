const SECTION_HEADERS = [
  'professional summary',
  'summary',
  'experience',
  'work experience',
  'education',
  'skills',
  'certifications',
  'projects',
];

const UNSAFE_CONTROL_OR_REPLACEMENT = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/g;
const PDF_OBJECT = /(?:^|\n)\s*\d+\s+\d+\s+obj\b/m;
const PDF_END_OBJECT = /(?:^|\n)\s*endobj\b/m;
const PDF_STREAM = /(?:^|\n)\s*stream\b/m;
const PDF_END_STREAM = /(?:^|\n)\s*endstream\b/m;
const PDF_XREF_EOF = /(?:^|\n)\s*xref\b[\s\S]*%%EOF\b/m;
const ZIP_CONTAINER_ENTRY = /(?:\[Content_Types\]\.xml|word\/document\.xml|_rels\/\.rels)/i;
const PARSER_DIAGNOSTIC =
  /(?:InvalidPDFException|Invalid PDF structure|FormatError:\s|bad XRef entry|Mammoth does not support|webpack:\/\/\/src\/pdf\.js)/i;
const STACK_FRAME = /(?:^|\n)\s*at\s+\S+.*:\d+:\d+\)?\s*$/m;
const MODEL_RESUME_FAILURE_NARRATIVE =
  /(?:base resume to improve|provided resume)[\s\S]{0,320}(?:raw PDF stream|cannot be parsed for text content)|(?:raw PDF stream|unreadable (?:PDF|file))[\s\S]{0,220}(?:cannot be parsed|no (?:usable|readable) text)/i;
const KNOWN_CONTEXT_PLACEHOLDER =
  /\{\{\s*(?:member_(?:first_name|full_name)|resume_(?:text|draft|context)|live_resume_draft|program_name)\s*\}\}/i;

export const RESUME_TEXT_UPLOAD_ERROR =
  'We could not read enough resume text from that file. If it is scanned or image-only, export it with selectable text, or upload a DOCX or TXT file. Your previous resume was kept.';

export const RESUME_TEXT_SAVE_ERROR =
  'We could not save that resume draft because it does not contain enough readable resume text. Paste at least a short summary, skills, or work history. Your previous resume was kept.';

/** Minimum normalized prose required before a resume is persisted or sent to an agent. */
export const MIN_SUBSTANTIVE_RESUME_TEXT_CHARS = 40;

function escaped(pattern: string): string {
  return pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}

/**
 * Detect file-container bytes, parser diagnostics, and unresolved agent placeholders.
 *
 * This is intentionally shared by server extraction and client resume-coach paths so
 * failed extraction output cannot be persisted or forwarded to a voice agent.
 */
export function isUnsafeResumePlainText(text: string): boolean {
  if (!text) return false;

  const normalized = text.replace(/\r\n?/g, '\n');
  const trimmed = normalized.trim();
  if (!trimmed) return false;

  const unsafeCharacters = normalized.match(UNSAFE_CONTROL_OR_REPLACEMENT)?.length ?? 0;
  if (unsafeCharacters > Math.max(2, Math.ceil(normalized.length * 0.01))) return true;

  if (/^%PDF-\d(?:\.\d)?/i.test(trimmed)) return true;
  if ((PDF_OBJECT.test(normalized) && PDF_END_OBJECT.test(normalized))
    || (PDF_STREAM.test(normalized) && PDF_END_STREAM.test(normalized))
    || PDF_XREF_EOF.test(normalized)) {
    return true;
  }

  if (/^PK(?:\u0003\u0004)?/.test(trimmed) && ZIP_CONTAINER_ENTRY.test(normalized)) return true;
  if (PARSER_DIAGNOSTIC.test(normalized) && (STACK_FRAME.test(normalized) || /\bError:\s/i.test(normalized))) {
    return true;
  }
  if (MODEL_RESUME_FAILURE_NARRATIVE.test(normalized)) return true;
  if (KNOWN_CONTEXT_PLACEHOLDER.test(normalized)) return true;

  return false;
}

/** Return normalized resume prose, or an empty string when the payload is unsafe. */
export function sanitizeResumePlainText(text: string): string {
  if (!text || isUnsafeResumePlainText(text)) return '';
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim();
}

/** True only for safe, normalized resume prose with enough content to be useful. */
export function hasSubstantiveResumeText(text: string): boolean {
  return sanitizeResumePlainText(text).length >= MIN_SUBSTANTIVE_RESUME_TEXT_CHARS;
}

export function getResumeExtractionWarning(text: string): string | null {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return null;

  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
  const longSingleLineCount = lines.filter((line) => line.length >= 140).length;
  const hasVeryLongLine = lines.some((line) => line.length >= 300);
  const mergedHeader = lines.some((line) => SECTION_HEADERS.some((header) => {
    const match = new RegExp(`^${escaped(header)}\\b[ \\t]+(.+)$`, 'i').exec(line);
    const content = match?.[1] ?? '';
    return content.length >= 19 && /^[A-Z]/.test(content);
  }));
  const lowLineBreakDensity = normalized.length >= 500 && normalized.length / lines.length >= 180;

  if (mergedHeader || lowLineBreakDensity || hasVeryLongLine || longSingleLineCount >= 3) {
    return 'This upload may have flattened headings or bullets during text extraction. Review your resume details before using them. If anything is missing, try another file format.';
  }

  return null;
}
