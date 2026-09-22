# Workforce AP knowledge base

Start here to understand the application, find the right code, and plan a change. This knowledge base lives with the source so any local or cloud agent can use the same navigation and evidence.

The [audit baseline](audit-baseline.json) identifies the reviewed application revision. [Generated inventory](generated/summary.json) describes the indexed source tree. Source inspection, synthetic regression probes, and dated production receipts are different kinds of evidence; a diagram or passing static check does not certify production behavior.

## Choose the context you need

| Need | Start here |
| --- | --- |
| Give an agent a compact orientation | [Agent context](agent-context.md) |
| Understand the system and trust boundaries | [Architecture and Mermaid diagrams](architecture.md) |
| Find a feature's UI, API, domain code and tests | [Feature navigation](features.md) |
| Understand tenant, user, training and business records | [Data model and ownership](data.md) |
| Find every endpoint, file, export or dependency reference | [Complete generated catalog](generated/README.md) |
| Understand external providers and failure boundaries | [Integrations](integrations.md) |
| Run, test, release, observe or recover the application | [Operations](operations.md) |
| Choose the next technical-debt work | [Evidence-backed debt register](technical-debt.md) |
| Refresh the index or contribute documentation | [Maintenance and audit coverage](maintenance.md) |

Read this page and the one relevant domain page first. Do not load the complete machine inventory into an agent prompt. It is intentionally exhaustive; the query tool returns only matching locations.

```bash
npm run kb:generate   # once per clone: writes the git-ignored generated/ directory
node scripts/knowledge-query.mjs "CourseEnrollment"
node scripts/knowledge-query.mjs "guardian" --limit 15
node scripts/knowledge-query.mjs --references lib/tenant/withTenantScope.ts --limit 20
```

Everything under `generated/` is build output and is **not tracked in Git**. Run
`npm run kb:generate` to produce it; until you do, links on this page that point into
`generated/` resolve only after that command (and do not resolve when browsing this file
on GitHub). CI regenerates the directory from the checked-out source and verifies it on
every pull request, so the index is always derived from the commit being reviewed.

The query tool reads generated JSON and prints paths, symbols and references. It does not contact production, load environment values, or run application code.

## What is authoritative

1. [AGENTS.md](../../AGENTS.md), the current implementation and its relevant tests govern changes.
2. [Deployment checklist](../DEPLOYMENT-CHECKLIST.md), [database recovery](../DATABASE-RECOVERY.md), [UI kit guide](../KIT_GUIDE.md) and [operating lanes](../two-lanes.md) govern their specific work.
3. This KB connects those sources and records the audit's evidence and limits.
4. Older audits, design exports, root `DEPLOY.md` and `Caddyfile` require historical-context checks before reuse. The nested [marketing guide](../../marketing/AGENTS.md) governs Astro authoring; the current [Vercel build](../../scripts/vercel-build.cjs) actively builds that tree and copies its output into Next's `public/`. Check route ownership before changing overlapping public surfaces. A filename or old “complete” label is not freshness evidence.

The generated [document catalog](generated/documents.json) includes all tracked Markdown/MDX files and headings. It deliberately does not declare every document current.

## Working rules that prevent expensive mistakes

- Confirm the actor, subject and organization before a data change. Use the established role and tenant helpers; UI visibility and a GUC wrapper are not sufficient authorization.
- Application source is in this repository. Lab configuration is in `homelab-config`; AI runtime configuration is in `openclaw-config`; GBrain carries shared context and source pointers. Member records and credentials do not belong in shared agent notes.
- Preserve the active worker's branch and ownership. Use an isolated branch, publish a PR, resolve the applicable review and validation gates, and record the exact released commit.
- A production merge can run migrations through the Vercel build. A Git revert is not a database restore. Never use production to compensate for unavailable development access.
- Update the human guide for changed behavior and regenerate the machine index for changed source. See [maintenance](maintenance.md).

## Current audit boundaries

Every tracked input file is cataloged, including assets, tests, operations and historical material. Generated output, ignored files and installed dependencies are outside that file inventory. Tracked private dotenv/key/database files receive metadata-only records; their content is not indexed. Manual and behavioral audits target shared production boundaries; they are not a claim that every branch of every file was executed. Read the [coverage record](maintenance.md#audit-coverage) before interpreting a clean result.
