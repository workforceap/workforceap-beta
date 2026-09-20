import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { logger } from '@/lib/observability/logger';
import {
  decideMissingLimiter,
  isAllowMissingUpstashEnabled,
  isApplyFailClosedEnvEnabled,
  resolveRateLimiterMode,
  type MissingLimiterMode,
  type RateLimiterMode,
} from '@/lib/rate-limit-policy';

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

const isProduction = process.env.NODE_ENV === 'production';
const upstashConfigured = Boolean(redisUrl && redisToken);

// ── Production boot assertion ───────────────────────────────────────────
// Rate limiting is a security control.  In production we MUST have Upstash
// Redis or every limiter falls open (auth, forgot-password, contact, AI
// tools, etc.).  Dev stays fail-open so local development works without
// credentials.
// ──────────────────────────────────────────────────────────────────────────
const allowMissingUpstash = isAllowMissingUpstashEnabled();
const nextPhase = process.env.NEXT_PHASE?.trim();
if (isProduction && !upstashConfigured && !allowMissingUpstash && nextPhase !== 'phase-production-build') {
  const msg =
    '[RATE-LIMIT] FATAL: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production. ' +
    'Rate limiters are currently disabled (fail-open), which weakens auth, forgot-password, contact, ' +
    'and AI-tool endpoints. Set the env vars or explicitly opt out with RATE_LIMIT_ALLOW_MISSING_UPSTASH=1. ' +
    'Partner signup, MFA verify, and bulk-email then use the security fail-open path; ' +
    'apply/signup stay open unless WAP_APPLY_RATE_LIMIT_FAIL_CLOSED=1.';
  logger.error(msg);
  // Throw synchronously so the server fails to boot rather than running
  // with silently-disabled security controls.
  throw new Error(msg);
}

// Apply/signup use apply-mode policy (open when RATE_LIMIT_ALLOW_MISSING_UPSTASH=1
// unless WAP_APPLY_RATE_LIMIT_FAIL_CLOSED=1). Contact/confirmation/partner/MFA/
// bulk-email use security fail-closed. Add UPSTASH_* to enable Redis-backed limits.
const FAIL_CLOSED = !upstashConfigured;

/**
 * Which posture the security-mode limiters are running in. Surfaced by
 * `/api/health/ready` so operators can prove production is on Redis instead
 * of inferring it from a contact form that 429s (WAP-13 / TODO-088).
 */
export function getRateLimiterMode(): RateLimiterMode {
  return resolveRateLimiterMode({ upstashConfigured, isProduction, allowMissingUpstash });
}

// Observable: one-time warning when running without Upstash (dev only, since
// production throws above).  Helps catch mis-configured preview deploys.
if (!isProduction && !upstashConfigured) {
  logger.warn('[RATE-LIMIT] Upstash Redis not configured — all rate limiters are fail-open (dev mode).');
}

