/**
 * Production boot policy for the shared cron secret (WAP-177 fix 6).
 *
 * Mirrors the rate limiter's boot assertion in `lib/rate-limit.ts`: a missing
 * secret in production must fail loudly at module load instead of letting all
 * 29 cron routes answer 401 forever with no trace. Kept as a pure decision so
 * the matrix is unit-testable without importing the wrapper.
 */

export const CRON_ALLOW_MISSING_SECRET_ENV = 'CRON_ALLOW_MISSING_SECRET';

export type CronSecretBootReason =
  | 'configured'
  | 'not-production'
  | 'build-phase'
  | 'allow-missing'
  | 'missing-in-production';

export type CronSecretBootDecision = { ok: boolean; reason: CronSecretBootReason };

export function decideCronSecretBoot(args: {
  isProduction: boolean;
  secretConfigured: boolean;
  allowMissing: boolean;
  nextPhase?: string;
}): CronSecretBootDecision {
  if (args.secretConfigured) return { ok: true, reason: 'configured' };
  if (!args.isProduction) return { ok: true, reason: 'not-production' };
  if (args.nextPhase === 'phase-production-build') return { ok: true, reason: 'build-phase' };
  if (args.allowMissing) return { ok: true, reason: 'allow-missing' };
  return { ok: false, reason: 'missing-in-production' };
}

export function decideCronSecretBootFromEnv(env: NodeJS.ProcessEnv = process.env): CronSecretBootDecision {
  return decideCronSecretBoot({
    isProduction: env.NODE_ENV === 'production',
    secretConfigured: Boolean(env.CRON_SECRET?.trim()),
    allowMissing: env[CRON_ALLOW_MISSING_SECRET_ENV]?.trim() === '1',
    nextPhase: env.NEXT_PHASE?.trim(),
  });
}

export const CRON_SECRET_BOOT_MESSAGE =
  '[CRON] FATAL: CRON_SECRET is required in production. Without it every scheduled job answers 401 ' +
  'and writes no CronExecution, WorkflowDiagnostic or error report (WAP-177). Set CRON_SECRET, or ' +
  `explicitly opt out for a preview deployment with ${CRON_ALLOW_MISSING_SECRET_ENV}=1. ` +
  'Set UNSUBSCRIBE_TOKEN_SECRET before rotating CRON_SECRET: unsubscribe links fall back to it.';
