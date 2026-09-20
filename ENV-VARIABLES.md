# WorkforceAP Environment Variables — Production Configuration

**File:** `.env.local` (for local dev) or Vercel Environment Variables (for production)  
**Last Updated:** 2026-04-24

> **Superseded deployment reference:** use [`docs/ENVIRONMENT-VARIABLES.md`](docs/ENVIRONMENT-VARIABLES.md) as the canonical inventory. This legacy snapshot describes expected configuration, not proof of current Vercel Production state; re-verify live values before a release.

---

## Required Variables

### Email Service (Resend)
| Variable | Production Value | Local Dev Value | Source |
|----------|------------------|-----------------|--------|
| `RESEND_API_KEY` | ✅ Set (`re_...`) | (your dev key) | Resend Dashboard |
| `EMAIL_FROM` | `info@workforceap.org` | `info@workforceap.org` | Your domain |
| `RESEND_WEBHOOK_SECRET` | `whsec_...` (set after registering `/api/webhooks/resend`) | (optional) | Resend Dashboard → Webhooks |

> `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` / `SMTP_PORT` are **not read anywhere** in the codebase (verified 2026-09-20). Resend is the sole app mailer; Supabase Auth's SMTP is configured in the Supabase dashboard, not via these variables. Remove them from Vercel if still present.

### Database (Supabase)
| Variable | Production Value | Local Dev Value | Source |
|----------|------------------|-----------------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | (set in Vercel) | (same) | Supabase Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (set in Vercel) | (same) | Supabase Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | (set in Vercel) | (same) | Supabase Project Settings → API |

### Authentication (Supabase Auth)
| Variable | Production Value | Local Dev Value | Source |
|----------|------------------|-----------------|--------|
| `NEXT_PUBLIC_SITE_URL` | `https://www.workforceap.org` | `http://localhost:3000` | Your domain |

### Rate Limiting (Upstash Redis) — Optional but Recommended
| Variable | Production Value | Local Dev Value | Source |
|----------|------------------|-----------------|--------|
| `UPSTASH_REDIS_REST_URL` | (set in Vercel) | (optional) | Upstash Console |
| `UPSTASH_REDIS_REST_TOKEN` | (set in Vercel) | (optional) | Upstash Console |

**Note:** Without Upstash, signup/apply rate limits fail open (Supabase enforces its own auth limits). Contact/confirmation remain fail-closed (spam risk).

### AI Tools: ElevenLabs (Voice Interview + Conversational AI Coaches)
| Variable | Production Value | Local Dev Value | Source |
|----------|------------------|-----------------|--------|
| `ELEVENLABS_API_KEY` | (set in Vercel) | (set in .env) | ElevenLabs Dashboard |
| `ELEVENLABS_READINESS_AGENT_ID` | `agent_5801kmznwny0e8gtmb726aaeevnt` | (same) | ElevenLabs ConvAI |
| `ELEVENLABS_INTERVIEW_AGENT_ID` | `agent_9001kmy4g522e5ttvj88k5z1ygem` | (same) | ElevenLabs ConvAI |
| `ELEVENLABS_COUNSELOR_AGENT_ID` | `agent_1101kqfjfm8retm8j6md467wzxdb` | (same) | ElevenLabs ConvAI (Lilley student career coach) |
| `ELEVENLABS_EMPLOYER_AGENT_ID` | `agent_0901kmznx45vf19s9psjrctqr6x5` | (same) | ElevenLabs ConvAI |
| `ELEVENLABS_PARTNER_AGENT_ID` | `agent_7601kntxhqx3e0mvznpwk9bqj5yw` | (same) | ElevenLabs ConvAI |
| `ELEVENLABS_RESUME_COACH_AGENT_ID` | `agent_6601kmznw90ffxkbk7mpbym73vh9` | (same) | ElevenLabs ConvAI |
| `ELEVENLABS_WIOA_PREQUAL_AGENT_ID` | `agent_7801kqfjg0qwfy68btrqh6jg87kf` (WIOA guide in the WorkforceAP nonprofit workspace, patched 2026-09-05; pre-migration id `agent_6801knv07nb2ftj9p54nm6xem0xj` is retired) | (same) | ElevenLabs ConvAI — the code falls back to the nonprofit id when unset. If the configured `ELEVENLABS_API_KEY` belongs to a workspace that does not know the agent (404), the member WIOA, readiness, and resume-coach routes start Lilley through the member gateway and tell the browser `agent: 'lilley_fallback'`; the public WIOA page returns a friendly 503. See `docs/runbooks/elevenlabs-nonprofit-workspace.md`. |

### Billing: J5 invoice + J6 cover letter packets (optional overrides)
All default to the Workforce Advancement Project identity printed on the official price list. Set only what differs.

