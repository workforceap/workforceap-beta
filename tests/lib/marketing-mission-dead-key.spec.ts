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

/**
 * `marketing.whatWeDo.missionBody1` held the OLD mission sentence ("equips
 * individuals, nonprofits, counselors, and community ambassadors ...") that
 * #2473 / #2484 replaced with the banner statement. Nothing reads the key
 * any more (no Astro component, `useT` call, lib/messages consumer or test),
 * so a stale sentence sat in nine message files waiting to be re-wired by
 * mistake. It is gone from every locale and mirror; the live `missionBody2`
 * stays.
 */
type Messages = { marketing: { whatWeDo: Record<string, unknown> } };

const FILES: Array<[string, Messages]> = [
  ['messages/en.json', appEn], ['messages/es.json', appEs], ['messages/fr.json', appFr], ['messages/pt.json', appPt],
  ['marketing/src/i18n/en.json', siteEn], ['marketing/src/i18n/es.json', siteEs], ['marketing/src/i18n/fr.json', siteFr], ['marketing/src/i18n/pt.json', sitePt],
  ['marketing/src/lib/messages.en.json', siteMirror as unknown as Messages],
];

describe('marketing.whatWeDo.missionBody1 is retired', () => {
  it.each(FILES)('%s: no missionBody1, missionBody2 kept', (_file, messages) => {
    const block = messages.marketing.whatWeDo;
    expect(block).toBeTypeOf('object');
    expect(Object.keys(block)).not.toContain('missionBody1');
    expect(typeof block.missionBody2).toBe('string');
    expect((block.missionBody2 as string).length).toBeGreaterThan(20);
  });

  it('no locale keeps the old mission sentence under any key', () => {
    for (const [file, messages] of FILES) {
      const values = Object.values(messages.marketing.whatWeDo).filter((v): v is string => typeof v === 'string');
      expect(values.some((v) => /nonprofits?, counselors,? and community ambassadors/i.test(v) || /conseillers et les ambassadeurs communautaires avec/i.test(v) || /conselheiros e embaixadores comunitários com/i.test(v) || /embajadores comunitarios y consejeros con/i.test(v)), file).toBe(false);
    }
  });
});