let signupRateLimiter: Ratelimit | null = null;
let applySignupRateLimiter: Ratelimit | null = null;
let authRateLimiter: Ratelimit | null = null;
// Per-IP-only bucket used alongside the per-(ip,email) `authRateLimiter`
// above. The compound key permits credential-stuffing — rotating emails on
// one IP gives each email its own bucket. This bucket caps the total
// auth attempts from any single IP regardless of which email is being
// tried. Per-launch-bump tuning: 300/15min covers a workforce-center- or
// library-on-shared-IP burst (~20 people each with a few attempts) without
// enabling rapid stuffing. The compound bucket at 20/min/email still
// catches single-account brute force. Revisit if abuse signals appear.
let authIpRateLimiter: Ratelimit | null = null;
// Per-email-only bucket for signup endpoints. Each signup route has its
// own per-IP limiter; this one prevents an attacker spread across many
// IPs from spamming the same target email with verification mails
// (Supabase will silently send "your account already exists" notices to
// real owners, which is an email-bombing surface for a known address).
let signupEmailRateLimiter: Ratelimit | null = null;
let aiToolRateLimiter: Ratelimit | null = null;
// Per-user limiter for the in-portal help assistant (/api/help/chat,
// `help_assistant_v1`). Each question is one LLM completion; 30/h covers a
// real conversation while capping a stuck retry loop or a scripted client.
// Security-mode (fail-closed) unlike the general AI-tool limiter: the endpoint
// is a free-text prompt surface and must not run unmetered in production.
let helpAssistantRateLimiter: Ratelimit | null = null;
let resumeUploadRateLimiter: Ratelimit | null = null;
let resumeDraftSaveRateLimiter: Ratelimit | null = null;
let contactRateLimiter: Ratelimit | null = null;
let adminInviteRateLimiter: Ratelimit | null = null;
// Per-admin limiter on /api/admin/members/bulk-email. The route can
// fire up to MAX_MEMBERS (100) Resend sends per call; without a
// per-admin cap a compromised admin token can blast every member in
// the org repeatedly until Resend's bulk-sender heuristic trips and
// the domain reputation craters. 3 bulk-sends per hour per admin
// covers normal communications while blocking compromise/abuse.
let bulkEmailRateLimiter: Ratelimit | null = null;
let employerJobImportRateLimiter: Ratelimit | null = null;
let partnerSignupRateLimiter: Ratelimit | null = null;
let confirmationEmailRateLimiter: Ratelimit | null = null;
// Per-email cap to prevent IP-rotating spray against a target inbox.
// The per-IP limiter alone allows a botnet to spam any chosen address
// with our branded "your application was received" email, abusing our
// domain for phishing pretext. 2/hr/email blocks that without affecting
// legitimate re-sends.
let confirmationEmailEmailRateLimiter: Ratelimit | null = null;
let careersRecommendRateLimiter: Ratelimit | null = null;
let interestProfilerRateLimiter: Ratelimit | null = null;
let forgotPasswordRateLimiter: Ratelimit | null = null;
let forgotPasswordEmailRateLimiter: Ratelimit | null = null;
let publicCareersGetRateLimiter: Ratelimit | null = null;
let publicVoiceSessionRateLimiter: Ratelimit | null = null;
// Per-authenticated-user limiter for any ElevenLabs voice session mint
// (member portal voice tools, counselor/employer/partner walkthroughs,
// AI interview practice, etc.). Each session bills 5-10 minutes of
// ElevenLabs voice at ~$0.30/min, so 1k unbounded reqs ≈ $1.5-3k.
// 10/hr per user covers multi-coach practice and retrying session starts while
// blocking obvious abuse and accidental loops.
let voiceSessionRateLimiter: Ratelimit | null = null;
export const VOICE_SESSION_STARTS_PER_HOUR = 10;
export const VOICE_SESSION_LIMIT_MESSAGE =
  `The limit is ${VOICE_SESSION_STARTS_PER_HOUR} voice session starts per hour. Please try again later.`;
let inviteAcceptRateLimiter: Ratelimit | null = null;
let publicInviteValidateRateLimiter: Ratelimit | null = null;
let publicOrgOutcomesRateLimiter: Ratelimit | null = null;
let publicUnsubscribeRateLimiter: Ratelimit | null = null;
let verifyMfaRateLimiter: Ratelimit | null = null;
let publicHealthRateLimiter: Ratelimit | null = null;
let xapiConfigGetRateLimiter: Ratelimit | null = null;
let xapiOAuthTokenRateLimiter: Ratelimit | null = null;
let xapiStatementsPostRateLimiter: Ratelimit | null = null;
let placementSurveyRateLimiter: Ratelimit | null = null;
let publicWioaQualificationRateLimiter: Ratelimit | null = null;
let webhookRateLimiter: Ratelimit | null = null;
let orgOnboardRateLimiter: Ratelimit | null = null;
let publicInterestProfilerRateLimiter: Ratelimit | null = null;
let courseraIdentityRateLimiter: Ratelimit | null = null;
// Per-IP limiter for the PUBLIC tokenized eligibility-questionnaire submit
// (POST /api/q/[token]/submit). The endpoint is reachable with no account —
// only a valid single-use token gates it — so an attacker who harvests a
// token (or sprays guesses) could otherwise hammer the write path. The token
// is consumed atomically on first submit, but the rate limit caps guessing /
// retry abuse before that. 5/min/IP covers a recipient who fat-fingers a few
// submits without enabling a flood.
let publicQuestionnaireSubmitRateLimiter: Ratelimit | null = null;
let adminTokenLinksRateLimiter: Ratelimit | null = null;
// Per-user cap on portal message sends (member/employer/partner counselor
// threads + employer application messages). Previously enforced with a
// module-level in-memory Map, which is per-instance only — on a
// multi-instance deploy each instance gets its own bucket, letting a user
// send up to N-times-instances messages per window. Moved to Redis so the
// limit is enforced globally. 10/min matches the prior in-memory semantics.
let messageSendRateLimiter: Ratelimit | null = null;