| Variable | Production Value | Local Dev Value | Source |
|----------|------------------|-----------------|--------|
| `BILLING_PROVIDER_LEGAL_NAME` | `Workforce Advancement Project` (default) | (same) | Letterhead on J5/J6 |
| `BILLING_PROVIDER_ADDRESS` | `207 Settlers Valley Drive, Suite C | Pflugerville, TX 78660` (default; `|` separates lines) | (same) | Letterhead / remit-to |
| `BILLING_PROVIDER_PHONE` / `BILLING_PROVIDER_EMAIL` / `BILLING_PROVIDER_WEBSITE` / `BILLING_PROVIDER_EIN` | defaults: `512-825-2896`, `michael.brown@workforceap.org`, `www.workforceap.org`, `41-2612389` | (same) | Letterhead; reply-to on the packet emails |
| `BILLING_SIGNER_NAME` / `BILLING_SIGNER_TITLE` | defaults: `Michael A. Brown, PMP, ChE`, `Executive Director` | (same) | Prefilled signer on /admin/members/[id]/billing (editable per packet) |
| `BILLING_PACKET_PREFIX` | `WAP` (default) -> invoice numbers `WAP-2026-0001` | (same) | Invoice numbering |
| `BILLING_DEFAULT_BILL_TO_NAME` / `BILLING_DEFAULT_BILL_TO_ATTENTION` / `BILLING_DEFAULT_BILL_TO_ADDRESS` | defaults: `Workforce Solutions Capital Area`, `Accounts Payable / Training Services`, empty | (same) | Prefilled "Bill to" (editable per packet) |

### AI Tools: Groq (Chat/Completion Backend)
| Variable | Production Value | Local Dev Value | Source |
|----------|------------------|-----------------|--------|
| `GROQ_API_KEY` | (set in Vercel) | (set in .env) | Groq Dashboard |

### AI Tools: Anthropic (Interview Feedback Fallback)
| Variable | Production Value | Local Dev Value | Source |
|----------|------------------|-----------------|--------|
| `ANTHROPIC_API_KEY` | (optional) | (optional) | Anthropic Console |
| `ANTHROPIC_MODEL` | `claude-3-5-sonnet-latest` | (same) | Model selector |

### AI Tools: O*NET (Skill Mapper)
| Variable | Production Value | Local Dev Value | Source |
|----------|------------------|-----------------|--------|
| `ONET_API_KEY` | (optional — public data) | (optional) | https://services.onetcenter.org/ |

### Web Scraping / Research
| Variable | Production Value | Local Dev Value | Source |
|----------|------------------|-----------------|--------|
| `FIRECRAWL_API_KEY` | (set in Vercel) | (optional) | Firecrawl Dashboard |
| `TAVILY_API_KEY` | (set in Vercel) | (optional) | Tavily Dashboard |

### Staff MFA Enforcement
| Variable | Production Value | Local Dev Value | Description |
|----------|------------------|-----------------|-------------|
| `STAFF_MFA_ENFORCEMENT` | unset or `1` (on by default) | `0` or unset | Production (`VERCEL_ENV=production`) fails closed: MFA is required unless this is explicitly `0`/`false`/`off`. Non-production stays opt-in (`1` to enable). |

**Note:** Do not ship production with `STAFF_MFA_ENFORCEMENT=0`. Enroll staff MFA before go-live.

### Optional: Analytics/Monitoring
| Variable | Production Value | Local Dev Value | Source |
|----------|------------------|-----------------|--------|
| `NEXT_PUBLIC_GA_ID` | (optional) | (optional) | Google Analytics |
| `NEXT_PUBLIC_VERCEL_ANALYTICS_ID` | (auto-set by Vercel) | — | Vercel |

---

## Historical Vercel Production Status Snapshot

**Checked:** 2026-04-24 — re-verification is required before the next production cutover.

**Present:**
- ✅ `RESEND_API_KEY` — Email service functional
- ✅ `ELEVENLABS_API_KEY` + agent IDs — Voice coaches functional
- ✅ `GROQ_API_KEY` — AI chat/completion functional
- ✅ `NEXT_PUBLIC_SUPABASE_URL` — Database works
- ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Auth works
- ✅ `SUPABASE_SERVICE_ROLE_KEY` — Server-side DB operations work
- ⚠️ `SMTP_HOST/USER/PASS/PORT` — were listed as present, but no code reads them (removed from the required table 2026-09-20)
- ✅ `UPSTASH_REDIS_REST_URL/TOKEN` — Rate limiting active (50/30min for signup)

---

## Security Notes

⚠️ **NEVER commit `.env.local` to git**  
⚠️ **NEVER share `SUPABASE_SERVICE_ROLE_KEY`** — it bypasses all Row Level Security  
⚠️ **Rotate keys if accidentally exposed**

**Protection:**
- `.env.local` is in `.gitignore` (should not be committed)
- Vercel env vars are encrypted at rest
- Use `NEXT_PUBLIC_` prefix only for client-safe variables

---

## Launch Checklist (May 1)

- [x] Auth flows (login, signup, invite) tested
- [x] Password reset working (public + admin-triggered)
- [x] Rate limits bumped to 50/30min for workforce centers
- [x] Staff MFA fail-closed in Vercel production (`STAFF_MFA_ENFORCEMENT` unset/`1`; explicit `0` to disable)
- [x] Voice coach first-message config fixed
- [x] Voice coach transcripts auto-save
- [x] No member-facing "Coming soon" stubs
- [x] No dead links or localhost fallbacks on public surfaces
- [ ] **Mike:** Live prod smoke test
- [ ] **Mike:** Pre-launch tag + env snapshot
- [ ] **Mike:** DB fixture cleanup (Test employers/jobs)
- [ ] **Mike:** Verify `partnersupport@` / `partnerships@` MX delivery

---

## Related Files

- `DEPLOY.md` — Deployment guide
- `EMAIL-SETUP.md` — Full email configuration guide
- `lib/email.ts` — Email sending functions
- `lib/rate-limit.ts` — Rate limiting configuration
- `lib/ai/elevenlabsAgents.ts` — ElevenLabs agent registry

---

*Document for Mike — WorkforceAP Tech Lead*
