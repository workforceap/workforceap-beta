# Compact context for an agent

Workforce AP is a Next.js App Router application with a public site and authenticated member, counselor, employer, partner and staff surfaces. Vercel hosts the production application. Supabase supplies authentication, PostgreSQL and storage; Prisma is the principal application database client. The production build also compiles the Astro `marketing/` tree and copies its output into Next's `public/`; check route ownership before changing either public surface. Historical homelab deployment artifacts do not define current production delivery.

Read [AGENTS.md](../../AGENTS.md) and [KB navigation](README.md). Current dependency versions come from [package.json](../../package.json) and its lockfile, not this prose.

## Locate the change

- **UI:** Astro public pages in `marketing/src/pages/`; dynamic Next journeys under `app/`, portals under `app/(portal)/`, staff pages under `app/admin/`, and shared `components/`. Locale prefixes are handled by middleware; there is no `app/[locale]/` directory. Start from the [feature table](features.md). Read `docs/KIT_GUIDE.md` before portal UI changes.
- **API:** `app/api/**/route.ts`; [every endpoint and its source](generated/routes.md). Imported guard names are navigation evidence, not proof that a route authorizes correctly.
- **Identity and tenant:** `middleware.ts`, `lib/auth/server.ts`, `lib/auth/roles.ts`, `lib/tenant/withTenantScope.ts`, `lib/tenant/organization.ts`.
- **Database:** `prisma/schema.prisma`, migrations, `lib/db/prisma.ts`, `lib/db/withRequestGuc.ts`. [Model distinctions](data.md) matter: admissions `Application`, personal `JobApplication`, and employer-facing `JobPostingApplication` are different.
- **Training:** `lib/content/programs.ts` is the app catalog, not the only catalog. Assignment is `CourseEnrollment` via `lib/member/courseEnrollmentAssignment.ts` (the only module allowed to create rows; ESLint and a path-allowlist test enforce it) + `lib/member/curriculumAssignment.ts`. `User.enrolledProgram` is a leftover pointer. Member `/dashboard/program` and `/dashboard/program/start` both resolve via `getActiveProgramForDashboard`; start must not bounce on a null leftover column when a primary enrollment exists. Coursera/xAPI: `lib/coursera/`, `lib/xapi/`.
- **Notifications and jobs:** `lib/notifications/`, `lib/email/`, `lib/email.ts`, `app/api/cron/`, `vercel.json`.
- **AI and voice:** `lib/ai/`, `lib/elevenlabs/agentRegistry.ts`, `app/api/ai/`, reviewed `scripts/elevenlabs/patches/`.
- **Delivery and support:** [operations](operations.md), [integrations](integrations.md), [technical debt](technical-debt.md).

```bash
node scripts/knowledge-query.mjs "your feature or symbol" --limit 20
node scripts/knowledge-query.mjs --references path/to/file.ts --limit 20
```

## Before implementing

1. Verify the current branch, active owner, intended behavior and source revision.
2. Read the entry point, shared helpers, data model and relevant tests. Follow imports and reverse references; do not infer isolation from a folder name.
3. Identify actor/subject/tenant checks, external effects, retry semantics and migration impact.
4. Consult the [debt register](technical-debt.md); an existing open finding may already explain the failure.
5. Make the bounded change, run the applicable checks, refresh the KB, and hand off the immutable revision with evidence.

Both Node and Vitest lanes are required where applicable; `npm test` alone is only the Node lane. Browser checks need a running application and appropriate development data. A build success does not prove a user flow or a provider configuration change.

Do not copy credentials or production member data into the KB, a PR body or GBrain. Do not rebuild or reset a live database based on a static audit finding. The normal Prisma GUC layer is configuration-dependent, and preview transaction flattening changes semantics; consult [data boundaries](data.md) before relying on either.
