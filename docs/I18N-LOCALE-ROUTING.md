# i18n Locale Routing Architecture

> **Status:** Design document — current system assessed, gaps identified, implementation path documented  
> **Last updated:** 2026-05-13  
> **Scope:** Public marketing pages (locale-prefixed URLs) + portal (cookie-based)  
> **Languages:** English (en), Spanish (es), French (fr), Portuguese (pt)

---

## 1. Executive Summary

WorkforceAP already has a **working locale-prefix routing system** for marketing pages. The architecture is sound: middleware detects `/es`, `/fr`, `/pt` prefixes, redirects unprefixed marketing traffic to the user's preferred locale, and transparently rewrites prefixed requests back to the unprefixed file-system routes. next-intl v4 is wired for translations, SEO metadata is locale-aware, and the sitemap includes `hreflang` alternates.

**What works today:**
- `/es/programs` → renders `app/programs/page.tsx` with Spanish messages
- `/fr/apply` → renders `app/apply/page.tsx` with French messages
- Language toggle switches locale via cookie + URL prefix replacement
- Sitemap includes alternate language URLs for all indexed pages
- `buildPageMetadata()` generates canonical + `hreflang` tags per locale

**What remains:**
- French and Portuguese translations need quality review (exist but untested)
- Some portal paths still have hardcoded English strings
- No automated extraction/enforcement ensuring new code uses `t()` instead of raw strings
- Translation completion gap: `es` is ~82% of `en`; `fr`/`pt` coverage is unknown

**Recommended approach:** Keep the current middleware-based architecture. It is the right trade-off for WAP: no file-system duplication, works with Next.js App Router, and gives shareable URLs.

---

## 2. Approach Comparison

### 2.1 next-intl (Current — Recommended)

| Aspect | Assessment |
|--------|-----------|
| **Route structure** | Middleware rewrite: `/{locale}/page` → `page` internally. No `[locale]` segment in `app/`. |
| **Locale detection** | Accept-Language header → `wap-locale` cookie → URL prefix (in that priority). |
| **Translations** | JSON files in `messages/{en,es,fr,pt}.json`. next-intl's `getRequestConfig` merges active locale over English fallback. |
| **SEO** | `buildPageMetadata()` generates canonical + `hreflang`. Sitemap includes `alternates.languages`. |
| **Shareable links** | ✅ `/es/programs` works when shared. Middleware redirects unprefixed requests to prefixed based on cookie/Accept-Language. |
| **Portal paths** | Cookie-only (`/dashboard`, `/login`). No prefix. Language toggle reloads page so middleware picks up new cookie. |
| **Bundle impact** | Server-side JSON import per request. Client receives only `pickRootClientMessages()` subset. |
| **Migration cost** | Already shipped. Zero migration. |

**Why this is the right choice for WAP:**
- No file-system route duplication (unlike `app/[locale]/...`)
- Works with existing App Router structure
- next-intl v4 has first-class App Router support
- Middleware handles detection + redirect + rewrite in one place

### 2.2 i18next + next-i18next (Previous — Retired)

The codebase previously had `next-i18next` configured with `public/locales/`. This was identified in `ENG_REVIEW_i18n.md` as one of three competing systems. It has been retired in favor of next-intl. **Do not reintroduce.**

### 2.3 Custom Middleware (What We Actually Built)

Our `middleware.ts` is essentially a custom locale router layered on top of next-intl. It handles:
1. Prefix extraction (`splitLocalePrefix`)
2. Locale resolution (query param → cookie → Accept-Language)
3. Redirect unprefixed marketing paths to prefixed
4. Rewrite prefixed paths back to unprefixed for file-system routing
5. Sets `x-wap-locale` header for downstream server components

This hybrid approach gives us full control over routing behavior while letting next-intl handle message resolution.

### 2.4 Subdomain Routing (`es.workforceap.org`)

| Pros | Cons |
|------|------|
| Clean separation per locale | Requires DNS + cert changes |
| Easy CDN caching rules | Partners sharing links need to know subdomain |
| No middleware redirects | More infra complexity |
| | Harder to test locally |

**Verdict:** Overkill for WAP's current scale. Revisit if we launch dedicated regional marketing sites.

### 2.5 Query Param (`?lang=es`)

