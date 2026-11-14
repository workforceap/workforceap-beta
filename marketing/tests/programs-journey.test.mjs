import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Exercise the generated page, including its enrollment-step wiring.
const html = readFileSync(new URL('../dist/programs/index.html', import.meta.url), 'utf8');
const journey = html.match(/<section\b[^>]*\bid="after-you-apply"[^>]*>([\s\S]*?)<\/section>/)?.[1];
const introduction = journey?.match(/<p\b[^>]*>([\s\S]*?)<\/p>/)?.[1]
  .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

test('generated programs page includes Digital Literacy and the enrollment journey', () => {
  assert.match(html, /href="\/programs\/digital-literacy-empowerment-class"/);
  assert.ok(journey, 'the generated page must include the after-you-apply section');
  assert.ok(introduction, 'the journey must explain which applicants its steps cover');
});

test('generated journey scopes its Coursera assignment steps to Coursera programs', () => {
  assert.match(introduction ?? '', /steps below apply to Coursera programs/i);
});

test('generated journey tells Digital Literacy applicants they need no Coursera access', () => {
  assert.match(introduction ?? '', /Digital Literacy uses WorkforceAP modules and does not need Coursera access/i);
});


test('generated catalog hero and metadata distinguish training from vendor certification', () => {
  const hero = html.match(/<p\b[^>]*class="sub"[^>]*>([\s\S]*?)<\/p>/)?.[1];
  const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1];
  for (const copy of [hero, description]) {
    assert.ok(copy);
    assert.match(copy, /preparation for vendor certification exams/i);
    assert.doesNotMatch(copy, /certifications from|industry certifications/i);
  }
});


test('all four locale catalogs qualify the hero claim and keep both catalogs aligned', () => {
  const preparation = {
    en: /preparation for vendor certification exams/i,
    es: /preparación para exámenes de certificación de proveedores/i,
    fr: /préparation aux examens de certification des fournisseurs/i,
    pt: /preparação para exames de certificação de fornecedores/i,
  };
  for (const [locale, qualifier] of Object.entries(preparation)) {
    const root = JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), 'utf8'));
    const marketing = JSON.parse(readFileSync(new URL(`../src/i18n/${locale}.json`, import.meta.url), 'utf8'));
    assert.match(root.marketing.programs.heroDesc, qualifier, locale);
    assert.equal(marketing.marketing.programs.heroDesc, root.marketing.programs.heroDesc, locale);
  }
});
