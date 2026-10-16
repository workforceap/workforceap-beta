import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COURSERA_HEAL_IGNORED_CAP,
  COURSERA_HEAL_UNMATCHED_CAP,
  CRON_JOB_EXPIRY_CAP,
  CRON_NUDGE_CANDIDATE_CAP,
  CRON_PARTNER_DIGEST_REFERRAL_CAP,
  partnerDigestReferralTake,
} from './cronCaps';
import { COURSERA_SYNC_MEMBER_CAP } from '@/lib/coursera/syncMembers';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function readRepo(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

test('partner digest take is a hard cap and does not scale with partner count', () => {
  assert.equal(partnerDigestReferralTake(1), CRON_PARTNER_DIGEST_REFERRAL_CAP);
  assert.equal(partnerDigestReferralTake(50), CRON_PARTNER_DIGEST_REFERRAL_CAP);
  assert.ok(partnerDigestReferralTake(50) < 2000 * 50);
});

test('hottest cron routes honor newly bounded takes', () => {
  const digest = readRepo('app/api/cron/partner-outcome-digest/route.ts');
  assert.doesNotMatch(digest, /2000\s*\*\s*partnerIds\.length/);
  assert.match(digest, /partnerDigestReferralTake\(partnerIds\.length\)/);
  assert.match(digest, /CRON_PARTNER_DIGEST_PARTNER_CAP/);
  assert.match(digest, /no_referrals/);

  const inactive = readRepo('app/api/cron/inactive-nudge/route.ts');
  assert.doesNotMatch(inactive, /take:\s*1000/);
  assert.doesNotMatch(inactive, /memberEvent\.groupBy/);
  assert.match(inactive, /CRON_NUDGE_CANDIDATE_CAP/);

  const inactivity = readRepo('app/api/cron/inactivity-nudge/route.ts');
  assert.match(inactivity, /CRON_NUDGE_CANDIDATE_CAP/);
  assert.match(inactivity, /memberEvents:\s*\{\s*none:/);

  const heal = readRepo('app/api/cron/coursera-auto-heal/route.ts');
  assert.match(heal, /countCourseraHealQueue/);
  assert.match(heal, /COURSERA_HEAL_UNMATCHED_CAP/);
  assert.match(heal, /COURSERA_HEAL_IGNORED_CAP/);
  assert.match(heal, /skipped:\s*'no_pending_heal'/);

  const expiry = readRepo('app/api/cron/job-expiry/route.ts');
  assert.match(expiry, /CRON_JOB_EXPIRY_CAP/);

  const recap = readRepo('app/api/cron/weekly-recap-email/route.ts');
  assert.doesNotMatch(recap, /memberEvent\.groupBy/);
  assert.match(recap, /memberEvents:\s*\{\s*none:/);

  const sync = readRepo('lib/coursera/syncMembers.ts');
  assert.match(sync, /COURSERA_SYNC_MEMBER_CAP/);
  assert.ok(COURSERA_SYNC_MEMBER_CAP >= 100);
  assert.ok(COURSERA_HEAL_UNMATCHED_CAP <= 200);
  assert.ok(COURSERA_HEAL_IGNORED_CAP <= 150);
  assert.equal(CRON_NUDGE_CANDIDATE_CAP, 200);
  assert.equal(CRON_JOB_EXPIRY_CAP, 200);
});

test('coursera-sync and b4b-sync no longer share the same minute', () => {
  const vercel = readRepo('vercel.json');
  assert.match(vercel, /"path": "\/api\/cron\/coursera-sync"[\s\S]*?"schedule": "0 \*\/6 \* \* \*"/);
  assert.match(vercel, /"path": "\/api\/cron\/coursera-b4b-sync"[\s\S]*?"schedule": "30 \*\/6 \* \* \*"/);
});

test('Vercel preview policy skips Claude and Codex branches', () => {
  const vercel = JSON.parse(readRepo('vercel.json')) as { ignoreCommand?: unknown };

  assert.equal(typeof vercel.ignoreCommand, 'string');
  assert.match(vercel.ignoreCommand as string, /VERCEL_ENV.*production/);
  assert.match(
    vercel.ignoreCommand as string,
    /preview\|feature\/portal-\*\|feature\/astro-\*/,
  );
  assert.doesNotMatch(vercel.ignoreCommand as string, /(?:^|\|)claude\/\*/);
  assert.doesNotMatch(vercel.ignoreCommand as string, /(?:^|\|)codex\/\*/);
});
