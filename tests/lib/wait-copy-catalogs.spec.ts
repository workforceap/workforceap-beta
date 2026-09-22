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
 * Real promises the guard now catches but this lane could not rewrite:
 * `messages/{en,es,fr,pt}.json` are owned by the empty-state PR while it is open.
 * Each entry is a follow-up, not a policy line; delete the entry when the value
 * (and its `marketing/src/**` mirrors plus the hardcoded copy in
 * `marketing/src/pages/mentor.astro` and `marketing/src/pages/partners.astro`)
 * is rewritten in the measured-wait / "we'll email you when" voice:
 *  - marketing.mentor.waitlistCopy: "Most pairings start 4–8 weeks after you apply"
 *  - marketing.partners.howSubtitle: "Most orgs are referring inside a week"
 */
const DEFERRED = new Set(['marketing.mentor.waitlistCopy', 'marketing.partners.howSubtitle']);
/**
 * Out of this guard's reach on purpose: the counselor reply SLA "within 2 business
 * days" in components/portal/MemberCounselorChatClient.tsx,
 * components/portal/MemberMessagesMobileClient.tsx, emails/counselor-assigned.ts
 * and emails/enrollment-confirmation.ts is hardcoded source, not catalogue copy,
 * and whether that promise stays is Mike's decision (needs-mike item 34). #2492
 * parked it; a source-reading spec would also be a WAP-175 source-text test.
 */
/**
 * Any fixed-time promise, whether or not a preposition introduces it:
 *  - "within/in/usually within N (or N–M, or one/two/a few) business days" and the
 *    es/fr/pt forms ("en 1 día hábil", "sous 2 jours ouvrés", "em 1–2 dias úteis");
 *  - a bare "N business days" / "N to M working days" / "1-2 días hábiles" with digits
 *    or number words one..ten, unless a threshold word precedes it ("after 5 business
 *    days", "past 2 business days", "more than", "last", "de/après/após ...");
 *  - an hour range ("24–48 hours", "24 horas") or "within N hours";
 *  - a wait in weeks: "within/inside/in under N weeks" or "N–M weeks after you apply"
 *    (a program length, "complete the program in 4–8 weeks", is not a wait).
 * The range dash may be –, —, -, "to"/"a"/"à"/"or"/"ou", or the HTML entities
 * &ndash; / &mdash; / &#8211;.
 */
const DASH = String.raw`(?:–|—|-|&ndash;|&mdash;|&#8211;|to|a|à|ou|or)`;
const NUM = String.raw`(?:\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|a few|several|a couple of|un|una|uno|unos|unas|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|algunos|algunas|une|deux|trois|quatre|cinq|sept|huit|neuf|dix|quelques|um|uma|dois|duas|três|quatro|sete|oito|nove|dez|alguns|algumas)`;
const THRESHOLD_EN = String.raw`(?<!\b(?:after|past|than|over|least|beyond|every|for|of|last|previous|prior)\s+(?:about\s+|roughly\s+|around\s+)?)`;
const THRESHOLD_ROM = String.raw`(?<!\b(?:de|tras|après|après|após|depuis|há|últimos|últimas|derniers|dernières)\s+)`;
const PROMISE = new RegExp(
  [
    String.raw`\b(?:within|in|en|dentro de|sous|dans|em)\s+(?:about\s+|around\s+|unos\s+|environ\s+|cerca de\s+)?(?:\d+(?:\s*${DASH}\s*\d+)?|one|two|three|a few|un|una|dos|deux|um|uma|dois)\s+(?:business|working)\s+days?\b`,
    String.raw`\b(?:en|dentro de|sous|dans|em)\s+(?:unos\s+|environ\s+|cerca de\s+)?(?:\d+|un|una|dos|deux|um|uma|dois)(?:\s*${DASH}\s*\d+)?\s+(?:d[ií]as?\s+h[áa]bil(?:es)?|dias?\s+[úu]t(?:il|eis)|jours?\s+ouvr\w*)`,
    String.raw`${THRESHOLD_EN}\b${NUM}(?:\s*${DASH}\s*${NUM})?\s+(?:business|working)\s+days?\b`,
    String.raw`${THRESHOLD_ROM}\b${NUM}(?:\s*${DASH}\s*${NUM})?\s+(?:d[ií]as?\s+h[áa]bil(?:es)?|dias?\s+[úu]t(?:il|eis)|jours?\s+ouvr\w*)`,
    String.raw`\d+\s*${DASH}\s*\d+\s*(?:hours|horas|heures)\b(?!\s+(?:per|par|por)\b)`,
    String.raw`\b(?:within|in|en|dentro de|sous|dans|em)\s+\d+\s+(?:hours|horas|heures)\b`,
    String.raw`\b(?:within|inside|in under|in less than|dentro de|en menos de|em menos de|en moins d[e']\s*|sous|em até)\s*(?:about\s+|around\s+|unos\s+|environ\s+|cerca de\s+)?${NUM}(?:\s*${DASH}\s*${NUM})?\s+(?:weeks?|semanas?|semaines?)\b(?!\s+(?:of|de|d')\b)`,
    String.raw`\b${NUM}(?:\s*${DASH}\s*${NUM})?\s+(?:weeks?|semanas?|semaines?)\s+(?:after|from|después de|tras|après|após|depois de)\b`,
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
    const offenders = flatten(catalogue).filter(([key, value]) => !KEPT.has(key) && !DEFERRED.has(key) && PROMISE.test(value)).map(([key]) => key);
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
    'Approval usually takes 1 to 2 business days.',
    'Reviewed in 1-2 business days',
    'Expect a reply, typically 2 business days.',
    'Turnaround: three&ndash;five working days',
    'Activación del portal: 1–2 días hábiles',
    'Activation du portail : deux jours ouvrés',
    'Ativação do portal: um dia útil',
    'Most pairings start 4–8 weeks after you apply.',
    'La mayoría de las parejas comienzan 4–8 semanas después de aplicar.',
    'We activate your portal within two weeks.',
    'Most orgs are referring inside a week.',
    'La mayoría de las organizaciones refieren en menos de una semana.',
    "La plupart des organisations réfèrent en moins d'une semaine.",
  ])('the guard recognises %s', (value) => {
    expect(PROMISE.test(value)).toBe(true);
  });

  it.each([
    'Need help or no email after 5 business days?',
    'Approvals past 2 business days: 3',
    'Most programs need 5–10 hours per week for 3–5 months.',
    'Recent applications were approved in about 40 days (based on 12 approvals in the last 30 days).',
    'If you do not hear from us after about 5 business days, call or email.',
    'Follow up on one application after 5 business days',
    'Members waiting on a reply for more than 24 hours.',
    'Replies you owe after 24 hours',
    'Si no sabes de nosotros después de 5 días hábiles, llama o escribe.',
    "Besoin d'aide ou pas d'e-mail après 5 jours ouvrables ?",
    'Precisa de ajuda ou não recebeu e-mail após 5 dias úteis?',
    'Records are kept for 30 business days.',
    'Most members complete the core program in 4–8 weeks, but you can move at your own pace.',
    "It's been two weeks — let's get you back on track with your training.",
    'No course progress in 3 weeks',
    'Try again in an hour.',
    'Members who practice within a week of certifying place faster.',
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
