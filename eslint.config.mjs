import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "typescript-eslint";
import path from "node:path";
import { fileURLToPath } from "node:url";
import wapKitPlugin from "./scripts/lint/eslint-plugin-wap-kit.mjs";

// eslint-config-next@15.x ships a legacy (eslintrc) config object, not a flat
// config array. FlatCompat bridges it into the flat config used below.
const compat = new FlatCompat({
  baseDirectory: path.dirname(fileURLToPath(import.meta.url)),
});
const nextVitals = compat.extends("next/core-web-vitals");

const NO_BARE_TABLE_MESSAGE =
  "Do not render bare <table> in product code. New kit pages use components/portal/kit/DataTable (with KitTableShell); existing featureful tables may use components/portal/ui/DataTable. Preserve sorting, density and responsive behavior. Native table markup belongs in these shared implementations or the explicit legacy exceptions. See docs/KIT_GUIDE.md.";

const NO_RAW_HEX_MESSAGE =
  "No raw hex colors in kit components. Use a semantic token — var(--wa-*) or colorVar() from components/portal/kit/tokens.ts — so dark mode and surface modes stay automatic (docs/KIT_GUIDE.md §1). For tinted backgrounds use color-mix(in srgb, var(--wa-x) 15%, transparent).";

const NO_DIRECT_MEMBER_EVENT_WRITE_MESSAGE =
  "Do not call memberEvent.create/createMany directly (WAP-39). Write through persistEvent (transaction-aware, throws) or trackEvent (best-effort) from lib/events/track.ts so every MemberEvent name is validated against the typed vocabulary in lib/events/names.ts.";

const NO_DIRECT_COURSE_ENROLLMENT_WRITE_MESSAGE =
  "Do not call courseEnrollment.create/createMany/upsert directly (WAP-174). Use upsertEquivalentCourseEnrollment from lib/member/courseEnrollmentAssignment.ts, the one canonical program-enrollment writer, so alias rows and the immutable curriculumVersion are handled in one place.";

// AST selectors for `<anything>.memberEvent.create(...)` and
// `<anything>.courseEnrollment.create|createMany|upsert(...)`. Formatting
// (line breaks, optional chaining) does not matter to the selector.
const DIRECT_WRITER_BANS = [
  {
    selector:
      "CallExpression[callee.type='MemberExpression'][callee.property.name=/^(create|createMany|upsert)$/][callee.object.type='MemberExpression'][callee.object.property.name='memberEvent']",
    message: NO_DIRECT_MEMBER_EVENT_WRITE_MESSAGE,
  },
  {
    selector:
      "CallExpression[callee.type='MemberExpression'][callee.property.name=/^(create|createMany|upsert)$/][callee.object.type='MemberExpression'][callee.object.property.name='courseEnrollment']",
    message: NO_DIRECT_COURSE_ENROLLMENT_WRITE_MESSAGE,
  },
];
const [MEMBER_EVENT_WRITER_BAN, COURSE_ENROLLMENT_WRITER_BAN] = DIRECT_WRITER_BANS;

const TABLE_BAN = {
  selector: "JSXOpeningElement[name.name='table']",
  message: NO_BARE_TABLE_MESSAGE,
};

const NO_ABANDONED_NOTIFY_MESSAGE =
  "Do not abandon notifyDiscord/createNotification/createBulkNotifications with `void`, a bare statement or a dangling .catch/.then. Vercel freezes the function once the response is sent, so the work may never run: `await` it, or schedule it with after(() => ...) from next/server so Next retains it (lib/notify/discord.ts, lib/notifications/create.ts).";

// `void notifyDiscord(...)` / `void createNotification(...)` anywhere, plus a
// bare or promise-chained `notifyDiscord(...)` statement outside `after()`.
// (createNotification registers its own after() internally, so only its
// `void` form is banned; notifyDiscord has no such retention.)
const ABANDONED_NOTIFY_BANS = [
  {
    selector:
      "UnaryExpression[operator='void'] > CallExpression[callee.name=/^(notifyDiscord|createNotification|createBulkNotifications)$/]",
    message: NO_ABANDONED_NOTIFY_MESSAGE,
  },
  {
    selector:
      "ExpressionStatement > CallExpression[callee.name='notifyDiscord']:not(CallExpression[callee.name='after'] CallExpression)",
    message: NO_ABANDONED_NOTIFY_MESSAGE,
  },
  {
    selector:
      "ExpressionStatement > CallExpression[callee.type='MemberExpression'][callee.property.name=/^(catch|then|finally)$/][callee.object.type='CallExpression'][callee.object.callee.name='notifyDiscord']:not(CallExpression[callee.name='after'] CallExpression)",
    message: NO_ABANDONED_NOTIFY_MESSAGE,
  },
];

