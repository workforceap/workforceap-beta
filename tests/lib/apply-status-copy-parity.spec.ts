import { describe, expect, it } from 'vitest';
import appEn from '@/messages/en.json';
import appEs from '@/messages/es.json';
import appFr from '@/messages/fr.json';
import appPt from '@/messages/pt.json';
import siteEn from '../../marketing/src/i18n/en.json';
import siteEs from '../../marketing/src/i18n/es.json';
import siteFr from '../../marketing/src/i18n/fr.json';
import sitePt from '../../marketing/src/i18n/pt.json';
import siteMirror from '../../marketing/src/lib/messages.en.json';
import { APPLICATION_STATUS_LINK_TTL_MINUTES } from '@/lib/apply/statusLinkConstants';

/**
 * #2471 removed the public status readout and #2489 replaced it with a
 * signed, 30-minute link emailed to the address on file. The Next catalogue
 * (`messages/*.json`, rendered by app/apply/status) was rewritten with it;
 * the Astro catalogue (`marketing/src/i18n/*.json`) still promised "We will
 * show your current status" with a "Check status" button. The Astro `t()`
 * has no interpolation, so its copy spells the expiry out. This spec keeps
 * the two catalogues telling the same story, and fails the moment the TTL
 * constant changes without the marketing copy following.
 */
type ApplyCatalogue = { apply: Record<string, unknown> };
const str = (catalogue: ApplyCatalogue, key: string) => String(catalogue.apply[key]);

const KEYS = ['statusMetaDescription', 'statusHeroSubtitle', 'statusLead', 'statusChecking', 'statusSubmit'] as const;

const PAIRS: Array<[string, ApplyCatalogue, ApplyCatalogue]> = [
  ['en', appEn as ApplyCatalogue, siteEn as ApplyCatalogue],
  ['es', appEs as ApplyCatalogue, siteEs as ApplyCatalogue],
  ['fr', appFr as ApplyCatalogue, siteFr as ApplyCatalogue],
  ['pt', appPt as ApplyCatalogue, sitePt as ApplyCatalogue],
  ['en (lib mirror)', appEn as ApplyCatalogue, siteMirror as unknown as ApplyCatalogue],
];

const withExpiry = (value: string) => value.replaceAll('{minutes}', String(APPLICATION_STATUS_LINK_TTL_MINUTES));

describe('public application-status copy: Astro catalogue matches the Next catalogue', () => {
  it.each(PAIRS)('%s: the five status-lookup strings are the same words, expiry spelled out', (_locale, app, site) => {
    for (const key of KEYS) {
      expect(str(site, key), key).toBe(withExpiry(str(app, key)));
    }
  });

  it.each(PAIRS)('%s: the lead says a link is emailed and how long it lives, and never claims to show the status on the page', (_locale, _app, site) => {
    const lead = str(site, 'statusLead');
    expect(lead).toMatch(new RegExp(`\\b${APPLICATION_STATUS_LINK_TTL_MINUTES}\\s+minut`, 'i'));
    expect(lead).toMatch(/\b(link|enlace|lien)\b/i);
    expect(lead).not.toMatch(/we will show|te mostraremos|nous afficherons|mostraremos seu/i);
    expect(lead).not.toContain('{minutes}');
  });

  it('the Next lead carries the expiry as a placeholder, so the number has one home', () => {
    for (const app of [appEn, appEs, appFr, appPt] as ApplyCatalogue[]) {
      expect(str(app, 'statusLead')).toContain('{minutes}');
    }
  });
});