| Pros | Cons |
|------|------|
| Simple to implement | Ugly URLs for sharing |
| No routing changes | SEO penalty — no canonical per locale |
| | Bookmarked links lose param on navigation |

**Verdict:** We support `?lang=es` as an explicit override (middleware strips it and sets cookie), but it is not the primary mechanism.

---

## 3. Current Route Structure

```
URL bar              →  File system          →  Locale source
─────────────────────────────────────────────────────────────────
/es/programs         →  app/programs/page.tsx →  URL prefix (/es)
/fr/apply            →  app/apply/page.tsx    →  URL prefix (/fr)
/pt/how-it-works     →  app/how-it-works/...  →  URL prefix (/pt)
/programs            →  308 → /es/programs    →  cookie/Accept-Language
/dashboard           →  app/(portal)/dashboard →  cookie only (no prefix)
/login               →  app/(auth)/login       →  cookie only (no prefix)
/api/...             →  (passthrough)          →  N/A
```

### 3.1 Localeable vs Bypass Paths

`lib/i18n/config.ts` defines:

```ts
const LOCALEABLE_PATH_PREFIXES = [
  '/', '/programs', '/apply', '/contact', '/faq',
  '/what-we-do', '/how-it-works', '/leadership',
  '/employers', '/partners', '/blog', '/find-your-path',
  // ... (26 total)
];
```

**Localeable:** Redirect to `/{locale}/...` if no prefix present.  
**Bypass:** API, `_next`, images, `/robots.txt`, `/manifest.json` — never redirected.

### 3.2 Portal Paths (Cookie-Only)

```ts
const PORTAL_PATHS = [
  '/dashboard', '/resources', '/help', '/applications',
  '/account', '/profile', '/certifications', '/partner',
  '/employer', '/counselor',
];
```

These are **not automatically redirected** to locale-prefixed URLs. The language toggle on portal pages:
1. Sets the `wap-locale` cookie
2. Reloads the page (`window.location.reload()`)
3. Middleware reads cookie on the next request
4. `next-intl` loads the appropriate messages

Portal URLs normally stay unprefixed and use the language cookie. Explicit `/es/dashboard` (and `/en`, `/fr`, `/pt`) deep links still resolve through the middleware rewrite. When a server-side legacy route redirects within the portal, it must preserve an explicit URL prefix without adding one to an unprefixed URL. Middleware forwards a validated `x-wap-explicit-locale` only when the URL contains that prefix; it removes any client-supplied value first. The application-tracker redirect uses this marker to reach the job-applications destination.

---

## 4. Middleware Strategy

### 4.1 Locale Resolution Priority

```
1. URL prefix        (/es/programs → es)
2. ?lang= query param (?lang=fr → fr, then redirect to /fr/...)
3. wap-locale cookie
4. Accept-Language header
5. Default (en)
```

Code: `resolvePreferredLocale()` in `middleware.ts`

### 4.2 Request Flow

```
User visits /programs
  ↓
Middleware: no prefix detected
  ↓
Is /programs localeable? Yes
  ↓
Resolve preferred locale → e.g. "es"
  ↓
308 Redirect → /es/programs
  ↓
Browser loads /es/programs
  ↓
Middleware: prefix detected → splitLocalePrefix → locale="es", path="/programs"
  ↓
Rewrite internally to /programs (file system)
  ↓
Set x-wap-locale: es header
  ↓
Page renders with Spanish messages
```

### 4.3 Edge Runtime Considerations

Middleware runs in Edge runtime. We **cannot** call Prisma. Custom-domain → org resolution uses an in-process cache (`customDomainCache`) populated by Node-runtime resolvers. This is independent of i18n but important to remember when modifying middleware.

---

## 5. URL Generation

### 5.1 Client-Side: `useLocalizedHref`

```ts
import { useLocalizedHref } from '@/lib/i18n/client';

// In a component rendered under /es/programs:
const href = useLocalizedHref('/apply'); // → "/es/apply"
```

Rules:
- If current URL has a locale prefix, the href gets the same prefix
- If current URL has no prefix (portal), href stays unprefixed
- External URLs, `/api`, `/_next` are passed through unchanged

### 5.2 Server-Side: `withLocalePrefix`

