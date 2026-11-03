# WorkforceAP portal reliability sprint — November 3, 2026

## Outcome

Members can continue their work without losing résumé content or a failed AI
attempt. Counselors retain unresolved intervention work. Mobile navigation is
discoverable, and portal acceptance distinguishes a working screen from an
unfinished or failed data load.

This is one coordinated release candidate. It preserves the existing five-role
portal, the O*NET Skill Mapper and numeric graph alternatives, training and
assessment authorization, tenant boundaries, and the current visual system.

## Ownership and source

| Responsibility | Owner / evidence |
| --- | --- |
| Requested by | Mike Brown; next sprint delivered end to end |
| Repository | `workforceap/workforceap-beta` |
| Immutable starting point | `a6eebc575374c0bbd7ed19343a17a70cf9264d39` (`master`) |
| Integration branch | `cook/portal-sprint-continuity-20261103`; excluded from automatic Vercel preview builds while the hosted-write hold remains |
| Integrator and publication | ChatGPT root task for this sprint |
| Member implementation | ChatGPT subagent `/root/member_integration`, isolated `work/member-continuity-20261103`; source head `54f8cf41eb9b1caa8b1ac1b32590658161c2289b` |
| Schema diagnosis and preflight | ChatGPT subagent `/root/inquiry_diagnosis`, isolated `work/preview-schema-preflight-20261103` |
| Independent review | ChatGPT subagent `/root/sprint_audit`; review the final immutable candidate, not only source PRs |
| Final merge coordination | Existing Hermes WAP coordinator; this sprint does not transfer that role |
| Release approval | Mike; the existing production hold remains in effect |

These are native ChatGPT tasks. They are not Claude, Cursor, or Hermes execution
receipts. Original draft branches remain intact. GBrain claim lookup required
reauthentication during this session; current PR ownership and isolated worktrees
were used to preserve existing work without writing to another worker's branch.

