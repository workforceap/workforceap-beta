import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Follow-up to #2488: no member-, applicant-, employer- or public-facing
 * catalogue string promises a fixed review or reply time. The accessibility
 * statement's "five business days" is a published policy commitment, not the
 * invented review promise, and stays; the "5 business days" escalation
 * threshold on the confirmation page ("no email after 5 business days? call")
 * is a when-to-chase line, not a promise, and stays too.
 */

const CATALOGUES = [
  'messages/en.json', 'messages/es.json', 'messages/fr.json', 'messages/pt.json',
  'marketing/src/lib/messages.en.json',
  'marketing/src/i18n/en.json', 'marketing/src/i18n/es.json', 'marketing/src/i18n/fr.json', 'marketing/src/i18n/pt.json',
];
const KEPT = new Set(['marketing.accessibility.helpCopy', 'apply.confirmationHelpHeading', 'apply.confirmationTrust3Desc']);
const PROMISE = /1.?(?:to|–|-|à|a|ou|or).?2 (?:business days|jours ouvr|dias úteis|días hábiles)|24.?(?:to|–|-|a|à).?48|within 24 hours|en 24 horas|within (?:a few|two) business days/i;

function flatten(obj: unknown, prefix = '', out: Array<[string, string]> = []): Array<[string, string]> {
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else if (typeof obj === 'string') out.push([prefix, obj]);
  return out;
}

describe('message catalogues carry no fixed review-wait promise', () => {
  it.each(CATALOGUES)('%s', (relPath) => {
    const catalogue = JSON.parse(readFileSync(path.join(process.cwd(), relPath), 'utf8')) as unknown;
    const offenders = flatten(catalogue).filter(([key, value]) => !KEPT.has(key) && PROMISE.test(value)).map(([key]) => key);
    expect(offenders).toEqual([]);
  });

  it('translates the employer and partner thank-you leads instead of leaving English fallbacks', () => {
    const en = JSON.parse(readFileSync(path.join(process.cwd(), 'messages/en.json'), 'utf8')) as { marketing: { thankYou: Record<string, { lead: string }> } };
    for (const locale of ['es', 'fr', 'pt']) {
      const other = JSON.parse(readFileSync(path.join(process.cwd(), `messages/${locale}.json`), 'utf8')) as typeof en;
      for (const funnel of ['employer', 'partners']) {
        expect(other.marketing.thankYou[funnel].lead, `${locale} ${funnel}`).not.toBe(en.marketing.thankYou[funnel].lead);
      }
    }
  });
});
