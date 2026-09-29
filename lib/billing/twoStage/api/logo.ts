import 'server-only';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256Hex } from '../canonical';
import { WAP_LOGO_PUBLIC_PATH } from '../letterhead';

/** The exact letterhead logo bytes the renderer embeds, read fresh so a changed file changes the hash. */
export async function readLetterheadLogo(): Promise<{ bytes: Uint8Array; sha256: string }> {
  const bytes = new Uint8Array(await readFile(join(process.cwd(), WAP_LOGO_PUBLIC_PATH)));
  return { bytes, sha256: sha256Hex(bytes) };
}
