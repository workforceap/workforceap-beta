# Outcomes Methodology

**Audience:** WIOA reviewers, board funders, partner directors, employer co-funders, anyone asking "where did these numbers come from?"

**Single source of truth:** [`/admin/outcomes`](/admin/outcomes) (admin-only). Public mirror at [`/outcomes`](/outcomes).

**Generator:** `getBoardSnapshot()` in `lib/admin/boardOutcomes.ts`, exported via `GET /api/admin/outcomes/snapshot` as a timestamped Markdown artifact.

This document defines every metric, the underlying Prisma query, and the rules around small samples and missing data. If a metric is presented externally, it must be present in this file.

---

## Discipline rules

1. **Small-sample suppression.** When the denominator is below `SMALL_SAMPLE_THRESHOLD` (currently **10**), rates and percentages are suppressed and replaced with a count and a "sample too small for a reliable rate" note. Counts are always shown — small numbers are not the problem; *misleading rates from small numbers* are the problem.
2. **Generation timestamp.** Every snapshot carries `generatedAt` in its header. A printed PDF without a recent timestamp is presumed stale.
3. **No aspirational numbers.** Any metric described as "target," "goal," or "projected" lives in roadmap docs (e.g. `docs/workforceap-product-vision.md`), not in `/admin/outcomes` or its exports.
4. **Data-quality flags.** Section 6 of every snapshot lists rows that exist in production but are missing fields a reviewer is likely to ask about. These are visible internally before any external review so we can fix them, not hide them.
5. **Flagged public social proof.** Placement story cards, partner outcome snapshots, and partner referral badges are gated by `WORKFORCEAP_PUBLIC_OUTCOMES_SOCIAL_PROOF`. The flag is off by default. The surfaces render only live placement/referral records, never seeded or illustrative outcomes; if there are no real placements, the bundle is suppressed entirely.

---

## Section-by-section sources

### 1. Application funnel

| Metric | Source |
|---|---|
| Total applications received | `applications` row count |
| Pending review | `applications WHERE status = 'PENDING'` |
| Approved | `applications WHERE status = 'APPROVED'` |
| Needs info | `applications WHERE status = 'NEEDS_INFO'` |
| Denied | `applications WHERE status = 'DENIED'` |

Implemented as `prisma.application.groupBy({ by: ['status'] })`. One row per `Application` record — a member who applied twice counts twice (rare; the pre-screening flow tries to deduplicate).

### 2. Member outcomes funnel

| Metric | Source |
|---|---|
| Members served / enrolled | `users WHERE deleted_at IS NULL AND enrolled_program IS NOT NULL` (period-bounded by `enrolled_at` when `period != 'all-time'`) |
| In active training | Members where `memberProgramProgressPct(...)` is in the open interval `(0, 100)` |
| Training completed | Members whose completed-course rollup equals the required course count for their assigned curriculum version; this does not establish credential verification |
| Placed | `placement_records` row count (period-bounded by `placed_at` when `period != 'all-time'`). Internal board figure: it includes rows a counselor has not yet verified. Public surfaces count verified placements only (see *Public placement counts* below) |
| Placement rate | `placed / enrolled`, suppressed when `enrolled < SMALL_SAMPLE_THRESHOLD` |
| Median annual salary | Median of `placement_records.salary_offered` where non-null and > 0 |
| Total annual salary value | Sum of the same set |
| Average weeks to placement | Mean of `(placed_at − user.enrolled_at)` in weeks, where both are present and non-negative |

Joins: `placement_records.user_id → users.id`. A `User` has at most one `PlacementRecord` (`@unique`).

### 3. Member activity

| Metric | Source |
|---|---|
| Total members | `users WHERE deleted_at IS NULL` |
| Active 7d / 14d / 30d | Distinct `user_id` from `member_events WHERE created_at >= now − N days` |
| Inactive 14+ days | `totalMembers − active14d` (set difference) |

Activity ≡ any `MemberEvent`. Includes login, AI tool runs, course progress, profile edits, etc. — every meaningful surface writes to `member_events`.

The legacy serialized fields `membersCertified` and per-program/cohort `certified` are retained for compatibility. Their visible label is **Training completed**.

