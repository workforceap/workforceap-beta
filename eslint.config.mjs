import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "typescript-eslint";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
      "CallExpression[callee.type='MemberExpression'][callee.property.name=/^(create|createMany)$/][callee.object.type='MemberExpression'][callee.object.property.name='memberEvent']",
    message: NO_DIRECT_MEMBER_EVENT_WRITE_MESSAGE,
  },
  {
    selector:
      "CallExpression[callee.type='MemberExpression'][callee.property.name=/^(create|createMany|upsert)$/][callee.object.type='MemberExpression'][callee.object.property.name='courseEnrollment']",
    message: NO_DIRECT_COURSE_ENROLLMENT_WRITE_MESSAGE,
  },
];

const config = [
  {
    // Astro's compiled assets are also staged into public before the Next build.
    // Keep handwritten public scripts in lint; ignore only generated chunks.
    ignores: [".next/**", "marketing/dist/**", "public/_astro/**", "node_modules/**"],
  },
  ...nextVitals,
  tseslint.configs.base,
  {
    rules: {
      // Start with a non-interactive lint gate that reflects today's codebase.
      // Tighten these rules in follow-up PRs instead of blocking CI adoption.
      "@next/next/no-html-link-for-pages": "off",
      "react/no-unescaped-entities": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "react-hooks/purity": "off",
      "react-hooks/error-boundaries": "off",
      // Re-enabled: catches genuine correctness bugs (conditional/looped
      // hook calls), unlike the stylistic rules above. Lint runs with
      // continue-on-error in CI (see .github/workflows/ci-gate.yml), so
      // this will not block merges while any existing violations are fixed.
      "react-hooks/rules-of-hooks": "error",
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
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='table']",
          message: NO_BARE_TABLE_MESSAGE,
        },
        ...DIRECT_WRITER_BANS,
      ],
    },
  },
  {
    // The two canonical writers are the only production modules allowed to
    // call the banned Prisma delegates. Vitest specs mock or observe these
    // delegates (`vi.mocked(prisma.memberEvent.create)`) without calling
    // them, so they are not exempted here; the `*.test.*` ignore above
    // covers node:test suites that build fake clients.
    files: [
      "lib/events/track.ts",
      "lib/member/courseEnrollmentAssignment.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='table']",
          message: NO_BARE_TABLE_MESSAGE,
        },
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
        {
          // Flat config replaces (not merges) rule entries, so the repo-wide
          // bare-<table> ban must be restated for these files.
          selector: "JSXOpeningElement[name.name='table']",
          message: NO_BARE_TABLE_MESSAGE,
        },
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
    // the hex ban still applies to both.
    files: [
      "components/portal/kit/DataTable.tsx",
      "components/portal/kit/KitTableShell.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        process.env.CI || process.env.WAP_STRICT_LINT ? "error" : "warn",
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
];

export default config;
