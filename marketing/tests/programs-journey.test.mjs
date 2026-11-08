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
