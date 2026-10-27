# Synthetic phase activation and recovery

Code and disposable localhost tests are authorized. Hosted assignment, mentor approval,
job publication, environment creation and credential changes remain held. No supplied
JSON boolean is human authorization. Independent current-commit review remains required;
Mike's permitted manual self-review is an activation gate, not independent code review.

## Review before activation

1. The existing `demo-qa` environment must have Mike (`mabrown040`, ID `225406758`)
   as its sole required reviewer, self-review allowed, administrator bypass disabled,
   and only the `master` branch allowed. The workflow refuses a missing environment;
   the coordinator owns configuration. Set the nonsecret organization ID at repository
   scope so the credential-free preflight can prepare the exact plan. Keep
   `DEMO_QA_ENABLED` and `DEMO_QA_ORGANIZATION_ID` at repository scope without
   conflicting environment-level definitions.
2. A first-attempt master dispatch prepares `portal-phase-blueprint-<run ID>` before
   the protected job starts. Inspect `phase-plan.json`, `creation-plan.json` and
   `review.txt`: deterministic reserved UUIDs, run/organization, both immutable commits,
   fifteen matching content blob hashes, five actor emails, every synthetic scalar,
   and all five scopes. Artifact ID, archive SHA-256 and blueprint SHA-256 flow from
   that job's outputs into the protected job. The protected job downloads by exact ID
   and rechecks GitHub artifact/run provenance and the canonical blueprint hash.
3. Only after review, the authorized operator may configure protected environment
   `DEMO_QA_PHASES_ENABLED=true` and `DEMO_QA_PHASE_APPROVAL` with the exact
   `portal-phase-approval-v1` contract described in the pure plan validator. The
   contract binds run, org, project, both commits, blueprint hash, Mike's identity,
   this exact workflow run's approval URL, explicit scopes and a maximum 24-hour validity.
   The synthetic job also expires four hours after the run was created. Missing,
   stale or partial scopes stop full acceptance before fixture creation. Expiration
   requires a new reviewed dispatch; it never authorizes a retry of a previous write.
4. Mike approves the waiting `demo-qa` job with the exact comment printed in
   `review.txt`: `portal-phase-approval-v1 sha256:<blueprint hash> scopes:<sorted scopes>`.
   The runner reads GitHub's actual review history, requiring exactly one matching
   approval by that GitHub user for this environment. A bare “approve”, JSON alone,
   another reviewer, stale run, altered artifact, duplicate review or different scope
   set fails closed. The same read-only proof is required by hosted creation, phase
   and browser action processes. No script posts approvals or modifies environment data.

The protected phase variables are bound on the runner's validation step after the
job has entered `demo-qa`, not in the earlier job-level environment expression.
Only validated canonical values are propagated through `GITHUB_ENV` to later
steps. GitHub documents [environment variable availability](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#vars-context)
and [configuration precedence](https://docs.github.com/en/actions/reference/workflows-and-actions/variables#configuration-variable-precedence);
the first hosted run must still verify the timing and artifact handoff in practice.

The explicit scopes are `saved-result`, `synthetic-assignment`, `mentor-owner`,
`mentor-directory-exposure`, and `synthetic-live-job`. The final two expose clearly
synthetic content to shared DEMO readers because the current detail loaders do not
filter those records by organization. The code provides the path after approval;
it does not infer approval from this document, missing coverage or elapsed time.

## Execution and evidence

The local companion runs first on an owned disconnected Next dev server. Hosted
creation then journals all five disposable Auth identities and exact base rows.
The original five-role/member mutations run while unassigned. Browser phases follow
in order: `unassigned`, `assigned-owner`, `approved-profile`. Each transition is an
atomic PostgreSQL mutation plus AuditLog checkpoint. The canonical enrollment writer
creates only the new run member's reserved enrollment. No legacy member assignment,
catalog, provider, progress, draft, mentor session or application is created.

Each phase fixes the case paths and a graph digest; bounded phase-qualified login
intents account for every role's possible login events. Baseline and candidate use
the same phase descriptor. The finalizer derives expected cases from durable
checkpoints and trusted source, combines all three bundles, then binds the local
companion's exact bytes and process execution receipt. Missing/invalid evidence writes
an error final receipt. No skip, absent phase or cleanup-only run can pass acceptance.

Cleanup compares the complete owned graph, deletes the exact job, mentor, saved
result and enrollment before dependent base rows, and commits absence proof with
the retained journal. Unplanned children or scalar changes stop cleanup. The two
real PostgreSQL contracts are run with explicit `TEST_REAL_DB=1` and localhost
  `POSTGRES_PRISMA_URL`, using `node scripts/demo-acceptance-journal.realdb.mjs` and
`tsx scripts/demo-acceptance-owned-rows.realdb.ts`. Their approval objects are local
simulations and cannot pass the hosted GitHub authorization check.

## Terminal recovery and operator holds

A canceled create may bypass the automatic cleanup steps. Once GitHub reports the
current journal owner's run terminal, dispatch a new first-attempt master run with
mode `recover-cleanup` and the original `<run ID>-1`. Leave baseline/deployment inputs
empty. The recovery runner loads the original plan from AuditLog, verifies the
current owner's terminal GitHub provenance, claims a new ownership revision, and
reconciles only exact run-owned outcomes before cleanup. A second recovery must
prove the immediately previous recovery owner terminal, not just the original run.
Recovery never repeats application actions or establishes acceptance.

Two outcomes require an operator hold and preserved journal/receipts:

- An out-of-allowlist child, foreign relationship or unexplained scalar drift.
  Inspect the exact IDs and history read-only; ask the responsible owner for a
  reviewed reconciliation. Do not widen the graph allowlist, bulk delete, or reset
  real/shared data to make the test pass.
- A durable dispatch marker whose reply was lost before the caller knows whether
  HTTP was sent, with no positive exact outcome. The absence of an Auth user or app
  change does not prove that an in-flight request cannot later commit. Do not repeat
  it or infer absence from a timeout. Preserve the operation in quarantine until a
  separately reviewed authoritative reconciliation supplies the missing evidence.

A received HTTP failure or failed UI assertion is different: a fresh exact graph
can record a confirmed failed action and permit cleanup, while acceptance stays
failed. All unresolved unknown outcomes remain held; the cleanup command reports
that boundary rather than guessing.

GitHub review evidence uses the documented read-only
[workflow approval history endpoint](https://docs.github.com/en/rest/actions/workflow-runs#get-the-review-history-for-a-workflow-run).
