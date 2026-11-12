# WAPAT vs the legacy points score: who uses which

Two different numbers come from the same 35 answers. Never compare them or apply one's threshold to the other.

| Metric | How it is computed | Example (Q1-26 right, Q27-35 wrong) |
| --- | --- | --- |
| WAPAT (Total and 3 sections) | correct / question count | 26/35 = 74.3% |
| Points score (legacy, weighted) | earned points / 98 points, stored as `assessmentScorePct` | 69% |

Math section is Q25-35. This range is provisional and not confirmed by Mike or Dad.

## Shows WAPAT
Member completion screen and dashboard card, staff email, member email, admin answer sheet (per attempt, when answers are retained), admin attempt history.

## Intentionally unchanged: still the legacy points score (label now says so)
Thresholds, sorting, matching and eligibility are not changed; only visible labels are.

| Consumer | Uses legacy for | Label |
| --- | --- | --- |
| Completion readiness copy (`assessmentConfirmMessage`) | 75 / 50 readiness lines | "Based on your points score of N% (legacy, weighted; not the WAPAT total)" |
| `lib/admin/fitScore.ts`, `lib/ai/matchWeights.ts` | fit score, student/job matching (>=70, >=50) | not displayed as a percent |
| Admin members list, recent signups, assessments table (header, filter, sort, CSV), interview-ready table | score column and 70/50 colour bands | "Points score % (legacy)" |
| Admin member page stat | stored score | "Points score (legacy)" |
| Admin exports: cohort, members, bulk members | stored score | "Assessment Points Score % (legacy, not WAPAT)" |
| Admin member summary facts | stored score | "Assessment points score (legacy, not WAPAT)" |
| Staff job-match reason (`staffAssessmentReason`) | stored score | "Assessment points score N% (legacy, not WAPAT)" |
| Career brief tile (`skillsScore` message, 4 locales) | stored score | "Points score (legacy)" |
| Counselor roster, status, retake, member merge, data export | stored score and attempts | not displayed as a labelled percent / data field unchanged |

Per-member WAPAT columns in lists and exports are a follow-up: older attempts did not keep answers, so they would show Unavailable for most history.
