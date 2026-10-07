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
| 2026-09-25T11:47:24Z | schedule | fail | [run](https://github.com/workforceap/workforceap-beta/actions/runs/36131228815) | ff6d60148 |
| 2026-09-26T11:20:36Z | schedule | fail | [run](https://github.com/workforceap/workforceap-beta/actions/runs/36238465679) | c9c95c346 |
| 2026-09-27T11:59:21Z | schedule | fail | [run](https://github.com/workforceap/workforceap-beta/actions/runs/36317432950) | fe7539f49 |
| 2026-09-28T13:49:00Z | schedule | fail | [run](https://github.com/workforceap/workforceap-beta/actions/runs/36431115467) | fde006636 |
| 2026-09-29T12:48:00Z | schedule | fail | [run](https://github.com/workforceap/workforceap-beta/actions/runs/36570435526) | f68be4e0c |
| 2026-09-30T12:30:12Z | schedule | fail | [run](https://github.com/workforceap/workforceap-beta/actions/runs/36715031215) | 0077a9abc |
| 2026-10-01T13:07:45Z | schedule | fail | [run](https://github.com/workforceap/workforceap-beta/actions/runs/36866335775) | 0077a9abc |
| 2026-10-02T12:28:45Z | schedule | fail | [run](https://github.com/workforceap/workforceap-beta/actions/runs/37006814631) | 0077a9abc |
| 2026-10-03T11:36:22Z | schedule | fail | [run](https://github.com/workforceap/workforceap-beta/actions/runs/37120136289) | 0077a9abc |
| 2026-10-04T12:17:39Z | schedule | fail | [run](https://github.com/workforceap/workforceap-beta/actions/runs/37201549535) | 0077a9abc |
| 2026-10-05T14:30:36Z | schedule | fail | [run](https://github.com/workforceap/workforceap-beta/actions/runs/37325135343) | 79da6320b |
| 2026-10-06T13:15:53Z | schedule | fail | [run](https://github.com/workforceap/workforceap-beta/actions/runs/37469299118) | 79da6320b |
| 2026-10-07T13:16:41Z | schedule | fail | [run](https://github.com/workforceap/workforceap-beta/actions/runs/37627103728) | 9fc64d265 |
