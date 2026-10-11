# Localized homepage routing — 2026-10-11

## Problem and bounded fix

WAP-294: the locale-prefix rewrite selected `/` for `/es/`, `/fr/` and `/pt/`,
serving the English Astro homepage despite translated home assets. A retained
baseline DEMO GET of `/es/` returned HTTP 200, `html lang="en"` and
`x-matched-path: /`.

[The production builder](../../scripts/vercel-build.cjs) compiles Astro and copies
its output into Next's `public/`. A fresh Astro build emitted 71 HTML files; the
only locale-prefixed HTML files were `es/index.html`, `fr/index.html` and
`pt/index.html`. No localized marketing leaf output was emitted. Marketing inputs
were unchanged between the build's `7c4c8e3` source, the initial candidate's
`42be2a95` base and the rebased `0866911f` base.

[Middleware](../../middleware.ts) now selects `/{locale}/index.html` only for
those exact homepage URLs, with or without a trailing slash, and retains the
query. `/en` keeps its existing root alias. Every other locale-prefixed path keeps
the existing prefix-strip contract and authorization handling. This patch makes
no broader claim about translated leaf routes.

## Verification and limits

[Behavioral regressions](../../tests/api/middleware-explicit-locale.spec.ts) cover
both homepage forms, explicit locale precedence, query preservation, session
response rebuilding, request/CSP headers, the English alias, unchanged Next and
marketing-leaf destinations, anonymous portal redirects and the tenant API 401
backstop. The original middleware failed the three localized-home tests; the
patched focused routing/CSP/enrollment/read-only-cookie/LanguageToggle suites
passed 57 assertions across five files.

The integrated local fixture copied the freshly built Astro assets into `public/`
and used a loopback-only dummy database, empty provider/auth credentials and GET
requests. `/es`, `/fr` and `/pt` returned HTTP 200 with the corresponding HTML
language and localized title; query strings survived the internal rewrite.
Trailing-slash requests took one normal slash-canonicalization redirect and then
served the matching language, retaining the query. `/es/apply` and `/es/login`
retained HTTP 200 with Spanish HTML; an anonymous prefixed portal request retained
its localized login redirect and complete return URL, health returned 200, and
the anonymous tenant API returned 401. The unchanged `/en` root alias returned
404 in this Next development fixture because directory-root static serving
differs from Vercel; its deployed acceptance remains required. An initial explicit-hostname
fixture reran locale rewrites and produced misleading redirects; restarting with
the established no-hostname recipe resolved that fixture behavior. Both traces
are retained. Local Next serving does not certify Vercel routing precedence.

Artifacts are retained under
`/workspace/artifacts/wap-sitewide-uiux-20261011/locale/`: fresh output ownership,
baseline/patched regression logs, integrated GET chains, host-fixture diagnosis,
and subsequent gate/deployment receipts. No database, provider or real-user
actions were executed. Independent immutable-head review, full repository gates
and exact hosted DEMO language/content/query acceptance are separate requirements;
production release acceptance belongs to the combined release receipt.
