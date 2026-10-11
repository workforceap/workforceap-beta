import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createTranslator } from 'next-intl';
import en from '@/messages/en.json';

vi.mock('@/lib/i18n/server', () => ({ getRequestLocale: async () => 'en' }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => createTranslator({ locale: 'en', messages: en, namespace: 'apply' }),
}));

import { buildApplyPageMetadata } from '@/lib/apply/applyProgramPage';

describe('application social previews', () => {
  it.each([undefined, 'it-support-professional-certificate-ibm'])('uses a real brand image with accurate dimensions for %s', async (program) => {
    const metadata = await buildApplyPageMetadata(program);
    const images = metadata.openGraph?.images as Array<{ url: string; width: number; height: number; alt: string }>;
    expect(images).toHaveLength(1);
    const image = images[0];
    const pathname = new URL(image.url, 'https://www.workforceap.org').pathname;
    const data = readFileSync(path.join(process.cwd(), 'public', pathname));
    expect(data.subarray(1, 4).toString()).toBe('PNG');
    expect(image.width).toBe(data.readUInt32BE(16));
    expect(image.height).toBe(data.readUInt32BE(20));
    expect(image.alt).toContain('Workforce Advancement Project');
    expect(metadata.twitter?.images).toEqual([{ url: image.url, alt: image.alt }]);
    if (program) expect(metadata.alternates?.canonical).toContain(`?program=${program}`);
  });
});
