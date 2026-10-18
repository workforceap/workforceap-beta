# Portal C Phase 0 protection

This draft stacks on #2829 at `0e3c7f96cef65a15243ec0fa726ada1e1da383dd`.
It establishes the protection and acceptance gates required before B1. It does
not authorize merging, marking a PR ready, or enabling a production rollout.

## Review findings addressed

| Finding | Change | Evidence |
| --- | --- | --- |
| Shared kit changes could alter staff pages | Restore master kit CSS; apply C overrides only inside the member compact shell. KpiStrip member responsiveness is explicit opt-in. | KPI rendering tests; strict staff screenshot comparison. |
| Member compact chrome must not affect staff roles | Add role tests for admin, counselor, employer, partner and group. Mentor keeps the ordinary shell. | WorkspaceShell behavior tests and mentor visual gate. |
| Incomplete route coverage could miss failures | Enumerate the full member registry and aliases; resolve real authorized detail links and fail when a fixture is missing. Verify final destinations. | Authenticated inventory suite at 1440 and 390. |
| Missing route states and behavior coverage | Add 16 loading boundaries plus behavioral tests for benefits, training bridge, counselor detail and lab access/load states. | Component and server-page tests; existing lab save/submit tests retained. |
| Session advisory locks did not protect pooled writes | Use a dedicated DEMO direct/session Prisma client and transaction advisory locks. Bind OIDC to the deployed commit. | Fixture endpoint tests. |
| Recovery could lose the original completed state | Persist the recovery snapshot before the first write, preserve it across reset/prepare, reject foreign targets, restore profile/notification/thread fields and verify readback. | Endpoint and recovery-client tests. |
| Deployment API 403 fell back to weaker evidence | Require HTTPS and Vercel API project/commit/branch/host proof plus DEMO health. Remove GitHub fallback and unscoped queries. | Guard denial tests, including API 403. |
| Schema presence checks could accept partial protections | Apply DDL under a transaction lock, check column definitions and table/function/trigger binding before commit, and repeat the check afterwards. | Schema bootstrap tests. |
| Local Windows checks differed from CI | Normalize audit and header-inventory paths without widening allowlists; preserve hashed historical SQL bytes. | Cross-platform audit test and unchanged migration-history guards. |
| Jobs lede claimed unsupported matching | Replace it with factual browsing/application copy in all four catalogs. | Review member screenshot changes before accepting baselines. |

## Staff reference

The baseline is draft #2832, commit
`fc68f346f4e50b364cadb44fe06417dc0da6f53c`, whose parent is master
`efc27e4a4ebeba09b5261e7b1c36463d01925017`. Only documentation and the audit
path-normalization tooling differ from that master. Application source and
styles are identical. Vercel ignores master-branch Preview builds, so this
allowed `feature/portal-*` branch supplies the master application baseline.

Preview: <https://workforceap-beta-64x99g521-mabrown040-5207s-projects.vercel.app>

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

`VERCEL_TOKEN` must read the known project/deployments within the existing
Vercel team. The inherited Actions token returned HTTP 403. The strict guard
deliberately blocks signed-in acceptance until that secret works.

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
