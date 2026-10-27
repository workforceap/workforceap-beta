# Agent delivery contract

The coordinator owns the feature from assignment through release and closeout.
Claude CLI, Cursor and Hermes contribute through their native clients, using
existing authentication, provider policy and user-selected settings. A manifest
entry is not evidence that an agent ran.

## Ownership and branches

1. Fetch the current default branch and inspect open PRs, worktrees and active
   agent claims before assigning work. Preserve other work and avoid duplicate
   fixes. Use a fresh branch for each new coherent feature; do not conceal new
   work in an aging carryover branch.
   On Windows, create the isolated checkout with per-command
   `git -c core.autocrlf=false worktree add -b <branch> <path> <current-base>`.
   Historical migration and fixture guards inspect exact bytes; CRLF conversion
   can fail them despite unchanged Git blobs. Restore only verified committed
   bytes when needed. Never change pinned hashes or shared Git configuration to
   make a checkout pass.
2. Name one integrator, implementation owner, independent reviewer, publication
   owner and final merge owner. The same integrator may publish; the reviewer
   must be independent of implementation. The existing Hermes WAP coordinator
   remains the single merge owner until an explicit handoff is acknowledged.
3. Limit active integration work to two coherent feature groups. Give workers
   disjoint files or responsibilities and isolated worktrees. Small child PRs
   target their feature branch; one release PR targets `master`. Unrelated
   production database changes remain separate release decisions.
4. Every handoff records task/issue, repository, worktree/branch, immutable base
   and head, allowed scope, native session/task handle, tests actually run,
   findings, evidence links, blockers and next owner/action. Track the native AO
   PR association when AO owns the worker; a local ledger supplements AO.
5. A running or uncertain native task retains its claim. Poll the same handle
   after an observation timeout. Never infer terminal status from elapsed time,
   a stale lock, or missing commentary, and never blindly resend an uncertain
   dispatch. Reassign only after authoritative terminal evidence or an explicit
   acknowledged handoff.

## Assigning the three agents

- Claude CLI: bounded implementation or independent review of a specified diff.
- Cursor: a separate bounded implementation, component/interaction review, or
  independent review. State whether edits are allowed and the exact file scope.
- Hermes: ownership reconciliation, backlog/release coordination and final merge
  execution through its existing supported interfaces. Delegate read-only
  investigations separately from implementation and production execution.

Choose responsibilities for the actual task; do not run all three on the same
implementation by default. Retain real native outputs, exit/terminal state and
exact reviewed revisions. Never label a Codex subagent result as a Claude,
Cursor or Hermes result. Preserve provider-native limits and paid-credit opt-outs;
do not add paid fallbacks or change models to conceal a failed route.

## Testing and integration

Every child PR needs policy/security/tenant/migration guards, typecheck, affected
lint and selected tests calculated from its actual base. Unknown test ownership,
deletions and broad configuration changes must fail safely to full applicable
testing. Related Vitest tests do not cover Node-owned or database suites.
If the affected runner cannot prove ownership, its check fails. Apply `ci-full`
to the child PR to trigger a fresh full run, including build and PostgreSQL;
an in-job full Vitest fallback alone is not sufficient. Preserve that label until
the uncertainty is resolved and the candidate is independently reviewed.

Run the full Node, Vitest, build, database and policy gates on the combined release
candidate. Auth, tenant isolation, schema/RLS, shared routing/providers/layouts,
dependency locks, CI and test setup trigger broader validation even on child PRs.
Keep one resource-heavy build/test operation per constrained host at a time.

Do not path-filter away required workflows. An aggregate must check the relevant
jobs explicitly, including database contracts, and distinguish justified skips
from missing or failed jobs. The implementation and live required-check rules,
not comments saying "required", determine enforcement.

Retargeting changes the integration question. Refresh policy checks and verify
the actual candidate tree and base. Prior full-suite evidence may be reused only
when immutable tested tree equivalence is proved and current policy permits it;
record the real tested base. Changed content/base or incomplete proof requires
fresh validation. Preserve master verification and deployment acceptance.

Preview availability is separate: inspect `vercel.json` and the deployment itself.
At initial installation only `preview`, `feature/portal-*` and `feature/astro-*`
are allowed by its preview filter. A successful skipped Vercel status is not a
deployed preview. Use an allowed, purpose-specific integration branch or change
the preview policy through a reviewed infrastructure change before promising QA.

## Landing and closing work

The merge owner verifies current base/head, independent review, all applicable
checks, ownership, explicit product/data decisions and the deployment/database
preflight. Use the normal guarded merge interface with an expected head; no admin
bypass, force push or direct default-branch push. Master merges start production
deployment and its migration stage. Follow `DEPLOYMENT-CHECKLIST.md` and
`DATABASE-RECOVERY.md`; never apply a second concurrent migration.

After landing, verify the resulting commit and deployment. Close incorporated
PRs only after exact code preservation is demonstrated and link the release
commit. Close obsolete preview/reference PRs with an explanation, preserving
branches/artifacts that other work still references. A stale PR containing unique
work needs a preservation map, refresh, explicit hold or owner abandonment
decision; do not call it redundant merely to reduce the count.

Report implemented, reviewed, CI-passed, deployed, accepted, closed and blocked
as separate states. A release may be complete while a broader production or
provider acceptance issue remains open. Morning summaries must read actual native
receipts, GitHub state and release checks; include every remaining owner/action.