```ts
import { withLocalePrefix } from '@/lib/i18n/config';

const canonical = withLocalePrefix('/programs', 'es'); // → "/es/programs"
```

### 5.3 `Link` Components

Marketing nav links should use `useLocalizedHref`:

```tsx
import Link from 'next/link';
import { useLocalizedHref } from '@/lib/i18n/client';

<Link href={useLocalizedHref('/programs')}>Programs</Link>
```

This ensures a user on `/es/how-it-works` clicking "Programs" goes to `/es/programs`, not `/programs` (which would 308 redirect).

---

## 6. SEO

### 6.1 Current Implementation

`app/seo.ts` exports `buildPageMetadata()` and `buildPageMetadataAsync()`:

```ts
export async function generateMetadata() {
  const t = await getTranslations('marketing.howItWorks');
  return buildPageMetadataAsync({
    title: t('title'),
    description: t('description'),
    path: '/how-it-works',
  });
}
```

This produces:
```html
<link rel="canonical" href="https://www.workforceap.org/es/how-it-works" />
<link rel="alternate" hreflang="en" href="https://www.workforceap.org/en/how-it-works" />
<link rel="alternate" hreflang="es" href="https://www.workforceap.org/es/how-it-works" />
<link rel="alternate" hreflang="fr" href="https://www.workforceap.org/fr/how-it-works" />
<link rel="alternate" hreflang="pt" href="https://www.workforceap.org/pt/how-it-works" />
<link rel="alternate" hreflang="x-default" href="https://www.workforceap.org/how-it-works" />
```

### 6.2 Open Graph Locale

```ts
ogLocaleTag('es') → 'es_US'
ogLocaleTag('fr') → 'fr_FR'
ogLocaleTag('pt') → 'pt_BR'
```

### 6.3 Sitemap

`app/sitemap.ts` already includes `alternates.languages` for every route:

```ts
function buildAlternates(path: string) {
  return {
    languages: {
      en: `${SITE_URL}${path}`,
      es: `${SITE_URL}/es${path}`,
      fr: `${SITE_URL}/fr${path}`,
      pt: `${SITE_URL}/pt${path}`,
      'x-default': `${SITE_URL}${path}`,
    }
  };
}
```

### 6.4 Gaps

| Gap | Impact | Fix |
|-----|--------|-----|
| Not all marketing pages use `buildPageMetadataAsync` | Missing hreflang on some pages | Audit all `page.tsx` files under `app/` for hardcoded metadata |
| `metadataBase` in `layout.tsx` is static | OG URLs may not reflect locale | Already handled — `buildPageMetadata` injects full URLs |
| `html lang` is dynamic ✅ | Screen readers work correctly | Already working via `x-wap-locale` header |

---

## 7. Content Strategy: What Gets Translated

### 7.1 UI Strings (messages/*.json)

**Status:** Centralized in `messages/{en,es,fr,pt}.json`

Namespaces:
- `nav` — Navigation labels
- `cta` — Call-to-action buttons
- `footer` — Footer copy
- `form` — Form labels
- `common` — Shared UI (errors, loading, etc.)
- `dashboard` — Portal dashboard
- `apply` — Application flow
- `training` — Training hub
- `marketing.*` — Marketing page copy (home, programs, faq, etc.)
- `jobs`, `counselor`, `partner`, `employer`, `admin` — Role-specific UI

### 7.2 CMS Content (Prisma)

**Blog posts** (`prisma.blogPost`) — Currently English-only. Fields that should support i18n:
- `title`
- `content`
- `excerpt`

**Programs** (`lib/content/programs.ts`) — Static TypeScript array. Translations needed for:
- `title`
- `description`
- `skills` array

**Leadership bios** (`lib/content/leadership.ts`) — Static. Names don't translate; bios might.

### 7.3 Recommendation

| Content Type | Translation Approach | Effort |
|--------------|---------------------|--------|
| UI strings | `messages/*.json` + professional translator | Medium |
| Blog posts | Add `BlogPostTranslation` table or JSON column | Medium |
| Program descriptions | Extract to JSON namespace `marketing.programs.{slug}` | Low |
| Hardcoded marketing copy | Audit + extract to `messages/*.json` | Medium |

---

## 8. Translation Completeness Audit

### 8.1 Key Count (via `scripts/verify-i18n-completeness.cjs`)