/**
 * Fail-closed wrapper for security-critical rate-limit checks.
 *
 * In production, if Upstash is missing, we MUST block the request rather
 * than allow unlimited abuse.  In dev we log once and allow (fail-open).
 *
 * @param limiter    — the Upstash Ratelimit instance (null when unconfigured)
 * @param name       — human-readable limiter name for logs
 * @param identifier — the key being rate-limited (IP, email, userId)
 */
/**
 * QA / CI bypass for automated testing.
 *
 * When `WAP_RATE_LIMIT_QA_BYPASS=1` is set, any request carrying the
 * `x-wap-qa-bypass` header with the value from `WAP_RATE_LIMIT_QA_SECRET`
 * (or the default dev secret) is allowed through rate limiters.
 *
 * This is intentionally NOT a public env var — it must be set in CI
 * secrets or local .env only. Never commit the secret.
 */
function isQaBypassEnabled(): boolean {
  return process.env.WAP_RATE_LIMIT_QA_BYPASS?.trim() === '1';
}

function getQaBypassSecret(): string {
  return process.env.WAP_RATE_LIMIT_QA_SECRET?.trim() || 'wap-qa-dev-secret-do-not-use-in-production';
}

function isQaBypassRequest(request?: Request): boolean {
  if (!isQaBypassEnabled()) return false;
  if (!request) return false;
  const header = request.headers.get('x-wap-qa-bypass')?.trim();
  return header === getQaBypassSecret();
}

async function runLimiter(
  limiter: Ratelimit | null,
  name: string,
  identifier: string,
  mode: MissingLimiterMode,
  request?: Request
): Promise<{ success: boolean; remaining?: number }> {
  if (isQaBypassRequest(request)) {
    logger.info(`[RATE-LIMIT] QA bypass active — allowing ${name} request for ${identifier}`);
    return { success: true };
  }

  if (limiter) {
    const result = await limiter.limit(identifier);
    return { success: result.success, remaining: result.remaining };
  }

  const decision = decideMissingLimiter({
    isProduction,
    allowMissingUpstash,
    mode,
    applyFailClosedEnv: isApplyFailClosedEnvEnabled(),
  });

  if (!decision.success) {
    logger.error(
      `[RATE-LIMIT] ${name} limiter is null (${decision.reason}) — blocking request for ${identifier}`
    );
    return { success: false, remaining: 0 };
  }

  if (decision.reason === 'dev-fail-open') {
    logger.warn(`[RATE-LIMIT] ${name} limiter is null — allowing request for ${identifier} (dev fail-open)`);
  } else {
    logger.warn(
      `[RATE-LIMIT] ${name} limiter is null (${decision.reason}) — allowing request for ${identifier}`
    );
  }
  return { success: true };
}

async function failClosedLimit(
  limiter: Ratelimit | null,
  name: string,
  identifier: string,
  request?: Request
): Promise<{ success: boolean; remaining?: number }> {
  return runLimiter(limiter, name, identifier, 'security', request);
}

async function failClosedApplyLimit(
  limiter: Ratelimit | null,
  name: string,
  identifier: string,
  request?: Request
): Promise<{ success: boolean; remaining?: number }> {
  return runLimiter(limiter, name, identifier, 'apply', request);
}