const NO_UNBOUNDED_TAKE_MESSAGE =
  "A Prisma `take` literal at or above 5000 hydrates an unbounded scan (the old silent 5k/10k/20k pattern). Use a cap from lib/db/scanCaps.ts or lib/db/queryCaps.ts, page with a cursor, or aggregate in SQL (count/groupBy/$queryRaw) for official totals.";

// `take: 5000`, `take: 10_000`, `take: 20000`, ... in any Prisma call.
const UNBOUNDED_TAKE_BAN = {
  selector: "Property[key.name='take'] > Literal[value>=5000]",
  message: NO_UNBOUNDED_TAKE_MESSAGE,
};

// Pre-existing unbounded takes that predate the ban. Shrink only; every new
// scan must use a cap from lib/db/*Caps.ts.
const LEGACY_UNBOUNDED_TAKE_FILES = [
  "app/admin/counselors/page.tsx",
  "app/api/admin/crons/export/route.ts",
  "app/api/admin/webhook-events/export/route.ts",
  "lib/admin/diagnoseMemberCoursera.ts",
  "lib/platform/programCatalog.ts",
  "lib/readiness/memberReadinessSections.ts",
  "lib/workflows/completeCareerOsActions.ts",
];

const NO_ABANDONED_ROUTE_EMAIL_MESSAGE =
  "Route handlers must not fire-and-forget send*Email(...) (bare call, `void`, or a dangling .catch/.then). Vercel freezes the function once the response is sent, so the send may never run: `await` it before responding, or schedule it with after(() => send...(...)) from next/server.";

// `sendX...Email(...)` in an API route must be awaited/returned or run inside
// `after()`. Matches the helper naming convention (sendWelcomeEmail,
// sendBrandedEmail, sendPreparedPlacementSurveyEmail, ...).
const ABANDONED_ROUTE_EMAIL_BANS = [
  {
    selector: "UnaryExpression[operator='void'] > CallExpression[callee.name=/^send\\w*Email$/]",
    message: NO_ABANDONED_ROUTE_EMAIL_MESSAGE,
  },
  {
    selector:
      "ExpressionStatement > CallExpression[callee.name=/^send\\w*Email$/]:not(CallExpression[callee.name='after'] CallExpression)",
    message: NO_ABANDONED_ROUTE_EMAIL_MESSAGE,
  },
  {
    selector:
      "ExpressionStatement > CallExpression[callee.type='MemberExpression'][callee.property.name=/^(catch|then|finally)$/][callee.object.type='CallExpression'][callee.object.callee.name=/^send\\w*Email$/]:not(CallExpression[callee.name='after'] CallExpression)",
    message: NO_ABANDONED_ROUTE_EMAIL_MESSAGE,
  },
];

const NO_DIRECT_PROVIDER_SEND_MESSAGE =
  "Do not call resend.emails.send(...) directly. Every outbound email goes through sendBrandedEmail / sendBrandedEmailOrThrowOnSkip in lib/email/send.ts so it gets a plaintext part, List-Unsubscribe headers, the fixture and provider-suppression guards, transient-error retry, an idempotency key and a failure diagnostic (WAP-163).";

// `<anything>.emails.send(...)` — the Resend SDK call — outside the shared
// wrapper. lib/email/send.ts is the one production module exempted below.
const DIRECT_PROVIDER_SEND_BAN = {
  selector:
    "CallExpression[callee.type='MemberExpression'][callee.property.name='send'][callee.object.type='MemberExpression'][callee.object.property.name='emails']",
  message: NO_DIRECT_PROVIDER_SEND_MESSAGE,
};

// Production-wide architecture bans (everything except the bare-<table> rule,
// which has its own exception list below). Flat config replaces rather than
// merges `no-restricted-syntax` entries, so every narrower block restates the
// families it keeps.
const PRODUCTION_BANS = [...DIRECT_WRITER_BANS, ...ABANDONED_NOTIFY_BANS, UNBOUNDED_TAKE_BAN, DIRECT_PROVIDER_SEND_BAN];

