import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CRON_ALLOW_MISSING_SECRET_ENV,
  decideCronSecretBoot,
  decideCronSecretBootFromEnv,
} from './cronSecretPolicy';

test('a configured secret always boots', () => {
  assert.deepEqual(
    decideCronSecretBoot({ isProduction: true, secretConfigured: true, allowMissing: false }),
    { ok: true, reason: 'configured' },
  );
});

test('development and test boot without a secret', () => {
  assert.deepEqual(
    decideCronSecretBoot({ isProduction: false, secretConfigured: false, allowMissing: false }),
    { ok: true, reason: 'not-production' },
  );
});

test('the production build phase never asserts (no runtime env during next build)', () => {
  assert.deepEqual(
    decideCronSecretBoot({ isProduction: true, secretConfigured: false, allowMissing: false, nextPhase: 'phase-production-build' }),
    { ok: true, reason: 'build-phase' },
  );
});

test('production without a secret fails closed unless explicitly opted out', () => {
  assert.deepEqual(
    decideCronSecretBoot({ isProduction: true, secretConfigured: false, allowMissing: false }),
    { ok: false, reason: 'missing-in-production' },
  );
  assert.deepEqual(
    decideCronSecretBoot({ isProduction: true, secretConfigured: false, allowMissing: true }),
    { ok: true, reason: 'allow-missing' },
  );
});

test('env reader trims whitespace-only secrets and reads the opt-out flag', () => {
  assert.equal(decideCronSecretBootFromEnv({ NODE_ENV: 'production', CRON_SECRET: '   ' }).ok, false);
  assert.equal(decideCronSecretBootFromEnv({ NODE_ENV: 'production', CRON_SECRET: 'secret' }).reason, 'configured');
  assert.equal(
    decideCronSecretBootFromEnv({ NODE_ENV: 'production', [CRON_ALLOW_MISSING_SECRET_ENV]: '1' }).reason,
    'allow-missing',
  );
});