if (redisUrl && redisToken) {
  const redis = new Redis({ url: redisUrl, token: redisToken });
  signupRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(12, '30 m'),
    prefix: 'ratelimit:signup',
  });
  applySignupRateLimiter = new Ratelimit({
    redis,
    // Launch bump: 50 per 30 min per IP (up from 20) — workforce centers / libraries
    // have many applicants on shared public IPs. Revert after launch if abuse appears.
    limiter: Ratelimit.slidingWindow(50, '30 m'),
    prefix: 'ratelimit:apply-signup',
  });
  authRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, '1 m'),
    prefix: 'ratelimit:auth',
  });
  authIpRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(300, '15 m'),
    prefix: 'ratelimit:auth-ip',
  });
  signupEmailRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(3, '1 h'),
    prefix: 'ratelimit:signup-email',
  });
  aiToolRateLimiter = new Ratelimit({
    redis,
    // Launch softening: members can hit several AI tools in one session.
    limiter: Ratelimit.slidingWindow(25, '1 h'),
    prefix: 'ratelimit:ai-tool',
  });
  helpAssistantRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, '1 h'),
    prefix: 'ratelimit:help-assistant',
  });
  resumeUploadRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, '1 h'),
    prefix: 'ratelimit:resume-upload',
  });
  resumeDraftSaveRateLimiter = new Ratelimit({
    redis,
    // Autosave is intentionally generous but bounded against authenticated
    // storage/write amplification. Normal editing stays well below 5/minute.
    limiter: Ratelimit.slidingWindow(300, '1 h'),
    prefix: 'ratelimit:resume-draft-save',
  });
  contactRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(3, '1 h'),
    prefix: 'ratelimit:contact',
  });
  adminInviteRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '1 h'),
    prefix: 'ratelimit:admin-invite',
  });
  bulkEmailRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(3, '1 h'),
    prefix: 'ratelimit:bulk-email',
  });
  employerJobImportRateLimiter = new Ratelimit({
    redis,
    // Bulk import can trigger many AI/scrape calls per request; keep this tighter than generic AI-tool limits.
    limiter: Ratelimit.slidingWindow(8, '1 h'),
    prefix: 'ratelimit:employer-job-import',
  });
  partnerSignupRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '1 h'),
    prefix: 'ratelimit:partner-signup',
  });
  confirmationEmailRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '1 h'),
    prefix: 'ratelimit:confirmation-email',
  });
  confirmationEmailEmailRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(2, '1 h'),
    prefix: 'ratelimit:confirmation-email-email',
  });
  careersRecommendRateLimiter = new Ratelimit({
    redis,
    // Quiz retries and slow devices can create extra submissions during exploration.
    limiter: Ratelimit.slidingWindow(60, '1 h'),
    prefix: 'ratelimit:careers-recommend',
  });
  interestProfilerRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, '1 h'),
    prefix: 'ratelimit:interest-profiler',
  });
  forgotPasswordRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '1 h'),
    prefix: 'ratelimit:forgot-password',
  });
  forgotPasswordEmailRateLimiter = new Ratelimit({
    redis,
    // Was 3 per 24 h: anyone who clicked "reset" a few times while a link was
    // slow to arrive was silently locked out for a day (9/2/26 ops report).
    limiter: Ratelimit.slidingWindow(5, '1 h'),
    prefix: 'ratelimit:forgot-password-email',
  });
  publicCareersGetRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(120, '1 h'),
    prefix: 'ratelimit:careers-public-get',
  });
  voiceSessionRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(VOICE_SESSION_STARTS_PER_HOUR, '1 h'),
    prefix: 'ratelimit:voice-session',
  });
  publicVoiceSessionRateLimiter = new Ratelimit({
    redis,
    // Public voice flows may retry on mic permission / network hiccups.
    limiter: Ratelimit.slidingWindow(20, '10 m'),
    prefix: 'ratelimit:public-voice-session',
  });
  inviteAcceptRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '1 h'),
    prefix: 'ratelimit:invite-accept',
  });
  publicInviteValidateRateLimiter = new Ratelimit({
    redis,
    // Unauthenticated token lookup; the invite page calls it once per load,
    // so this only needs to stop token brute-force, not legitimate refreshes.
    limiter: Ratelimit.slidingWindow(60, '1 h'),
    prefix: 'ratelimit:public-invite-validate',
  });
  publicOrgOutcomesRateLimiter = new Ratelimit({
    redis,
    // Public partner outcomes page re-fetches on each quarter/year change.
    limiter: Ratelimit.slidingWindow(120, '1 h'),
    prefix: 'ratelimit:public-org-outcomes',
  });
  publicUnsubscribeRateLimiter = new Ratelimit({
    redis,
    // Unauthenticated HMAC-token unsubscribe (RFC 8058 one-click POST + footer
    // GET). Each valid hit is a user lookup + update, so cap per IP. Mailbox
    // providers POST from shared egress IPs, so keep headroom above what one
    // person could ever click.
    limiter: Ratelimit.slidingWindow(60, '1 h'),
    prefix: 'ratelimit:public-unsubscribe',
  });
  verifyMfaRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '15 m'),
    prefix: 'ratelimit:verify-mfa',
  });
  publicHealthRateLimiter = new Ratelimit({
    redis,
    // Uptime monitors + scrapers: generous per IP without opening infinite abuse.
    limiter: Ratelimit.slidingWindow(600, '1 h'),
    prefix: 'ratelimit:public-health',
  });
  xapiConfigGetRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(120, '1 h'),
    prefix: 'ratelimit:xapi-config-get',
  });
  xapiOAuthTokenRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(120, '1 h'),
    prefix: 'ratelimit:xapi-oauth-token',
  });
  xapiStatementsPostRateLimiter = new Ratelimit({
    redis,
    // Ingest can batch; keep high enough for legitimate LRS traffic per egress IP.
    limiter: Ratelimit.slidingWindow(3000, '1 h'),
    prefix: 'ratelimit:xapi-statements-post',
  });
  placementSurveyRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(50, '1 h'),
    prefix: 'ratelimit:placement-survey',
  });
  publicWioaQualificationRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '1 h'),
    prefix: 'ratelimit:public-wioa-qualification',
  });
  webhookRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(1000, '1 m'),
    prefix: 'ratelimit:webhook',
  });
  orgOnboardRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '1 h'),
    prefix: 'ratelimit:org-onboard',
  });
  publicInterestProfilerRateLimiter = new Ratelimit({
    redis,
    // Public interest profiler — generous per IP for exploration; 50/hr covers
    // legitimate repeat visitors while preventing abuse of the O*NET API.
    limiter: Ratelimit.slidingWindow(50, '1 h'),
    prefix: 'ratelimit:public-interest-profiler',
  });
  courseraIdentityRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '1 h'),
    prefix: 'ratelimit:coursera-identity',
  });
  publicQuestionnaireSubmitRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '1 m'),
    prefix: 'ratelimit:public-questionnaire-submit',
  });
  adminTokenLinksRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '1 h'),
    prefix: 'ratelimit:admin-token-links',
  });
  messageSendRateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '1 m'),
    prefix: 'ratelimit:message-send',
  });
}

