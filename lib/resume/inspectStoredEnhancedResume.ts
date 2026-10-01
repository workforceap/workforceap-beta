import { Buffer } from 'node:buffer';
import { extractTextFromResumeBuffer } from './extractTextFromResumeBuffer';
import { hasSubstantiveResumeText, sanitizeResumePlainText } from './extractionQuality';

export interface InspectedEnhancedResume {
  readable: boolean;
  /** Only text files are returned as inline Markdown. Binary files use preview URLs. */
  text: string | null;
}

/**
 * Legacy enhanced objects predate the current upload/generation guards. Validate
 * their actual bytes before exposing a preview or signed download link. A bad
 * object stays in storage for later recovery, but is not presented as a resume.
 */
export async function inspectStoredEnhancedResume(
  bytes: Uint8Array,
  path: string,
): Promise<InspectedEnhancedResume> {
  const extension = path.split('/').pop()?.split('.').pop()?.toLowerCase() ?? '';
  if (!['txt', 'pdf', 'docx'].includes(extension)) {
    return { readable: false, text: null };
  }

  try {
    const extracted = await extractTextFromResumeBuffer(Buffer.from(bytes), extension);
    const safeText = sanitizeResumePlainText(extracted);
    if (!hasSubstantiveResumeText(safeText)) {
      return { readable: false, text: null };
    }
    return { readable: true, text: extension === 'txt' ? safeText : null };
  } catch {
    return { readable: false, text: null };
  }
}