### 4. Credential records

| Metric | Source |
|---|---|
| Total credential records | `user_certifications` row count |
| Reported earned dates in last 30 days | `user_certifications WHERE earned_at >= now − 30 days` |
| Unique members with credential records | `SELECT DISTINCT user_id FROM user_certifications` |

A single member can have multiple credential records. These queries do not filter by review status and include member-reported credentials; they must not be presented as verified-credential totals. Historical records and serialized aggregate keys are unchanged.

### 5. Programs

| Metric | Source |
|---|---|
| Per-program enrolled count | Group `users` by `enrolled_program` |
| Per-program training completed count | Members whose completed-course rollup equals the required count for the assigned curriculum version |
| Per-program placed count | Group `placement_records` by joined `user.enrolled_program` |
| Per-program placement rate | `placed / enrolled` per row, suppressed below threshold |

Sorted by enrolled count, descending.

### 6. Data quality flags

| Flag | Source |
|---|---|
| Placements missing program slug | `placement_records WHERE program_slug IS NULL` |
| Placements missing funding source | `placement_records WHERE funding_source IS NULL` |
| Placements missing retention status / decision | `placement_records WHERE retention_status IS NULL AND retention_decision IS NULL` |
| Placements missing salary at placement | `placement_records WHERE salary_offered IS NULL` |
| Enrolled members missing `enrolled_at` | `users WHERE enrolled_program IS NOT NULL AND enrolled_at IS NULL` |

These are the rows that, if a WIOA auditor asked about them, we couldn't answer. The expectation is that this section trends to zero over time.


### 7. Public social-proof surfaces (flagged)

When `WORKFORCEAP_PUBLIC_OUTCOMES_SOCIAL_PROOF` is true, `/outcomes` may render anonymized placement story cards and `/partners` may render an aggregate partner referral snapshot. Authenticated partner portal users may also see referral badge embed code for their real referral code.

| Metric / card | Source | Public rule |
|---|---|---|
| Placement story cards | Verified `placement_records` rows (`start_date_verified = true`) from the last two years with a non-empty `job_title` | PII stripped; no member names, employer names, or salary values; suppressed when there are zero real placements or enrolled N `< SMALL_SAMPLE_THRESHOLD` |
| Partner referrals | Distinct non-deleted users from `partner_referrals` | Count only; no rate claim by itself |
| Partner placements | Distinct verified `placement_records.user_id` (`start_date_verified = true`) for non-deleted users with partner referrals | Count only; no fake/seeded rows |
| Partner placement rate | `partner placements / distinct referred members` | Suppressed when referrals `< SMALL_SAMPLE_THRESHOLD` and shown as `X of N` instead |
| Partner quarterly outcomes page (`/org/[slug]/outcomes`, `GET /api/org/[slug]/outcomes`; not flag-gated) | `generatePartnerQuarterlyOutcomes()` in `lib/analytics/partnerQuarterlyOutcomes.ts`, projected by `toPublicPartnerOutcomes()` in `lib/outcomes/publicPartnerOutcomes.ts` | Allowlist of counts only: referred, enrolled, completions, placements, active, drop-offs, program breakdown and 90/180-day retention counts. Drop-off rate (`drop-offs / referred`) is suppressed when referrals `< SMALL_SAMPLE_THRESHOLD` and shown as `N=<referred> · sample too small for a reliable rate`. No member rows, no salary values and no days-to-placement |
| Referral badge link/embed | Generated from the authenticated partner's real referral code as `/apply?ref=<code>` | Tracking utility only; hidden unless the feature flag is enabled; does not make an outcome claim |

These public surfaces are designed to stay dark in production until enough verified placements exist to support real social proof.

### 8. Public placement counts

A placement counts on a public surface only when it is **verified**: `placement_records.start_date_verified = true`, which a counselor or admin sets after confirming the start date and wage (`app/api/admin/members/[id]/placed-outcome/route.ts`). An employer marking an application "hired" or a member self-reporting a job creates a row with `start_date_verified = false` (`lib/placement/recordPlacementFromApplication.ts`); that row is not a public outcome until it is verified. This is the same rule the funder report (`lib/admin/funderProgramMetrics.ts`) and the partner outcomes CSV (`app/api/partner/export/referrals/route.ts`) already use. The shared filter is `VERIFIED_PLACEMENT_WHERE` in `lib/placement/verifiedPlacement.ts`.

