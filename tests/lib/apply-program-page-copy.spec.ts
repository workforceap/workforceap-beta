import { describe, expect, it, vi } from 'vitest';
import { createTranslator } from 'next-intl';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';

const catalogs = { en, es, fr, pt };
const state = vi.hoisted(() => ({ locale: 'en' as keyof typeof catalogs }));
vi.mock('@/lib/i18n/server', () => ({ getRequestLocale: async () => state.locale }));
vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale, namespace }: { locale: keyof typeof catalogs; namespace: 'apply' }) =>
    createTranslator({ locale, messages: catalogs[locale], namespace }),
}));

import { buildApplyPageMetadata } from '@/lib/apply/applyProgramPage';

/** /apply without a program: the SEO description names the review and the email, not "1 to 2 business days". */
describe('apply page metadata description', () => {
  it('makes no fixed-wait promise', async () => {
    state.locale = 'en';
    const metadata = await buildApplyPageMetadata(undefined);
    expect(metadata.description).toBe(
      "Apply for career certification training at no cost to members. CompTIA, Google, IBM, AWS, and more. Serving communities nationwide. A counselor reviews every application; you'll get an email when a decision is made.",
    );
    expect(String(metadata.openGraph?.description ?? metadata.description)).not.toMatch(/business days/i);
  });
  it.each(['en', 'es', 'fr', 'pt'] as const)('uses the shared %s application estimate in program metadata', async (locale) => {
    state.locale = locale;
    const metadata = await buildApplyPageMetadata('it-support-professional-certificate-ibm');
    expect(metadata.description).toContain(`${catalogs[locale].apply.applicationTimeEstimate} to apply.`);
    expect(metadata.description).not.toContain('10 minutes');
    expect(metadata.openGraph?.description).toBe(metadata.description);
    expect(metadata.alternates?.canonical).toContain('?program=it-support-professional-certificate-ibm');
  });
});
