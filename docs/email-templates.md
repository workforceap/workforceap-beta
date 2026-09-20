# Email Template System

## Overview

WorkforceAP uses a centralized email template management system under **Admin → Email Templates**.
Templates define reusable subject lines and HTML bodies with variable placeholders like `{firstName}`.

## Admin UI

- **Browse:** `/admin/email-templates` — list all templates with search
- **Preview:** Select any template to render it with sample data
- **Edit:** Click Edit to modify subject, body HTML, variables, and active status
- **Test Send:** Send a rendered preview to your admin email with custom variable values

## Template Schema

| Field     | Type     | Description                              |
|-----------|----------|------------------------------------------|
| `key`     | String   | Unique machine identifier                |
| `name`    | String   | Human-readable label                     |
| `subject` | String   | Email subject line (supports variables)  |
| `body`    | String   | HTML body (supports variables)           |
| `variables` | String[] | List of placeholder names without braces |
| `active`  | Boolean  | Whether the template is enabled          |

Variables use `{variableName}` syntax in both subject and body.

## API Endpoints

| Method | Endpoint                                      | Description                 |
|--------|-----------------------------------------------|-----------------------------|
| GET    | `/api/admin/email-templates`                  | List all templates          |
| GET    | `/api/admin/email-templates/[id]`             | Get single template         |
| PATCH  | `/api/admin/email-templates/[id]`             | Update template             |
| POST   | `/api/admin/email-templates/[id]/preview`     | Render preview with vars    |
| POST   | `/api/admin/email-templates/[id]/test`        | Send test email to admin    |

All endpoints require admin authentication.

## Template → Existing Email Mapping

The following templates map to existing email functions in `lib/email.ts`. The legacy functions still send emails directly; this system provides a preview/management layer ahead of future migration.

| Template Key             | Legacy Function                          | Audience    |
|--------------------------|------------------------------------------|-------------|
| `welcome-member`         | `sendEnrollmentConfirmationEmail`        | Member      |
| `application-confirmation`| `sendApplicationConfirmationEmail`      | Applicant / new member — ops welcome letter (“Thank you for becoming a member of Workforce Advancement Project!”) |
| `application-accepted`   | `sendApplicationAcceptedEmail`           | Applicant / new member — same welcome letter when an application is accepted |
| `application-rejected`   | `sendApplicationRejectedEmail`           | Applicant   |
| `enrollment-confirmed`   | `sendEnrollmentConfirmationEmail`        | Member      |
| `course-enrolled`        | `sendCourseEnrolledEmail`                | Member      |
| `course-completed`       | `sendCourseCompletedEmail`               | Member      |
| `inactive-nudge`         | `sendInactiveNudgeEmail`                 | Member      |
| `weekly-recap`           | `sendWeeklyRecapEmail`                   | Member      |
| `placement-survey`       | `sendPlacementSurveyEmail`               | Member      |
| `counselor-assigned`     | `sendCounselorAssignedEmail`             | Member      |
| `job-approved`           | `sendJobApprovedEmail`                   | Employer    |
| `job-rejected`           | `sendJobRejectedEmail`                   | Employer    |
| `new-application-alert`  | `sendNewApplicationAdminEmail`           | Admin       |
| `admin-weekly-recap`     | `sendAdminWeeklyRecapEmail`              | Admin       |
| `partner-weekly-digest`  | `sendPartnerWeeklyDigestEmail`           | Partner     |
| `invitation`             | `sendInvitationEmail`                    | Invite      |
| `employer-welcome`       | `sendEmployerWelcomeEmail`               | Employer    |
| `counselor-at-risk-alert` | `sendCounselorAtRiskAlertEmail`         | Counselor / staff fallback |

## Seeding Default Templates

Run the seed script to populate default templates:

```bash
npx tsx prisma/seed-email-templates.ts
```

New templates are inserted via `upsert` — existing rows are left untouched.

## Future Migration Plan

1. **Phase 1 (current):** Preview + management UI only. Legacy email functions unchanged.
2. **Phase 2:** Update legacy functions to read from `EmailTemplate` by key, falling back to hardcoded HTML.
3. **Phase 3:** Remove hardcoded HTML from `lib/email.ts` and drive all transactional emails from templates.