| File | Keys | % of EN | Missing from EN | Extra vs EN | Status |
|------|------|---------|-----------------|-------------|--------|
| `messages/en.json` | 1,546 | 100% | — | — | ✅ Source of truth |
| `messages/es.json` | 1,253 | 81.0% | 294 | 0 | ⚠️ Partial — needs backfill |
| `messages/fr.json` | 1,584 | 102.5% | 0 | 38 | ⚠️ Complete but has stale keys; needs quality review |
| `messages/pt.json` | 1,584 | 102.5% | 0 | 38 | ⚠️ Complete but has stale keys; needs quality review |

### 8.2 Missing Spanish Keys

`messages/es.json` is missing 294 keys present in English. Sample gaps:
- `dashboard.homeOverviewTrainingTeaser`
- `dashboard.myTrainingHubCardTitle`
- `training.nextCourseBannerTitle`
- `counselor.counselorDashboard`
- `counselor.welcomeBack`

These cluster around newer features: training hub redesign, counselor dashboard v2, and partner portal enhancements. Run `node scripts/verify-i18n-completeness.cjs --json` for the full list.

### 8.3 Stale Keys in FR/PT

French and Portuguese each have 38 keys not present in English (e.g., `counselor.available`, `partner.outcomesSnapshotDescription`). These are likely from an earlier translation pass that included features later refactored in English. They are harmless but should be pruned to keep files clean.

### 8.3 French / Portuguese Quality

`fr` and `pt` have similar line counts to English, suggesting a bulk translation pass. **Recommendation:** Have a native speaker review before activating these locales publicly. The `LanguageToggle` already shows all 4 options, so users can already switch — but quality may be poor.

### 8.4 Enforcing Completion

Add a CI check that fails if `messages/es.json` (or `fr`, `pt`) is missing keys present in `messages/en.json`:

```bash
# Pseudo-check
node scripts/verify-i18n-completeness.cjs
```

This prevents "mixed English/Spanish" UI when a new feature ships with English-only strings.

---

## 9. Migration Plan (What's Already Done vs. What Remains)

### ✅ Already Shipped

- [x] Middleware locale detection + redirect + rewrite
- [x] `messages/{en,es,fr,pt}.json` with next-intl
- [x] `x-wap-locale` header passing locale to server components
- [x] Dynamic `<html lang>` in `RootLayout`
- [x] `buildPageMetadata()` with canonical + hreflang
- [x] Sitemap with language alternates
- [x] `LanguageToggle` component (cookie + URL prefix)
- [x] `useLocalizedHref` for client-side link localization
- [x] English fallback for missing keys (deep merge in `i18n/request.ts`)

### 🔄 Remaining (This Sprint)

- [ ] **Audit all marketing pages** for hardcoded English strings and extract to `messages/*.json`
- [ ] **Verify `fr` and `pt` translation quality** — native speaker review
- [ ] **Add CI check** for message completeness across locales
- [ ] **Document** the i18n architecture for new developers (this file)

### 📋 Backlog (Future Sprints)

- [ ] **Blog post i18n** — `BlogPostTranslation` table or JSON column
- [ ] **Program description i18n** — extract from `lib/content/programs.ts` to JSON
- [ ] **Translation management platform** — evaluate Crowdin, Lokalise, or Tolgee for professional workflow
- [ ] **RTL support** — scaffold for future Arabic/Hebrew (`isRtlLocale` already exists)
- [ ] **ICU pluralization audit** — ensure all count strings use `plural` syntax correctly

---

## 10. Shareable Links: Requirements & Verification

### 10.1 Requirements

| Scenario | Expected Behavior | Current Status |
|----------|-------------------|----------------|
| Share `/es/programs` | Loads Spanish programs page | ✅ Works |
| Share `/fr/apply` | Loads French apply page | ✅ Works |
| Share `/programs` (no prefix) | Redirects to user's locale (cookie/Accept-Lang) | ✅ Works |
| Share `/pt/blog/post-slug` | Loads Portuguese blog post | ⚠️ Blog content is English-only; UI is PT |
| Switch language on `/es/programs` | Goes to `/fr/programs`, same content | ✅ Works |
| Switch language on `/dashboard` | Reloads page, cookie changes, UI updates | ✅ Works |

### 10.2 Test Matrix

