# Maintenance and audit coverage

The knowledge base has two layers: human explanations and a deterministic source index. Both are versioned with the application. The human layer explains intent and boundaries; the generated layer proves which tracked files and static references were indexed.

## Refresh after a change

1. Update the relevant human guide when behavior, ownership, a data contract, a provider or a release path changes.
2. Stage the intended source and documentation files. The generator reads `git ls-files`, so an untracked new file is deliberately not indexed until added to Git.
3. Run `npm run kb:generate`. The output lands in `docs/knowledge-base/generated/`, which is git-ignored: regenerate it, read it, but never stage it.
4. Run `npm run kb:test` and `npm run kb:check`. Because the output is not committed, a change landing on the target branch no longer invalidates your branch's copy; you only regenerate when you want the index to reflect your own edits.
5. Record any new live acceptance separately from source facts.

```bash
git add path/to/intended/source path/to/relevant/document
npm run kb:generate   # writes the git-ignored docs/knowledge-base/generated/
npm run kb:test
npm run kb:check
```

`docs/knowledge-base/generated/` is build output, not source. It is not tracked, so
a fresh clone does not have it: run `npm run kb:generate` once before `npm run kb:query`
or before following a link into `generated/`. CI regenerates it from the checked-out
source on every pull request and then verifies it, so the index the check validates is
always derived from that commit's tree.

These tools do not load application modules, contact providers or read private environment files. They require the repository's TypeScript development dependency. A normal frozen install supplies it. The index job can install with lifecycle scripts disabled because Prisma generation and database connectivity are unnecessary for this work.

The [knowledge-base workflow](../../.github/workflows/knowledge-base.yml) checks new PRs and `master` pushes. It detects source/index drift; it does not independently update prose or establish runtime correctness. Repository branch protection determines whether a check is required—adding a workflow does not change those settings.

## Provenance and completeness

[audit-baseline.json](audit-baseline.json) records the application revision that received the human audit. Update it after reviewing a new application baseline, not merely because a documentation commit changed `HEAD`.

The generator records a deterministic hash of all indexed file paths and content hashes. This avoids timestamp churn and a self-referential commit hash. It intentionally excludes its own generated output directory from its inputs; that directory is validated as output instead. Untracked/ignored files, installed dependencies, production data and live provider configuration are outside the inventory. A tracked private dotenv/key/database file receives only metadata; its content is not read.

The [summary](generated/summary.json) reports exact counts for its indexed input tree. The [file inventory](generated/inventory.json) includes source, binaries, assets, Markdown, operations and historical material. Binary files have hashes and sizes rather than invented textual descriptions.

## What the static tools know

| Index | Evidence | Important limit |
| --- | --- | --- |
| Files and symbols | Git-tracked files; TypeScript AST declarations/exports with lines | Not every declaration is callable or used at runtime. |
| Imports and reverse references | Literal imports, re-exports, `require`, dynamic `import`, type imports; local alias/directory resolution | Not a complete call graph. Computed imports, framework tracing and HTTP relationships need manual review. |
| Routes and layouts | Next filesystem entries, exported HTTP methods, selected literal runtime options and Astro page filename patterns | Does not certify access control, middleware coverage, deployed routing, or Astro/static precedence. |
| Database | Declared Prisma models/enums, fields and relation references | Does not include every migration-only policy/trigger or prove deployed schema. |
| Scheduled jobs | `vercel.json` declarations linked to route source | A schedule is not an invocation or delivery receipt. |
| Environment | Source references and example declarations; names only | Computed names, shell templates and deployed values are not resolved. Not every reference is required. |
| Tests | Source candidates/helpers, framework imports and declared Node/Vitest/Playwright selection | Static selection is not execution or coverage; computed configurations require manual review. Consult the runner index and audit findings. |
| Documents | Tracked Markdown/MDX titles and headings | A date or “complete” heading does not establish current authority. |

Astro and shell files remain in the complete file catalog, even where the TypeScript AST index cannot describe their internal behavior. The [integration guide](integrations.md) and [operations guide](operations.md) supply the manually traced build/provider relationships.

## Audit coverage

This audit covers the repository-wide tracked inventory and selected production boundaries through source inspection and isolated synthetic execution. The existing [blast-radius workflow](../../.agents/skills/blast-radius-audit/SKILL.md) and frozen [graph schema](../../graph/SCHEMA.md) remain the evidence format. The existing seeded map contains only five historical clusters; the complete KB inventory and current subgraph scopes supplement it.

Review perspectives are dependencies/build contracts, identity/tenant/PII boundaries, dead-code/collection/documentation reachability, and production hot paths. Reviews run in bounded waves while the separate active release worker retains ownership. The final [audit report](audit-report.md) records who covered each scope, what was executed, and the resulting claims. It must not be interpreted as four simultaneous independent production tests.

The existing workflow uses append-only claims and raw sanitized evidence. For this run, the public repository receives reduced tracking records; detailed new security findings, claim batches and runnable probes are retained in the private maintainer bundle KB-AUDIT-20260912. Synthetic probes execute relevant source with controlled dependencies; they do not send email, create voice sessions, mutate billing, or query live members. A reproduced failure path establishes that path under the stated inputs, not that an incident happened in production.

Ranking comes from the existing frozen `scripts/audit-rank.mjs`, applied to the current run's private claim snapshot. The [debt register](technical-debt.md) uses that output and keeps older/unverified backlog items separate. The audit does not modify the ranker, silently accept rules, or implement unrelated product fixes.

## Keep fixes connected to evidence

For a selected debt item, link the claim and reproducer in its implementation issue/PR. Preserve the original evidence, add the regression test to an actually collected runner, implement the bounded fix, and record the final head and relevant release acceptance. Supersede historical claims explicitly; do not erase them or label a finding resolved because a nearby file changed.

New durable constraints can be proposed in `graph/rules.json`. Rule acceptance and selection of additional product fixes remain explicit decisions under the repository's audit governance. The knowledge base itself is a navigation and audit deliverable; its publication is not approval to deploy every finding.

## GBrain and portable agent context

Use GBrain for a compact pointer to this KB, the repository/PR/revision, active ownership and current operational gates. Keep the full catalog and source-grounded architecture in Git. Any agent can read [agent-context.md](agent-context.md) and query the checked-out index without depending on a particular model, editor, connector or cloud.

Refresh a GBrain pointer after the reviewed Git change lands. Do not overwrite a canonical page with an old Git snapshot or replace a full ledger with its compiled summary. Never mirror production member records, raw provider preimages or credentials into the developer knowledge base.