export async function checkSignupRateLimit(identifier: string, request?: Request): Promise<{ success: boolean; remaining?: number }> {
  return failClosedApplyLimit(signupRateLimiter, 'signup', identifier, request);
}

export async function checkApplySignupRateLimit(identifier: string, request?: Request): Promise<{ success: boolean; remaining?: number }> {
  return failClosedApplyLimit(applySignupRateLimiter, 'apply-signup', identifier, request);
}

export async function checkAuthRateLimit(identifier: string, request?: Request): Promise<{ success: boolean; remaining?: number }> {
  return failClosedLimit(authRateLimiter, 'auth', identifier, request);
}

/**
 * Per-IP-only auth limiter. Use alongside `checkAuthRateLimit` (which is
 * keyed by `ip:email`) so a credential-stuffer rotating emails on one IP
 * is throttled by total attempts, not per-target-email buckets.
 */
export async function checkAuthIpRateLimit(ip: string, request?: Request): Promise<{ success: boolean; remaining?: number }> {
  return failClosedLimit(authIpRateLimiter, 'auth-ip', `auth-ip:${ip}`, request);
}

/**
 * Per-authenticated-user voice-session rate limit. Apply at every
 * voice-session / voice-walkthrough / interview/session call site
 * (under `/api/`). ElevenLabs is ~$0.30/min and each session bills
 * 5-10 min, so unbounded mints are an immediate money-drain on a
 * compromised account.
 */
export async function checkVoiceSessionRateLimit(userId: string): Promise<{ success: boolean; remaining?: number }> {
  if (!voiceSessionRateLimiter) return { success: true };
  const result = await voiceSessionRateLimiter.limit(`voice-session:${userId}`);
  return { success: result.success, remaining: result.remaining };
}

/**
 * Per-email signup limiter. Use alongside the per-IP signup limiters
 * (member/apply/employer/partner) to block one attacker rotating IPs to
 * spam verification mail to the same target address.
 */