| Surface | Verified-only figures | Hide rule (unchanged) |
|---|---|---|
| TrustStrip on `/apply` (`lib/marketing/trustStripMetrics.ts`) | "members placed" count and the average starting wage beside it | Each segment hidden at 0; the placeholder line (no numbers) shows when both are empty |
| `/impact` (`lib/marketing/publicImpactStats.ts`) | Hires, placement rate numerator and the average salary increase | Zero-value rates and empty metrics are not published |
| `/outcomes` and `/partners` social proof (`lib/outcomes/socialProof.ts`) | Placed total, partner placements and story cards | Section 7 rules; the bundle is suppressed when there are zero verified placements |
| Google IT Support landing (`lib/marketing/googleItSupportLanding.ts`) | Placement count behind the placement-rate card | Rate shown only at `GOOGLE_IT_PLACEMENT_RATE_MIN_ENROLLMENTS` (40) enrollments or more |

There is no fallback number. If no verified placement exists, the placement figure is hidden, never estimated.

Not yet covered: the partner quarterly outcomes page (`/org/[slug]/outcomes`, `generatePartnerQuarterlyOutcomes()`) still counts every placement row, verified or not. That is a follow-up.

### 9. Partner outcome packet

An authenticated partner can download one packet that reconciles its referrals to outcomes: the **Outcome packet** section on `/partner/exports` and `GET /api/partner/export/referrals?preset=packet` (CSV). Both render one `buildPartnerOutcomePacket()` output (`lib/partner/outcomePacket.ts`, definitions version `partner-packet-v1`), so the page and the download show the same numbers.

**Scope.** Only the signed-in partner's own `partner_referrals` rows, in the partner's organization, for non-deleted member accounts (staff and test accounts excluded by `MEMBER_ONLY_WHERE`). The partner comes from the session, never from the request. The shared filter is `partnerReferralScopeWhere()` in `lib/partner/referralBundle.ts`; the capped load and the uncapped count both use it. Period: all referrals to date, ordered by referral date.

The packet adds **no new metric definition and no rate**. Each line maps to a definition above:

| Packet line | Definition it reuses | Denominator |
|---|---|---|
| Referred members | §7 *Partner referrals*: distinct non-deleted members with a referral from this partner (uncapped count) | itself |
| Enrolled | §2 *Members served / enrolled*: `enrolled_program` is set | referrals in the packet |
| Training completed | §2 *Training completed*: completed-course rollup equals the required count for the assigned curriculum; not a credential verification | referrals in the packet |
| Credential records (member-reported) | §4 *Unique members with credential records*: at least one `user_certifications` row. Member-reported; never presented as verified | referrals in the packet |
| Placement records | §2 *Placed*: every `placement_records` row, verified or not | referrals in the packet |
| Placement start date verified | §7 *Partner placements* / §8: `start_date_verified = true`. A **subset** of placement records | referrals in the packet |
| Placement start date not yet verified | Placement records minus the verified subset | referrals in the packet |

Rules:

- **X of N only.** Every line is printed as `X of N`. No percentage or rate is shown, whatever N is, so the packet does not choose between the all-records (§2) and verified-only (§7/§8) placement definitions; it shows both, with the verified line as a subset. `smallSample` is set when fewer than `SMALL_SAMPLE_THRESHOLD` referrals are in the packet.
- **Cap and truncation.** The member rows come from `loadPartnerReferralBundle()`, which loads at most 500 referrals (newest first). *Referred members* is the uncapped `countPartnerReferrals()`. When it is larger than the rows loaded, the packet is marked `truncated`, the CSV prints a `# WARNING` line and the page shows a banner; every other line then covers only the loaded rows.
- **Provenance.** The CSV header carries `generated_at=<ISO 8601>`, the period, `definitions_version`, the source (this file, §2/§4/§7), one definition line per packet line, the unknowns and the exclusions. Then a `metric,count,denominator,display` block, a blank line, and one row per referral.
- **Unknowns.** Enrolled members with no `enrolled_at` (§6), and placement records without a verified start date.
- **Rows.** Member name, referral date, stage, program, yes/no for enrolled, training completed and credential record, placement status (`start_date_verified`, `recorded_start_not_verified` or `none`), and the employer and job title **only** when the start date is verified. No email, story text, salary or demographic fields. Every line except *Referred members* equals an aggregate over these rows.
- **Not counted.** Member-submitted placement confirmations awaiting staff review are not placement records.
- **No certification.** The packet is an operational report generated from live records. It is not a regulatory, WIOA or audited certification of outcomes.

