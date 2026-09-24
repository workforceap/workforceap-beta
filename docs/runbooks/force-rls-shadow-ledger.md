# FORCE RLS shadow rehearsal — run ledger

> **Why this file exists (WAP-24).** `docs/runbooks/force-rls-staging-rehearsal.md`
> promotes the shadow rehearsal to a required PR check only after **30 consecutive
> clean runs**. Until 2026-09-21 the workflow was `workflow_dispatch`-only with no
> persisted result, so the streak could never accumulate. The nightly
> `schedule:` in `.github/workflows/force-rls-shadow.yml` now appends one row per
> run here.

## Where the rows live

- **This file on `master`** is the seed: the schema and the reading rules.
- **The live ledger is the `force-rls-shadow-ledger` branch.** Branch protection
  on `master` requires a pull request, so the workflow cannot commit here; it
  checks out `force-rls-shadow-ledger` (creating it from `master` on the first
  run), appends the row to this same path, and pushes with the workflow's
  `GITHUB_TOKEN`. Read it at
  `https://github.com/workforceap/workforceap-beta/blob/force-rls-shadow-ledger/docs/runbooks/force-rls-shadow-ledger.md`.
- Rows are append-only. Never edit or delete a row; a bad run stays on the
  record and the streak restarts after it.

## Counting the streak

The streak is the number of trailing `pass` rows since the most recent `fail`
(or since the first row). From a checkout of the ledger branch:

```bash
git fetch origin force-rls-shadow-ledger
git show origin/force-rls-shadow-ledger:docs/runbooks/force-rls-shadow-ledger.md \
  | grep -E '^\| [0-9]{4}-' | awk -F'|' '{ s = ($4 ~ /pass/) ? s + 1 : 0 } END { print s }'
```

When the number reaches **30**, follow "Promotion to required" in the runbook:
drop `continue-on-error: true` from the job, add it to the branch-protection
required checks, and record the flip below the table.

## Columns

| Column | Meaning |
| -- | -- |
| Run (UTC) | `date -u +%FT%TZ` at ledger-append time |
| Trigger | `schedule` (nightly) or `workflow_dispatch` |
| Result | `pass` — harness exit 0; `fail` — any non-zero exit, including infrastructure failures (a run that cannot prove the policies counts against the streak) |
| Run | link to the Actions run, which carries the `force-rls-summary` artifact |
| Commit | short SHA of the checked-out `master` |

## Ledger

| Run (UTC) | Trigger | Result | Run | Commit |
| -- | -- | -- | -- | -- |
| 2026-09-21T12:43:29Z | schedule | fail | [run](https://github.com/workforceap/workforceap-beta/actions/runs/35601104271) | ac6e17b09 |
| 2026-09-22T11:34:24Z | schedule | fail | [run](https://github.com/workforceap/workforceap-beta/actions/runs/35722089394) | 842a3cf43 |
| 2026-09-23T11:30:50Z | schedule | fail | [run](https://github.com/workforceap/workforceap-beta/actions/runs/35854851302) | e97a497f8 |
| 2026-09-24T11:41:18Z | schedule | fail | [run](https://github.com/workforceap/workforceap-beta/actions/runs/35994371811) | c19831706 |
