import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const blendCss = readFileSync(path.join(root, 'marketing/src/styles/blend.css'), 'utf8');
const homeSource = readFileSync(path.join(root, 'marketing/src/pages/index.astro'), 'utf8');
const programsSource = readFileSync(path.join(root, 'marketing/src/pages/programs.astro'), 'utf8');
const contactSource = readFileSync(path.join(root, 'marketing/src/pages/contact.astro'), 'utf8');
const consentSource = readFileSync(
  path.join(root, 'marketing/src/components/ConsentBanner.astro'),
  'utf8',
);

describe('marketing mobile touch targets', () => {
  it('keeps logo, footer navigation, audience links, and Donate at least 44px tall', () => {
    expect(blendCss).toMatch(/\.brand\{[^}]*min-height:44px/);
    expect(blendCss).toMatch(
      /footer li a,\.flegal a\{display:inline-flex;align-items:center;min-width:44px;min-height:44px;/,
    );
    expect(homeSource).toMatch(/\.tlink\{[^}]*min-height:44px/);
    expect(homeSource).toMatch(/\.pill--donate\{min-height:44px;/);
    expect(consentSource).toMatch(
      /\.consent__copy a\{display:inline-flex;align-items:center;min-height:44px;/,
    );
  });

  // WAP-209 (390x844 QA): /programs filter chips were 34px, /contact email and phone links 16-20px.
  it('keeps the /programs filter chips 44px tall while the visible pill stays 34px', () => {
    expect(programsSource).toMatch(/\.chip\{[^}]*min-height:44px/);
    // The button itself is transparent; the pill is its ::before, inset 5px top and bottom.
    expect(programsSource).toMatch(/\.chip\{[^}]*background:transparent/);
    expect(programsSource).toMatch(/\.chip::before\{[^}]*inset:5px 0;[^}]*background:var\(--surface\);border:1px solid var\(--border\)/);
    expect(programsSource).toMatch(/\.chip\.active::before\{background:var\(--grad\)/);
  });

  it('keeps the /contact email and phone links 44px tall without moving the card text', () => {
    expect(contactSource).toMatch(/\.ilink\{display:inline-flex;align-items:center;min-height:44px;margin-block:-11px;/);
    expect(contactSource).toContain('<a class="ilink" href="mailto:');
    expect(contactSource).toContain('<a class="ilink" href="tel:');
  });
});