The existing `default`, `outcomes` and `demographics` presets of the same route are unchanged.


## Demographic breakdowns

Sourced from `Profile` rows joined to enrolled `User`s. Buckets are aligned to WIOA ETA reporting categories:

- **Veteran status:** `Not a Veteran`, `Veteran`, `Disabled Veteran`, `Not reported`
- **Employment at entry:** `Unemployed`, `Underemployed`, `Employed`, `Self-Employed`, `Not reported`
- **Household income:** `Under $20K`, `$20K–$40K`, `$40K–$60K`, `Over $60K`, `Not reported`
- **Education:** `Less than HS`, `HS Diploma or GED`, `Some College`, `Associate's`, `Bachelor's`, `Graduate`, `Not reported`
- **Ethnicity:** standard WIOA categories (Hispanic/Latino, White, Black, Asian, AIAN, NHPI, Two or More)

Bucket counts are zero-suppressed (a bucket with 0 rows does not appear). "Not reported" is shown when present so missing data is visible rather than hidden.

Demographics live inside `BoardOutcomes`, not the snapshot top level — they are exported in the full board view but not the headline Markdown summary.

---

## Period semantics

`BoardOutcomesPeriod` is one of `'all-time' | 'ytd' | 'q-current' | 'q-prev'`.

- `all-time` — no date filter. Recommended default for cumulative funder narratives.
- `ytd` — `enrolled_at` (or `placed_at` for placements) ≥ Jan 1 of current year.
- `q-current` — current calendar quarter to date.
- `q-prev` — full previous calendar quarter.

The snapshot endpoint accepts `?period=` to switch. The `/admin/outcomes` page currently renders `all-time`; per-period rendering is a follow-up.

---

## What this methodology deliberately does NOT cover (yet)

- **Income gain.** "Avg income increase from pre-program to placement" requires a verified pre-program wage on every member. We don't yet collect this consistently. Until we do, this metric should not appear in any external pitch.
- **NPS / satisfaction.** No survey instrument is wired into the platform. Any NPS or satisfaction number quoted externally is illustrative.
- **Long-term retention.** 90-day retention is captured by `retentionStatus` on `PlacementRecord`. 12-month / 24-month retention requires longer dwell time and re-survey workflow that doesn't exist.
- **Employer satisfaction.** Same — no survey instrument yet.

If a funder asks for one of the above, the answer is: *"We have the schema field for it; the survey/collection workflow is on the roadmap. We won't quote a number we can't source from the database."*

---

## Document history

| Date | Change |
|---|---|
| 2026-05-07 | Initial methodology doc; `getBoardSnapshot()` shipped on branch `claude/workforce-app-stakeholder-alignment-S52it`. |
| 2026-06-15 | Added flagged public social-proof methodology for placement story cards, partner snapshots, and referral badges. |
| 2026-09-23 | Documented the public partner quarterly outcomes page: counts only, small-N drop-off rate suppressed, no salary or days-to-placement. |
| 2026-09-23 | public placed counts are verified-only (Mike, Slack 05:08 UTC) |
| 2026-09-23 | Added §9 *Partner outcome packet*: maps each packet line to its existing §2/§4/§7 definition, scoped to the partner's own referrals; X of N only; cap and truncation rule (Vision C4, pending Mike's review). |

---

*If you change a metric definition or add a new one, update this file in the same PR.*
