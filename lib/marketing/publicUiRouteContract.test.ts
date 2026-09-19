import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), 'utf8');

test('the public WIOA fit CTA renders the public assessment instead of redirecting to apply', () => {
  const page = source('app/wioa-qualification/page.tsx');

  assert.match(page, /WioaQualificationClient initialSnapshot=\{null\} mode="public"/);
  assert.doesNotMatch(page, /redirect\(['"]\/apply/);
  assert.match(page, /getTranslations\('wioa'\)/);
  assert.match(page, /title: t\('title'\)/);
});

test('the privacy vendor table links to the current authoritative vendor pages', () => {
  const privacy = source('marketing/src/pages/privacy.astro');

  assert.match(privacy, /https:\/\/trust\.upstash\.com\//);
  assert.match(privacy, /https:\/\/formspree\.io\/legal\/privacy-policy\//);
  assert.doesNotMatch(privacy, /https:\/\/upstash\.com\/trust['"]/);
  assert.doesNotMatch(privacy, /https:\/\/formspree\.io\/privacy['"]/);
});

test('login exposes one visible primary heading on both desktop and mobile', () => {
  const login = source('app/(auth)/login/LoginForm.tsx');

  assert.match(login, /<p style=\{\{ \.\.\.s\.brandHeading/);
  assert.match(login, /<h1 style=\{s\.heading\}>\{tAuth\('login\.heading'\)\}<\/h1>/);
  assert.equal(login.match(/<h1\b/g)?.length, 1);
});
