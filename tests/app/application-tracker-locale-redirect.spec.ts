// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

const { mockHeaders, mockRedirect } = vi.hoisted(() => ({
  mockHeaders: vi.fn(),
  mockRedirect: vi.fn((href: string) => { throw new Error(`REDIRECT:${href}`); }),
}));

vi.mock('next/headers', () => ({ headers: mockHeaders }));
vi.mock('next/navigation', () => ({ redirect: mockRedirect }));

import ApplicationTrackerPage from '@/app/(portal)/dashboard/ai-tools/application-tracker/page';
import { WAP_EXPLICIT_LOCALE_HEADER } from '@/lib/i18n/config';

describe('legacy application tracker destination', () => {
  it.each(['en', 'es', 'fr', 'pt'])('keeps an explicit /%s prefix', async (locale) => {
    mockHeaders.mockResolvedValue(new Headers({ [WAP_EXPLICIT_LOCALE_HEADER]: locale }));
    await expect(ApplicationTrackerPage()).rejects.toThrow(`REDIRECT:/${locale}/dashboard/job-applications`);
  });

  it('keeps unprefixed portal URLs unprefixed', async () => {
    mockHeaders.mockResolvedValue(new Headers());
    await expect(ApplicationTrackerPage()).rejects.toThrow('REDIRECT:/dashboard/job-applications');
  });
});
