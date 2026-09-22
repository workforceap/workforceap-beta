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
/**
 * Any fixed-time promise: "within/in/usually within N (or N–M, or one/two/a few) business days",
 * the same in es/fr/pt ("en 1 día hábil", "sous 2 jours ouvrés", "em 1–2 dias úteis"),
 * an hour range ("24–48 hours", "24 horas"), or "within N hours" — with the range dash
 * spelled as –, -, "to" or the HTML entities &ndash; / &mdash; / &#8211;.
 */
const DASH = String.raw`(?:–|—|-|&ndash;|&mdash;|&#8211;|to|a|à|ou|or)`;
const PROMISE = new RegExp(
  [
    String.raw`\b(?:within|in|en|dentro de|sous|dans|em)\s+(?:about\s+|around\s+|unos\s+|environ\s+|cerca de\s+)?(?:\d+(?:\s*${DASH}\s*\d+)?|one|two|three|a few|un|una|dos|deux|um|uma|dois)\s+(?:business|working)\s+days?\b`,
    String.raw`\b(?:en|dentro de|sous|dans|em)\s+(?:unos\s+|environ\s+|cerca de\s+)?(?:\d+|un|una|dos|deux|um|uma|dois)(?:\s*${DASH}\s*\d+)?\s+(?:d[ií]as?\s+h[áa]bil(?:es)?|dias?\s+[úu]t(?:il|eis)|jours?\s+ouvr\w*)`,
    String.raw`\d+\s*${DASH}\s*\d+\s*(?:hours|horas|heures)\b(?!\s+(?:per|par|por)\b)`,
    String.raw`\b(?:within|in|en|dentro de|sous|dans|em)\s+\d+\s+(?:hours|horas|heures)\b`,
  ].join('|'),
  'i',
);

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

  it.each([
    'We follow up within 1–2 business days.',
    'within about 1&ndash;2 business days',
    "We'll email next steps within 1 business day.",
    'usually within 1 business day',
    'follow up within 2–3 business days',
    'replies within 2 business days',
    'We typically reply within one business day.',
    'within a few business days',
    'Program enrollment in ~24–48 hours',
    'Te enviaremos los próximos pasos por correo en 1 día hábil.',
    'nous activons votre portail partenaire sous 1 à 2 jours ouvrés',
    'ativamos seu portal de parceiro em 1–2 dias úteis',
    'Our team will reach out within 24 hours.',
  ])('the guard recognises %s', (value) => {
    expect(PROMISE.test(value)).toBe(true);
  });

  it.each([
    'Need help or no email after 5 business days?',
    'Approvals past 2 business days: 3',
    'Most programs need 5–10 hours per week for 3–5 months.',
    'Recent applications were approved in about 40 days (based on 12 approvals in the last 30 days).',
  ])('the guard ignores a threshold, a staff SLA tile, a study-time estimate or the measured median: %s', (value) => {
    expect(PROMISE.test(value)).toBe(false);
  });

  it('translates the employer and partner thank-you leads instead of leaving English fallbacks', () => {
    const en = JSON.parse(readFileSync(path.join(process.cwd(), 'messages/en.json'), 'utf8')) as { marketing: { thankYou: Record<string, { lead: string }> } };
    for (const locale of ['es', 'fr', 'pt']) {
      const other = JSON.parse(readFileSync(path.join(process.cwd(), `messages/${locale}.json`), 'utf8')) as typeof en;
      for (const funnel of ['employer', 'partners', 'apply']) {
        expect(other.marketing.thankYou[funnel].lead, `${locale} ${funnel}`).not.toBe(en.marketing.thankYou[funnel].lead);
      }
    }
  });
});