export async function checkSignupEmailRateLimit(email: string, request?: Request): Promise<{ success: boolean; remaining?: number }> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return { success: true };
  return failClosedApplyLimit(signupEmailRateLimiter, 'signup-email', `signup-email:${normalized}`, request);
}

export async function checkAIToolRateLimit(userId: string): Promise<{ success: boolean; remaining?: number }> {
  if (!aiToolRateLimiter) return { success: true };
  const result = await aiToolRateLimiter.limit(userId);
  return { success: result.success, remaining: result.remaining };
}

/** Help assistant questions: fail-closed when the limiter is unavailable in production. */
export async function checkHelpAssistantRateLimit(userId: string, request?: Request): Promise<{ success: boolean; remaining?: number }> {
  return failClosedLimit(helpAssistantRateLimiter, 'help-assistant', `help-assistant:${userId}`, request);
}

export async function checkResumeUploadRateLimit(userId: string): Promise<{ success: boolean; remaining?: number }> {
  if (!resumeUploadRateLimiter) return { success: true };
  const result = await resumeUploadRateLimiter.limit(`resume-upload:${userId}`);
  return { success: result.success, remaining: result.remaining };
}

export async function checkResumeDraftSaveRateLimit(userId: string): Promise<{ success: boolean; remaining?: number }> {
  if (!resumeDraftSaveRateLimiter) return { success: true };
  const result = await resumeDraftSaveRateLimiter.limit(`resume-draft-save:${userId}`);
  return { success: result.success, remaining: result.remaining };
}

export async function checkContactRateLimit(ip: string): Promise<{ success: boolean; remaining?: number }> {
  return failClosedLimit(contactRateLimiter, 'contact', ip);
}

/** Public partner/employer self-registration — fail-closed in production when Redis is missing. */
export async function checkPartnerSignupRateLimit(identifier: string, request?: Request): Promise<{ success: boolean }> {
  const r = await failClosedLimit(partnerSignupRateLimiter, 'partner-signup', identifier, request);
  return { success: r.success };
}

export async function checkAdminInviteRateLimit(userId: string): Promise<{ success: boolean; remaining?: number }> {
  if (!adminInviteRateLimiter) return { success: true };
  const result = await adminInviteRateLimiter.limit(userId);
  return { success: result.success, remaining: result.remaining };
}

/**
 * Per-admin cap on /api/admin/members/bulk-email — 3 calls/hr. Each
 * call can fan out to MAX_MEMBERS (100) Resend sends, so a compromised
 * admin can blast the entire member list and burn the domain's bulk-
 * sender reputation.
 */
export async function checkBulkEmailRateLimit(userId: string, request?: Request): Promise<{ success: boolean; remaining?: number }> {
  return failClosedLimit(bulkEmailRateLimiter, 'bulk-email', `bulk-email:${userId}`, request);
}

/** Per-user cap on employer job import POSTs (single + bulk share one bucket). Fail-open without Redis. */
export async function checkEmployerJobImportRateLimit(userId: string): Promise<{ success: boolean; remaining?: number }> {
  if (!employerJobImportRateLimiter) return { success: true };
  const result = await employerJobImportRateLimiter.limit(userId);
  return { success: result.success, remaining: result.remaining };
}

/** Public confirmation-email endpoint — 5 per IP per hour. Fails closed in production. */
export async function checkConfirmationEmailRateLimit(ip: string): Promise<{ success: boolean }> {
  const r = await failClosedLimit(confirmationEmailRateLimiter, 'confirmation-email', ip);
  return { success: r.success };
}

/** Per-email cap on confirmation-email sends — 2 per email per hour. Same fail-closed policy. Use both together. */
export async function checkConfirmationEmailEmailRateLimit(email: string): Promise<{ success: boolean }> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return { success: true };
  const r = await failClosedLimit(confirmationEmailEmailRateLimiter, 'confirmation-email-email', `confirmation-email-email:${normalized}`);
  return { success: r.success };
}

/** Public career quiz recommend — fail-open without Redis (dev). */
export async function checkCareersRecommendRateLimit(ip: string): Promise<{ success: boolean }> {
  if (!careersRecommendRateLimiter) return { success: true };
  const result = await careersRecommendRateLimiter.limit(ip);
  return { success: result.success };
}