const config = [
  {
    // Astro's compiled assets are also staged into public before the Next build.
    // Keep handwritten public scripts in lint; ignore only generated chunks.
    ignores: [".next/**", "marketing/dist/**", "public/_astro/**", "node_modules/**", ".claude/**"],
  },
  ...nextVitals,
  tseslint.configs.base,
  {
    rules: {
      // Start with a non-interactive lint gate that reflects today's codebase.
      // Tighten these rules in follow-up PRs instead of blocking CI adoption.
      "@next/next/no-html-link-for-pages": "off",
      "react/no-unescaped-entities": "off",
      // eslint-plugin-react-hooks@5.2.0 ships only `rules-of-hooks` and
      // `exhaustive-deps`; the React Compiler rules (refs, purity,
      // set-state-in-effect, immutability, error-boundaries) arrive with the
      // v6+ plugin. Do not pre-configure rules the installed plugin lacks.
      // Catches genuine correctness bugs (conditional/looped hook calls).
      "react-hooks/rules-of-hooks": "error",
    },
  },
  {
    // Direct-writer, abandoned-notify and unbounded-take bans apply to every
    // file, tests included (specs mock or observe the delegates without
    // calling them). The bare-<table> exceptions below do NOT exempt a file
    // from these bans: that block restates them.
    files: ["**/*.{ts,tsx,js,jsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...PRODUCTION_BANS],
    },
  },
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    ignores: [
      // The DataTable implementation legitimately renders <table>.
      "components/portal/ui/DataTable.tsx",
      // Design-kit DataTable + its native chrome shell: warm/dense token-driven
      // table implementation (Phase 0 portal redesign). Sibling to the ui/ one;
      // KitTableShell is the <table> host DataTable composes.
      "components/portal/kit/DataTable.tsx",
      "components/portal/kit/KitTableShell.tsx",
      // The admin methodology is authored in Markdown, with varying table
      // columns. Its renderer preserves native table semantics and captions.
      "app/admin/outcomes/methodology/page.tsx",
      // Legacy admin UIs still use raw tables; migrate to <DataTable> over time.
      // 2026-05-20: each retained <table> now carries a <caption className="sr-only"> for a11y.
      "app/admin/placement-surveys/page.tsx",
      "app/admin/growth/page.tsx",
      "app/admin/reports/quarterly-outcomes/QuarterlyOutcomesClient.tsx",
      "app/privacy/page.tsx",
      "components/admin/B4BProgramsListButton.tsx",
      "components/admin/IgnoredXapiSummaryCard.tsx",
      "components/admin/TestimonialsAdminClient.tsx",
      "components/admin/TrainingProgressClient.tsx",
      "components/employer/JobApplicantsClient.tsx",
      "components/portal/counselor/CounselorPriorityQueue.tsx",
      // Tests and stories may exercise table markup directly.
      "**/*.test.{ts,tsx}",
      "**/*.stories.{ts,tsx}",
    ],
    rules: {
      "no-restricted-syntax": ["error", TABLE_BAN, ...PRODUCTION_BANS],
    },
  },
  {
    // Specs deliberately discard a notify promise to prove the helper retains
    // its own work (tests/lib/notifications/create.spec.ts), so the
    // abandoned-notify family is the one production ban tests do not carry.
    files: ["**/*.{test,spec}.{ts,tsx,js,jsx}", "**/*.stories.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...DIRECT_WRITER_BANS, UNBOUNDED_TAKE_BAN],
    },
  },
  {
    // API route handlers additionally may not fire-and-forget email sends.
    files: ["app/api/**/route.ts"],
    rules: {
      "no-restricted-syntax": ["error", TABLE_BAN, ...PRODUCTION_BANS, ...ABANDONED_ROUTE_EMAIL_BANS],
    },
  },
  {
    // Legacy unbounded takes (see LEGACY_UNBOUNDED_TAKE_FILES): keep every
    // other ban, drop only the take literal ban.
    files: LEGACY_UNBOUNDED_TAKE_FILES.filter((file) => !/^app\/api\/.*\/route\.ts$/.test(file)),
    rules: {
      "no-restricted-syntax": ["error", TABLE_BAN, ...DIRECT_WRITER_BANS, ...ABANDONED_NOTIFY_BANS, DIRECT_PROVIDER_SEND_BAN],
    },
  },
  {
    // Legacy-take API routes keep the route email ban as well.
    files: LEGACY_UNBOUNDED_TAKE_FILES.filter((file) => /^app\/api\/.*\/route\.ts$/.test(file)),
    rules: {
      "no-restricted-syntax": [
        "error",
        TABLE_BAN,
        ...DIRECT_WRITER_BANS,
        ...ABANDONED_NOTIFY_BANS,
        ...ABANDONED_ROUTE_EMAIL_BANS,
        DIRECT_PROVIDER_SEND_BAN,
      ],
    },
  },
  {
    // The two canonical writers are the only production modules allowed to
    // call their own banned Prisma delegate; each keeps the other's ban.
    // Vitest specs mock or observe these delegates
    // (`vi.mocked(prisma.memberEvent.create)`) without calling them, so
    // they are not exempted anywhere.
    files: ["lib/events/track.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        TABLE_BAN,
        COURSE_ENROLLMENT_WRITER_BAN,
        ...ABANDONED_NOTIFY_BANS,
        UNBOUNDED_TAKE_BAN,
        DIRECT_PROVIDER_SEND_BAN,
      ],
    },
  },
  {
    files: ["lib/member/courseEnrollmentAssignment.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        TABLE_BAN,
        MEMBER_EVENT_WRITER_BAN,
        ...ABANDONED_NOTIFY_BANS,
        UNBOUNDED_TAKE_BAN,
        DIRECT_PROVIDER_SEND_BAN,
      ],
    },
  },
  {
    // The provider boundary is the only production module that may call the
    // Resend SDK's emails.send; it keeps every other production ban.
    files: ["lib/email/send.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        TABLE_BAN,
        ...DIRECT_WRITER_BANS,
        ...ABANDONED_NOTIFY_BANS,
        UNBOUNDED_TAKE_BAN,
      ],
    },
  },
  {
    // Token discipline inside the design kit (docs/KIT_GUIDE.md §7,
    // docs/ASTRYX_LESSONS.md Lesson 8): raw hex colors are banned across the
    // whole kit (primitives, hooks, AND pages/**) — use var(--wa-*) /
    // colorVar() so dark mode and surface modes stay automatic. Two-tier
    // severity: warnings for humans locally, hard errors in CI (and under
    // WAP_STRICT_LINT=1) so agents get the stricter gate.
    files: ["components/portal/kit/**/*.{ts,tsx}"],
    ignores: [
      "components/portal/kit/DataTable.tsx",
      "components/portal/kit/KitTableShell.tsx",
      // The Voice Studio session theater is intentionally fixed dark chrome
      // (same in light and dark — see the file's header comment); its ~30
      // dark-panel literals are by design, not token debt.
      "components/portal/kit/pages/VoiceStudioKit.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        process.env.CI || process.env.WAP_STRICT_LINT ? "error" : "warn",
        // Flat config replaces (not merges) rule entries, so the repo-wide
        // bare-<table> ban and the production bans must be restated here.
        TABLE_BAN,
        ...PRODUCTION_BANS,
        {
          selector: "Literal[value=/#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b/]",
          message: NO_RAW_HEX_MESSAGE,
        },
        {
          selector: "TemplateElement[value.raw=/#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b/]",
          message: NO_RAW_HEX_MESSAGE,
        },
      ],
    },
  },
  {
    // kit/DataTable.tsx and KitTableShell legitimately render <table>, but
    // the hex ban and the production bans still apply to both.
    files: [
      "components/portal/kit/DataTable.tsx",
      "components/portal/kit/KitTableShell.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        process.env.CI || process.env.WAP_STRICT_LINT ? "error" : "warn",
        ...PRODUCTION_BANS,
        {
          selector: "Literal[value=/#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b/]",
          message: NO_RAW_HEX_MESSAGE,
        },
        {
          selector: "TemplateElement[value.raw=/#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b/]",
          message: NO_RAW_HEX_MESSAGE,
        },
      ],
    },
  },
  {
    // High-signal jsx-a11y baseline. Intentionally narrower than the
    // upstream `recommended` set so we do not drown the team in errors.
    // The `jsx-a11y` plugin itself is already registered by
    // `eslint-config-next/core-web-vitals`, so we only override rules here
    // (re-declaring the plugin would error: "Cannot redefine plugin").
    // Tighten / expand in follow-up PRs.
    files: ["**/*.{tsx,jsx}"],
    rules: {
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/anchor-has-content": "error",
      "jsx-a11y/anchor-is-valid": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-proptypes": "error",
      "jsx-a11y/aria-role": "error",
      "jsx-a11y/aria-unsupported-elements": "error",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/role-supports-aria-props": "error",
      "jsx-a11y/heading-has-content": "error",
      // High false-positive rate on custom <Label> wrappers; surface but
      // do not block CI.
      "jsx-a11y/label-has-associated-control": "warn",
      "jsx-a11y/no-redundant-roles": "error",
      "jsx-a11y/scope": "error",
    },
  },
  {
    // No Astryx <Button> directly inside <Link>/<AstryxLink> (WAP-268,
    // follow-up to WAP-252): it renders invalid <a><button> with two tab
    // stops. Use KitLinkButton. A separate local rule, not
    // no-restricted-syntax, so no other block has to restate it.
    files: ["**/*.{tsx,jsx}"],
    ignores: [
      // Remove each ignore when #2553 / #2513 merge and the site is
      // converted to KitLinkButton (WAP-268).
      "components/portal/kit/pages/admin-subviews/StudentsRosterKit.tsx", // #2553
      "components/portal/kit/pages/employer/EmployerHomeKit.tsx", // #2513
    ],
    plugins: { "wap-kit": wapKitPlugin },
    rules: {
      "wap-kit/no-button-in-link": "error",
    },
  },
];

export default config;
