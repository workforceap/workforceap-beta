# Partner data tiers, minors and the referral disclosure

One rule decides what a partner sees about the members it referred:
[`lib/partner/dataAccess.ts`](../lib/partner/dataAccess.ts). Every partner
loader, page, API route, CSV export and partner email reads it. The tier is
derived from `Partner.partnerType`; there is no separate column and no
migration.

## Tiers

| Tier | Partner types | Sees |
| --- | --- | --- |
| `restricted` (status only) | `referral` — the payout (affiliate) track, and any future payout-eligible type | Member name; application status and submitted date; program; progress (the portal shows progress %, the CSV exports the stage: enrolled / in progress / completed); certification names; placed yes/no and the placement date. |
| `full` | `community`, `high_school`, anything else (unknown types normalize to `community`) | Everything above, plus email (CSV), city / state / ZIP, employment status and education level (demographics CSV), and employer, job title, salary and retention for verified placements. This is the behaviour before tiers existed. |

Restricted partners never see email, phone, city/state/ZIP, employment status,
education level, employer, job title or salary. This is enforced where data is
loaded, not in the UI:

- [`loadPartnerReferralBundle`](../lib/partner/referralBundle.ts) reads the
  partner type from the stored row and narrows the Prisma select (no profile,
  placement `placedAt` + `startDateVerified` only), then projects every row
  through `partnerVisiblePlacement`. Its callers — overview, referred members,
  outcomes, `/api/partner/{members,referrals,referral-members,dashboard,milestones}`
  and the CSV export — inherit the rule.
- The member detail page and `/api/partner/earnings` narrow their own selects.
- [`/api/partner/export/referrals`](../app/api/partner/export/referrals/route.ts)
  writes status-only columns for every preset, skips the email lookup, and
  refuses `preset=demographics` (403) for restricted partners.
- Partner milestone emails drop `Employer` / `Role`; the weekly digest drops
  the job title.
- The weekly digest announces a placement only once its start date is
  verified, in the portal's wording (`partnerPlacementLabel`), and counts only
  verified placements as the Placed stage. An unverified member self-report is
  never announced.
- The signup acknowledgement to a sponsoring partner
  (`sendSchoolEnrollmentPartnerAckEmail`) is sent to any sponsoring partner
  type, so it follows the same rule: restricted partners get no applicant
  email or grade.

The partner payout flow does not depend on the removed fields: eligibility is
`placedAt` + `startDateVerified` ([`payoutEligibility.ts`](../lib/partner/payoutEligibility.ts)),
and employer / role in the payout panel are admin-only.

## Minors

A referred member is a minor when `Profile.isMinor` is true or a saved
`Profile.dob` is under 18. Minors are hidden from every non-school partner
(lists, counts, detail page — a 404 — exports, attention queue, messages
context, share counts, emails) unless `Profile.ferpaConsentGiven` is true.
`high_school` partners keep seeing their students. `parentalConsentGiven`
alone does not unhide a minor: it is consent for training activation, not for
sharing records with a third party. The Prisma filter is
`withPartnerMemberVisibility`; the attention queue's raw SQL mirrors it.

The rule also covers partner writes and partner-bound email:

- `/api/partner/outreach` lists no outreach about a hidden member, and
  outreach POST, `/api/partner/referrals` POST and
  `/api/partner/referrals/[memberId]` PATCH answer 404 for one, the same
  answer as for a member the partner never referred.
- A hidden member's own placement confirmation writes no partner timeline
  event, and the attention timeline leaves out any older event whose actor is
  a hidden member.
- The signup acknowledgement, the new-member-assigned email and milestone
  emails are not sent about a hidden member. At signup the applicant has no
  FERPA consent yet, so an under-18 applicant is never announced to a
  non-school partner.
- The "Payout due" count uses the same population as the Placed tile.

Two details the real-database suite
([`partnerVisibility.realdb.test.ts`](../lib/partner/partnerVisibility.realdb.test.ts))
pins: the hidden-member condition is NULL-safe (`dob IS NOT NULL AND dob >
cutoff`), because Prisma negates a to-one filter in SQL and a bare
`dob > cutoff` hid every adult with no saved date of birth; and on Feb 29 the
cutoff clamps to Feb 28, bound in SQL as a `YYYY-MM-DD` date so the session
time zone cannot move it.

## Disclosure at signup

When a valid partner ref is in play on `/apply`, `/apply/create-account`,
`/signup` or `/join/<code>`, the applicant sees which partner referred them
and, in plain language, what that partner will be able to see — worded per
tier (`apply.partnerDisclosureRestricted` / `apply.partnerDisclosureFull` in
`messages/*.json`).

- The partner is resolved on the server with the signup lookup
  ([`activeReferralPartnerWhere`](../lib/partner/referralPartnerLookup.ts):
  active partner, same organization). A client-supplied name is never used;
  an unknown or inactive ref shows nothing. When the ref the browser will
  submit differs from the page's, the form asks
  `GET /api/apply/partner-disclosure` (rate limited, name + tier only).
- Acknowledgement is recorded without a migration on the
  `apply_signup_completed` MemberEvent: `partner_disclosure_shown`,
  `partner_disclosure_partner_id`, `partner_disclosure_tier`,
  `partner_disclosure_version`. "Shown" is true only when the disclosed ref
  matches the ref signup attributed.

## Landing page and share tools

`/join/<referral code or slug>` ([page](../app/join/[code]/page.tsx)) is the
partner-branded public landing page (`/r/<code>` is the member referral door;
`/partners/*` belongs to the Astro site). It 404s unknown, inactive and
not-yet-approved (`status != 'active'`) partners, persists the ref with the
existing capture (`EnrollRefCookie`, `UtmCapture`) and sends every Apply CTA to
`/apply?ref=<code>`. The partner guide's share tools
([`PartnerShareToolkit`](../components/partner/PartnerShareToolkit.tsx),
[`shareLinks.ts`](../lib/partner/shareLinks.ts)) offer the landing link,
per-channel links with `utm_source` / `utm_medium` / `utm_campaign`, a
plain-`<a>` Apply button snippet, and per-channel signup counts (counts only).
There is no QR code: the repo has no QR dependency and the CSP `img-src`
blocks third-party QR images.