/** Member Interest Profiler API — per-user cap; fail-open without Redis (dev). */
export async function checkInterestProfilerRateLimit(userId: string): Promise<{ success: boolean }> {
  if (!interestProfilerRateLimiter) return { success: true };
  const result = await interestProfilerRateLimiter.limit(userId);
  return { success: result.success };
}

/** Forgot-password / reset email requests — per IP; fail-closed in production. */
export async function checkForgotPasswordRateLimit(ip: string): Promise<{ success: boolean }> {
  const r = await failClosedLimit(forgotPasswordRateLimiter, 'forgot-password', ip);
  return { success: r.success };
}

/** Forgot-password per-email cap — 5 requests per email per hour; fail-closed in production. */
export async function checkForgotPasswordEmailRateLimit(email: string): Promise<{ success: boolean }> {
  const r = await failClosedLimit(forgotPasswordEmailRateLimiter, 'forgot-password-email', email.toLowerCase());
  return { success: r.success };
}

/** Public GET /api/careers/* (occupation detail, program matches) — per IP; fail-open without Redis. */
export async function checkPublicCareersGetRateLimit(ip: string): Promise<{ success: boolean }> {
  if (!publicCareersGetRateLimiter) return { success: true };
  const result = await publicCareersGetRateLimiter.limit(ip);
  return { success: result.success };
}

/** Public voice-session minting — per IP; fail-open without Redis in dev, but throttle aggressively when configured. */
export async function checkPublicVoiceSessionRateLimit(ip: string): Promise<{ success: boolean }> {
  if (!publicVoiceSessionRateLimiter) return { success: true };
  const result = await publicVoiceSessionRateLimiter.limit(ip);
  return { success: result.success };
}

/** Invitation acceptance (account creation) — per IP; fail-open without Redis. */
export async function checkInviteAcceptRateLimit(ip: string): Promise<{ success: boolean }> {
  if (!inviteAcceptRateLimiter) return { success: true };
  const result = await inviteAcceptRateLimiter.limit(ip);
  return { success: result.success };
}

/** GET /api/invite/validate?token= — public token lookup; per IP, fail-open without Redis. */
export async function checkPublicInviteValidateRateLimit(ip: string): Promise<{ success: boolean }> {
  if (!publicInviteValidateRateLimiter) return { success: true };
  const result = await publicInviteValidateRateLimiter.limit(ip);
  return { success: result.success };
}

/** GET /api/org/[slug]/outcomes — public partner outcomes read; per IP, fail-open without Redis. */
export async function checkPublicOrgOutcomesRateLimit(ip: string): Promise<{ success: boolean }> {
  if (!publicOrgOutcomesRateLimiter) return { success: true };
  const result = await publicOrgOutcomesRateLimiter.limit(ip);
  return { success: result.success };
}

/** GET/POST /api/unsubscribe?token= — public HMAC-token unsubscribe; per IP, fail-open without Redis. */
export async function checkPublicUnsubscribeRateLimit(ip: string): Promise<{ success: boolean }> {
  if (!publicUnsubscribeRateLimiter) return { success: true };
  const result = await publicUnsubscribeRateLimiter.limit(ip);
  return { success: result.success };
}

/** MFA challenge/verify — 10 attempts per 15 min per IP; fail-closed in production without Redis. */
export async function checkVerifyMfaRateLimit(ip: string, request?: Request): Promise<{ success: boolean }> {
  const r = await failClosedLimit(verifyMfaRateLimiter, 'verify-mfa', ip, request);
  return { success: r.success };
}

/** GET /api/health — fail-open without Redis (same as other public GET caps). */
export async function checkPublicHealthRateLimit(ip: string): Promise<{ success: boolean }> {
  if (!publicHealthRateLimiter) return { success: true };
  const result = await publicHealthRateLimiter.limit(ip);
  return { success: result.success };
}

/** GET /api/xapi/config */
export async function checkXapiConfigGetRateLimit(ip: string): Promise<{ success: boolean }> {
  if (!xapiConfigGetRateLimiter) return { success: true };
  const result = await xapiConfigGetRateLimiter.limit(ip);
  return { success: result.success };
}

/** POST /api/xapi/oauth/token */
export async function checkXapiOAuthTokenRateLimit(ip: string): Promise<{ success: boolean }> {
  if (!xapiOAuthTokenRateLimiter) return { success: true };
  const result = await xapiOAuthTokenRateLimiter.limit(ip);
  return { success: result.success };
}