The existing tracking umbrella is
[WAP-307 — Customer continuity](https://linear.app/mikebeezy/issue/WAP-307/customer-continuity-staged-hardening-and-readiness),
with [WAP-6 — Five-role action-and-persistence acceptance](https://linear.app/mikebeezy/issue/WAP-6/workforceap-require-five-role-action-and-persistence-acceptance)
owning the remaining end-to-end acceptance. Read-only reconciliation found no
current or next WorkforceAP cycle and no exact issue match for the five source
PRs; their PR numbers remain the source-story identifiers. No Linear status,
assignment, cycle or date was changed.

WAP-6's recorded beta10 execution and beta2 coordination claims remain visible
even though its assignee field is blank. These historical claims do not prove
worker liveness or authorize transferring the lane. Related contracts include
[WAP-223 — Preserve member-reported escalations](https://linear.app/mikebeezy/issue/WAP-223/vision-a1-nightly-at-risk-cron-keeps-member-reported-escalations-no)
and [WAP-283 — Résumé source preservation](https://linear.app/mikebeezy/issue/WAP-283/resume-build-must-preserve-uploaded-source-and-reject-contradictory).
They are not replacements for the new source PRs or evidence that those separate
acceptance tasks are complete. Canceled WAP-25 does not authorize blanket DEMO
migration replay.

## Sprint backlog and acceptance

| ID | Journey / change | Acceptance required |
| --- | --- | --- |
| S1 | Member opens, edits, saves and reopens a long résumé | Load the complete stored source, preserve text beyond the old 12,000-character tool excerpt, save up to the existing 120,000-character limit, reopen without session-storage recovery, and verify both the original ending and the edit. Keep original-file and edited-text provenance distinct. |
| S2 | Member retries a mission after an AI/provider failure | Release only the exact failed request's attempt reservation. A successful or usable completed evaluation stays counted; concurrent requests cannot bypass the daily cap. Failed result persistence also returns the reservation through the same scoped cleanup. |
| S3 | Counselor reviews at-risk members after nightly scoring | Unscored members retain alerts. Only successfully scored below-MEDIUM members are eligible for automatic resolution. A fresh escalation, newer score, or staff change between read and update survives. Report the actual number of updated records. |
| S4 | Member discovers the mobile menu and a student signs up | Show localized Menu text in the portal, Next public header and Astro header, preserve keyboard/focus/hydration behavior and minimum touch targets, and expose Student while preserving historical Member values. Check narrow screens and both themes. |
| S5 | Staff follows redirects and record links; member opens settings | Preserve exact record identity and required query semantics while permitting list-return context. Resolve intermediate navigation cancellation only after the correct destination commits. Settings lands on and focuses its profile section. |
| S6 | Portal audit encounters a slow or failed page | Unfinished foreground GET/HEAD requests, mutations and incomplete diagnostics fail. Only proven portal navigation prefetches may be diagnostic after independent destination checks. Visible busy tables and loading regions prevent readiness. A later prefetch cannot erase an earlier foreground timeout. |
| S7 | Admin opens public inquiries | Contain query errors with an accessible failed-load state, keep that state failing acceptance, verify the DEMO schema prerequisite, then prove an authorized empty/populated inbox after the separately held schema correction. |

### Existing work incorporated

| Source PR | Immutable source head | Incorporated scope |
| --- | --- | --- |
| [#2879](https://github.com/workforceap/workforceap-beta/pull/2879) | `5678db5bb757df0f44630b95efd295e126f3c389` | Complete résumé editor source and shared limits |
| [#2880](https://github.com/workforceap/workforceap-beta/pull/2880) | `43abdc42501def119e15d95b34d384976388e084` | Resolve only evaluated low-risk members |
| [#2875](https://github.com/workforceap/workforceap-beta/pull/2875) | `dee5a3dbfae3524c35d1ece00630b6e2ed344062` | Failed mission attempt cleanup |
| [#2877](https://github.com/workforceap/workforceap-beta/pull/2877) | `c914c0092f4338beb23ea241f2e5a8cf2d935223` | Mobile Menu labels and Student signup; contains #2872 work |
| [#2873](https://github.com/workforceap/workforceap-beta/pull/2873) | `a20a1d72b50847f03f75765a1919828d198e9f3e` | Signed-in audit/navigation repair and inquiry failure containment |

The original commits were imported with attribution into local integration
history. #2879/#2880 were reported as conflicting by GitHub, but their bounded
source commits applied cleanly to the verified starting point. This does not
authorize closing the source PRs: the merge coordinator must verify preservation
against the eventual released tree first.

New sprint work adds the alert write-time revision guard, a real component
save/reopen regression, stricter foreground-data acceptance and a separate
read-only schema preflight. The already merged welcome-letter/report work and
assessment authorization fixes are retained rather than rebuilt.

## Acceptance sequence

1. Run policy, migration-history, tenant, audit, source-text-test and icon guards;
   typecheck, changed-file lint and related tests through `npm run prepush`.
2. Validate the combined release with full Node, Vitest, build and PostgreSQL
   contract lanes. The PostgreSQL lane owns real migration/RLS proofs; component
   mocks do not establish database behavior.
3. Independently review the exact combined head. Any revision requires refreshed
   applicable evidence; retain the tested tree identity if publication changes
   only Git commit metadata.
4. Publish a draft release PR on the preview-excluded `cook/` branch. After the
   separately required DEMO bootstrap authorization, prepare one purpose-specific
   Preview deployment through the existing allowed path. Verify the Vercel
   project, commit, environment and DEMO Supabase identity. A skipped Vercel label
   is not a preview.
5. Inspect the affected mobile and desktop sample screens in light and dark.
   Sample screens establish rendering and local interaction, not authenticated
   persistence or provider behavior.
6. Complete signed-in acceptance on the exact candidate after its prerequisites
   and authorization are satisfied. Preserve the strict existing five-role
   access-denial checks. Never relabel a missing fixture as passed.
7. Mike reviews the preview and release evidence; Hermes owns the guarded merge
   queue. Production release, hosted schema changes and real delivery remain
   distinct from preparing this candidate.

## Confirmed DEMO prerequisite: public inquiries

Read-only verification identified `workforceap-demo`
(`esbdrgaonplpvzmtrdhw`, PostgreSQL 17) as active and healthy but missing
`public.public_inquiries`, its columns, and its three indexes. No matching Prisma
migration ledger entry was present, and no unresolved Prisma migration was found.
The prerequisite `public.organizations(id text)` and API roles were present.

The ready master preview at
[deployment dpl_85BLqPFBbuoNYunoyMjddnELoJsb](https://vercel.com/mabrown040-5207s-projects/workforceap-beta/85BLqPFBbuoNYunoyMjddnELoJsb)
logged Prisma `P2021` from both `publicInquiry.findMany()` and `.count()` during
the November 2 audit. This corroborates the independent schema check. Production
schema was not queried for this diagnosis.

With the existing preview/development environment supplied securely, run the
read-only prerequisite check before attempting the inbox journey:

```sh
node scripts/check-preview-public-inquiries-schema.cjs --project-ref esbdrgaonplpvzmtrdhw
```

It refuses mismatched targets before opening a database connection and checks
the relation, required columns, keys, indexes, RLS and API-role access, including
privileges available on the target PostgreSQL version. Exit 0 verifies those
selected prerequisites; exit 1 means missing/unsafe/unverifiable schema; exit 2
refuses the target. It never migrates or reads inquiry content. Check constraints,
migration history and authenticated behavior still require separate acceptance.

The exact existing correction is
[`20261015225832_public_inquiries`](../../prisma/migrations/20261015225832_public_inquiries/migration.sql),
SHA-256 `f11627b294494121e173e95a9860b46dc3711d306dc9d3ec1d93f51dceca41fc`.
It creates the table, organization FK, tenant submission-key uniqueness,
retention indexes and validation constraints in one transaction. It enables RLS,
revokes PUBLIC/anon/authenticated/service_role access and adds no browser policy.

The required operator action is to validate and apply that existing additive
migration to DEMO through the established recovery process once authorized, then
verify every postcondition. Do not replay historical migrations, use hosted
`db push`, change the checksum, or mark a migration applied before checking it.
The existing code already expects the relation. A failed SQL transaction rolls
back its changes; any later rollback must preserve real inquiry receipts.

The existing isolated proof is
[`tests/migrations/public-inquiries.mjs`](../../tests/migrations/public-inquiries.mjs).
It verifies durability, tenant uniqueness, FK/constraint rejection, RLS and
denied reader/browser access, plus whole-row retention deletion. It is collected
by the full database-contract lane. Local execution requires a disposable
loopback PostgreSQL and `wap_shadow`, and must never use hosted data.

## Limits and follow-through

- The normal preview build runs three existing DEMO bootstraps. The curriculum
  bootstrap always executes its migration, including function replacement and
  trigger recreation, even when its table and seed rows exist. Training and lab
  bootstraps verify existing schemas and apply only when absent. None of those
  scripts changed in this sprint, but a new preview still causes hosted SQL
  execution. The retained user hold requires explicit approval before creating
  this candidate's preview; the `cook/` branch keeps draft-PR CI separate from
  that action. Do not weaken the target guards or infer permission from an older
  #2873-specific approval.
- AI cleanup is request-level recovery. Process termination before `finally` or
  a cleanup database outage can leave the reservation counted until its 24-hour
  window expires. Durable submission/verdict identity and ambiguous-commit
  reconciliation are a later bounded story; a blind age-based deletion is unsafe.
- `/api/health` proves process/target identity and `/api/health/ready` proves the
  default organization is reachable. Neither certifies every feature's schema.
  The new schema preflight remains separate from liveness and does not migrate.
- The restricted #2873 credentialed workflow is pinned to its reviewed source.
  It must not be repurposed to execute this larger candidate by weakening its
  guards or relabeling its tree. Obtain a reviewed exact-candidate acceptance
  path through the existing owner before credentialed dispatch.
- Assessment final-attempt policy, live O*NET/AI/provider results, real inbox
  receipt, actual member program assignments, historical Coursera event repair
  and placement-survey catch-up are not established by synthetic tests. They
  retain their own acceptance or data decisions.
- No production merge, hosted migration, real email, participant provisioning,
  credential/settings change or original-PR closure is part of this preparation.

## Validation receipt

The release PR carries the final immutable head, current CI and preview URLs,
independent review disposition, browser evidence, and the remaining owner/action.
Do not infer completion of a later stage from an earlier stage's success.
