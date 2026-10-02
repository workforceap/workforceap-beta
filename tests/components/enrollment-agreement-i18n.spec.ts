import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';
import { pickAdminClientMessages, pickPortalClientMessages, pickRootClientMessages } from '@/lib/i18n/pickRootClientMessages';

function keys(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, entry]) => typeof entry === 'object'
    ? keys(entry, prefix + key + '.') : [prefix + key]);
}
describe('enrollment agreement translations', () => {
  it.each([['es', es], ['fr', fr], ['pt', pt]] as const)('has all agreement keys in %s', (_locale, catalog) => {
    expect(keys(catalog.enrollmentAgreement).sort()).toEqual(keys(en.enrollmentAgreement).sort());
  });
  it('ships only to authenticated portal and staff client providers', () => {
    expect(pickPortalClientMessages(en).enrollmentAgreement).toEqual(en.enrollmentAgreement);
    expect(pickAdminClientMessages(en).enrollmentAgreement).toEqual(en.enrollmentAgreement);
    expect(pickRootClientMessages(en).enrollmentAgreement).toBeUndefined();
  });
});
