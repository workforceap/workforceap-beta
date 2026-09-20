# WorkforceAP Environment Variables

> **Last audited:** 2026-09-17
>
> **Scope:** Application code (`app/`, `lib/`, `components/`, `scripts/`, `tests/`, `prisma/`)
>
> **Excludes:** Node.js / Next.js / Vercel runtime internals (e.g. `PORT`, `HOSTNAME`, `PATH`)

---

## Table of Contents

1. [Legend](#legend)
2. [Quick Stats](#quick-stats)
3. [Core Infrastructure](#core-infrastructure)
4. [Authentication & Security](#authentication--security)
5. [Database](#database)
6. [Email](#email)
7. [AI & LLM Providers](#ai--llm-providers)
8. [ElevenLabs Voice & Conversational AI](#elevenlabs-voice--conversational-ai)
9. [Coursera / Learning Integration](#coursera--learning-integration)
10. [Stripe / Payments](#stripe--payments)
11. [Analytics & Monitoring](#analytics--monitoring)
12. [WIOA](#wioa)
13. [Partner & Org](#partner--org)
14. [Admin & Cron](#admin--cron)
15. [Testing & QA](#testing--qa)
16. [Build & Internal](#build--internal)
17. [Deprecated / Legacy](#deprecated--legacy)
18. [Security Notes](#security-notes)
19. [Drift Report](#drift-report)

---

## Legend

| Badge | Meaning |
|-------|---------|
| 🔴 **Required** | App will error or misbehave in production without this |
| 🟡 **Recommended** | App works without it but features are degraded |
| 🟢 **Optional** | Nice-to-have; no impact if missing |
| 🛠️ **Dev-only** | Only needed for local development, seeding, or E2E tests |
| 👁️ **Public** | Safe to expose to the browser (`NEXT_PUBLIC_*`) |
| 🔒 **Secret** | Server-only. Never prefix with `NEXT_PUBLIC_` |

---

## Quick Stats

| Category | Count |
|----------|-------|
| 🔴 Required for production | ~14 |
| 🟡 Recommended for production | ~12 |
| 🟢 Optional | ~35 |
| 🛠️ Dev / test only | ~14 |
| 🔴 Deprecated / unused in code | 6 |
| **Total application env vars** | **~81** |

---

## Core Infrastructure

| Name | Badge | Description | Example | Used In |
|------|-------|-------------|---------|---------|
| `NODE_ENV` | — | Node.js runtime mode (set automatically) | `production` | Universal |
| `NEXT_PUBLIC_SITE_URL` | 🔴 👁️ | Canonical public URL for links, redirects, emails | `https://www.workforceap.org` | `middleware.ts`, email, auth, Coursera |
| `NEXT_PUBLIC_BASE_URL` | 🟢 👁️ | Alternate base URL fallback | `https://www.workforceap.org` | Smoke-test cron |
| `VERCEL_URL` | — | Vercel auto-provided deploy URL | `wap-abc123.vercel.app` | Site URL fallback |
| `VERCEL_ENV` | — | Vercel environment name | `production` | Sentry env fallback |
| `NEXT_PUBLIC_VERCEL_ENV` | 🟢 👁️ | Exposed Vercel env for client checks | `production` | Sentry client config |

---

## Authentication & Security

| Name | Badge | Description | Example | Used In |
|------|-------|-------------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | 🔴 👁️ | Supabase project URL | `https://xyz.supabase.co` | `middleware.ts`, client, server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 🔴 👁️ | Supabase public anon key | `eyJ...` | `middleware.ts`, client, server |
| `SUPABASE_SERVICE_ROLE_KEY` | 🔴 🔒 | Supabase service role key (bypasses RLS) | `eyJ...` | Server DB admin ops |
| `AUTH_TRUST_COOKIE_SECRET` | 🔴 🔒 | Signing secret for admin MFA trust cookies | `openssl rand -hex 32` | `lib/auth/mfaTrust.ts` |
| `ADMIN_MFA_TRUST_DAYS` | 🟡 🔒 | How long admin MFA trust lasts (default: 7) | `7` | `lib/auth/mfaTrust.ts` |
| `STAFF_MFA_ENFORCEMENT` | 🟡 🔒 | Set `1` to force MFA for staff | `0` or `1` | Auth flows |
| `CRON_SECRET` | 🔴 🔒 | Protects `/api/cron/*` endpoints | `openssl rand -hex 32` | All cron routes |
| `PLACEMENT_SURVEY_TOKEN_SECRET` | 🔴 🔒 | Signs post-placement survey email links | `openssl rand -hex 32` | Placement survey cron |
| `UNSUBSCRIBE_TOKEN_SECRET` | 🟡 🔒 | Signs one-click email unsubscribe tokens. When unset the code falls back to `CRON_SECRET`, then `SUPABASE_SERVICE_ROLE_KEY`; set it explicitly, because the tokens never expire and rotating a fallback silently invalidates every unsubscribe link already sent | `openssl rand -hex 32` | `lib/email/unsubscribeToken.ts` |
| `NEXT_PUBLIC_CAPTCHA_ENABLED` | 🟡 👁️ | Enable Cloudflare Turnstile | `false` | Public forms |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | 🟡 👁️ | Turnstile site key (public) | `0x4AAAA...` | Employer contact, public forms |
| `TURNSTILE_SECRET_KEY` | 🟡 🔒 | Turnstile secret key | `0x4AAAA...` | API validation |
| `UPSTASH_REDIS_REST_URL` | 🟡 🔒 | Upstash Redis REST URL for rate limiters and short-lived member-agent tool sessions | `https://….upstash.io` | `lib/rate-limit.ts`, `lib/agents/gateway/sessionStore.ts` |
| `UPSTASH_REDIS_REST_TOKEN` | 🟡 🔒 | Upstash Redis REST token for rate limits and member-agent tool sessions | `AXxxxx` | `lib/rate-limit.ts`, `lib/agents/gateway/sessionStore.ts` |
| `RATE_LIMIT_ALLOW_MISSING_UPSTASH` | 🟢 🔒 | Set `1` to boot production/preview without Redis. Auth/contact/partner-signup/MFA/bulk-email fail-open. Apply/signup stay open unless `WAP_APPLY_RATE_LIMIT_FAIL_CLOSED=1`. | `1` | `lib/rate-limit.ts`, `lib/rate-limit-policy.ts` |
| `WAP_APPLY_RATE_LIMIT_FAIL_CLOSED` | 🟢 🔒 | Set `1` to 429 apply/member signup when Redis is missing, even if `RATE_LIMIT_ALLOW_MISSING_UPSTASH=1`. Off by default so pre-prod conversion is not bricked. | `1` | `lib/rate-limit-policy.ts` |

Still fail-open when Redis is missing (dev, or prod with `RATE_LIMIT_ALLOW_MISSING_UPSTASH=1`): public GET caps, invite-accept, org-onboard, careers-recommend, interest-profiler, webhooks, message-send, employer job-import, admin invite / token-links, Coursera identity, voice session, AI tools. Lilley's member-data tools are the exception: gateway token issue and authorization always fail closed without Upstash.

---

## Database

| Name | Badge | Description | Example | Used In |
|------|-------|-------------|---------|---------|
| `POSTGRES_PRISMA_URL` | 🔴 🔒 | Pooled Prisma connection string | `postgresql://...?pgbouncer=true` | Prisma client |
| `POSTGRES_URL_NON_POOLING` | 🔴 🔒 | Direct non-pooled connection (migrations) | `postgresql://...` | Prisma migrate |
| `DATABASE_URL` | 🟡 🔒 | Fallback for local dev | `postgresql://...` | `scripts/ensure-prisma-env.cjs` |
| `__PRISMA_PLACEHOLDER_DB` | 🛠️ 🔒 | Internal flag set by build script when DB is unreachable | `1` | `lib/db/optionalBuildDb.ts` |
| `WORKFORCEAP_FORCE_DB_BUILD` | 🛠️ 🔒 | Force DB queries during build (dev override) | `1` | `lib/db/optionalBuildDb.ts` |

**Note:** `scripts/ensure-prisma-env.cjs` automatically copies `DATABASE_URL` → `POSTGRES_PRISMA_URL` / `POSTGRES_URL_NON_POOLING` if the latter are missing.

---

## Email

| Name | Badge | Description | Example | Used In |
|------|-------|-------------|---------|---------|
| `RESEND_API_KEY` | 🔴 🔒 | Resend API key for transactional email | `re_xxxxxxxx` | `lib/email.ts` |
| `EMAIL_FROM` | 🔴 🔒 | Default sender address | `WorkforceAP <hello@workforceap.org>` | `lib/email.ts` |
| `SUPPORT_EMAIL` | 🟡 🔒 | Support/contact email fallback | `info@workforceap.org` | `lib/tenant/organizationBranding.ts` |
| `WORKSPACE_EMAIL_PROVIDER` | 🟢 🔒 | Workspace email provider (`noop`, `google`, `microsoft`) | `noop` | `lib/workspace-email/provider.ts` |
| `VOICE_COACH_TRANSCRIPT_EMAILS` | 🟢 🔒 | Comma-separated recipients for coach transcripts | `admin@workforceap.org` | `lib/email.ts` |
| `VOICE_INTERVIEW_TRANSCRIPT_EMAILS` | 🟢 🔒 | Comma-separated recipients for interview transcripts | `admin@workforceap.org` | `app/api/interview/history/route.ts` |
| `AT_RISK_DIGEST_EMAILS` | 🟢 🔒 | Comma-separated staff fallback recipients for nightly at-risk alerts about critical members with no assigned counselor | `admin@workforceap.org` | `lib/email.ts` |
| `COURSERA_UNMATCHED_ACTOR_ALERT_EMAILS` | 🟢 🔒 | Comma-separated alerts for unmatched Coursera actors | `admin@workforceap.org` | `lib/email.ts` |
| `WIOA_SCREENING_NOTIFY_EMAIL` | 🟢 🔒 | WIOA screening notification recipient | `info@workforceap.org` | `lib/wioa/wioaNotification.ts` |

**Deprecated:** `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_PORT` — referenced in old `ENV-VARIABLES.md` but **not used in current code**. Resend is the sole email provider.

---

## AI & LLM Providers

Provider fallback chain: **Anthropic → Groq → Gemini**. At least one is required for member AI tools.

| Name | Badge | Description | Example | Used In |
|------|-------|-------------|---------|---------|
| `ANTHROPIC_API_KEY` | 🟡 🔒 | Anthropic API key | `sk-ant-...` | `lib/ai/anthropic.ts` |
| `ANTHROPIC_MODEL` | 🟢 🔒 | Override Anthropic model | `claude-3-5-sonnet-latest` | `lib/ai/anthropic.ts` |
| `GROQ_API_KEY` | 🟡 🔒 | Groq API key | `gsk_...` | `lib/ai/groq.ts` |
| `GROQ_MODEL` | 🟢 🔒 | Override Groq model | `llama-3.3-70b-versatile` | `lib/ai/groq.ts` |
| `GEMINI_API_KEY` | 🟡 🔒 | Google Gemini API key | `AIza...` | `lib/ai/gemini.ts` |
| `GEMINI_MODEL` | 🟢 🔒 | Override Gemini model | `gemini-2.5-flash` | `lib/ai/gemini.ts` |
| `TAVILY_API_KEY` | 🟢 🔒 | Tavily web search (blog AI tools) | `tvly-...` | Blog drafting |
| `FIRECRAWL_API_KEY` | 🟢 🔒 | Firecrawl for job import from URLs | `fc-...` | Employer job import |
| `PROXYCURL_API_KEY` | 🟢 🔒 | Proxycurl for LinkedIn enrichment | `your-key` | `app/api/member/linkedin-enrich/route.ts` |

---

## ElevenLabs Voice & Conversational AI

| Name | Badge | Description | Example | Used In |
|------|-------|-------------|---------|---------|
| `ELEVENLABS_API_KEY` | 🟡 🔒 | API key from the WorkforceAP nonprofit workspace; signed-session creation requires ElevenAgents Write (`convai_write`), plus Text to Speech access for speech generation | `sk_...` | Voice UI, signed URLs |
| `ELEVENLABS_INTERVIEW_AGENT_ID` | 🟢 🔒 | ConvAI agent: interview coach | `agent_...` | `lib/ai/elevenlabsAgents.ts` |
| `ELEVENLABS_COUNSELOR_AGENT_ID` | 🟢 🔒 | Optional ConvAI override for Lilley; only reviewed student-agent IDs are accepted | `agent_...` | `/api/counselor/session` member/default mode |
| `ELEVENLABS_LILLEY_BRANCH_ID` | 🔴 🔒 | Exact attended-reviewed Lilley main branch; required for both governed member Lilley entry points and branch-pinned provider verification | `agtbranch_...` | Member counselor/career-business signed URLs and Lilley patch runner |
| `ELEVENLABS_COUNSELOR_STAFF_AGENT_ID` | 🔴 🔒 | Required to enable the separate counselor/admin caseload, outreach, and staff portal voice agent; no code fallback | `agent_...` | `/api/counselor/session` explicit staff mode; unset returns 503 |
| `ELEVENLABS_EMPLOYER_AGENT_ID` | 🟢 🔒 | ConvAI agent: employer coach | `agent_...` | `lib/ai/elevenlabsAgents.ts` |
| `ELEVENLABS_READINESS_AGENT_ID` | 🟢 🔒 | ConvAI agent: readiness coach | `agent_...` | `lib/ai/elevenlabsAgents.ts` |
| `ELEVENLABS_RESUME_COACH_AGENT_ID` | 🟢 🔒 | ConvAI agent: resume coach | `agent_...` | `lib/ai/elevenlabsAgents.ts` |
| `ELEVENLABS_PARTNER_AGENT_ID` | 🟢 🔒 | ConvAI agent: partner portal | `agent_...` | `lib/ai/elevenlabsAgents.ts` |
| `ELEVENLABS_WIOA_PREQUAL_AGENT_ID` | 🟢 🔒 | ConvAI agent: WIOA prequal | `agent_...` | `lib/ai/elevenlabsAgents.ts` |
| `ELEVENLABS_CAREER_BUSINESS_AGENT_ID` | 🟢 🔒 | Legacy member career/business override; restricted to the reviewed Lilley student agent | `agent_...` | `lib/ai/elevenlabsAgents.ts` |
| `NEXT_PUBLIC_ELEVENLABS_WIOA_VOICE_ID` | 🟢 👁️ | Public TTS voice ID: WIOA | `Sarah` | Portal voice surfaces |
| `NEXT_PUBLIC_ELEVENLABS_COUNSELOR_VOICE_ID` | 🟢 👁️ | Legacy fallback for the WIOA guide when `NEXT_PUBLIC_ELEVENLABS_WIOA_VOICE_ID` is unset; does not control Lilley or staff ConvAI voices | `...` | `lib/portal/counselorVoice.ts` |
| `NEXT_PUBLIC_ELEVENLABS_INTERVIEWER_FEMALE_VOICE_ID` | 🟢 👁️ | Public TTS voice ID: female interviewer | `...` | Portal voice surfaces |
| `NEXT_PUBLIC_ELEVENLABS_INTERVIEWER_MALE_VOICE_ID` | 🟢 👁️ | Public TTS voice ID: male interviewer | `...` | Portal voice surfaces |

**Note:** Most agent IDs have reviewed code fallbacks for production resilience, but staff counselor mode intentionally does not. Keep member and staff IDs separate: member/default sessions use Lilley; role-authorized requests with `audience: "staff"` require `ELEVENLABS_COUNSELOR_STAFF_AGENT_ID` and return 503 while it is unset. ConvAI voices are configured on each ElevenLabs agent, not by `NEXT_PUBLIC_ELEVENLABS_COUNSELOR_VOICE_ID`. Both member Lilley entry points accept only reviewed student-agent IDs and require `ELEVENLABS_LILLEY_BRANCH_ID`, so stale or unknown deploy values cannot route students to a staff, unreviewed branch, or unverified voice. The staff and unrelated agents do not inherit the Lilley branch pin.

Lilley's member prompt contains no browser-supplied text placeholders. The session response exposes only `secret__agent_gateway_token`, a short-lived bearer value scoped to the signed-in user, organization, deployment, agent, and three read-only tools. Use `pnpm elevenlabs:apply-patches` for the reviewed voice/prompt/privacy patch and `pnpm elevenlabs:sync-member-tools -- --apply` for the explicit provider tool attachment; both require an exact `ELEVENLABS_AGENT_ID`, the attended-reviewed `ELEVENLABS_LILLEY_BRANCH_ID`, and a securely injected API key. Never paste provider keys or branch IDs from an unverified source into chat, docs, Git, or shell history.

---

## Coursera / Learning Integration

| Name | Badge | Description | Example | Used In |
|------|-------|-------------|---------|---------|
| `COURSERA_API_BASE_URL` | 🟡 🔒 | Enterprise REST API base | `https://api.coursera.com/ent/api/rest/v1` | `lib/coursera/configCore.ts` |
| `COURSERA_API_TOKEN` | 🟡 🔒 | Bearer token for Enterprise API | `...` | `lib/coursera/configCore.ts` |
| `COURSERA_PROGRAM_ID` | 🟢 🔒 | Default program ID | `TpIlAogTQ8-SJQKIE8PP9w` | `lib/coursera/configCore.ts` |
| `COURSERA_PROGRAM_ID_MAP` | 🟢 🔒 | JSON slug → program ID map | `{}` | `lib/coursera/configCore.ts` |
| `COURSERA_PROGRAM_HOME_URL` | 🟢 🔒 | Fixed member launch URL | `...` | `lib/coursera/configCore.ts` |
| `COURSERA_PROGRAM_URL_TEMPLATE` | 🟢 🔒 | Templated launch URL | `https://.../{programId}` | `lib/coursera/configCore.ts` |
| `COURSERA_DEFAULT_SKILLSET_IDS` | 🟢 🔒 | Comma-separated skillset IDs | `skill1,skill2` | `lib/coursera/configCore.ts` |
| `COURSERA_SKILLSET_ID_MAP` | 🟢 🔒 | JSON slug → skillset IDs | `{}` | `lib/coursera/configCore.ts` |
| `COURSERA_LEARNING_PATH_URL_TEMPLATE` | 🟢 🔒 | Deep-link template for learning paths | `...` | `lib/coursera/configCore.ts` |
| `COURSERA_LEARNING_PATH_ID_MAP` | 🟢 🔒 | JSON slug → learning path ID | `{}` | `lib/coursera/configCore.ts` |
| `COURSERA_WEBHOOK_SECRET` | 🟡 🔒 | Secret for inbound completion webhooks | `...` | `lib/coursera/webhookAuth.ts` |
| `WEBHOOK_SECRET` | 🟢 🔒 | **Fallback** for Coursera webhook secret | `...` | `lib/coursera/configCore.ts` |
| `XAPI_CLIENT_ID` | 🟢 🔒 | Primary inbound xAPI client ID | `...` | `lib/xapi/config.ts` |
| `XAPI_CLIENT_SECRET` | 🟢 🔒 | Primary inbound xAPI client secret | `...` | `lib/xapi/config.ts` |
| `COURSERA_APP_ID` | 🟢 🔒 | Fallback inbound xAPI client ID | `...` | `lib/xapi/config.ts` |
| `COURSERA_APP_SECRET` | 🟢 🔒 | Fallback inbound xAPI client secret | `...` | `lib/xapi/config.ts` |
| `COURSERA_XAPI_CLIENT_ID` | 🟡 🔒 | Optional explicit inbound test credential override | `...` | `app/api/admin/coursera/self-test/route.ts` |
| `COURSERA_XAPI_CLIENT_SECRET` | 🟡 🔒 | Optional explicit inbound test credential override | `...` | `app/api/admin/coursera/self-test/route.ts` |
| `COURSERA_TARGET_BASE_URL` | 🟢 🔒 | Target base URL for launch | `...` | `lib/coursera/configCore.ts` |
| `COURSERA_ORG_ID` | 🟢 🔒 | Organization ID | `...` | `lib/coursera/configCore.ts` |
| `COURSERA_ORG_SLUG` | 🟢 🔒 | Organization slug | `...` | `lib/coursera/configCore.ts` |
| `COURSERA_OAUTH_TOKEN_URL` | 🟢 🔒 | OAuth token endpoint | `...` | `lib/coursera/configCore.ts` |
| `COURSERA_B4B_CLIENT_ID` | 🟢 🔒 | Business-to-Business client ID | `...` | `lib/coursera/b4bClient.ts` |
| `COURSERA_B4B_CLIENT_SECRET` | 🟢 🔒 | Business-to-Business client secret | `...` | `lib/coursera/b4bClient.ts` |
| `COURSERA_COURSE_ID_MAP` | 🟢 🔒 | JSON slug → course ID map | `{}` | `lib/coursera/configCore.ts` |
| `COURSERA_COURSE_URL_TEMPLATE` | 🟢 🔒 | Course deep-link template | `...` | `lib/coursera/configCore.ts` |
| `COURSERA_SKILLSET_SLUG_MAP` | 🟢 🔒 | Skillset slug mapping | `{}` | `lib/coursera/configCore.ts` |

---

## Stripe / Payments

| Name | Badge | Description | Example | Used In |
|------|-------|-------------|---------|---------|
| `STRIPE_SECRET_KEY` | 🔴 🔒 | Stripe secret key | `sk_live_...` | `lib/stripe/client.ts` |
| `STRIPE_WEBHOOK_SECRET` | 🔴 🔒 | Stripe webhook endpoint secret | `whsec_...` | `lib/stripe/client.ts` |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | 🔴 🔒 | Stripe Connect webhook secret | `whsec_...` | `lib/stripe/client.ts` |
| `STRIPE_STARTER_PRICE_ID` | 🟡 🔒 | Org onboarding: Starter tier | `price_...` | `app/org/onboard/page.tsx` |
| `STRIPE_GROWTH_PRICE_ID` | 🟡 🔒 | Org onboarding: Growth tier | `price_...` | `app/org/onboard/page.tsx` |
| `STRIPE_ENTERPRISE_PRICE_ID` | 🟡 🔒 | Org onboarding: Enterprise tier | `price_...` | `app/org/onboard/page.tsx` |
| `STRIPE_BASIC_PRICE_ID` | 🟢 🔒 | Legacy basic tier | `price_...` | `lib/stripe/client.ts` |

---

## Analytics & Monitoring

| Name | Badge | Description | Example | Used In |
|------|-------|-------------|---------|---------|
| `NEXT_PUBLIC_GTM_ID` | 🟡 👁️ | Google Tag Manager container ID | `GTM-XXXXXXX` | Public pages |
| `SENTRY_DSN` | 🟡 🔒 | Sentry server/edge DSN | `https://...` | `sentry.server.config.ts`, `sentry.edge.config.ts` |
| `NEXT_PUBLIC_SENTRY_DSN` | 🟡 👁️ | Sentry browser DSN | `https://...` | `instrumentation-client.ts` |
| `SENTRY_ENVIRONMENT` | 🟢 🔒 | Sentry server environment tag | `production` | `sentry.server.config.ts` |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | 🟢 👁️ | Sentry client environment tag | `production` | `instrumentation-client.ts` |
| `ENABLE_ANALYTICS_LOGS` | 🟢 🔒 | Enable analytics debug logging | `true` | Analytics utilities |

**Build-time only** (used by `@sentry/nextjs` webpack plugin, not referenced directly in app code):
- `SENTRY_AUTH_TOKEN` — Source map upload token
- `SENTRY_ORG` — Sentry organization slug
- `SENTRY_PROJECT` — Sentry project slug

---

## WIOA

| Name | Badge | Description | Example | Used In |
|------|-------|-------------|---------|---------|
| `NEXT_PUBLIC_WIOA_ENABLED` | 🟡 👁️ | Show WIOA discovery links (`0` hides nav/cards; direct page and APIs remain available) | `1` | Portal nav, learning hub |
| `WIOA_SCREENING_NOTIFY_EMAIL` | 🟢 🔒 | WIOA screening notifications | `info@workforceap.org` | `lib/wioa/wioaNotification.ts` |

---

## Partner & Org

| Name | Badge | Description | Example | Used In |
|------|-------|-------------|---------|---------|
| `PARTNER_PLACEMENT_PAYOUT_USD` | 🟢 🔒 | Illustrative payout per placement | `500` | Partner dashboard |
| `NEXT_PUBLIC_PARTNER_PLACEMENT_PAYOUT_USD` | 🟢 👁️ | Public-facing payout display | `500` | Partner portal |

---

## Admin & Cron

| Name | Badge | Description | Example | Used In |
|------|-------|-------------|---------|---------|
| `ADMIN_MATCH_SUGGESTIONS_TEST_EMAIL` | 🛠️ 🔒 | Redirect match suggestion emails to test inbox | `test@workforceap.org` | `lib/admin/matchSuggestionsConfig.ts` |
| `ADMIN_MATCH_SUGGESTIONS_DRY_RUN` | 🛠️ 🔒 | Skip Resend send, record audit only | `1` | `lib/admin/matchSuggestionsConfig.ts` |
| `DEFAULT_GREETING_TZ` | 🟢 🔒 | Timezone for greeting calculations | `America/Chicago` | `lib/time/greeting.ts` |

---

## Testing & QA

| Name | Badge | Description | Example | Used In |
|------|-------|-------------|---------|---------|
| `PLAYWRIGHT_BASE_URL` | 🛠️ 🔒 | E2E test target URL | `http://localhost:3000` | Playwright tests |
| `PLAYWRIGHT_MEMBER_EMAIL` | 🛠️ 🔒 | Test member login email | `member-test@...` | E2E specs |
| `PLAYWRIGHT_PARTNER_EMAIL` | 🛠️ 🔒 | Test partner login email | `partner-test@...` | E2E specs |
| `PLAYWRIGHT_PORTAL_PASSWORD` | 🛠️ 🔒 | Shared test password | `TestWfAP2026!` | E2E specs |
| `PLAYWRIGHT_STORAGE_STATE` | 🛠️ 🔒 | Auth state file path | `./playwright-state.json` | E2E helpers |
| `PLAYWRIGHT_ADMIN_STORAGE_STATE` | 🛠️ 🔒 | Admin auth state path | `./admin-state.json` | E2E helpers |
| `PLAYWRIGHT_VERCEL_SHARE_URL` | 🛠️ 🔒 | Vercel share URL for remote runs | `...` | `tests/e2e/auth-helpers.ts` |
| `PLAYWRIGHT_SCREENSHOT` | 🛠️ 🔒 | Enable screenshots | `on` | `playwright.config.ts` |
| `PLAYWRIGHT_TRACE` | 🛠️ 🔒 | Enable traces | `on` | `playwright.config.ts` |
| `PLAYWRIGHT_VIDEO` | 🛠️ 🔒 | Enable video | `on` | `playwright.config.ts` |
| `PORTAL_AUDIT_MODE` | 🛠️ 🔒 | Trusted target and coverage policy | `local`, `isolated_preview`, or `production_canary` | Portal audit runner and cross-portal E2E |
| `PORTAL_AUDIT_TRUSTED_PREVIEW_ORIGIN` | 🛠️ 🔒 | Exact isolated preview origin; broad Vercel wildcards are forbidden | `https://exact-preview.example` | Portal audit runner and cross-portal E2E |
| `PORTAL_AUDIT_SECTION` | 🛠️ 🔒 | Local-only portal section filter; trusted remote policies require `all` | `all` | Portal audit runner and cross-portal E2E |
| `PORTAL_AUDIT_OUTPUT` | 🛠️ 🔒 | Current audit result path | `test-results/portal-audit-results.json` | Portal audit runner |
| `PORTAL_AUDIT_ROUTE_CONCURRENCY` | 🛠️ 🔒 | Bounded page concurrency (1–12) | `8` | Portal audit runner |
| `PORTAL_AUDIT_READ_ONLY_TOKEN` | 🛠️ 🔒 | Capability token (≥ 32 chars) the audit browser sends only to the exact trusted origin; the target deployment must hold the same value | `openssl rand -hex 32` | Portal audit runner, `middleware.ts` |
| `PORTAL_AUDIT_TARGET_ORIGIN` | 🛠️ 🔒 | Origin the pre-audit health gate probes (falls back to `PLAYWRIGHT_BASE_URL`) | `https://exact-preview.example` | `scripts/portal-audit-health-gate.mjs` |
| `PORTAL_AUDIT_TRUSTED_SHA` | 🛠️ 🔒 | Full commit the target must serve on `/api/health` (falls back to `GITHUB_SHA`) | `f630cf65…` | `scripts/portal-audit-health-gate.mjs` |
| `PORTAL_AUDIT_HEALTH_TIMEOUT_MS` | 🛠️ 🔒 | How long the health gate waits for a still-building preview (default 10 minutes) | `600000` | `scripts/portal-audit-health-gate.mjs` |
| `PORTAL_AUDIT_HEALTH_INTERVAL_MS` | 🛠️ 🔒 | Delay between health gate attempts (default 15 seconds) | `15000` | `scripts/portal-audit-health-gate.mjs` |
| `ARTIFACTS_DIR` | 🛠️ 🔒 | E2E artifact output dir | `./test-results/artifacts` | Visual regression tests |
| `E2E_<ROLE>_EMAIL` | 🛠️ 🔒 | Dedicated identity email for member/admin/employer/partner/counselor | `member-audit@...` | Five-role portal audit and E2E |
| `E2E_<ROLE>_PASSWORD` | 🛠️ 🔒 | Password paired only with that role identity | `...` | Five-role portal audit and E2E |
| `E2E_ISSUE_XAPI_TOKEN` | 🛠️ 🔒 | xAPI token for E2E issue testing | `...` | Coursera E2E |
| `SEED_TEST_ACCOUNTS` | 🛠️ 🔒 | Seed QA test accounts in DB | `true` | `prisma/seed.ts` |
| `SEED_DEMO` | 🛠️ 🔒 | Seed demo data | `true` | `prisma/seed-demo.ts` |

**GitHub Actions secrets behind the trusted portal audit** (`.github/workflows/authenticated-portal-smoke.yml`; stored in the repository's Actions secrets, not in Vercel):

- `PREVIEW_SITE_URL` — the exact origin of the isolated preview. It must be the branch alias of the `preview` mirror branch that `.github/workflows/mirror-master-to-preview.yml` keeps at master's head, so the deployment serves master's commit from the **Preview** environment (DEMO Supabase project, `docs/STAGING_ENV.md`). The workflow feeds it to both `PLAYWRIGHT_BASE_URL` and `PORTAL_AUDIT_TRUSTED_PREVIEW_ORIGIN`; the health gate tolerates a pasted trailing newline or slash. Never a production alias.
- `E2E_<ROLE>_EMAIL` / `E2E_<ROLE>_PASSWORD` for member, admin, employer, partner and counselor — five distinct accounts that must exist in the DEMO project (`production_canary` injects only member, employer and partner; `hub_smoke` injects member, counselor, and employer only and does not require `PORTAL_AUDIT_READ_ONLY_TOKEN`).
- `PORTAL_AUDIT_READ_ONLY_TOKEN` — the same value the Preview deployment holds in Vercel (required for `isolated_preview` / `production_canary`, not for `hub_smoke`).

---

## Build & Internal

| Name | Badge | Description | Example | Used In |
|------|-------|-------------|---------|---------|
| `ANALYZE` | 🛠️ 🔒 | Enable `@next/bundle-analyzer` | `true` | `next.config.ts` |
| `NEXT_PUBLIC_IS_BUILDING` | 🛠️ 👁️ | Client hint for build-time UIs | `1` | (reserved) |
| `NEXT_PUBLIC_IS_PREVIEW_DEVELOPMENT` | 🛠️ 👁️ | Preview dev mode flag | `1` | (reserved) |
| `VERCEL_GIT_COMMIT_SHA` | — | Vercel auto-provided commit SHA | `abc123...` | Sentry release version |
| `VERCEL_PROJECT_ID` | — | Vercel project ID | `prj_...` | Vercel API scripts |
| `VERCEL_TEAM_ID` | — | Vercel team ID | `team_...` | Vercel API scripts |
| `VERCEL_TOKEN` | 🟢 🔒 | Vercel API token | `...` | Deployment scripts |

---

## Deprecated / Legacy

The following variables appear in `.env.example` or old docs but **are not referenced in current application code**. They should be removed from Vercel and `.env` files to avoid confusion.

| Name | Status | Migration |
|------|--------|-----------|
| `SMTP_HOST` | ❌ Unused | Remove. Resend is the sole email provider. |
| `SMTP_USER` | ❌ Unused | Remove. |
| `SMTP_PASS` | ❌ Unused | Remove. |
| `SMTP_PORT` | ❌ Unused | Remove. |
| `ONET_API_USERNAME` | ❌ Unused | Remove. O*NET v2 uses `ONET_API_KEY` only. |
| `ONET_API_PASSWORD` | ❌ Unused | Remove. |
| `NEXT_PUBLIC_GA_ID` | ❌ Unused | Remove. Use `NEXT_PUBLIC_GTM_ID` instead. |

---

## Security Notes

### 🔒 Server-Only Variables

**NEVER** expose these to the client. Do not prefix with `NEXT_PUBLIC_`:

- `SUPABASE_SERVICE_ROLE_KEY` — bypasses all Row Level Security
- `RESEND_API_KEY` — could be used to send spam
- `CRON_SECRET` — could trigger arbitrary cron jobs
- `PLACEMENT_SURVEY_TOKEN_SECRET` — could forge survey links
- `UNSUBSCRIBE_TOKEN_SECRET` — could forge unsubscribe links (and, unset, the fallbacks above become the signing key)
- `PORTAL_AUDIT_READ_ONLY_TOKEN` — could switch a session into read-only audit mode
- `AUTH_TRUST_COOKIE_SECRET` — could forge MFA trust cookies
- `STRIPE_SECRET_KEY` — financial access
- All `*_API_KEY`, `*_SECRET`, `*_SECRET_KEY`, `*_TOKEN` vars

### 👁️ Client-Safe Variables

These **must** be prefixed with `NEXT_PUBLIC_` to be accessible in the browser:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_GTM_ID`
- `NEXT_PUBLIC_CAPTCHA_ENABLED`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- `NEXT_PUBLIC_SENTRY_DSN`
- `NEXT_PUBLIC_ELEVENLABS_*_VOICE_ID`
- `NEXT_PUBLIC_WIOA_ENABLED`
- `NEXT_PUBLIC_PARTNER_PLACEMENT_PAYOUT_USD`

### .gitignore

`.env.local` and `.env.*.local` are already in `.gitignore`. Never commit secrets.

---

## Drift Report

### Variables in CODE but NOT in `.env.example` (Missing from template)

These are referenced in the application but absent from `.env.example`. New developers won't know they exist.

**Auth & Security:**
- `AUTH_TRUST_COOKIE_SECRET`
- `ADMIN_MFA_TRUST_DAYS`
- `ADMIN_MATCH_SUGGESTIONS_DRY_RUN`
- `ADMIN_MATCH_SUGGESTIONS_TEST_EMAIL`
- `UNSUBSCRIBE_TOKEN_SECRET`

**AI / Voice:**
- `ELEVENLABS_CAREER_BUSINESS_AGENT_ID`
- `ELEVENLABS_WIOA_PREQUAL_AGENT_ID`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GROQ_MODEL`
- `NEXT_PUBLIC_ELEVENLABS_INTERVIEWER_FEMALE_VOICE_ID`
- `NEXT_PUBLIC_ELEVENLABS_INTERVIEWER_MALE_VOICE_ID`

**Analytics:**
- `ENABLE_ANALYTICS_LOGS`
- `NEXT_PUBLIC_SENTRY_ENVIRONMENT`

**Build / Internal:**
- `NEXT_PUBLIC_BASE_URL`
- `NEXT_PUBLIC_IS_BUILDING`
- `NEXT_PUBLIC_IS_PREVIEW_DEVELOPMENT`
- `NEXT_PUBLIC_VERCEL_ENV`

**Coursera (many missing):**
- `COURSERA_B4B_CLIENT_ID`, `COURSERA_B4B_CLIENT_SECRET`
- `COURSERA_COURSE_ID_MAP`, `COURSERA_COURSE_URL_TEMPLATE`
- `COURSERA_LEARNING_PATH_ID_MAP`, `COURSERA_LEARNING_PATH_URL_TEMPLATE`
- `COURSERA_OAUTH_TOKEN_URL`
- `COURSERA_ORG_ID`, `COURSERA_ORG_SLUG`
- `COURSERA_PROGRAM_HOME_URL`, `COURSERA_PROGRAM_ID_MAP`, `COURSERA_PROGRAM_URL_TEMPLATE`
- `COURSERA_SKILLSET_ID_MAP`, `COURSERA_SKILLSET_SLUG_MAP`
- `COURSERA_TARGET_BASE_URL`
- `COURSERA_UNMATCHED_ACTOR_ALERT_EMAILS`
- `XAPI_CLIENT_ID`, `XAPI_CLIENT_SECRET`
- `COURSERA_APP_ID`, `COURSERA_APP_SECRET`
- `COURSERA_XAPI_CLIENT_ID`, `COURSERA_XAPI_CLIENT_SECRET` (optional self-test overrides)
- `WEBHOOK_SECRET` (fallback)

**Email / Notifications:**
- `AT_RISK_DIGEST_EMAILS`
- `COURSERA_UNMATCHED_ACTOR_ALERT_EMAILS`
- `DEFAULT_GREETING_TZ`
- `SUPPORT_EMAIL`
- `VOICE_COACH_TRANSCRIPT_EMAILS`
- `VOICE_INTERVIEW_TRANSCRIPT_EMAILS`
- `WIOA_SCREENING_NOTIFY_EMAIL`
- `WORKSPACE_EMAIL_PROVIDER`

**O*NET:**
- `ONET_API_BASE_URL`

**Partner / Org:**
- `NEXT_PUBLIC_PARTNER_PLACEMENT_PAYOUT_USD`

**Stripe:**
- `STRIPE_BASIC_PRICE_ID`
- `STRIPE_CONNECT_WEBHOOK_SECRET`
- `STRIPE_ENTERPRISE_PRICE_ID`
- `STRIPE_GROWTH_PRICE_ID`
- `STRIPE_SECRET_KEY`
- `STRIPE_STARTER_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`

**Testing / QA:**
- `ARTIFACTS_DIR`
- `E2E_ISSUE_XAPI_TOKEN`
- `E2E_MEMBER_EMAIL`, `E2E_MEMBER_PASSWORD`
- `PLAYWRIGHT_ADMIN_STORAGE_STATE`, `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_MEMBER_EMAIL`, `PLAYWRIGHT_PARTNER_EMAIL`, `PLAYWRIGHT_PORTAL_PASSWORD`, `PLAYWRIGHT_SCREENSHOT`, `PLAYWRIGHT_STORAGE_STATE`, `PLAYWRIGHT_TRACE`, `PLAYWRIGHT_VERCEL_SHARE_URL`, `PLAYWRIGHT_VIDEO`
- `PORTAL_AUDIT_SECTION`, `PORTAL_AUDIT_READ_ONLY_TOKEN`, `PORTAL_AUDIT_TARGET_ORIGIN`, `PORTAL_AUDIT_TRUSTED_SHA`, `PORTAL_AUDIT_HEALTH_TIMEOUT_MS`, `PORTAL_AUDIT_HEALTH_INTERVAL_MS`
- `SEED_DEMO`, `SEED_TEST_ACCOUNTS`

**WIOA:**
- `NEXT_PUBLIC_WIOA_ENABLED`

**Other:**
- `FIRECRAWL_API_KEY`
- `PROXYCURL_API_KEY`
- `TAVILY_API_KEY`
- `WORKFORCEAP_FORCE_DB_BUILD`

### Variables in `.env.example` but NOT in CODE (Potentially stale)

- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_PORT` — **Deprecated**. Remove.
- `ONET_API_USERNAME`, `ONET_API_PASSWORD` — **Deprecated**. Remove.
- `NEXT_PUBLIC_GA_ID` — **Deprecated**. Not in code. Remove.
- `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` — **Build-time only** (used by `@sentry/nextjs` internally). Keep for CI/build but document as build-time.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-09-18 | Documented `hub_smoke` on Authenticated Portal Smoke (member/counselor/employer Playwright lane; no read-only audit token). |
| 2026-09-17 | WAP-66: documented `UNSUBSCRIBE_TOKEN_SECRET` and its rotation caveat, `PORTAL_AUDIT_READ_ONLY_TOKEN`, the pre-audit health gate variables, and the GitHub Actions secrets behind the isolated preview audit. |
| 2026-08-31 | Documented the fail-closed member-agent gateway, Upstash dependency, reviewed-agent registry, and secure ElevenLabs activation commands. |
| 2026-05-13 | Comprehensive audit. Documented 81 vars. Identified 6 deprecated. Updated `.env.example`. |
| 2026-04-24 | Initial env variable list in `ENV-VARIABLES.md` (now superseded by this doc). |
