# WorkforceAP Email Configuration Guide

## Overview
WorkforceAP uses **Resend** for transactional email delivery (contact forms, notifications, alerts, digests, branded password resets). Supabase Auth's own mailer is only the fallback for password resets and still sends signup confirmations and invites.

---

## Current Status

| Environment | Status | Notes |
|-------------|--------|-------|
| **Vercel Production** | ✅ Configured | `RESEND_API_KEY` set; domain `workforceap.org` verified (DKIM + return-path); ~513 accepted sends 2026-08-23..09-19 |
| **Delivery webhook** | ⏳ Register after deploy | `/api/webhooks/resend` needs `RESEND_WEBHOOK_SECRET` (see below) |
| **Local Development** | ⚠️ UNVERIFIED | Requires .env.local setup |

The historical failures (768 CRLF-header rejections 2026-07-02..09-01, 40 rate-limit 429s) are fixed at HEAD by header sanitising, a 150 ms send pacer and Retry-After retries; see `lib/email/send.ts` and `lib/email/pacing.ts`.

---

## Required Environment Variables

| Variable | Example Value | Where to Get It |
|----------|---------------|-----------------|
| `RESEND_API_KEY` | `re_1234567890abcdef` | [Resend Dashboard](https://resend.com/api-keys) |
| `EMAIL_FROM` | `info@workforceap.org` | Your domain (any valid email) |
| `EMAIL_TO_ADMIN` | `info@workforceap.org` | Where admin alerts go |
| `RESEND_WEBHOOK_SECRET` | `whsec_...` | Resend Dashboard → Webhooks → your endpoint → Signing secret |

---

## Vercel Setup Instructions

### Step 1: Get Resend API Key
1. Go to https://resend.com
2. Sign up/login with your email
3. Navigate to **API Keys** → **Create API Key**
4. Name: `WorkforceAP Production`
5. Permissions: `Sending` (minimum required)
6. Copy the key (starts with `re_`)

### Step 2: Add to Vercel
1. Go to https://vercel.com/dashboard
2. Select `workforceap-beta` project
3. Click **Settings** tab
4. Click **Environment Variables** in left sidebar
5. Add each variable:
   - Name: `RESEND_API_KEY`
   - Value: (paste your key)
   - Environment: Production ✓, Preview ✓, Development (optional)
6. Repeat for `EMAIL_FROM` = `info@workforceap.org`
7. Click **Save**

### Step 3: Redeploy
1. Go to **Deployments** tab
2. Click the latest deployment
3. Click **Redeploy** → **Use Existing Build Cache**
4. Wait for deployment to complete (~2 minutes)

### Step 4: Test
1. Go to https://www.workforceap.org/contact
2. Submit test form with your email
3. Check inbox (and spam folder) for email

---

## Delivery Webhook (bounces, complaints, delivered)

Every send is written to `email_send_logs` (`EmailSendLog`) with the provider's message id. Resend reports what happened next only through webhooks, so without this step bounced and complained deliveries stay invisible and the app keeps emailing dead addresses.

1. Deploy a build that includes `app/api/webhooks/resend/route.ts`.
2. Resend dashboard → **Webhooks** → **Add Endpoint**
   - URL: `https://www.workforceap.org/api/webhooks/resend`
   - Events: `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained` (optionally `email.opened`, `email.clicked`)
3. Copy the endpoint's **Signing secret** (`whsec_...`) into Vercel as `RESEND_WEBHOOK_SECRET` (Production + Preview) and redeploy.
4. Send yourself a test from **Webhooks → Send test event**; `/admin/webhook-events` shows the receipt (source `resend`) and `/admin/health` → "Email Delivery" shows the last webhook time.

Behaviour: each event updates `EmailSendLog.lastEvent`; a **permanent bounce** or a **spam complaint** sets the recipient's `notificationsUpdates` to false (the same switch as one-click unsubscribe) and records an `email_delivery` diagnostic. Transient bounces are recorded but do not mute anyone. Until the secret is set the route answers 503 and logs the miss.

---

## Domain Authentication (Recommended)

For better deliverability (emails not going to spam), set up domain authentication:

### Resend Domain Setup
1. In Resend dashboard → **Domains** → **Add Domain**
2. Enter: `workforceap.org`
3. Resend will provide DNS records (SPF, DKIM, DMARC)

### DNS Configuration
Add these records to your domain registrar (where workforceap.org is managed):

**Type: TXT** (SPF)
```
Name: @
Value: v=spf1 include:_spf.resend.com ~all
```

**Type: TXT** (DKIM)
```
Name: resend._domainkey
Value: (copy from Resend dashboard)
```

**Type: TXT** (DMARC - optional but recommended)
```
Name: _dmarc
Value: v=DMARC1; p=quarantine; rua=mailto:dmarc@workforceap.org
```

### Verification
- Return to Resend dashboard
- Click **Verify** next to your domain
- May take 5-30 minutes for DNS to propagate

---

## Testing Checklist

| Test | How | Expected Result |
|------|-----|-----------------|
| Contact form | Submit on /contact | Email to info@workforceap.org |
| Application submit | Apply as test user | Admin alert email |
| Application accept | Accept in admin | Welcome email to applicant |
| Partner milestone | Enroll member | Partner notification |

---

## Troubleshooting

### "Email service is not configured"
- Missing `RESEND_API_KEY` in Vercel env vars
- Fix: Add key and redeploy

### Emails going to spam
- Domain not authenticated (add SPF/DKIM records)
- Sender reputation (use authenticated domain)
- Email content (avoid spam trigger words)

### "Invalid API key"
- Key copied incorrectly
- Key has wrong permissions (needs "Sending")
- Fix: Regenerate key in Resend dashboard

### No emails received
- Check spam/junk folder
- Verify `EMAIL_FROM` domain matches verified domain in Resend
- Check Resend dashboard for delivery logs

---

## Nonprofit License Context

**Status:** Approved for 10 free nonprofit licenses  
**Applies to:** Other services (not Resend — Resend has generous free tier)  
**Action Needed:** Identify which services need licenses (Google Workspace, Slack, etc.)

---

## Related Files

- `lib/email.ts` — Email sending functions
- `app/api/contact/route.ts` — Contact form handler
- `app/api/applications/route.ts` — Application submission
- `emails/` — Email templates (React Email)

---

*Last updated: 2026-09-20 (delivery audit; send log + webhook)*