```
Request: GET /programs
Accept-Language: es-US,es;q=0.9,en;q=0.8
Cookie: (none)
Expected: 308 → /es/programs

Request: GET /es/programs
Expected: 200, html lang="es", messages from es.json

Request: GET /dashboard
Cookie: wap-locale=fr
Expected: 200, html lang="fr", messages from fr.json

Request: GET /api/admin/members
Expected: 200 (no locale redirect)
```

---

## 11. Implementation Path & Effort Estimate

### Phase 1: Harden Current System (1–2 days)

1. **Hardcoded string audit** (4–6 hrs)
   - Run `grep -r "\"[A-Z]" app/ components/` for suspicious English strings
   - Focus on marketing pages: `home`, `what-we-do`, `how-it-works`, `programs`, `apply`
   - Extract findings to `messages/en.json`, then backfill `es`, `fr`, `pt`

2. **Translation completeness script** (2–3 hrs)
   - Write `scripts/verify-i18n-completeness.cjs`
   - Compare keys recursively across `messages/*.json`
   - Run in CI (`npm run check` or separate workflow)

3. **FR/PT quality review** (1–2 days, parallel)
   - Send `messages/fr.json` and `messages/pt.json` to native speakers
   - Flag awkward/machine-translated strings
   - Update files

### Phase 2: CMS Content i18n (3–5 days)

1. **Blog post translations** (2–3 days)
   - Add `BlogPostTranslation` table: `postId`, `locale`, `title`, `content`, `excerpt`
   - Update `app/blog/[slug]/page.tsx` to load translation
   - Update sitemap to include translated blog URLs

2. **Program descriptions** (1–2 days)
   - Extract program copy from `lib/content/programs.ts`
   - Add `marketing.programs.{slug}.*` to `messages/*.json`
   - Update `ProgramsContent.tsx` to use `t()`

### Phase 3: Translation Management Platform (1–2 weeks)

Evaluate and integrate:
- **Crowdin** — GitHub sync, good for open source/nonprofit
- **Lokalise** — More features, paid
- **Tolgee** — Open source, developer-friendly

This replaces manual JSON editing and gives translators a UI.

---

## 12. Blockers & Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| FR/PT translations are poor quality | High | Don't publicly promote FR/PT until reviewed. Toggle shows them but they're discoverable. |
| New features ship with English-only strings | High | CI completeness check + code review requirement |
| Blog posts never get translated | Medium | Document process; defer to Phase 2 |
| Middleware performance on high traffic | Low | Edge runtime; no DB calls. Monitor if traffic scales. |
| Mixed-language UI confuses members | Medium | English fallback is explicit in `i18n/request.ts`. Completeness check catches gaps. |

---

## 13. File Reference

| File | Purpose |
|------|---------|
| `middleware.ts` | Locale detection, redirect, rewrite, auth |
| `lib/i18n/config.ts` | Locale constants, path classification, prefix utilities |
| `lib/i18n/server.ts` | `getRequestLocale()` — reads `x-wap-locale` header |
| `lib/i18n/client.ts` | `useLocalizedHref`, `useLocaleFromPath`, cookie helpers |
| `i18n/request.ts` | next-intl `getRequestConfig` — loads + merges messages |
| `app/seo.ts` | `buildPageMetadata()`, `buildPageMetadataAsync()` |
| `app/sitemap.ts` | Sitemap with `alternates.languages` |
| `messages/{en,es,fr,pt}.json` | Translation source files |
| `components/portal/LanguageToggle.tsx` | UI for switching locale |
| `app/layout.tsx` | Dynamic `<html lang>` + `NextIntlClientProvider` |

---

## 14. Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-Q1 | Choose next-intl over next-i18next | Better App Router support, simpler API |
| 2025-Q2 | Middleware rewrite instead of `[locale]` segments | Avoid file-system duplication; existing routes stay clean |
| 2025-Q2 | Cookie-only for portal, prefix for marketing | Portal URLs aren't shared; marketing URLs are |
| 2025-Q2 | English fallback via deep merge | Prevents MISSING_MESSAGE crashes; graceful degradation |
| 2026-05 | Document architecture in this file | Team growth; need single source of truth |

---

*End of document. For questions or updates, ping the #i18n thread or update this file directly.*