/** POST /api/xapi/statements */
export async function checkXapiStatementsPostRateLimit(ip: string): Promise<{ success: boolean }> {
  if (!xapiStatementsPostRateLimiter) return { success: true };
  const result = await xapiStatementsPostRateLimiter.limit(ip);
  return { success: result.success };
}

/** GET + POST /api/placement-survey (unauthenticated) */
export async function checkPlacementSurveyRateLimit(ip: string): Promise<{ success: boolean }> {
  if (!placementSurveyRateLimiter) return { success: true };
  const result = await placementSurveyRateLimiter.limit(ip);
  return { success: result.success };
}

/** POST /api/public/wioa-qualification — public lead form; fail-open without Redis. */
export async function checkPublicWioaQualificationRateLimit(ip: string): Promise<{ success: boolean }> {
  if (!publicWioaQualificationRateLimiter) return { success: true };
  const result = await publicWioaQualificationRateLimiter.limit(ip);
  return { success: result.success };
}

/** Webhook endpoints (Coursera, learning-completion, etc.) — generous for legitimate retries. */
export async function checkWebhookRateLimit(ip: string): Promise<{ success: boolean }> {
  if (!webhookRateLimiter) return { success: true };
  const result = await webhookRateLimiter.limit(ip);
  return { success: result.success };
}

/** POST /api/org/onboard — public organization creation; fail-open without Redis. */
export async function checkOrgOnboardRateLimit(ip: string): Promise<{ success: boolean }> {
  if (!orgOnboardRateLimiter) return { success: true };
  const result = await orgOnboardRateLimiter.limit(ip);
  return { success: result.success };
}

/** POST /api/public/interest-profiler/* — public no-account quiz; cap per-IP O*NET abuse. Fail-open without Redis. */
export async function checkPublicInterestProfilerRateLimit(ip: string): Promise<{ success: boolean }> {
  if (!publicInterestProfilerRateLimiter) return { success: true };
  const result = await publicInterestProfilerRateLimiter.limit(ip);
  return { success: result.success };
}

/** Per-admin cap on tokenized-link minting — 10 per hour. Credential-minting
 * surface; without a cap a compromised admin token can mint unlimited links.
 */
export async function checkAdminTokenLinksRateLimit(userId: string): Promise<{ success: boolean; remaining?: number }> {
  if (!adminTokenLinksRateLimiter) return { success: true };
  const result = await adminTokenLinksRateLimiter.limit(userId);
  return { success: result.success, remaining: result.remaining };
}

/** POST /api/q/[token]/submit — PUBLIC (no-account) tokenized eligibility
 * questionnaire submit. Token-gated + single-use, but reachable without auth,
 * so cap per-IP abuse. Fail-open without Redis (the single-use token consume
 * is the hard guarantee).
 */
export async function checkPublicQuestionnaireSubmitRateLimit(ip: string): Promise<{ success: boolean }> {
  if (!publicQuestionnaireSubmitRateLimiter) return { success: true };
  const result = await publicQuestionnaireSubmitRateLimiter.limit(ip);
  return { success: result.success };
}

/** POST /api/member/coursera/identity — limit Coursera email spray. */
export async function checkCourseraIdentityRateLimit(ip: string): Promise<{ success: boolean }> {
  if (!courseraIdentityRateLimiter) return { success: true };
  const result = await courseraIdentityRateLimiter.limit(ip);
  return { success: result.success };
}

/**
 * Per-user cap on portal message sends — 10 messages per minute per user.
 * Backs `checkMessageRateLimit` in lib/messages/rateLimit.ts. Redis-backed so
 * the limit holds across all serverless instances (the prior in-memory Map
 * only enforced the limit per-instance). Fail-open without Redis, matching
 * the prior in-memory behavior of always allowing when unconfigured.
 */
export async function checkMessageSendRateLimit(
  userId: string
): Promise<{ success: boolean; remaining?: number; resetMs?: number }> {
  if (!messageSendRateLimiter) return { success: true };
  const result = await messageSendRateLimiter.limit(`message-send:${userId}`);
  return { success: result.success, remaining: result.remaining, resetMs: result.reset };
}
