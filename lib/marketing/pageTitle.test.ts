import test from 'node:test';
import assert from 'node:assert/strict';
import { brandedPageTitle, hasBrand } from './pageTitle';

test('a bare page title gains the brand suffix with the site em dash', () => {
  assert.equal(brandedPageTitle('Terms of Service'), 'Terms of Service — WorkforceAP');
  assert.equal(brandedPageTitle('Community & Employer Partners'), 'Community & Employer Partners — WorkforceAP');
});

test('a title that already carries the brand is returned unchanged', () => {
  for (const title of [
    'FAQ — WorkforceAP',
    'About WorkforceAP',
    'Careers at WorkforceAP',
    'Program Price List — Workforce Advancement Project',
    'Workforce AP — legacy spelling',
  ]) {
    assert.ok(hasBrand(title), `${title} should count as branded`);
    assert.equal(brandedPageTitle(title), title);
  }
});

test('a pipe-separated title keeps its own separator', () => {
  assert.equal(
    brandedPageTitle('Workforce Development Blog | Career Tips & Training News'),
    'Workforce Development Blog | Career Tips & Training News | WorkforceAP',
  );
});

test('trailing whitespace and a dangling separator do not produce a double dash', () => {
  assert.equal(brandedPageTitle('Accessibility Statement — '), 'Accessibility Statement — WorkforceAP');
  assert.equal(brandedPageTitle('   '), 'WorkforceAP');
});

test('the word "workforce" alone is not the brand', () => {
  assert.equal(brandedPageTitle('Workforce boards'), 'Workforce boards — WorkforceAP');
});
