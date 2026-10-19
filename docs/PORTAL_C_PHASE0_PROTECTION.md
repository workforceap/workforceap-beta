# Portal C Phase 0 protection

This draft stacks on #2829 at `0e3c7f96cef65a15243ec0fa726ada1e1da383dd`.
It establishes the protection and acceptance gates required before B1. It does
not authorize merging, marking a PR ready, or enabling a production rollout.

## Review findings addressed

| Finding | Change | Evidence |
| --- | --- | --- |
| Shared kit changes could alter staff pages | Restore master kit CSS; apply C overrides only inside the ordinary member shell, excluding its marked mentor staff view. KpiStrip member responsiveness is explicit opt-in. | KPI rendering tests; strict staff screenshot comparison. |
| Member compact chrome must not affect staff roles | Add role tests for admin, counselor, employer, partner and group. Mentor keeps the ordinary shell. | WorkspaceShell behavior tests and mentor visual gate. |
| Incomplete route coverage could miss failures | Enumerate the full member registry and aliases; resolve real authorized detail links and fail when a fixture is missing. Verify final destinations. | Authenticated inventory suite at 1440 and 390. |
| Missing route states and behavior coverage | Add 16 loading boundaries plus behavioral tests for benefits, training bridge, counselor detail and lab access/load states. | Component and server-page tests; existing lab save/submit tests retained. |
| Session advisory locks did not protect pooled writes | Use a dedicated DEMO direct/session Prisma client and transaction advisory locks. Bind OIDC to the deployed commit. | Fixture endpoint tests. |
| Recovery could lose the original completed state | Persist the recovery snapshot before the first write, preserve it across reset/prepare, reject foreign targets, restore profile/notification/thread fields and verify readback. | Endpoint and recovery-client tests. |
| Deployment API 403 fell back to weaker evidence | Prefer Vercel API project/commit/branch/host proof. If that token is forbidden, require independent vercel[bot] Preview + Vercel GitHub App status for this SHA, branch tip, team/project, and host, then DEMO health. Missing any piece still denies login. | Guard denial tests, including API 403 without GitHub proof. |
| Schema presence checks could accept partial protections | Apply DDL under a transaction lock, check column definitions and table/function/trigger binding before commit, and repeat the check afterwards. | Schema bootstrap tests. |
| Local Windows checks differed from CI | Normalize audit and header-inventory paths without widening allowlists; preserve hashed historical SQL bytes. | Cross-platform audit test and unchanged migration-history guards. |
| Phone helper and job metadata were clipped | Keep member tool descriptions and company/location text readable; extend browser clipping assertions. | Live 390px inspection and member component tests. |
| Jobs lede claimed unsupported matching | Replace it with factual browsing/application copy in all four catalogs. | Review member screenshot changes before accepting baselines. |

## Staff reference

The baseline is draft #2832, commit
`406ec351b3ca719fa469cedefb57c6d18b4109eb`, whose first parent chain reaches
master `efc27e4a4ebeba09b5261e7b1c36463d01925017`. Only documentation and the
audit path-normalization tooling differ from that master. Application source
and styles are identical. Vercel ignores master-branch Preview builds, so this
allowed `feature/portal-*` branch supplies the master application baseline.
The staff workflow waits for a vercel[bot] Preview of that SHA instead of
pinning a unique URL that can go stale when Preview env vars change.

The staff workflow refuses to continue when master moves or the baseline has
other changes. Both baseline and candidate pass the Vercel API and DEMO guard
before login credentials are exposed. Twenty staff pages are compared at
1440x900, 1024x768 and 390x844; landings add dark, collapsed-rail and mobile-drawer
states. A separate mentor comparison protects `/dashboard/mentor`.
Comparisons use zero allowed differing pixels and mask clocks only. Review
actual screenshot differences; do not weaken the threshold to make CI pass.

## Required fixture access

Use Actions secrets only. The existing five role pairs are already mapped.
For the mentor comparison, the serialized member job temporarily creates an
inactive, unapproved mentor record on the synthetic member. Its original
absence is captured before any write. Restore removes only that marked record,
refuses unexpected sessions or specialties, and verifies the original state.
No extra login is needed. Staff navigation and the mentor comparison run with
the read-only audit capability and block non-read browser requests after login.
An ordinary member's `/mentor/apply` redirect is checked separately as an access
gate and never counts as a mentor content pass.

`VERCEL_TOKEN` should read the known project/deployments within the existing
Vercel team. The inherited Actions token still returns HTTP 403. Until Mike
replaces that secret, the guard uses the Vercel GitHub App status plus a
`vercel[bot]` Preview for the trusted SHA, branch tip, team/project, and host.
That path still fails closed: a 403 without those proofs never exposes login
credentials.

Authenticated staff and member inventory jobs need the Preview deployment to
hold `PORTAL_AUDIT_READ_ONLY_TOKEN`. Mike attached that token to every Preview
deployment. Rebuild both the candidate and the staff-baseline Preview after
that change; an older unique URL still rejects the cookie and fails closed.

The direct database URL used by the fixture endpoint must identify DEMO and
use a direct/session connection. Existing production-classified Actions
database URLs must not be substituted. No fixture writes occur during builds.
Member and staff jobs share a standing concurrency group with cancellation off.
Fixture cleanup runs in `always()` and corrupt snapshots fail loudly.

## Remaining acceptance

- Complete static, Node, Vitest and build checks on the final commit.
- Run the full preview harness and inspect legitimate member screenshot changes.
- Run authenticated route/action/save/reload checks and verify fixture restoration.
- Run all staff/mentor comparisons against the pinned master application baseline.
- Supply screenshots and a click-path recording after authenticated access works.
- Review the historical assessment backfill separately before assessment acceptance:
  a DEMO read found eight completed users with zero recorded attempts. This DDL
  bootstrap does not replay the canonical data backfill or alter those users.

The rollout is not passed while any required item is missing. B1 remains gated.
