# Configured scheduled jobs

[Source vercel.json](../../../vercel.json) · [Machine records](crons.json)

Schedules are UTC declarations; this index does not prove a deployed invocation, successful result, or safe retry.

| Schedule (UTC) | Endpoint | Source | Declared duration |
| --- | --- | --- | --- |
| `7 11 */3 * *` | /api/cron/applicant-followup | [route](../../../app/api/cron/applicant-followup/route.ts) | 300 |
| `37 14 * * 1` | /api/cron/applicant-aging-digest | [route](../../../app/api/cron/applicant-aging-digest/route.ts) | 300 |
| `7 13 * * 1` | /api/cron/at-risk-alerts | [route](../../../app/api/cron/at-risk-alerts/route.ts) | 300 |
| `11 6 * * *` | /api/cron/at-risk-check | [route](../../../app/api/cron/at-risk-check/route.ts) | 300 |
| `15 * * * *` | /api/cron/coursera-auto-heal | [route](../../../app/api/cron/coursera-auto-heal/route.ts) | 300 |
| `30 */6 * * *` | /api/cron/coursera-b4b-sync | [route](../../../app/api/cron/coursera-b4b-sync/route.ts) | 300 |
| `0 */6 * * *` | /api/cron/coursera-sync | [route](../../../app/api/cron/coursera-sync/route.ts) | 300 |
| `5 * * * *` | /api/cron/coursera-training-sync | [route](../../../app/api/cron/coursera-training-sync/route.ts) | 300 |
| `13 15 * * *` | /api/cron/course-accountability | [route](../../../app/api/cron/course-accountability/route.ts) | 300 |
| `30 7 * * *` | /api/cron/data-cleanup | [route](../../../app/api/cron/data-cleanup/route.ts) | 300 |
| `0 * * * *` | /api/cron/deploy-health | [route](../../../app/api/cron/deploy-health/route.ts) | 60 |
| `23 10 * * 1` | /api/cron/inactive-nudge | [route](../../../app/api/cron/inactive-nudge/route.ts) | 300 |
| `29 10 * * 3` | /api/cron/inactivity-nudge | [route](../../../app/api/cron/inactivity-nudge/route.ts) | 300 |
| `30 14 * * *` | /api/cron/interview-reminders | [route](../../../app/api/cron/interview-reminders/route.ts) | 300 |
| `30 15 * * 2` | /api/cron/onboarding-stalls | [route](../../../app/api/cron/onboarding-stalls/route.ts) | 300 |
| `17 16 * * 2` | /api/cron/employer-pending-applicants | [route](../../../app/api/cron/employer-pending-applicants/route.ts) | 300 |
| `45 7 * * *` | /api/cron/job-expiry | [route](../../../app/api/cron/job-expiry/route.ts) | 300 |
| `30 13 * * 4` | /api/cron/retention-decisions | [route](../../../app/api/cron/retention-decisions/route.ts) | 300 |
| `37 9 * * 1` | /api/cron/job-alerts | [route](../../../app/api/cron/job-alerts/route.ts) | 300 |
| `0 * * * *` | /api/cron/milestone-cascade-draft | [route](../../../app/api/cron/milestone-cascade-draft/route.ts) | 300 |
| `0 9 * * *` | /api/cron/milestone-cascade-expire | [route](../../../app/api/cron/milestone-cascade-expire/route.ts) | 300 |
| `43 11 * * *` | /api/cron/milestone-celebration | [route](../../../app/api/cron/milestone-celebration/route.ts) | 300 |
| `47 13 * * 1` | /api/cron/partner-outcome-digest | [route](../../../app/api/cron/partner-outcome-digest/route.ts) | 300 |
| `41 14 * * *` | /api/cron/placement-survey | [route](../../../app/api/cron/placement-survey/route.ts) | 300 |
| `0 * * * *` | /api/cron/smoke-test | [route](../../../app/api/cron/smoke-test/route.ts) | 60 |
| `30 12 * * *` | /api/cron/stale-training-check | [route](../../../app/api/cron/stale-training-check/route.ts) | 300 |
| `0 11 * * *` | /api/cron/verification | [route](../../../app/api/cron/verification/route.ts) | 300 |
| `53 18 * * 0` | /api/cron/weekly-recap | [route](../../../app/api/cron/weekly-recap/route.ts) | 300 |
| `19 22 * * 5` | /api/cron/weekly-recap-email | [route](../../../app/api/cron/weekly-recap-email/route.ts) | 300 |
| `31 14 1 * *` | /api/cron/wioa-report | [route](../../../app/api/cron/wioa-report/route.ts) | 300 |
| `*/10 * * * *` | /api/admin/webhooks/process-retries | [route](../../../app/api/admin/webhooks/process-retries/route.ts) | 300 |
