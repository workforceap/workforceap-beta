import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/i18n/server', () => ({ getRequestLocale: async () => 'en' }));

import { buildApplyPageMetadata } from '@/lib/apply/applyProgramPage';

/** /apply without a program: the SEO description names the review and the email, not "1 to 2 business days". */
describe('apply page metadata description', () => {
  it('makes no fixed-wait promise', async () => {
    const metadata = await buildApplyPageMetadata(undefined);
    expect(metadata.description).toBe(
      "Apply for career certification training at no cost to members. CompTIA, Google, IBM, AWS, and more. Serving communities nationwide. A counselor reviews every application; you'll get an email when a decision is made.",
    );
    expect(String(metadata.openGraph?.description ?? metadata.description)).not.toMatch(/business days/i);
  });
});
