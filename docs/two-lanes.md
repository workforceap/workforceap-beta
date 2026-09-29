# Two lanes, any agent

## Workforce AP

Application source, tests, database migrations and deployment configuration belong
in `mabrown040/workforceap-beta`. Follow that repository's AGENTS.md. Use a feature
branch/worktree and PR per task. Run `npm run prepush` before every push; it runs the
same static gates as CI's `static-gates` job (see AGENTS.md "Lint / Test / Build"), and
`git config core.hooksPath .githooks` makes `git push` run it automatically (opt-in).
Verify in development/preview before the authorized
production release. Development Supabase project: `esbdrgaonplpvzmtrdhw`;
production: `jqddnyuszufndwwezdwp`. Never substitute production for missing dev access.
Sentry observes faults; it is not permission to alter production data.

## Home Lab

Infrastructure scope belongs in `mabrown040/homelab-config`. AI-runtime scope belongs
in `mabrown040/openclaw-config`, within the Home Lab lane. GBrain owns shared operating
memory and claims. Linear owns tasks and acceptance. Hermes coordinates ownership
and handoffs; workers may use any provider/model supported by their execution client.

## Portable execution contract

Cloud and local agents use the same repository instructions, branch/PR workflow,
target identity, preimage, scoped change, rollback and validation receipt. Git access
does not grant access to the real lab. A cloud agent without a trusted lab connection
prepares a PR and hands the exact commit to a lab-connected executor. An executor
needs an authorized identity, network path (LAN/Tailscale), native tools and locally
provisioned credentials. Do not expose admin APIs publicly or copy host credentials
into repositories. This contract does not automatically install every vendor's client.

## Version individual components

Keep component changes in their owning repository; avoid a repository per guest.
Record image/package version, exact Git SHA, target identity, preimage hash, rollback
version and post-change checks in the change receipt. Use immutable image digests when
available. Tag a verified release as `component/vMAJOR.MINOR.PATCH`; never move an
existing release tag. A tag records a release; it does not trigger a deployment.
Database schema changes use ordered migrations; destructive data loss cannot be
undone merely by reverting application code. Backups remain separate from Git.

The `automation/lab-observed` branch records sanitized observed infrastructure and
runtime state. Desired application/infrastructure changes use separate feature PRs.
Do not auto-merge inventory or apply snapshots. Refresh observations after verified
lab changes with `systemctl --user start lab-git-sync.service` on the coordinator.

## Done means

The exact commit is linked to its task; the authorized target was changed; relevant
tests and user-facing checks passed; rollback and remaining gates are documented;
shared context and observed snapshots are refreshed. A successful commit or healthy
process alone is not evidence that a deployment worked end to end.
