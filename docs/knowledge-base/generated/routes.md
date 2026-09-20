# Route and layout index

[Human guide](../README.md) · [Machine route records](routes.json)

Next groups are removed from URL patterns; bracketed parameters remain. Intercepting routes are flagged for source review. Astro page patterns are active static-build inputs, with no proof of getStaticPaths/locale expansion or current middleware/static/Next serving precedence. Imported boundary helpers do not prove authorization coverage.

| Pattern | Kind | Methods | Source | Boundary import references |
| --- | --- | --- | --- | --- |
| / | error |  | [app/(auth)/error.tsx](../../../app/%28auth%29/error.tsx) |  |
| /forgot-password | layout |  | [app/(auth)/forgot-password/layout.tsx](../../../app/%28auth%29/forgot-password/layout.tsx) |  |
| /forgot-password | page |  | [app/(auth)/forgot-password/page.tsx](../../../app/%28auth%29/forgot-password/page.tsx) | @/lib/auth/postLoginRedirect:8 |
| / | layout |  | [app/(auth)/layout.tsx](../../../app/%28auth%29/layout.tsx) | @/css/auth-depth.css:5 |
| / | loading |  | [app/(auth)/loading.tsx](../../../app/%28auth%29/loading.tsx) |  |
| /login | loading |  | [app/(auth)/login/loading.tsx](../../../app/%28auth%29/login/loading.tsx) |  |
| /login | page |  | [app/(auth)/login/page.tsx](../../../app/%28auth%29/login/page.tsx) | @/lib/auth/postLoginRedirect:4, @/lib/auth/server:5, @/lib/auth/roles:6 |
| / | not-found |  | [app/(auth)/not-found.tsx](../../../app/%28auth%29/not-found.tsx) |  |
| /reset-password | layout |  | [app/(auth)/reset-password/layout.tsx](../../../app/%28auth%29/reset-password/layout.tsx) |  |
| /reset-password | page |  | [app/(auth)/reset-password/page.tsx](../../../app/%28auth%29/reset-password/page.tsx) | @/lib/auth/client:9, @/lib/auth/postLoginRedirect:10 |
| /setup-mfa | layout |  | [app/(auth)/setup-mfa/layout.tsx](../../../app/%28auth%29/setup-mfa/layout.tsx) |  |
| /setup-mfa | loading |  | [app/(auth)/setup-mfa/loading.tsx](../../../app/%28auth%29/setup-mfa/loading.tsx) |  |
| /setup-mfa | page |  | [app/(auth)/setup-mfa/page.tsx](../../../app/%28auth%29/setup-mfa/page.tsx) | @/lib/auth/safeRedirectPath:10 |
| /signup | loading |  | [app/(auth)/signup/loading.tsx](../../../app/%28auth%29/signup/loading.tsx) |  |
| /signup | page |  | [app/(auth)/signup/page.tsx](../../../app/%28auth%29/signup/page.tsx) | @/lib/auth/safeRedirectPath:4 |
| /verify-mfa | layout |  | [app/(auth)/verify-mfa/layout.tsx](../../../app/%28auth%29/verify-mfa/layout.tsx) |  |
| /verify-mfa | loading |  | [app/(auth)/verify-mfa/loading.tsx](../../../app/%28auth%29/verify-mfa/loading.tsx) |  |
| /verify-mfa | page |  | [app/(auth)/verify-mfa/page.tsx](../../../app/%28auth%29/verify-mfa/page.tsx) | @/lib/auth/safeRedirectPath:9 |
| / | error |  | [app/(decision-journey)/error.tsx](../../../app/%28decision-journey%29/error.tsx) |  |
| /find-your-path | loading |  | [app/(decision-journey)/find-your-path/loading.tsx](../../../app/%28decision-journey%29/find-your-path/loading.tsx) |  |
| / | layout |  | [app/(decision-journey)/layout.tsx](../../../app/%28decision-journey%29/layout.tsx) |  |
| / | loading |  | [app/(decision-journey)/loading.tsx](../../../app/%28decision-journey%29/loading.tsx) |  |
| / | not-found |  | [app/(decision-journey)/not-found.tsx](../../../app/%28decision-journey%29/not-found.tsx) |  |
| /account | page |  | [app/(portal)/account/page.tsx](../../../app/%28portal%29/account/page.tsx) |  |
| /account/privacy | page |  | [app/(portal)/account/privacy/page.tsx](../../../app/%28portal%29/account/privacy/page.tsx) |  |
| /admin/chapters | page |  | [app/(portal)/admin/chapters/page.tsx](../../../app/%28portal%29/admin/chapters/page.tsx) |  |
| /applications | page |  | [app/(portal)/applications/page.tsx](../../../app/%28portal%29/applications/page.tsx) | @/lib/auth/server:5 |
| /certifications | page |  | [app/(portal)/certifications/page.tsx](../../../app/%28portal%29/certifications/page.tsx) |  |
| /coach/chat | route | POST | [app/(portal)/coach/chat/route.ts](../../../app/%28portal%29/coach/chat/route.ts) | @/lib/auth/server:2, @/lib/rate-limit:3, @/lib/db/withRequestGuc:13 |
| /coach | page |  | [app/(portal)/coach/page.tsx](../../../app/%28portal%29/coach/page.tsx) | @/lib/auth/server:7 |
| /counselor/at-risk | page |  | [app/(portal)/counselor/at-risk/page.tsx](../../../app/%28portal%29/counselor/at-risk/page.tsx) | @/lib/auth/server:3, @/lib/auth/roles:4 |
| /counselor | error |  | [app/(portal)/counselor/error.tsx](../../../app/%28portal%29/counselor/error.tsx) |  |
| /counselor/guide | error |  | [app/(portal)/counselor/guide/error.tsx](../../../app/%28portal%29/counselor/guide/error.tsx) |  |
| /counselor/guide | loading |  | [app/(portal)/counselor/guide/loading.tsx](../../../app/%28portal%29/counselor/guide/loading.tsx) |  |
| /counselor/guide | page |  | [app/(portal)/counselor/guide/page.tsx](../../../app/%28portal%29/counselor/guide/page.tsx) | @/lib/auth/server:6, @/lib/auth/roles:7 |
| /counselor/inactive-members | error |  | [app/(portal)/counselor/inactive-members/error.tsx](../../../app/%28portal%29/counselor/inactive-members/error.tsx) |  |
| /counselor/inactive-members | loading |  | [app/(portal)/counselor/inactive-members/loading.tsx](../../../app/%28portal%29/counselor/inactive-members/loading.tsx) |  |
| /counselor/inactive-members | page |  | [app/(portal)/counselor/inactive-members/page.tsx](../../../app/%28portal%29/counselor/inactive-members/page.tsx) |  |
| /counselor/inbox | error |  | [app/(portal)/counselor/inbox/error.tsx](../../../app/%28portal%29/counselor/inbox/error.tsx) |  |
| /counselor/inbox | loading |  | [app/(portal)/counselor/inbox/loading.tsx](../../../app/%28portal%29/counselor/inbox/loading.tsx) |  |
| /counselor/inbox | page |  | [app/(portal)/counselor/inbox/page.tsx](../../../app/%28portal%29/counselor/inbox/page.tsx) | @/lib/auth/server:4, @/lib/auth/roles:5 |
| /counselor/lab-reviews/\[submissionId\] | page |  | [app/(portal)/counselor/lab-reviews/\[submissionId\]/page.tsx](../../../app/%28portal%29/counselor/lab-reviews/%5BsubmissionId%5D/page.tsx) |  |
| /counselor/lab-reviews | page |  | [app/(portal)/counselor/lab-reviews/page.tsx](../../../app/%28portal%29/counselor/lab-reviews/page.tsx) |  |
| /counselor | layout |  | [app/(portal)/counselor/layout.tsx](../../../app/%28portal%29/counselor/layout.tsx) | @/lib/auth/server:4, @/lib/auth/roles:5, @/lib/auth/portalRoleSwitcher:6 |
| /counselor | loading |  | [app/(portal)/counselor/loading.tsx](../../../app/%28portal%29/counselor/loading.tsx) |  |
| /counselor/messages | error |  | [app/(portal)/counselor/messages/error.tsx](../../../app/%28portal%29/counselor/messages/error.tsx) |  |
| /counselor/messages | loading |  | [app/(portal)/counselor/messages/loading.tsx](../../../app/%28portal%29/counselor/messages/loading.tsx) |  |
| /counselor/messages | page |  | [app/(portal)/counselor/messages/page.tsx](../../../app/%28portal%29/counselor/messages/page.tsx) | @/lib/auth/server:3, @/lib/auth/roles:4 |
| /counselor | not-found |  | [app/(portal)/counselor/not-found.tsx](../../../app/%28portal%29/counselor/not-found.tsx) |  |
| /counselor/notifications | page |  | [app/(portal)/counselor/notifications/page.tsx](../../../app/%28portal%29/counselor/notifications/page.tsx) | @/lib/auth/server:3, @/lib/auth/roles:4 |
| /counselor/overview | page |  | [app/(portal)/counselor/overview/page.tsx](../../../app/%28portal%29/counselor/overview/page.tsx) | @/lib/auth/server:3, @/lib/auth/roles:4 |
| /counselor | page |  | [app/(portal)/counselor/page.tsx](../../../app/%28portal%29/counselor/page.tsx) |  |
| /counselor/placements | error |  | [app/(portal)/counselor/placements/error.tsx](../../../app/%28portal%29/counselor/placements/error.tsx) |  |
| /counselor/placements | loading |  | [app/(portal)/counselor/placements/loading.tsx](../../../app/%28portal%29/counselor/placements/loading.tsx) |  |
| /counselor/placements | page |  | [app/(portal)/counselor/placements/page.tsx](../../../app/%28portal%29/counselor/placements/page.tsx) |  |
| /counselor/profile | page |  | [app/(portal)/counselor/profile/page.tsx](../../../app/%28portal%29/counselor/profile/page.tsx) | @/lib/auth/server:5, @/lib/auth/roles:6 |
| /counselor/queue | error |  | [app/(portal)/counselor/queue/error.tsx](../../../app/%28portal%29/counselor/queue/error.tsx) |  |
| /counselor/queue | loading |  | [app/(portal)/counselor/queue/loading.tsx](../../../app/%28portal%29/counselor/queue/loading.tsx) |  |
| /counselor/queue | page |  | [app/(portal)/counselor/queue/page.tsx](../../../app/%28portal%29/counselor/queue/page.tsx) | @/lib/auth/server:4, @/lib/auth/roles:5 |
| /counselor/resources | error |  | [app/(portal)/counselor/resources/error.tsx](../../../app/%28portal%29/counselor/resources/error.tsx) |  |
| /counselor/resources | loading |  | [app/(portal)/counselor/resources/loading.tsx](../../../app/%28portal%29/counselor/resources/loading.tsx) |  |
| /counselor/resources | page |  | [app/(portal)/counselor/resources/page.tsx](../../../app/%28portal%29/counselor/resources/page.tsx) | @/lib/auth/server:4, @/lib/auth/roles:5 |
| /counselor/sessions/\[memberId\]/run | page |  | [app/(portal)/counselor/sessions/\[memberId\]/run/page.tsx](../../../app/%28portal%29/counselor/sessions/%5BmemberId%5D/run/page.tsx) | @/lib/auth/server:8, @/lib/auth/roles:9 |
| /counselor/sessions | page |  | [app/(portal)/counselor/sessions/page.tsx](../../../app/%28portal%29/counselor/sessions/page.tsx) | @/lib/auth/server:5, @/lib/auth/roles:6 |
| /counselor/sessions/walk-in | page |  | [app/(portal)/counselor/sessions/walk-in/page.tsx](../../../app/%28portal%29/counselor/sessions/walk-in/page.tsx) | @/lib/auth/server:5, @/lib/auth/roles:6 |
| /counselor/students/\[memberId\] | error |  | [app/(portal)/counselor/students/\[memberId\]/error.tsx](../../../app/%28portal%29/counselor/students/%5BmemberId%5D/error.tsx) |  |
| /counselor/students/\[memberId\] | loading |  | [app/(portal)/counselor/students/\[memberId\]/loading.tsx](../../../app/%28portal%29/counselor/students/%5BmemberId%5D/loading.tsx) |  |
| /counselor/students/\[memberId\] | page |  | [app/(portal)/counselor/students/\[memberId\]/page.tsx](../../../app/%28portal%29/counselor/students/%5BmemberId%5D/page.tsx) | @/lib/auth/server:4, @/lib/auth/roles:5 |
| /counselor/students | error |  | [app/(portal)/counselor/students/error.tsx](../../../app/%28portal%29/counselor/students/error.tsx) |  |
| /counselor/students | loading |  | [app/(portal)/counselor/students/loading.tsx](../../../app/%28portal%29/counselor/students/loading.tsx) |  |
| /counselor/students | page |  | [app/(portal)/counselor/students/page.tsx](../../../app/%28portal%29/counselor/students/page.tsx) | @/lib/auth/server:4, @/lib/auth/roles:5 |
| /counselor/today | page |  | [app/(portal)/counselor/today/page.tsx](../../../app/%28portal%29/counselor/today/page.tsx) | @/lib/auth/server:2, @/lib/auth/roles:3 |
| /counselor/triage | error |  | [app/(portal)/counselor/triage/error.tsx](../../../app/%28portal%29/counselor/triage/error.tsx) |  |
| /counselor/triage | loading |  | [app/(portal)/counselor/triage/loading.tsx](../../../app/%28portal%29/counselor/triage/loading.tsx) |  |
| /counselor/triage | page |  | [app/(portal)/counselor/triage/page.tsx](../../../app/%28portal%29/counselor/triage/page.tsx) | @/lib/auth/server:6, @/lib/auth/roles:7 |
| /dashboard/\[...slug\] | page |  | [app/(portal)/dashboard/\[...slug\]/page.tsx](../../../app/%28portal%29/dashboard/%5B...slug%5D/page.tsx) |  |
| /dashboard/account | loading |  | [app/(portal)/dashboard/account/loading.tsx](../../../app/%28portal%29/dashboard/account/loading.tsx) |  |
| /dashboard/account | page |  | [app/(portal)/dashboard/account/page.tsx](../../../app/%28portal%29/dashboard/account/page.tsx) | @/lib/auth/server:6 |
| /dashboard/ai-tools/application-tracker | loading |  | [app/(portal)/dashboard/ai-tools/application-tracker/loading.tsx](../../../app/%28portal%29/dashboard/ai-tools/application-tracker/loading.tsx) |  |
| /dashboard/ai-tools/application-tracker | page |  | [app/(portal)/dashboard/ai-tools/application-tracker/page.tsx](../../../app/%28portal%29/dashboard/ai-tools/application-tracker/page.tsx) |  |
| /dashboard/ai-tools/benefits-cliff | page |  | [app/(portal)/dashboard/ai-tools/benefits-cliff/page.tsx](../../../app/%28portal%29/dashboard/ai-tools/benefits-cliff/page.tsx) | @/lib/auth/server:5 |
| /dashboard/ai-tools/career-business-coach | loading |  | [app/(portal)/dashboard/ai-tools/career-business-coach/loading.tsx](../../../app/%28portal%29/dashboard/ai-tools/career-business-coach/loading.tsx) |  |
| /dashboard/ai-tools/career-business-coach | page |  | [app/(portal)/dashboard/ai-tools/career-business-coach/page.tsx](../../../app/%28portal%29/dashboard/ai-tools/career-business-coach/page.tsx) | @/lib/auth/server:5 |
| /dashboard/ai-tools/cover-letter | loading |  | [app/(portal)/dashboard/ai-tools/cover-letter/loading.tsx](../../../app/%28portal%29/dashboard/ai-tools/cover-letter/loading.tsx) |  |
| /dashboard/ai-tools/cover-letter | page |  | [app/(portal)/dashboard/ai-tools/cover-letter/page.tsx](../../../app/%28portal%29/dashboard/ai-tools/cover-letter/page.tsx) | @/lib/auth/server:5 |
| /dashboard/ai-tools/elevator-pitch | loading |  | [app/(portal)/dashboard/ai-tools/elevator-pitch/loading.tsx](../../../app/%28portal%29/dashboard/ai-tools/elevator-pitch/loading.tsx) |  |
| /dashboard/ai-tools/elevator-pitch | page |  | [app/(portal)/dashboard/ai-tools/elevator-pitch/page.tsx](../../../app/%28portal%29/dashboard/ai-tools/elevator-pitch/page.tsx) | @/lib/auth/server:5 |
| /dashboard/ai-tools/gap-analyzer | loading |  | [app/(portal)/dashboard/ai-tools/gap-analyzer/loading.tsx](../../../app/%28portal%29/dashboard/ai-tools/gap-analyzer/loading.tsx) |  |
| /dashboard/ai-tools/gap-analyzer | page |  | [app/(portal)/dashboard/ai-tools/gap-analyzer/page.tsx](../../../app/%28portal%29/dashboard/ai-tools/gap-analyzer/page.tsx) | @/lib/auth/server:5 |
| /dashboard/ai-tools/history | loading |  | [app/(portal)/dashboard/ai-tools/history/loading.tsx](../../../app/%28portal%29/dashboard/ai-tools/history/loading.tsx) |  |
| /dashboard/ai-tools/history | page |  | [app/(portal)/dashboard/ai-tools/history/page.tsx](../../../app/%28portal%29/dashboard/ai-tools/history/page.tsx) | @/lib/auth/server:7 |
| /dashboard/ai-tools/interview-coach | loading |  | [app/(portal)/dashboard/ai-tools/interview-coach/loading.tsx](../../../app/%28portal%29/dashboard/ai-tools/interview-coach/loading.tsx) |  |
| /dashboard/ai-tools/interview-coach | page |  | [app/(portal)/dashboard/ai-tools/interview-coach/page.tsx](../../../app/%28portal%29/dashboard/ai-tools/interview-coach/page.tsx) | @/lib/auth/server:5 |
| /dashboard/ai-tools/interview-practice | loading |  | [app/(portal)/dashboard/ai-tools/interview-practice/loading.tsx](../../../app/%28portal%29/dashboard/ai-tools/interview-practice/loading.tsx) |  |
| /dashboard/ai-tools/interview-practice | page |  | [app/(portal)/dashboard/ai-tools/interview-practice/page.tsx](../../../app/%28portal%29/dashboard/ai-tools/interview-practice/page.tsx) | @/lib/auth/server:5 |
| /dashboard/ai-tools/interview-prep | loading |  | [app/(portal)/dashboard/ai-tools/interview-prep/loading.tsx](../../../app/%28portal%29/dashboard/ai-tools/interview-prep/loading.tsx) |  |
| /dashboard/ai-tools/interview-prep | page |  | [app/(portal)/dashboard/ai-tools/interview-prep/page.tsx](../../../app/%28portal%29/dashboard/ai-tools/interview-prep/page.tsx) | @/lib/auth/server:2 |
| /dashboard/ai-tools/job-match-scorer | loading |  | [app/(portal)/dashboard/ai-tools/job-match-scorer/loading.tsx](../../../app/%28portal%29/dashboard/ai-tools/job-match-scorer/loading.tsx) |  |
| /dashboard/ai-tools/job-match-scorer | page |  | [app/(portal)/dashboard/ai-tools/job-match-scorer/page.tsx](../../../app/%28portal%29/dashboard/ai-tools/job-match-scorer/page.tsx) | @/lib/auth/server:5 |
| /dashboard/ai-tools/linkedin-about | loading |  | [app/(portal)/dashboard/ai-tools/linkedin-about/loading.tsx](../../../app/%28portal%29/dashboard/ai-tools/linkedin-about/loading.tsx) |  |
| /dashboard/ai-tools/linkedin-about | page |  | [app/(portal)/dashboard/ai-tools/linkedin-about/page.tsx](../../../app/%28portal%29/dashboard/ai-tools/linkedin-about/page.tsx) | @/lib/auth/server:6 |
| /dashboard/ai-tools/linkedin-headline | loading |  | [app/(portal)/dashboard/ai-tools/linkedin-headline/loading.tsx](../../../app/%28portal%29/dashboard/ai-tools/linkedin-headline/loading.tsx) |  |
| /dashboard/ai-tools/linkedin-headline | page |  | [app/(portal)/dashboard/ai-tools/linkedin-headline/page.tsx](../../../app/%28portal%29/dashboard/ai-tools/linkedin-headline/page.tsx) | @/lib/auth/server:5 |
| /dashboard/ai-tools | loading |  | [app/(portal)/dashboard/ai-tools/loading.tsx](../../../app/%28portal%29/dashboard/ai-tools/loading.tsx) |  |
| /dashboard/ai-tools | page |  | [app/(portal)/dashboard/ai-tools/page.tsx](../../../app/%28portal%29/dashboard/ai-tools/page.tsx) | @/lib/auth/server:5 |
| /dashboard/ai-tools/readiness-coach | page |  | [app/(portal)/dashboard/ai-tools/readiness-coach/page.tsx](../../../app/%28portal%29/dashboard/ai-tools/readiness-coach/page.tsx) | @/lib/auth/server:5 |
| /dashboard/ai-tools/resume-analysis | loading |  | [app/(portal)/dashboard/ai-tools/resume-analysis/loading.tsx](../../../app/%28portal%29/dashboard/ai-tools/resume-analysis/loading.tsx) |  |
| /dashboard/ai-tools/resume-analysis | page |  | [app/(portal)/dashboard/ai-tools/resume-analysis/page.tsx](../../../app/%28portal%29/dashboard/ai-tools/resume-analysis/page.tsx) |  |
| /dashboard/ai-tools/resume-coach | loading |  | [app/(portal)/dashboard/ai-tools/resume-coach/loading.tsx](../../../app/%28portal%29/dashboard/ai-tools/resume-coach/loading.tsx) |  |
| /dashboard/ai-tools/resume-coach | page |  | [app/(portal)/dashboard/ai-tools/resume-coach/page.tsx](../../../app/%28portal%29/dashboard/ai-tools/resume-coach/page.tsx) |  |
| /dashboard/ai-tools/resume-rewriter | loading |  | [app/(portal)/dashboard/ai-tools/resume-rewriter/loading.tsx](../../../app/%28portal%29/dashboard/ai-tools/resume-rewriter/loading.tsx) |  |
| /dashboard/ai-tools/resume-rewriter | page |  | [app/(portal)/dashboard/ai-tools/resume-rewriter/page.tsx](../../../app/%28portal%29/dashboard/ai-tools/resume-rewriter/page.tsx) |  |
| /dashboard/ai-tools/resume-studio | page |  | [app/(portal)/dashboard/ai-tools/resume-studio/page.tsx](../../../app/%28portal%29/dashboard/ai-tools/resume-studio/page.tsx) | @/lib/auth/server:7 |
| /dashboard/ai-tools/salary-negotiation | loading |  | [app/(portal)/dashboard/ai-tools/salary-negotiation/loading.tsx](../../../app/%28portal%29/dashboard/ai-tools/salary-negotiation/loading.tsx) |  |
| /dashboard/ai-tools/salary-negotiation | page |  | [app/(portal)/dashboard/ai-tools/salary-negotiation/page.tsx](../../../app/%28portal%29/dashboard/ai-tools/salary-negotiation/page.tsx) | @/lib/auth/server:5 |
| /dashboard/ai-tools/skill-checkpoints | loading |  | [app/(portal)/dashboard/ai-tools/skill-checkpoints/loading.tsx](../../../app/%28portal%29/dashboard/ai-tools/skill-checkpoints/loading.tsx) |  |
| /dashboard/ai-tools/skill-checkpoints | page |  | [app/(portal)/dashboard/ai-tools/skill-checkpoints/page.tsx](../../../app/%28portal%29/dashboard/ai-tools/skill-checkpoints/page.tsx) | @/lib/auth/server:5 |
| /dashboard/ai-tools/skill-mapper | loading |  | [app/(portal)/dashboard/ai-tools/skill-mapper/loading.tsx](../../../app/%28portal%29/dashboard/ai-tools/skill-mapper/loading.tsx) |  |
| /dashboard/ai-tools/skill-mapper | page |  | [app/(portal)/dashboard/ai-tools/skill-mapper/page.tsx](../../../app/%28portal%29/dashboard/ai-tools/skill-mapper/page.tsx) | @/lib/auth/server:6 |
| /dashboard/ai-tools/studio | loading |  | [app/(portal)/dashboard/ai-tools/studio/loading.tsx](../../../app/%28portal%29/dashboard/ai-tools/studio/loading.tsx) |  |
| /dashboard/ai-tools/studio | page |  | [app/(portal)/dashboard/ai-tools/studio/page.tsx](../../../app/%28portal%29/dashboard/ai-tools/studio/page.tsx) |  |
| /dashboard/ai-tools/training-bridge | page |  | [app/(portal)/dashboard/ai-tools/training-bridge/page.tsx](../../../app/%28portal%29/dashboard/ai-tools/training-bridge/page.tsx) | @/lib/auth/server:5 |
| /dashboard/ai-tools/voice-interview | loading |  | [app/(portal)/dashboard/ai-tools/voice-interview/loading.tsx](../../../app/%28portal%29/dashboard/ai-tools/voice-interview/loading.tsx) |  |
| /dashboard/ai-tools/voice-interview | page |  | [app/(portal)/dashboard/ai-tools/voice-interview/page.tsx](../../../app/%28portal%29/dashboard/ai-tools/voice-interview/page.tsx) | @/lib/auth/server:11 |
| /dashboard/assessment | loading |  | [app/(portal)/dashboard/assessment/loading.tsx](../../../app/%28portal%29/dashboard/assessment/loading.tsx) |  |
| /dashboard/assessment | page |  | [app/(portal)/dashboard/assessment/page.tsx](../../../app/%28portal%29/dashboard/assessment/page.tsx) | @/lib/auth/server:5 |
| /dashboard/assessments | page |  | [app/(portal)/dashboard/assessments/page.tsx](../../../app/%28portal%29/dashboard/assessments/page.tsx) |  |
| /dashboard/career-brief/\[slug\] | page |  | [app/(portal)/dashboard/career-brief/\[slug\]/page.tsx](../../../app/%28portal%29/dashboard/career-brief/%5Bslug%5D/page.tsx) | @/lib/auth/server:8 |
| /dashboard/career-brief | loading |  | [app/(portal)/dashboard/career-brief/loading.tsx](../../../app/%28portal%29/dashboard/career-brief/loading.tsx) |  |
| /dashboard/career-brief | page |  | [app/(portal)/dashboard/career-brief/page.tsx](../../../app/%28portal%29/dashboard/career-brief/page.tsx) | @/lib/auth/server:7 |
| /dashboard/career-library/\[id\] | page |  | [app/(portal)/dashboard/career-library/\[id\]/page.tsx](../../../app/%28portal%29/dashboard/career-library/%5Bid%5D/page.tsx) | @/lib/auth/server:9 |
| /dashboard/career-library | loading |  | [app/(portal)/dashboard/career-library/loading.tsx](../../../app/%28portal%29/dashboard/career-library/loading.tsx) |  |
| /dashboard/career-library | page |  | [app/(portal)/dashboard/career-library/page.tsx](../../../app/%28portal%29/dashboard/career-library/page.tsx) | @/lib/auth/server:7 |
| /dashboard/certifications | loading |  | [app/(portal)/dashboard/certifications/loading.tsx](../../../app/%28portal%29/dashboard/certifications/loading.tsx) |  |
| /dashboard/certifications | page |  | [app/(portal)/dashboard/certifications/page.tsx](../../../app/%28portal%29/dashboard/certifications/page.tsx) | @/lib/auth/server:7 |
| /dashboard/counselor/\[id\] | page |  | [app/(portal)/dashboard/counselor/\[id\]/page.tsx](../../../app/%28portal%29/dashboard/counselor/%5Bid%5D/page.tsx) | @/lib/auth/server:7 |
| /dashboard/counselor | loading |  | [app/(portal)/dashboard/counselor/loading.tsx](../../../app/%28portal%29/dashboard/counselor/loading.tsx) |  |
| /dashboard/counselor | page |  | [app/(portal)/dashboard/counselor/page.tsx](../../../app/%28portal%29/dashboard/counselor/page.tsx) | @/lib/auth/server:7 |
| /dashboard/coursera | loading |  | [app/(portal)/dashboard/coursera/loading.tsx](../../../app/%28portal%29/dashboard/coursera/loading.tsx) |  |
| /dashboard/coursera | page |  | [app/(portal)/dashboard/coursera/page.tsx](../../../app/%28portal%29/dashboard/coursera/page.tsx) | @/lib/auth/server:2 |
| /dashboard/documents | page |  | [app/(portal)/dashboard/documents/page.tsx](../../../app/%28portal%29/dashboard/documents/page.tsx) | @/lib/auth/server:4 |
| /dashboard/eligibility | loading |  | [app/(portal)/dashboard/eligibility/loading.tsx](../../../app/%28portal%29/dashboard/eligibility/loading.tsx) |  |
| /dashboard/eligibility | page |  | [app/(portal)/dashboard/eligibility/page.tsx](../../../app/%28portal%29/dashboard/eligibility/page.tsx) | @/lib/auth/server:4 |
| /dashboard | error |  | [app/(portal)/dashboard/error.tsx](../../../app/%28portal%29/dashboard/error.tsx) |  |
| /dashboard/guide | loading |  | [app/(portal)/dashboard/guide/loading.tsx](../../../app/%28portal%29/dashboard/guide/loading.tsx) |  |
| /dashboard/guide | page |  | [app/(portal)/dashboard/guide/page.tsx](../../../app/%28portal%29/dashboard/guide/page.tsx) | @/lib/auth/server:6 |
| /dashboard/help | loading |  | [app/(portal)/dashboard/help/loading.tsx](../../../app/%28portal%29/dashboard/help/loading.tsx) |  |
| /dashboard/help | page |  | [app/(portal)/dashboard/help/page.tsx](../../../app/%28portal%29/dashboard/help/page.tsx) | @/lib/auth/server:8 |
| /dashboard/job-applications | loading |  | [app/(portal)/dashboard/job-applications/loading.tsx](../../../app/%28portal%29/dashboard/job-applications/loading.tsx) |  |
| /dashboard/job-applications | page |  | [app/(portal)/dashboard/job-applications/page.tsx](../../../app/%28portal%29/dashboard/job-applications/page.tsx) | @/lib/auth/server:6 |
| /dashboard/jobs/\[id\] | page |  | [app/(portal)/dashboard/jobs/\[id\]/page.tsx](../../../app/%28portal%29/dashboard/jobs/%5Bid%5D/page.tsx) | @/lib/auth/server:4 |
| /dashboard/jobs | loading |  | [app/(portal)/dashboard/jobs/loading.tsx](../../../app/%28portal%29/dashboard/jobs/loading.tsx) |  |
| /dashboard/jobs | page |  | [app/(portal)/dashboard/jobs/page.tsx](../../../app/%28portal%29/dashboard/jobs/page.tsx) | @/lib/auth/server:4 |
| /dashboard | layout |  | [app/(portal)/dashboard/layout.tsx](../../../app/%28portal%29/dashboard/layout.tsx) | @/lib/auth/server:4, @/lib/auth/roles:5, @/lib/auth/portalRoleSwitcher:11 |
| /dashboard/learning/find-your-career | loading |  | [app/(portal)/dashboard/learning/find-your-career/loading.tsx](../../../app/%28portal%29/dashboard/learning/find-your-career/loading.tsx) |  |
| /dashboard/learning/find-your-career | page |  | [app/(portal)/dashboard/learning/find-your-career/page.tsx](../../../app/%28portal%29/dashboard/learning/find-your-career/page.tsx) | @/lib/auth/server:5 |
| /dashboard/learning/interest-profiler | loading |  | [app/(portal)/dashboard/learning/interest-profiler/loading.tsx](../../../app/%28portal%29/dashboard/learning/interest-profiler/loading.tsx) |  |
| /dashboard/learning/interest-profiler | page |  | [app/(portal)/dashboard/learning/interest-profiler/page.tsx](../../../app/%28portal%29/dashboard/learning/interest-profiler/page.tsx) | @/lib/auth/server:6 |
| /dashboard/learning/labs/\[labId\] | page |  | [app/(portal)/dashboard/learning/labs/\[labId\]/page.tsx](../../../app/%28portal%29/dashboard/learning/labs/%5BlabId%5D/page.tsx) | @/lib/auth/server:4 |
| /dashboard/learning | loading |  | [app/(portal)/dashboard/learning/loading.tsx](../../../app/%28portal%29/dashboard/learning/loading.tsx) |  |
| /dashboard/learning/modules/\[courseSlug\] | page |  | [app/(portal)/dashboard/learning/modules/\[courseSlug\]/page.tsx](../../../app/%28portal%29/dashboard/learning/modules/%5BcourseSlug%5D/page.tsx) | @/lib/auth/server:5 |
| /dashboard/learning | page |  | [app/(portal)/dashboard/learning/page.tsx](../../../app/%28portal%29/dashboard/learning/page.tsx) | @/lib/auth/server:5 |
| /dashboard/learning/wioa-qualification | loading |  | [app/(portal)/dashboard/learning/wioa-qualification/loading.tsx](../../../app/%28portal%29/dashboard/learning/wioa-qualification/loading.tsx) |  |
| /dashboard/learning/wioa-qualification | page |  | [app/(portal)/dashboard/learning/wioa-qualification/page.tsx](../../../app/%28portal%29/dashboard/learning/wioa-qualification/page.tsx) | @/lib/auth/server:8 |
| /dashboard | loading |  | [app/(portal)/dashboard/loading.tsx](../../../app/%28portal%29/dashboard/loading.tsx) |  |
| /dashboard/mentor | page |  | [app/(portal)/dashboard/mentor/page.tsx](../../../app/%28portal%29/dashboard/mentor/page.tsx) | @/lib/auth/server:8 |
| /dashboard/mentors/\[mentorId\] | page |  | [app/(portal)/dashboard/mentors/\[mentorId\]/page.tsx](../../../app/%28portal%29/dashboard/mentors/%5BmentorId%5D/page.tsx) | @/lib/auth/server:3 |
| /dashboard/mentors | loading |  | [app/(portal)/dashboard/mentors/loading.tsx](../../../app/%28portal%29/dashboard/mentors/loading.tsx) |  |
| /dashboard/mentors | page |  | [app/(portal)/dashboard/mentors/page.tsx](../../../app/%28portal%29/dashboard/mentors/page.tsx) | @/lib/auth/server:4 |
| /dashboard/messages | loading |  | [app/(portal)/dashboard/messages/loading.tsx](../../../app/%28portal%29/dashboard/messages/loading.tsx) |  |
| /dashboard/messages | page |  | [app/(portal)/dashboard/messages/page.tsx](../../../app/%28portal%29/dashboard/messages/page.tsx) | @/lib/auth/server:6 |
| /dashboard/missions | page |  | [app/(portal)/dashboard/missions/page.tsx](../../../app/%28portal%29/dashboard/missions/page.tsx) | @/lib/auth/server:5 |
| /dashboard | not-found |  | [app/(portal)/dashboard/not-found.tsx](../../../app/%28portal%29/dashboard/not-found.tsx) |  |
| /dashboard | page |  | [app/(portal)/dashboard/page.tsx](../../../app/%28portal%29/dashboard/page.tsx) | @/lib/auth/server:7, @/lib/auth/roles:19 |
| /dashboard/points | loading |  | [app/(portal)/dashboard/points/loading.tsx](../../../app/%28portal%29/dashboard/points/loading.tsx) |  |
| /dashboard/points | page |  | [app/(portal)/dashboard/points/page.tsx](../../../app/%28portal%29/dashboard/points/page.tsx) | @/lib/auth/server:8 |
| /dashboard/profile | loading |  | [app/(portal)/dashboard/profile/loading.tsx](../../../app/%28portal%29/dashboard/profile/loading.tsx) |  |
| /dashboard/profile | page |  | [app/(portal)/dashboard/profile/page.tsx](../../../app/%28portal%29/dashboard/profile/page.tsx) | @/lib/auth/server:10 |
| /dashboard/program/change | page |  | [app/(portal)/dashboard/program/change/page.tsx](../../../app/%28portal%29/dashboard/program/change/page.tsx) |  |
| /dashboard/program/employer-screening | page |  | [app/(portal)/dashboard/program/employer-screening/page.tsx](../../../app/%28portal%29/dashboard/program/employer-screening/page.tsx) | @/lib/auth/server:5 |
| /dashboard/program | loading |  | [app/(portal)/dashboard/program/loading.tsx](../../../app/%28portal%29/dashboard/program/loading.tsx) |  |
| /dashboard/program | page |  | [app/(portal)/dashboard/program/page.tsx](../../../app/%28portal%29/dashboard/program/page.tsx) | @/lib/auth/server:8, @/lib/auth/roles:23 |
| /dashboard/program/start | page |  | [app/(portal)/dashboard/program/start/page.tsx](../../../app/%28portal%29/dashboard/program/start/page.tsx) | @/lib/auth/server:5 |
| /dashboard/readiness | loading |  | [app/(portal)/dashboard/readiness/loading.tsx](../../../app/%28portal%29/dashboard/readiness/loading.tsx) |  |
| /dashboard/readiness | page |  | [app/(portal)/dashboard/readiness/page.tsx](../../../app/%28portal%29/dashboard/readiness/page.tsx) | @/lib/auth/server:5 |
| /dashboard/referrals | page |  | [app/(portal)/dashboard/referrals/page.tsx](../../../app/%28portal%29/dashboard/referrals/page.tsx) | @/lib/auth/server:5 |
| /dashboard/resources | loading |  | [app/(portal)/dashboard/resources/loading.tsx](../../../app/%28portal%29/dashboard/resources/loading.tsx) |  |
| /dashboard/resources | page |  | [app/(portal)/dashboard/resources/page.tsx](../../../app/%28portal%29/dashboard/resources/page.tsx) | @/lib/auth/server:7 |
| /dashboard/resume | loading |  | [app/(portal)/dashboard/resume/loading.tsx](../../../app/%28portal%29/dashboard/resume/loading.tsx) |  |
| /dashboard/resume | page |  | [app/(portal)/dashboard/resume/page.tsx](../../../app/%28portal%29/dashboard/resume/page.tsx) | @/lib/auth/server:8 |
| /dashboard/settings | loading |  | [app/(portal)/dashboard/settings/loading.tsx](../../../app/%28portal%29/dashboard/settings/loading.tsx) |  |
| /dashboard/settings | page |  | [app/(portal)/dashboard/settings/page.tsx](../../../app/%28portal%29/dashboard/settings/page.tsx) |  |
| /dashboard/skills-assessment | loading |  | [app/(portal)/dashboard/skills-assessment/loading.tsx](../../../app/%28portal%29/dashboard/skills-assessment/loading.tsx) |  |
| /dashboard/skills-assessment | page |  | [app/(portal)/dashboard/skills-assessment/page.tsx](../../../app/%28portal%29/dashboard/skills-assessment/page.tsx) |  |
| /dashboard/survey | page |  | [app/(portal)/dashboard/survey/page.tsx](../../../app/%28portal%29/dashboard/survey/page.tsx) | @/lib/auth/server:4 |
| /dashboard/toolkit | loading |  | [app/(portal)/dashboard/toolkit/loading.tsx](../../../app/%28portal%29/dashboard/toolkit/loading.tsx) |  |
| /dashboard/toolkit | page |  | [app/(portal)/dashboard/toolkit/page.tsx](../../../app/%28portal%29/dashboard/toolkit/page.tsx) |  |
| /dashboard/training | loading |  | [app/(portal)/dashboard/training/loading.tsx](../../../app/%28portal%29/dashboard/training/loading.tsx) |  |
| /dashboard/training | page |  | [app/(portal)/dashboard/training/page.tsx](../../../app/%28portal%29/dashboard/training/page.tsx) | @/lib/auth/server:2 |
| /dashboard/weekly-recap | loading |  | [app/(portal)/dashboard/weekly-recap/loading.tsx](../../../app/%28portal%29/dashboard/weekly-recap/loading.tsx) |  |
| /dashboard/weekly-recap | page |  | [app/(portal)/dashboard/weekly-recap/page.tsx](../../../app/%28portal%29/dashboard/weekly-recap/page.tsx) | @/lib/auth/server:8 |
| /employer/applications/\[id\] | loading |  | [app/(portal)/employer/applications/\[id\]/loading.tsx](../../../app/%28portal%29/employer/applications/%5Bid%5D/loading.tsx) |  |
| /employer/applications/\[id\] | page |  | [app/(portal)/employer/applications/\[id\]/page.tsx](../../../app/%28portal%29/employer/applications/%5Bid%5D/page.tsx) | @/lib/auth/server:6, @/lib/auth/roles:7, @/lib/auth/portalGuards:8 |
| /employer/applications | loading |  | [app/(portal)/employer/applications/loading.tsx](../../../app/%28portal%29/employer/applications/loading.tsx) |  |
| /employer/applications | page |  | [app/(portal)/employer/applications/page.tsx](../../../app/%28portal%29/employer/applications/page.tsx) | @/lib/auth/portalGuards:4, @/lib/auth/server:6, @/lib/auth/roles:7 |
| /employer/billing | loading |  | [app/(portal)/employer/billing/loading.tsx](../../../app/%28portal%29/employer/billing/loading.tsx) |  |
| /employer/billing | page |  | [app/(portal)/employer/billing/page.tsx](../../../app/%28portal%29/employer/billing/page.tsx) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/auth/portalGuards:5 |
| /employer/candidates/\[studentId\] | loading |  | [app/(portal)/employer/candidates/\[studentId\]/loading.tsx](../../../app/%28portal%29/employer/candidates/%5BstudentId%5D/loading.tsx) |  |
| /employer/candidates/\[studentId\] | page |  | [app/(portal)/employer/candidates/\[studentId\]/page.tsx](../../../app/%28portal%29/employer/candidates/%5BstudentId%5D/page.tsx) | @/lib/auth/server:8, @/lib/auth/roles:9, @/lib/auth/portalGuards:10 |
| /employer/candidates | loading |  | [app/(portal)/employer/candidates/loading.tsx](../../../app/%28portal%29/employer/candidates/loading.tsx) |  |
| /employer | error |  | [app/(portal)/employer/error.tsx](../../../app/%28portal%29/employer/error.tsx) |  |
| /employer/guide | loading |  | [app/(portal)/employer/guide/loading.tsx](../../../app/%28portal%29/employer/guide/loading.tsx) |  |
| /employer/guide | page |  | [app/(portal)/employer/guide/page.tsx](../../../app/%28portal%29/employer/guide/page.tsx) | @/lib/auth/portalGuards:5, @/lib/auth/server:7, @/lib/auth/roles:8 |
| /employer/jobs/\[id\]/applicants | loading |  | [app/(portal)/employer/jobs/\[id\]/applicants/loading.tsx](../../../app/%28portal%29/employer/jobs/%5Bid%5D/applicants/loading.tsx) |  |
| /employer/jobs/\[id\]/applicants | page |  | [app/(portal)/employer/jobs/\[id\]/applicants/page.tsx](../../../app/%28portal%29/employer/jobs/%5Bid%5D/applicants/page.tsx) | @/lib/auth/server:6, @/lib/auth/roles:7, @/lib/auth/portalGuards:8 |
| /employer/jobs/\[id\]/edit | loading |  | [app/(portal)/employer/jobs/\[id\]/edit/loading.tsx](../../../app/%28portal%29/employer/jobs/%5Bid%5D/edit/loading.tsx) |  |
| /employer/jobs/\[id\]/edit | page |  | [app/(portal)/employer/jobs/\[id\]/edit/page.tsx](../../../app/%28portal%29/employer/jobs/%5Bid%5D/edit/page.tsx) | @/lib/auth/server:6, @/lib/auth/roles:7, @/lib/auth/portalGuards:8 |
| /employer/jobs/\[id\] | loading |  | [app/(portal)/employer/jobs/\[id\]/loading.tsx](../../../app/%28portal%29/employer/jobs/%5Bid%5D/loading.tsx) |  |
| /employer/jobs/\[id\] | page |  | [app/(portal)/employer/jobs/\[id\]/page.tsx](../../../app/%28portal%29/employer/jobs/%5Bid%5D/page.tsx) | @/lib/auth/server:6, @/lib/auth/roles:7, @/lib/auth/portalGuards:8 |
| /employer/jobs/import | loading |  | [app/(portal)/employer/jobs/import/loading.tsx](../../../app/%28portal%29/employer/jobs/import/loading.tsx) |  |
| /employer/jobs/import | page |  | [app/(portal)/employer/jobs/import/page.tsx](../../../app/%28portal%29/employer/jobs/import/page.tsx) | @/lib/auth/portalGuards:5, @/lib/auth/server:7, @/lib/auth/roles:8 |
| /employer/jobs | loading |  | [app/(portal)/employer/jobs/loading.tsx](../../../app/%28portal%29/employer/jobs/loading.tsx) |  |
| /employer/jobs/new | loading |  | [app/(portal)/employer/jobs/new/loading.tsx](../../../app/%28portal%29/employer/jobs/new/loading.tsx) |  |
| /employer/jobs/new | page |  | [app/(portal)/employer/jobs/new/page.tsx](../../../app/%28portal%29/employer/jobs/new/page.tsx) | @/lib/auth/portalGuards:5, @/lib/auth/server:7, @/lib/auth/roles:8 |
| /employer/jobs | page |  | [app/(portal)/employer/jobs/page.tsx](../../../app/%28portal%29/employer/jobs/page.tsx) | @/lib/auth/portalGuards:4, @/lib/auth/server:6, @/lib/auth/roles:7 |
| /employer/jobs/post | loading |  | [app/(portal)/employer/jobs/post/loading.tsx](../../../app/%28portal%29/employer/jobs/post/loading.tsx) |  |
| /employer/jobs/post | page |  | [app/(portal)/employer/jobs/post/page.tsx](../../../app/%28portal%29/employer/jobs/post/page.tsx) | @/lib/auth/portalGuards:4, @/lib/auth/server:6, @/lib/auth/roles:7 |
| /employer | layout |  | [app/(portal)/employer/layout.tsx](../../../app/%28portal%29/employer/layout.tsx) | @/lib/auth/portalGuards:3, @/lib/auth/server:4, @/lib/auth/roles:6, @/lib/auth/portalRoleSwitcher:7 |
| /employer | loading |  | [app/(portal)/employer/loading.tsx](../../../app/%28portal%29/employer/loading.tsx) |  |
| /employer/matches | loading |  | [app/(portal)/employer/matches/loading.tsx](../../../app/%28portal%29/employer/matches/loading.tsx) |  |
| /employer/matches | page |  | [app/(portal)/employer/matches/page.tsx](../../../app/%28portal%29/employer/matches/page.tsx) | @/lib/auth/portalGuards:3, @/lib/auth/server:5, @/lib/auth/roles:6 |
| /employer/messages | loading |  | [app/(portal)/employer/messages/loading.tsx](../../../app/%28portal%29/employer/messages/loading.tsx) |  |
| /employer/messages | page |  | [app/(portal)/employer/messages/page.tsx](../../../app/%28portal%29/employer/messages/page.tsx) | @/lib/auth/portalGuards:4, @/lib/auth/server:6, @/lib/auth/roles:7 |
| /employer | not-found |  | [app/(portal)/employer/not-found.tsx](../../../app/%28portal%29/employer/not-found.tsx) |  |
| /employer | page |  | [app/(portal)/employer/page.tsx](../../../app/%28portal%29/employer/page.tsx) | @/lib/auth/server:6, @/lib/auth/roles:7, @/lib/auth/portalGuards:8 |
| /employer/pipeline | loading |  | [app/(portal)/employer/pipeline/loading.tsx](../../../app/%28portal%29/employer/pipeline/loading.tsx) |  |
| /employer/pipeline | page |  | [app/(portal)/employer/pipeline/page.tsx](../../../app/%28portal%29/employer/pipeline/page.tsx) | @/lib/auth/portalGuards:4, @/lib/auth/server:6, @/lib/auth/roles:7 |
| /employer/settings | loading |  | [app/(portal)/employer/settings/loading.tsx](../../../app/%28portal%29/employer/settings/loading.tsx) |  |
| /employer/settings | page |  | [app/(portal)/employer/settings/page.tsx](../../../app/%28portal%29/employer/settings/page.tsx) | @/lib/auth/portalGuards:3, @/lib/auth/server:5, @/lib/auth/roles:6 |
| /employer/work-queue | loading |  | [app/(portal)/employer/work-queue/loading.tsx](../../../app/%28portal%29/employer/work-queue/loading.tsx) |  |
| /employer/work-queue | page |  | [app/(portal)/employer/work-queue/page.tsx](../../../app/%28portal%29/employer/work-queue/page.tsx) | @/lib/auth/portalGuards:3, @/lib/auth/server:5, @/lib/auth/roles:6 |
| / | error |  | [app/(portal)/error.tsx](../../../app/%28portal%29/error.tsx) |  |
| /help | page |  | [app/(portal)/help/page.tsx](../../../app/%28portal%29/help/page.tsx) |  |
| / | layout |  | [app/(portal)/layout.tsx](../../../app/%28portal%29/layout.tsx) |  |
| /leader/dashboard | page |  | [app/(portal)/leader/dashboard/page.tsx](../../../app/%28portal%29/leader/dashboard/page.tsx) |  |
| / | loading |  | [app/(portal)/loading.tsx](../../../app/%28portal%29/loading.tsx) |  |
| / | not-found |  | [app/(portal)/not-found.tsx](../../../app/%28portal%29/not-found.tsx) |  |
| /partner/attention | loading |  | [app/(portal)/partner/attention/loading.tsx](../../../app/%28portal%29/partner/attention/loading.tsx) |  |
| /partner/attention | page |  | [app/(portal)/partner/attention/page.tsx](../../../app/%28portal%29/partner/attention/page.tsx) | @/lib/auth/portalGuards:3, @/lib/auth/server:5, @/lib/auth/roles:6 |
| /partner | error |  | [app/(portal)/partner/error.tsx](../../../app/%28portal%29/partner/error.tsx) |  |
| /partner/exports | loading |  | [app/(portal)/partner/exports/loading.tsx](../../../app/%28portal%29/partner/exports/loading.tsx) |  |
| /partner/exports | page |  | [app/(portal)/partner/exports/page.tsx](../../../app/%28portal%29/partner/exports/page.tsx) | @/lib/auth/portalGuards:4, @/lib/auth/server:6, @/lib/auth/roles:7 |
| /partner/guide | loading |  | [app/(portal)/partner/guide/loading.tsx](../../../app/%28portal%29/partner/guide/loading.tsx) |  |
| /partner/guide | page |  | [app/(portal)/partner/guide/page.tsx](../../../app/%28portal%29/partner/guide/page.tsx) | @/lib/auth/portalGuards:4, @/lib/auth/server:6, @/lib/auth/roles:7 |
| /partner | layout |  | [app/(portal)/partner/layout.tsx](../../../app/%28portal%29/partner/layout.tsx) | @/lib/auth/portalGuards:3, @/lib/auth/server:4, @/lib/auth/roles:6, @/lib/auth/portalRoleSwitcher:7 |
| /partner | loading |  | [app/(portal)/partner/loading.tsx](../../../app/%28portal%29/partner/loading.tsx) |  |
| /partner/members/\[id\] | page |  | [app/(portal)/partner/members/\[id\]/page.tsx](../../../app/%28portal%29/partner/members/%5Bid%5D/page.tsx) |  |
| /partner/members | page |  | [app/(portal)/partner/members/page.tsx](../../../app/%28portal%29/partner/members/page.tsx) |  |
| /partner/messages | loading |  | [app/(portal)/partner/messages/loading.tsx](../../../app/%28portal%29/partner/messages/loading.tsx) |  |
| /partner/messages | page |  | [app/(portal)/partner/messages/page.tsx](../../../app/%28portal%29/partner/messages/page.tsx) | @/lib/auth/portalGuards:4, @/lib/auth/server:6, @/lib/auth/roles:7 |
| /partner/milestones | loading |  | [app/(portal)/partner/milestones/loading.tsx](../../../app/%28portal%29/partner/milestones/loading.tsx) |  |
| /partner/milestones | page |  | [app/(portal)/partner/milestones/page.tsx](../../../app/%28portal%29/partner/milestones/page.tsx) | @/lib/auth/portalGuards:3, @/lib/auth/server:5, @/lib/auth/roles:6 |
| /partner | not-found |  | [app/(portal)/partner/not-found.tsx](../../../app/%28portal%29/partner/not-found.tsx) |  |
| /partner/outcomes | loading |  | [app/(portal)/partner/outcomes/loading.tsx](../../../app/%28portal%29/partner/outcomes/loading.tsx) |  |
| /partner/outcomes | page |  | [app/(portal)/partner/outcomes/page.tsx](../../../app/%28portal%29/partner/outcomes/page.tsx) | @/lib/auth/portalGuards:3, @/lib/auth/server:5, @/lib/auth/roles:6 |
| /partner | page |  | [app/(portal)/partner/page.tsx](../../../app/%28portal%29/partner/page.tsx) | @/lib/auth/server:6, @/lib/auth/roles:7, @/lib/auth/portalGuards:8, @/lib/auth/roles:23 |
| /partner/referred-members/\[memberId\] | page |  | [app/(portal)/partner/referred-members/\[memberId\]/page.tsx](../../../app/%28portal%29/partner/referred-members/%5BmemberId%5D/page.tsx) | @/lib/auth/roles:10, @/lib/auth/portalGuards:11, @/lib/auth/server:12 |
| /partner/referred-members | loading |  | [app/(portal)/partner/referred-members/loading.tsx](../../../app/%28portal%29/partner/referred-members/loading.tsx) |  |
| /partner/referred-members | page |  | [app/(portal)/partner/referred-members/page.tsx](../../../app/%28portal%29/partner/referred-members/page.tsx) | @/lib/auth/portalGuards:3, @/lib/auth/roles:8, @/lib/auth/server:9 |
| /partner/resources | loading |  | [app/(portal)/partner/resources/loading.tsx](../../../app/%28portal%29/partner/resources/loading.tsx) |  |
| /partner/resources | page |  | [app/(portal)/partner/resources/page.tsx](../../../app/%28portal%29/partner/resources/page.tsx) | @/lib/auth/portalGuards:5, @/lib/auth/server:7, @/lib/auth/roles:8 |
| /partner/settings | loading |  | [app/(portal)/partner/settings/loading.tsx](../../../app/%28portal%29/partner/settings/loading.tsx) |  |
| /partner/settings | page |  | [app/(portal)/partner/settings/page.tsx](../../../app/%28portal%29/partner/settings/page.tsx) | @/lib/auth/portalGuards:4, @/lib/auth/server:6, @/lib/auth/roles:7 |
| /partner/signup | page |  | [app/(portal)/partner/signup/page.tsx](../../../app/%28portal%29/partner/signup/page.tsx) |  |
| /profile | page |  | [app/(portal)/profile/page.tsx](../../../app/%28portal%29/profile/page.tsx) |  |
| /resources/\[id\] | page |  | [app/(portal)/resources/\[id\]/page.tsx](../../../app/%28portal%29/resources/%5Bid%5D/page.tsx) |  |
| /resources | page |  | [app/(portal)/resources/page.tsx](../../../app/%28portal%29/resources/page.tsx) |  |
| /admin/agent-inbox | loading |  | [app/admin/agent-inbox/loading.tsx](../../../app/admin/agent-inbox/loading.tsx) |  |
| /admin/agent-inbox | page |  | [app/admin/agent-inbox/page.tsx](../../../app/admin/agent-inbox/page.tsx) | @/lib/auth/server:4, @/lib/tenant/adminPageScope:5, @/lib/auth/roles:6 |
| /admin/ai-tools | loading |  | [app/admin/ai-tools/loading.tsx](../../../app/admin/ai-tools/loading.tsx) |  |
| /admin/ai-tools | page |  | [app/admin/ai-tools/page.tsx](../../../app/admin/ai-tools/page.tsx) | @/lib/auth/server:4, @/lib/tenant/adminPageScope:5 |
| /admin/analytics/ai-efficacy | page |  | [app/admin/analytics/ai-efficacy/page.tsx](../../../app/admin/analytics/ai-efficacy/page.tsx) | @/lib/auth/server:3, @/lib/tenant/adminPageScope:4 |
| /admin/analytics | loading |  | [app/admin/analytics/loading.tsx](../../../app/admin/analytics/loading.tsx) |  |
| /admin/analytics | page |  | [app/admin/analytics/page.tsx](../../../app/admin/analytics/page.tsx) | @/lib/auth/server:4, @/lib/tenant/adminPageScope:5, @/lib/tenant/organization:11 |
| /admin/assessments | loading |  | [app/admin/assessments/loading.tsx](../../../app/admin/assessments/loading.tsx) |  |
| /admin/assessments | page |  | [app/admin/assessments/page.tsx](../../../app/admin/assessments/page.tsx) | @/lib/auth/server:5, @/lib/tenant/adminPageScope:6, @/lib/tenant/adminPageScope:66, @/lib/tenant/adminPageScope:117 |
| /admin/audit-logs | loading |  | [app/admin/audit-logs/loading.tsx](../../../app/admin/audit-logs/loading.tsx) |  |
| /admin/audit-logs | page |  | [app/admin/audit-logs/page.tsx](../../../app/admin/audit-logs/page.tsx) | @/lib/auth/server:5, @/lib/auth/roles:6 |
| /admin/blog/\[id\]/edit | page |  | [app/admin/blog/\[id\]/edit/page.tsx](../../../app/admin/blog/%5Bid%5D/edit/page.tsx) |  |
| /admin/blog/ai | loading |  | [app/admin/blog/ai/loading.tsx](../../../app/admin/blog/ai/loading.tsx) |  |
| /admin/blog/ai | page |  | [app/admin/blog/ai/page.tsx](../../../app/admin/blog/ai/page.tsx) |  |
| /admin/blog | loading |  | [app/admin/blog/loading.tsx](../../../app/admin/blog/loading.tsx) |  |
| /admin/blog/new | loading |  | [app/admin/blog/new/loading.tsx](../../../app/admin/blog/new/loading.tsx) |  |
| /admin/blog/new | page |  | [app/admin/blog/new/page.tsx](../../../app/admin/blog/new/page.tsx) |  |
| /admin/blog | page |  | [app/admin/blog/page.tsx](../../../app/admin/blog/page.tsx) | @/lib/auth/server:7, @/lib/tenant/adminPageScope:8 |
| /admin/blog/preview/\[slug\] | page |  | [app/admin/blog/preview/\[slug\]/page.tsx](../../../app/admin/blog/preview/%5Bslug%5D/page.tsx) |  |
| /admin/board | loading |  | [app/admin/board/loading.tsx](../../../app/admin/board/loading.tsx) |  |
| /admin/board | page |  | [app/admin/board/page.tsx](../../../app/admin/board/page.tsx) | @/lib/auth/server:6, @/lib/tenant/adminPageScope:7, @/lib/auth/roles:8, @/lib/tenant/organization:9 |
| /admin/board/print | page |  | [app/admin/board/print/page.tsx](../../../app/admin/board/print/page.tsx) | @/lib/auth/server:4, @/lib/tenant/adminPageScope:5, @/lib/auth/roles:6, @/lib/tenant/organization:7 |
| /admin/career-mappings | loading |  | [app/admin/career-mappings/loading.tsx](../../../app/admin/career-mappings/loading.tsx) |  |
| /admin/career-mappings | page |  | [app/admin/career-mappings/page.tsx](../../../app/admin/career-mappings/page.tsx) | @/lib/auth/server:4, @/lib/tenant/adminPageScope:5 |
| /admin/certifications | loading |  | [app/admin/certifications/loading.tsx](../../../app/admin/certifications/loading.tsx) |  |
| /admin/certifications | page |  | [app/admin/certifications/page.tsx](../../../app/admin/certifications/page.tsx) | @/lib/auth/server:5, @/lib/tenant/adminPageScope:6 |
| /admin/command-center | page |  | [app/admin/command-center/page.tsx](../../../app/admin/command-center/page.tsx) | @/lib/auth/server:5, @/lib/tenant/adminPageScope:6, @/lib/tenant/organization:8 |
| /admin/counselors | loading |  | [app/admin/counselors/loading.tsx](../../../app/admin/counselors/loading.tsx) |  |
| /admin/counselors | page |  | [app/admin/counselors/page.tsx](../../../app/admin/counselors/page.tsx) | @/lib/auth/server:4, @/lib/tenant/adminPageScope:5 |
| /admin/coursera/csv-import | page |  | [app/admin/coursera/csv-import/page.tsx](../../../app/admin/coursera/csv-import/page.tsx) | @/lib/auth/server:8, @/lib/tenant/adminPageScope:9 |
| /admin/coursera/enrollment | page |  | [app/admin/coursera/enrollment/page.tsx](../../../app/admin/coursera/enrollment/page.tsx) | @/lib/auth/server:8, @/lib/tenant/adminPageScope:9, @/lib/tenant/organization:10 |
| /admin/coursera/health | page |  | [app/admin/coursera/health/page.tsx](../../../app/admin/coursera/health/page.tsx) | @/lib/auth/server:10, @/lib/tenant/adminPageScope:11 |
| /admin/coursera/learners/\[userId\] | page |  | [app/admin/coursera/learners/\[userId\]/page.tsx](../../../app/admin/coursera/learners/%5BuserId%5D/page.tsx) | @/lib/tenant/organization:5, @/lib/auth/roles:6, @/lib/auth/server:7, @/lib/tenant/adminPageScope:8, @/lib/auth/roles:9 |
| /admin/coursera/learners/unmatched/\[externalEmail\]/events | page |  | [app/admin/coursera/learners/unmatched/\[externalEmail\]/events/page.tsx](../../../app/admin/coursera/learners/unmatched/%5BexternalEmail%5D/events/page.tsx) | @/lib/auth/server:8, @/lib/tenant/adminPageScope:9, @/lib/tenant/organization:10 |
| /admin/coursera/learners/unmatched/\[externalEmail\] | page |  | [app/admin/coursera/learners/unmatched/\[externalEmail\]/page.tsx](../../../app/admin/coursera/learners/unmatched/%5BexternalEmail%5D/page.tsx) | @/lib/auth/server:11, @/lib/tenant/adminPageScope:12, @/lib/tenant/organization:13 |
| /admin/coursera | page |  | [app/admin/coursera/page.tsx](../../../app/admin/coursera/page.tsx) | @/lib/auth/server:22, @/lib/tenant/adminPageScope:23, @/lib/tenant/organization:29 |
| /admin/coursera/provisioning | page |  | [app/admin/coursera/provisioning/page.tsx](../../../app/admin/coursera/provisioning/page.tsx) | @/lib/auth/server:8, @/lib/tenant/adminPageScope:9, @/lib/tenant/organization:10 |
| /admin/crons | loading |  | [app/admin/crons/loading.tsx](../../../app/admin/crons/loading.tsx) |  |
| /admin/crons | page |  | [app/admin/crons/page.tsx](../../../app/admin/crons/page.tsx) | @/lib/auth/server:4, @/lib/tenant/adminPageScope:5 |
| /admin/dashboard | page |  | [app/admin/dashboard/page.tsx](../../../app/admin/dashboard/page.tsx) |  |
| /admin/data-retention | page |  | [app/admin/data-retention/page.tsx](../../../app/admin/data-retention/page.tsx) | @/lib/auth/server:4, @/lib/auth/roles:5 |
| /admin/diagnostics | loading |  | [app/admin/diagnostics/loading.tsx](../../../app/admin/diagnostics/loading.tsx) |  |
| /admin/diagnostics | page |  | [app/admin/diagnostics/page.tsx](../../../app/admin/diagnostics/page.tsx) | @/lib/auth/server:5, @/lib/tenant/adminPageScope:6 |
| /admin/email-crons | page |  | [app/admin/email-crons/page.tsx](../../../app/admin/email-crons/page.tsx) | @/lib/auth/server:4, @/lib/tenant/adminPageScope:5 |
| /admin/email-templates | loading |  | [app/admin/email-templates/loading.tsx](../../../app/admin/email-templates/loading.tsx) |  |
| /admin/email-templates | page |  | [app/admin/email-templates/page.tsx](../../../app/admin/email-templates/page.tsx) | @/lib/auth/server:4, @/lib/tenant/adminPageScope:5 |
| /admin/employer-screening-packs | page |  | [app/admin/employer-screening-packs/page.tsx](../../../app/admin/employer-screening-packs/page.tsx) | @/lib/auth/server:5, @/lib/tenant/adminPageScope:6 |
| /admin/employers/\[id\] | page |  | [app/admin/employers/\[id\]/page.tsx](../../../app/admin/employers/%5Bid%5D/page.tsx) | @/lib/auth/server:5, @/lib/tenant/adminPageScope:6 |
| /admin/employers | loading |  | [app/admin/employers/loading.tsx](../../../app/admin/employers/loading.tsx) |  |
| /admin/employers | page |  | [app/admin/employers/page.tsx](../../../app/admin/employers/page.tsx) | @/lib/auth/server:6, @/lib/auth/roles:7, @/lib/tenant/adminPageScope:8 |
| /admin | error |  | [app/admin/error.tsx](../../../app/admin/error.tsx) |  |
| /admin/exports | loading |  | [app/admin/exports/loading.tsx](../../../app/admin/exports/loading.tsx) |  |
| /admin/exports | page |  | [app/admin/exports/page.tsx](../../../app/admin/exports/page.tsx) | @/lib/auth/server:7, @/lib/tenant/adminPageScope:8 |
| /admin/feature-flags | loading |  | [app/admin/feature-flags/loading.tsx](../../../app/admin/feature-flags/loading.tsx) |  |
| /admin/feature-flags | page |  | [app/admin/feature-flags/page.tsx](../../../app/admin/feature-flags/page.tsx) | @/lib/auth/server:4, @/lib/tenant/adminPageScope:5 |
| /admin/feedback | loading |  | [app/admin/feedback/loading.tsx](../../../app/admin/feedback/loading.tsx) |  |
| /admin/feedback | page |  | [app/admin/feedback/page.tsx](../../../app/admin/feedback/page.tsx) | @/lib/auth/server:4, @/lib/tenant/adminPageScope:5 |
| /admin/growth | page |  | [app/admin/growth/page.tsx](../../../app/admin/growth/page.tsx) | @/lib/auth/server:27, @/lib/tenant/adminPageScope:28, @/lib/tenant/organization:32 |
| /admin/health | page |  | [app/admin/health/page.tsx](../../../app/admin/health/page.tsx) |  |
| /admin/invites | layout |  | [app/admin/invites/layout.tsx](../../../app/admin/invites/layout.tsx) |  |
| /admin/invites | loading |  | [app/admin/invites/loading.tsx](../../../app/admin/invites/loading.tsx) |  |
| /admin/invites/new | loading |  | [app/admin/invites/new/loading.tsx](../../../app/admin/invites/new/loading.tsx) |  |
| /admin/invites/new | page |  | [app/admin/invites/new/page.tsx](../../../app/admin/invites/new/page.tsx) | @/lib/auth/server:5, @/lib/tenant/adminPageScope:6 |
| /admin/invites | page |  | [app/admin/invites/page.tsx](../../../app/admin/invites/page.tsx) | @/lib/auth/server:6, @/lib/tenant/adminPageScope:8 |
| /admin/jobs/\[id\] | page |  | [app/admin/jobs/\[id\]/page.tsx](../../../app/admin/jobs/%5Bid%5D/page.tsx) | @/lib/auth/server:4, @/lib/tenant/adminPageScope:5 |
| /admin/jobs | loading |  | [app/admin/jobs/loading.tsx](../../../app/admin/jobs/loading.tsx) |  |
| /admin/jobs | page |  | [app/admin/jobs/page.tsx](../../../app/admin/jobs/page.tsx) | @/lib/auth/server:6, @/lib/tenant/adminPageScope:7 |
| /admin | layout |  | [app/admin/layout.tsx](../../../app/admin/layout.tsx) | @/lib/auth/server:6, @/lib/tenant/adminPageScope:7, @/lib/auth/portalRoleSwitcher:8 |
| /admin | loading |  | [app/admin/loading.tsx](../../../app/admin/loading.tsx) |  |
| /admin/members/\[id\]/billing | page |  | [app/admin/members/\[id\]/billing/page.tsx](../../../app/admin/members/%5Bid%5D/billing/page.tsx) | @/lib/auth/server:5, @/lib/tenant/adminPageScope:6 |
| /admin/members/\[id\]/lifecycle | page |  | [app/admin/members/\[id\]/lifecycle/page.tsx](../../../app/admin/members/%5Bid%5D/lifecycle/page.tsx) | @/lib/auth/server:6, @/lib/tenant/adminPageScope:7, @/lib/tenant/organization:8 |
| /admin/members/\[id\] | page |  | [app/admin/members/\[id\]/page.tsx](../../../app/admin/members/%5Bid%5D/page.tsx) | @/lib/auth/server:8, @/lib/tenant/adminPageScope:9 |
| /admin/members/\[id\]/readiness | page |  | [app/admin/members/\[id\]/readiness/page.tsx](../../../app/admin/members/%5Bid%5D/readiness/page.tsx) | @/lib/auth/server:7, @/lib/tenant/adminPageScope:8, @/lib/tenant/organization:10 |
| /admin/members/\[id\]/stakeholder | page |  | [app/admin/members/\[id\]/stakeholder/page.tsx](../../../app/admin/members/%5Bid%5D/stakeholder/page.tsx) | @/lib/auth/server:7, @/lib/tenant/adminPageScope:8, @/lib/tenant/organization:12 |
| /admin/members/duplicates | page |  | [app/admin/members/duplicates/page.tsx](../../../app/admin/members/duplicates/page.tsx) | @/lib/auth/server:5, @/lib/tenant/adminPageScope:6, @/lib/auth/roles:7, @/lib/tenant/organization:8 |
| /admin/members/interview-ready | loading |  | [app/admin/members/interview-ready/loading.tsx](../../../app/admin/members/interview-ready/loading.tsx) |  |
| /admin/members/interview-ready | page |  | [app/admin/members/interview-ready/page.tsx](../../../app/admin/members/interview-ready/page.tsx) | @/lib/auth/server:4, @/lib/tenant/adminPageScope:5 |
| /admin/members/job-ready | page |  | [app/admin/members/job-ready/page.tsx](../../../app/admin/members/job-ready/page.tsx) | @/lib/auth/server:5, @/lib/tenant/adminPageScope:6 |
| /admin/members | loading |  | [app/admin/members/loading.tsx](../../../app/admin/members/loading.tsx) |  |
| /admin/members/merge | page |  | [app/admin/members/merge/page.tsx](../../../app/admin/members/merge/page.tsx) | @/lib/auth/server:4, @/lib/tenant/adminPageScope:5 |
| /admin/members/new | loading |  | [app/admin/members/new/loading.tsx](../../../app/admin/members/new/loading.tsx) |  |
| /admin/members/new | page |  | [app/admin/members/new/page.tsx](../../../app/admin/members/new/page.tsx) | @/lib/auth/server:4, @/lib/tenant/adminPageScope:5 |
| /admin/members | page |  | [app/admin/members/page.tsx](../../../app/admin/members/page.tsx) | @/lib/auth/server:7, @/lib/tenant/adminPageScope:8 |
| /admin/members/training | page |  | [app/admin/members/training/page.tsx](../../../app/admin/members/training/page.tsx) | @/lib/auth/server:7, @/lib/tenant/adminPageScope:8 |
| /admin/mentors | loading |  | [app/admin/mentors/loading.tsx](../../../app/admin/mentors/loading.tsx) |  |
| /admin/mentors | page |  | [app/admin/mentors/page.tsx](../../../app/admin/mentors/page.tsx) | @/lib/auth/server:6, @/lib/tenant/adminPageScope:7, @/lib/tenant/adminPageScope:198 |
| /admin/messages | loading |  | [app/admin/messages/loading.tsx](../../../app/admin/messages/loading.tsx) |  |
| /admin/messages | page |  | [app/admin/messages/page.tsx](../../../app/admin/messages/page.tsx) | @/lib/auth/server:4, @/lib/auth/roles:5 |
| /admin/metrics | loading |  | [app/admin/metrics/loading.tsx](../../../app/admin/metrics/loading.tsx) |  |
| /admin/metrics | page |  | [app/admin/metrics/page.tsx](../../../app/admin/metrics/page.tsx) | @/lib/auth/server:6, @/lib/tenant/adminPageScope:7, @/lib/tenant/organization:9 |
| /admin | not-found |  | [app/admin/not-found.tsx](../../../app/admin/not-found.tsx) |  |
| /admin/outcomes/board.pdf | route | GET | [app/admin/outcomes/board.pdf/route.ts](../../../app/admin/outcomes/board.pdf/route.ts) | @/lib/auth/server:2, @/lib/tenant/adminPageScope:3, @/lib/tenant/organization:5 |
| /admin/outcomes | loading |  | [app/admin/outcomes/loading.tsx](../../../app/admin/outcomes/loading.tsx) |  |
| /admin/outcomes/methodology | page |  | [app/admin/outcomes/methodology/page.tsx](../../../app/admin/outcomes/methodology/page.tsx) | @/lib/auth/server:9, @/lib/tenant/adminPageScope:10 |
| /admin/outcomes | page |  | [app/admin/outcomes/page.tsx](../../../app/admin/outcomes/page.tsx) | @/lib/auth/server:4, @/lib/tenant/adminPageScope:5, @/lib/tenant/organization:8 |
| /admin/overview | loading |  | [app/admin/overview/loading.tsx](../../../app/admin/overview/loading.tsx) |  |
| /admin/overview | page |  | [app/admin/overview/page.tsx](../../../app/admin/overview/page.tsx) | @/lib/auth/server:24, @/lib/tenant/adminPageScope:25, @/lib/auth/roles:26 |
| /admin | page |  | [app/admin/page.tsx](../../../app/admin/page.tsx) | @/lib/auth/server:5, @/lib/tenant/adminPageScope:6, @/lib/tenant/organization:9 |
| /admin/partners/\[id\] | page |  | [app/admin/partners/\[id\]/page.tsx](../../../app/admin/partners/%5Bid%5D/page.tsx) | @/lib/auth/server:7, @/lib/tenant/adminPageScope:8, @/lib/tenant/organization:9, @/lib/tenant/withTenantScope:10 |
| /admin/partners/\[id\]/quarterly-outcomes | page |  | [app/admin/partners/\[id\]/quarterly-outcomes/page.tsx](../../../app/admin/partners/%5Bid%5D/quarterly-outcomes/page.tsx) | @/lib/auth/server:3, @/lib/tenant/adminPageScope:4, @/lib/tenant/organization:6, @/lib/tenant/withTenantScope:7 |
| /admin/partners | loading |  | [app/admin/partners/loading.tsx](../../../app/admin/partners/loading.tsx) |  |
| /admin/partners/new | loading |  | [app/admin/partners/new/loading.tsx](../../../app/admin/partners/new/loading.tsx) |  |
| /admin/partners/new | page |  | [app/admin/partners/new/page.tsx](../../../app/admin/partners/new/page.tsx) |  |
| /admin/partners | page |  | [app/admin/partners/page.tsx](../../../app/admin/partners/page.tsx) | @/lib/auth/server:5, @/lib/tenant/adminPageScope:6, @/lib/auth/roles:7, @/lib/tenant/organization:8, @/lib/tenant/withTenantScope:9, @/lib/tenant/adminPageScope:33, @/lib/tenant/adminPageScope:81 |
| /admin/pipeline | loading |  | [app/admin/pipeline/loading.tsx](../../../app/admin/pipeline/loading.tsx) |  |
| /admin/pipeline | page |  | [app/admin/pipeline/page.tsx](../../../app/admin/pipeline/page.tsx) | @/lib/auth/server:5, @/lib/tenant/adminPageScope:6, @/lib/tenant/organization:7, @/lib/tenant/withTenantScope:8 |
| /admin/placement-surveys | page |  | [app/admin/placement-surveys/page.tsx](../../../app/admin/placement-surveys/page.tsx) | @/lib/auth/server:4, @/lib/tenant/adminPageScope:5, @/lib/tenant/adminPageScope:42 |
| /admin/placements | loading |  | [app/admin/placements/loading.tsx](../../../app/admin/placements/loading.tsx) |  |
| /admin/placements/new | loading |  | [app/admin/placements/new/loading.tsx](../../../app/admin/placements/new/loading.tsx) |  |
| /admin/placements/new | page |  | [app/admin/placements/new/page.tsx](../../../app/admin/placements/new/page.tsx) |  |
| /admin/placements | page |  | [app/admin/placements/page.tsx](../../../app/admin/placements/page.tsx) | @/lib/auth/server:6, @/lib/tenant/adminPageScope:7 |
| /admin/placements/retention | page |  | [app/admin/placements/retention/page.tsx](../../../app/admin/placements/retention/page.tsx) | @/lib/auth/server:6, @/lib/tenant/adminPageScope:7 |
| /admin/program-change-requests | loading |  | [app/admin/program-change-requests/loading.tsx](../../../app/admin/program-change-requests/loading.tsx) |  |
| /admin/program-change-requests | page |  | [app/admin/program-change-requests/page.tsx](../../../app/admin/program-change-requests/page.tsx) | @/lib/auth/server:4, @/lib/tenant/adminPageScope:5 |
| /admin/programs | loading |  | [app/admin/programs/loading.tsx](../../../app/admin/programs/loading.tsx) |  |
| /admin/programs | page |  | [app/admin/programs/page.tsx](../../../app/admin/programs/page.tsx) | @/lib/auth/server:6, @/lib/tenant/adminPageScope:7 |
| /admin/reports/quarterly-outcomes | page |  | [app/admin/reports/quarterly-outcomes/page.tsx](../../../app/admin/reports/quarterly-outcomes/page.tsx) | @/lib/auth/server:3, @/lib/tenant/adminPageScope:4 |
| /admin/sessions/\[memberId\]/run | page |  | [app/admin/sessions/\[memberId\]/run/page.tsx](../../../app/admin/sessions/%5BmemberId%5D/run/page.tsx) | @/lib/auth/server:7, @/lib/tenant/adminPageScope:8 |
| /admin/sessions | page |  | [app/admin/sessions/page.tsx](../../../app/admin/sessions/page.tsx) | @/lib/auth/server:4, @/lib/tenant/adminPageScope:5 |
| /admin/sessions/walk-in | page |  | [app/admin/sessions/walk-in/page.tsx](../../../app/admin/sessions/walk-in/page.tsx) | @/lib/auth/server:4, @/lib/tenant/adminPageScope:5 |
| /admin/settings | loading |  | [app/admin/settings/loading.tsx](../../../app/admin/settings/loading.tsx) |  |
| /admin/settings | page |  | [app/admin/settings/page.tsx](../../../app/admin/settings/page.tsx) | @/lib/auth/server:4, @/lib/tenant/adminPageScope:5, @/lib/tenant/organization:8 |
| /admin/students | page |  | [app/admin/students/page.tsx](../../../app/admin/students/page.tsx) | @/lib/auth/server:5, @/lib/tenant/adminPageScope:7 |
| /admin/subgroups/\[id\]/edit | page |  | [app/admin/subgroups/\[id\]/edit/page.tsx](../../../app/admin/subgroups/%5Bid%5D/edit/page.tsx) | @/lib/auth/server:4, @/lib/tenant/adminPageScope:5 |
| /admin/subgroups/\[id\] | page |  | [app/admin/subgroups/\[id\]/page.tsx](../../../app/admin/subgroups/%5Bid%5D/page.tsx) | @/lib/auth/server:3, @/lib/tenant/adminPageScope:4 |
| /admin/subgroups | loading |  | [app/admin/subgroups/loading.tsx](../../../app/admin/subgroups/loading.tsx) |  |
| /admin/subgroups/new | loading |  | [app/admin/subgroups/new/loading.tsx](../../../app/admin/subgroups/new/loading.tsx) |  |
| /admin/subgroups/new | page |  | [app/admin/subgroups/new/page.tsx](../../../app/admin/subgroups/new/page.tsx) | @/lib/auth/server:4, @/lib/tenant/adminPageScope:5 |
| /admin/subgroups | page |  | [app/admin/subgroups/page.tsx](../../../app/admin/subgroups/page.tsx) | @/lib/auth/server:4, @/lib/tenant/adminPageScope:5 |
| /admin/testimonials | loading |  | [app/admin/testimonials/loading.tsx](../../../app/admin/testimonials/loading.tsx) |  |
| /admin/testimonials | page |  | [app/admin/testimonials/page.tsx](../../../app/admin/testimonials/page.tsx) | @/lib/auth/server:4, @/lib/tenant/adminPageScope:5 |
| /admin/training-progress | page |  | [app/admin/training-progress/page.tsx](../../../app/admin/training-progress/page.tsx) | @/lib/auth/server:5, @/lib/tenant/adminPageScope:6, @/lib/tenant/adminPageScope:86 |
| /admin/users/deleted | page |  | [app/admin/users/deleted/page.tsx](../../../app/admin/users/deleted/page.tsx) | @/lib/auth/server:4, @/lib/tenant/adminPageScope:5 |
| /admin/users | loading |  | [app/admin/users/loading.tsx](../../../app/admin/users/loading.tsx) |  |
| /admin/users | page |  | [app/admin/users/page.tsx](../../../app/admin/users/page.tsx) | @/lib/auth/server:6, @/lib/auth/roles:7, @/lib/tenant/adminPageScope:8 |
| /admin/webhook-events | loading |  | [app/admin/webhook-events/loading.tsx](../../../app/admin/webhook-events/loading.tsx) |  |
| /admin/webhook-events | page |  | [app/admin/webhook-events/page.tsx](../../../app/admin/webhook-events/page.tsx) | @/lib/auth/server:5, @/lib/auth/roles:6 |
| /admin/weekly-recap | loading |  | [app/admin/weekly-recap/loading.tsx](../../../app/admin/weekly-recap/loading.tsx) |  |
| /admin/weekly-recap | page |  | [app/admin/weekly-recap/page.tsx](../../../app/admin/weekly-recap/page.tsx) | @/lib/auth/server:5, @/lib/tenant/adminPageScope:6, @/lib/auth/roles:8, @/lib/tenant/organization:9 |
| /admin/what-workforceap-does | page |  | [app/admin/what-workforceap-does/page.tsx](../../../app/admin/what-workforceap-does/page.tsx) | @/lib/auth/server:5, @/lib/tenant/adminPageScope:6 |
| /admin/wioa-screening | loading |  | [app/admin/wioa-screening/loading.tsx](../../../app/admin/wioa-screening/loading.tsx) |  |
| /admin/wioa-screening | page |  | [app/admin/wioa-screening/page.tsx](../../../app/admin/wioa-screening/page.tsx) | @/lib/auth/server:5, @/lib/tenant/adminPageScope:7 |
| /api-docs | page |  | [app/api-docs/page.tsx](../../../app/api-docs/page.tsx) | @/lib/auth/server:5, @/lib/auth/roles:6 |
| /api/dashboard/jobs/\[id\]/apply | route | POST | [app/api/(portal)/dashboard/jobs/\[id\]/apply/route.ts](../../../app/api/%28portal%29/dashboard/jobs/%5Bid%5D/apply/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:10 |
| /api/dashboard/jobs/\[id\] | route | GET | [app/api/(portal)/dashboard/jobs/\[id\]/route.ts](../../../app/api/%28portal%29/dashboard/jobs/%5Bid%5D/route.ts) | @/lib/db/withRequestGuc:4 |
| /api/dashboard/jobs | route | GET | [app/api/(portal)/dashboard/jobs/route.ts](../../../app/api/%28portal%29/dashboard/jobs/route.ts) | @/lib/db/withRequestGuc:2 |
| /api/admin/analytics/ai-efficacy | route | GET | [app/api/admin/analytics/ai-efficacy/route.ts](../../../app/api/admin/analytics/ai-efficacy/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/db/withRequestGuc:5, @/lib/tenant/organization:6 |
| /api/admin/analytics/dashboard | route | GET | [app/api/admin/analytics/dashboard/route.ts](../../../app/api/admin/analytics/dashboard/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:4, @/lib/db/withRequestGuc:12 |
| /api/admin/analytics/members | route | GET | [app/api/admin/analytics/members/route.ts](../../../app/api/admin/analytics/members/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:4, @/lib/db/withRequestGuc:6 |
| /api/admin/analytics/placements | route | GET | [app/api/admin/analytics/placements/route.ts](../../../app/api/admin/analytics/placements/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:4, @/lib/db/withRequestGuc:7 |
| /api/admin/analytics/programs | route | GET | [app/api/admin/analytics/programs/route.ts](../../../app/api/admin/analytics/programs/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:4, @/lib/db/withRequestGuc:7 |
| /api/admin/api-docs/openapi | route | GET | [app/api/admin/api-docs/openapi/route.ts](../../../app/api/admin/api-docs/openapi/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:4 |
| /api/admin/applications/bulk-review | route | POST | [app/api/admin/applications/bulk-review/route.ts](../../../app/api/admin/applications/bulk-review/route.ts) | @/lib/auth/server:3, @/lib/rate-limit:4, @/lib/tenant/organization:5, @/lib/db/withRequestGuc:11 |
| /api/admin/blog/\[id\] | route | GET, PATCH, DELETE | [app/api/admin/blog/\[id\]/route.ts](../../../app/api/admin/blog/%5Bid%5D/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/db/withRequestGuc:7 |
| /api/admin/blog/ai/draft | route | POST | [app/api/admin/blog/ai/draft/route.ts](../../../app/api/admin/blog/ai/draft/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/rate-limit:7, @/lib/db/withRequestGuc:9 |
| /api/admin/blog/ai/from-ideas | route | POST | [app/api/admin/blog/ai/from-ideas/route.ts](../../../app/api/admin/blog/ai/from-ideas/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/rate-limit:6, @/lib/db/withRequestGuc:8 |
| /api/admin/blog/ai/review | route | POST | [app/api/admin/blog/ai/review/route.ts](../../../app/api/admin/blog/ai/review/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/rate-limit:5, @/lib/db/withRequestGuc:6 |
| /api/admin/blog/ai/suggest-topics | route | POST | [app/api/admin/blog/ai/suggest-topics/route.ts](../../../app/api/admin/blog/ai/suggest-topics/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/rate-limit:8, @/lib/db/withRequestGuc:10 |
| /api/admin/blog/generate | route | POST | [app/api/admin/blog/generate/route.ts](../../../app/api/admin/blog/generate/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/rate-limit:5, @/lib/db/withRequestGuc:6 |
| /api/admin/blog | route | POST | [app/api/admin/blog/route.ts](../../../app/api/admin/blog/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/db/withRequestGuc:7 |
| /api/admin/certifications/review | route | POST | [app/api/admin/certifications/review/route.ts](../../../app/api/admin/certifications/review/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:4, @/lib/tenant/withTenantScope:5, @/lib/db/withRequestGuc:6 |
| /api/admin/chapters | route | GET, POST | [app/api/admin/chapters/route.ts](../../../app/api/admin/chapters/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:4, @/lib/tenant/withTenantScope:5, @/lib/db/withRequestGuc:7 |
| /api/admin/cohort-export | route | GET | [app/api/admin/cohort-export/route.ts](../../../app/api/admin/cohort-export/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:16, @/lib/db/withRequestGuc:18 |
| /api/admin/counselors | route | GET, POST | [app/api/admin/counselors/route.ts](../../../app/api/admin/counselors/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/withTenantScope:6, @/lib/tenant/organization:7, @/lib/db/withRequestGuc:9 |
| /api/admin/coursera/auto-heal | route | POST, GET | [app/api/admin/coursera/auto-heal/route.ts](../../../app/api/admin/coursera/auto-heal/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:7 |
| /api/admin/coursera/b4b-bindings-suggestions | route | GET | [app/api/admin/coursera/b4b-bindings-suggestions/route.ts](../../../app/api/admin/coursera/b4b-bindings-suggestions/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/organization:8, @/lib/db/withRequestGuc:9 |
| /api/admin/coursera/b4b-programs | route | GET | [app/api/admin/coursera/b4b-programs/route.ts](../../../app/api/admin/coursera/b4b-programs/route.ts) | @/lib/auth/server:4, @/lib/auth/roles:5, @/lib/db/withRequestGuc:8 |
| /api/admin/coursera/backfill-orphans | route | POST | [app/api/admin/coursera/backfill-orphans/route.ts](../../../app/api/admin/coursera/backfill-orphans/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:5, @/lib/db/withRequestGuc:7 |
| /api/admin/coursera/backfill-xapi | route | GET, POST | [app/api/admin/coursera/backfill-xapi/route.ts](../../../app/api/admin/coursera/backfill-xapi/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:4, @/lib/tenant/organization:5, @/lib/db/withRequestGuc:11 |
| /api/admin/coursera/canonical-course-mappings | route | POST, DELETE | [app/api/admin/coursera/canonical-course-mappings/route.ts](../../../app/api/admin/coursera/canonical-course-mappings/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:7, @/lib/db/withRequestGuc:9 |
| /api/admin/coursera/csv-import | route | POST | [app/api/admin/coursera/csv-import/route.ts](../../../app/api/admin/coursera/csv-import/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:4, @/lib/db/withRequestGuc:14 |
| /api/admin/coursera/enroll-member | route | POST | [app/api/admin/coursera/enroll-member/route.ts](../../../app/api/admin/coursera/enroll-member/route.ts) | @/lib/auth/server:4, @/lib/auth/roles:5, @/lib/tenant/withTenantScope:6, @/lib/tenant/organization:7, @/lib/tenant/adminSubjectAccess:8, @/lib/db/withRequestGuc:9 |
| /api/admin/coursera/enrollment-pipeline | route | GET | [app/api/admin/coursera/enrollment-pipeline/route.ts](../../../app/api/admin/coursera/enrollment-pipeline/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/organization:5, @/lib/db/withRequestGuc:6 |
| /api/admin/coursera/ignored-xapi-summary | route | GET | [app/api/admin/coursera/ignored-xapi-summary/route.ts](../../../app/api/admin/coursera/ignored-xapi-summary/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/organization:7, @/lib/db/withRequestGuc:9 |
| /api/admin/coursera/inspect-by-email | route | GET | [app/api/admin/coursera/inspect-by-email/route.ts](../../../app/api/admin/coursera/inspect-by-email/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/organization:15, @/lib/tenant/withTenantScope:16, @/lib/db/withRequestGuc:19 |
| /api/admin/coursera/link-health | route | GET | [app/api/admin/coursera/link-health/route.ts](../../../app/api/admin/coursera/link-health/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:4 |
| /api/admin/coursera/map-unmatched | route | POST | [app/api/admin/coursera/map-unmatched/route.ts](../../../app/api/admin/coursera/map-unmatched/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:4, @/lib/tenant/organization:6, @/lib/db/withRequestGuc:9 |
| /api/admin/coursera/mappings | route | GET, POST | [app/api/admin/coursera/mappings/route.ts](../../../app/api/admin/coursera/mappings/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:4, @/lib/tenant/organization:10, @/lib/db/withRequestGuc:13 |
| /api/admin/coursera/members/bulk-approve | route | POST | [app/api/admin/coursera/members/bulk-approve/route.ts](../../../app/api/admin/coursera/members/bulk-approve/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/organization:5, @/lib/db/withRequestGuc:7 |
| /api/admin/coursera/reconcile/add-to-wap | route | POST | [app/api/admin/coursera/reconcile/add-to-wap/route.ts](../../../app/api/admin/coursera/reconcile/add-to-wap/route.ts) | @/lib/auth/server:4, @/lib/auth/roles:5, @/lib/tenant/organization:7, @/lib/tenant/withTenantScope:8, @/lib/auth/passwordReset:13, @/lib/db/withRequestGuc:20 |
| /api/admin/coursera/reconcile | route | GET | [app/api/admin/coursera/reconcile/route.ts](../../../app/api/admin/coursera/reconcile/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/organization:6, @/lib/tenant/withTenantScope:7, @/lib/db/withRequestGuc:9 |
| /api/admin/coursera/seed-canonical-mappings-from-b4b | route | POST | [app/api/admin/coursera/seed-canonical-mappings-from-b4b/route.ts](../../../app/api/admin/coursera/seed-canonical-mappings-from-b4b/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/organization:8, @/lib/db/withRequestGuc:11 |
| /api/admin/coursera/seed-canonical-mappings-from-catalog | route | POST | [app/api/admin/coursera/seed-canonical-mappings-from-catalog/route.ts](../../../app/api/admin/coursera/seed-canonical-mappings-from-catalog/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/organization:7, @/lib/db/withRequestGuc:10 |
| /api/admin/coursera/self-test | route | GET | [app/api/admin/coursera/self-test/route.ts](../../../app/api/admin/coursera/self-test/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:16 |
| /api/admin/coursera/sync-b4b | route | POST | [app/api/admin/coursera/sync-b4b/route.ts](../../../app/api/admin/coursera/sync-b4b/route.ts) | @/lib/auth/server:4, @/lib/auth/roles:5, @/lib/db/withRequestGuc:9 |
| /api/admin/coursera/sync-progress | route | POST | [app/api/admin/coursera/sync-progress/route.ts](../../../app/api/admin/coursera/sync-progress/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:7, @/lib/db/withRequestGuc:9 |
| /api/admin/coursera/sync-user-from-b4b | route | POST | [app/api/admin/coursera/sync-user-from-b4b/route.ts](../../../app/api/admin/coursera/sync-user-from-b4b/route.ts) | @/lib/auth/server:4, @/lib/auth/roles:5, @/lib/tenant/organization:8, @/lib/tenant/withTenantScope:9, @/lib/db/withRequestGuc:11 |
| /api/admin/crons/export | route | GET | [app/api/admin/crons/export/route.ts](../../../app/api/admin/crons/export/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:7 |
| /api/admin/crons | route | GET | [app/api/admin/crons/route.ts](../../../app/api/admin/crons/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:5 |
| /api/admin/crons/summary | route | GET | [app/api/admin/crons/summary/route.ts](../../../app/api/admin/crons/summary/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:4 |
| /api/admin/data-retention | route | GET, POST | [app/api/admin/data-retention/route.ts](../../../app/api/admin/data-retention/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:8 |
| /api/admin/email-crons/\[id\]/dry-run | route | POST | [app/api/admin/email-crons/\[id\]/dry-run/route.ts](../../../app/api/admin/email-crons/%5Bid%5D/dry-run/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:6, @/lib/db/withRequestGuc:18 |
| /api/admin/email-crons/\[id\]/preview | route | GET | [app/api/admin/email-crons/\[id\]/preview/route.ts](../../../app/api/admin/email-crons/%5Bid%5D/preview/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:6, @/lib/db/withRequestGuc:9 |
| /api/admin/email-crons/\[id\]/template-preview | route | GET | [app/api/admin/email-crons/\[id\]/template-preview/route.ts](../../../app/api/admin/email-crons/%5Bid%5D/template-preview/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3 |
| /api/admin/email-crons/\[id\]/toggle | route | POST | [app/api/admin/email-crons/\[id\]/toggle/route.ts](../../../app/api/admin/email-crons/%5Bid%5D/toggle/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:7, @/lib/db/withRequestGuc:11 |
| /api/admin/email-crons/\[id\]/trigger | route | POST | [app/api/admin/email-crons/\[id\]/trigger/route.ts](../../../app/api/admin/email-crons/%5Bid%5D/trigger/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:6, @/lib/db/withRequestGuc:10 |
| /api/admin/email-crons/activate-all | route | POST | [app/api/admin/email-crons/activate-all/route.ts](../../../app/api/admin/email-crons/activate-all/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:7, @/lib/db/withRequestGuc:11 |
| /api/admin/email-crons | route | GET | [app/api/admin/email-crons/route.ts](../../../app/api/admin/email-crons/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:8 |
| /api/admin/email-failures/\[id\]/resend | route | POST | [app/api/admin/email-failures/\[id\]/resend/route.ts](../../../app/api/admin/email-failures/%5Bid%5D/resend/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:14 |
| /api/admin/email-templates/\[id\]/preview | route | POST | [app/api/admin/email-templates/\[id\]/preview/route.ts](../../../app/api/admin/email-templates/%5Bid%5D/preview/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:7 |
| /api/admin/email-templates/\[id\] | route | GET, PATCH | [app/api/admin/email-templates/\[id\]/route.ts](../../../app/api/admin/email-templates/%5Bid%5D/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:8 |
| /api/admin/email-templates/\[id\]/test | route | POST | [app/api/admin/email-templates/\[id\]/test/route.ts](../../../app/api/admin/email-templates/%5Bid%5D/test/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:10 |
| /api/admin/email-templates | route | GET | [app/api/admin/email-templates/route.ts](../../../app/api/admin/email-templates/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:6 |
| /api/admin/employer-context | route | GET, POST | [app/api/admin/employer-context/route.ts](../../../app/api/admin/employer-context/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/db/withRequestGuc:8 |
| /api/admin/employer-screening-packs/\[id\] | route | PATCH, DELETE | [app/api/admin/employer-screening-packs/\[id\]/route.ts](../../../app/api/admin/employer-screening-packs/%5Bid%5D/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/db/withRequestGuc:7 |
| /api/admin/employer-screening-packs | route | GET, POST | [app/api/admin/employer-screening-packs/route.ts](../../../app/api/admin/employer-screening-packs/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/db/withRequestGuc:8 |
| /api/admin/employers/\[id\]/approve | route | POST | [app/api/admin/employers/\[id\]/approve/route.ts](../../../app/api/admin/employers/%5Bid%5D/approve/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/withTenantScope:6, @/lib/tenant/organization:7, @/lib/db/withRequestGuc:12 |
| /api/admin/employers/\[id\]/deactivate | route | POST | [app/api/admin/employers/\[id\]/deactivate/route.ts](../../../app/api/admin/employers/%5Bid%5D/deactivate/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/withTenantScope:4, @/lib/tenant/organization:5, @/lib/db/withRequestGuc:9 |
| /api/admin/employers/\[id\]/reactivate | route | POST | [app/api/admin/employers/\[id\]/reactivate/route.ts](../../../app/api/admin/employers/%5Bid%5D/reactivate/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/withTenantScope:4, @/lib/tenant/organization:5, @/lib/db/withRequestGuc:9 |
| /api/admin/employers/\[id\]/reject | route | POST | [app/api/admin/employers/\[id\]/reject/route.ts](../../../app/api/admin/employers/%5Bid%5D/reject/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/withTenantScope:6, @/lib/tenant/organization:7, @/lib/db/withRequestGuc:11 |
| /api/admin/employers/\[id\]/tier | route | PATCH | [app/api/admin/employers/\[id\]/tier/route.ts](../../../app/api/admin/employers/%5Bid%5D/tier/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/withTenantScope:5, @/lib/tenant/organization:6, @/lib/db/withRequestGuc:9 |
| /api/admin/employers/export | route | GET | [app/api/admin/employers/export/route.ts](../../../app/api/admin/employers/export/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/withTenantScope:7, @/lib/tenant/resolveOrgFromRequest:8, @/lib/db/withRequestGuc:9 |
| /api/admin/employers | route | GET, POST | [app/api/admin/employers/route.ts](../../../app/api/admin/employers/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/withTenantScope:6, @/lib/tenant/resolveOrgFromRequest:7, @/lib/db/withRequestGuc:10 |
| /api/admin/export/eligibility | route | GET | [app/api/admin/export/eligibility/route.ts](../../../app/api/admin/export/eligibility/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/withTenantScope:4, @/lib/tenant/organization:5, @/lib/db/withRequestGuc:7 |
| /api/admin/export/members | route | GET | [app/api/admin/export/members/route.ts](../../../app/api/admin/export/members/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/withTenantScope:4, @/lib/tenant/organization:5, @/lib/db/withRequestGuc:14 |
| /api/admin/feature-flags/\[id\] | route | PATCH, DELETE | [app/api/admin/feature-flags/\[id\]/route.ts](../../../app/api/admin/feature-flags/%5Bid%5D/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:7 |
| /api/admin/feature-flags | route | GET, POST | [app/api/admin/feature-flags/route.ts](../../../app/api/admin/feature-flags/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:7 |
| /api/admin/feedback/export | route | GET | [app/api/admin/feedback/export/route.ts](../../../app/api/admin/feedback/export/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:4 |
| /api/admin/feedback | route | GET | [app/api/admin/feedback/route.ts](../../../app/api/admin/feedback/route.ts) | @/lib/auth/roles:2, @/lib/db/withRequestGuc:7 |
| /api/admin/feedback/summary | route | GET | [app/api/admin/feedback/summary/route.ts](../../../app/api/admin/feedback/summary/route.ts) | @/lib/auth/roles:2, @/lib/db/withRequestGuc:5 |
| /api/admin/funder-program-summary | route | GET | [app/api/admin/funder-program-summary/route.ts](../../../app/api/admin/funder-program-summary/route.ts) | @/lib/auth/server:5, @/lib/auth/roles:6, @/lib/db/withRequestGuc:7, @/lib/tenant/organization:8 |
| /api/admin/health | route | GET | [app/api/admin/health/route.ts](../../../app/api/admin/health/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:6 |
| /api/admin/invites/\[id\]/resend | route | POST | [app/api/admin/invites/\[id\]/resend/route.ts](../../../app/api/admin/invites/%5Bid%5D/resend/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/rate-limit:5, @/lib/tenant/organization:7, @/lib/db/withRequestGuc:12 |
| /api/admin/invites/\[id\]/revoke | route | PATCH | [app/api/admin/invites/\[id\]/revoke/route.ts](../../../app/api/admin/invites/%5Bid%5D/revoke/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:5, @/lib/db/withRequestGuc:9 |
| /api/admin/invites | route | GET, POST | [app/api/admin/invites/route.ts](../../../app/api/admin/invites/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/rate-limit:6, @/lib/tenant/organization:8, @/lib/db/withRequestGuc:13 |
| /api/admin/jobs/\[id\]/approve | route | POST | [app/api/admin/jobs/\[id\]/approve/route.ts](../../../app/api/admin/jobs/%5Bid%5D/approve/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/withTenantScope:5, @/lib/tenant/organization:6, @/lib/db/withRequestGuc:12 |
| /api/admin/jobs/\[id\]/matches | route | GET | [app/api/admin/jobs/\[id\]/matches/route.ts](../../../app/api/admin/jobs/%5Bid%5D/matches/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:7, @/lib/tenant/organization:9, @/lib/tenant/withTenantScope:10 |
| /api/admin/jobs/\[id\]/reject | route | POST | [app/api/admin/jobs/\[id\]/reject/route.ts](../../../app/api/admin/jobs/%5Bid%5D/reject/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/withTenantScope:4, @/lib/tenant/organization:5, @/lib/db/withRequestGuc:11 |
| /api/admin/jobs/\[id\] | route | GET | [app/api/admin/jobs/\[id\]/route.ts](../../../app/api/admin/jobs/%5Bid%5D/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/withTenantScope:4, @/lib/tenant/organization:5, @/lib/db/withRequestGuc:6 |
| /api/admin/jobs/\[id\]/suggest-matches | route | POST | [app/api/admin/jobs/\[id\]/suggest-matches/route.ts](../../../app/api/admin/jobs/%5Bid%5D/suggest-matches/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/organization:10, @/lib/tenant/withTenantScope:11, @/lib/db/withRequestGuc:13 |
| /api/admin/jobs | route | GET | [app/api/admin/jobs/route.ts](../../../app/api/admin/jobs/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/withTenantScope:4, @/lib/tenant/organization:5, @/lib/db/withRequestGuc:7 |
| /api/admin/lifecycle/drift | route | GET | [app/api/admin/lifecycle/drift/route.ts](../../../app/api/admin/lifecycle/drift/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:4, @/lib/db/withRequestGuc:7 |
| /api/admin/lifecycle/member/\[id\] | route | GET | [app/api/admin/lifecycle/member/\[id\]/route.ts](../../../app/api/admin/lifecycle/member/%5Bid%5D/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:5, @/lib/db/withRequestGuc:7 |
| /api/admin/members/\[id\]/award-points | route | POST | [app/api/admin/members/\[id\]/award-points/route.ts](../../../app/api/admin/members/%5Bid%5D/award-points/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/withTenantScope:5, @/lib/tenant/organization:6, @/lib/db/withRequestGuc:7 |
| /api/admin/members/\[id\]/billing-packets | route | GET, POST | [app/api/admin/members/\[id\]/billing-packets/route.ts](../../../app/api/admin/members/%5Bid%5D/billing-packets/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:5, @/lib/tenant/adminSubjectAccess:6, @/lib/db/withRequestGuc:7 |
| /api/admin/members/\[id\]/consent | route | PATCH | [app/api/admin/members/\[id\]/consent/route.ts](../../../app/api/admin/members/%5Bid%5D/consent/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/db/withRequestGuc:5, @/lib/tenant/withTenantScope:6, @/lib/tenant/organization:7 |
| /api/admin/members/\[id\]/counselor | route | POST | [app/api/admin/members/\[id\]/counselor/route.ts](../../../app/api/admin/members/%5Bid%5D/counselor/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/organization:9, @/lib/db/withRequestGuc:11 |
| /api/admin/members/\[id\]/coursera-enrollment-approval | route | PATCH | [app/api/admin/members/\[id\]/coursera-enrollment-approval/route.ts](../../../app/api/admin/members/%5Bid%5D/coursera-enrollment-approval/route.ts) | @/lib/auth/server:4, @/lib/auth/roles:5, @/lib/tenant/organization:6, @/lib/tenant/adminSubjectAccess:7, @/lib/db/withRequestGuc:9 |
| /api/admin/members/\[id\]/delete | route | POST | [app/api/admin/members/\[id\]/delete/route.ts](../../../app/api/admin/members/%5Bid%5D/delete/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/admin/authUserLifecycle:6, @/lib/tenant/withTenantScope:7, @/lib/auth/roleAccess:8, @/lib/tenant/organization:10, @/lib/db/withRequestGuc:12, @/lib/auth/roles:15 |
| /api/admin/members/\[id\]/edit-profile | route | PATCH | [app/api/admin/members/\[id\]/edit-profile/route.ts](../../../app/api/admin/members/%5Bid%5D/edit-profile/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/withTenantScope:6, @/lib/tenant/organization:7, @/lib/db/withRequestGuc:10 |
| /api/admin/members/\[id\]/enrollment-funding | route | POST | [app/api/admin/members/\[id\]/enrollment-funding/route.ts](../../../app/api/admin/members/%5Bid%5D/enrollment-funding/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/organization:6, @/lib/db/withRequestGuc:9 |
| /api/admin/members/\[id\]/erase | route | POST | [app/api/admin/members/\[id\]/erase/route.ts](../../../app/api/admin/members/%5Bid%5D/erase/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/withTenantScope:8, @/lib/tenant/organization:9, @/lib/auth/roleAccess:10, @/lib/db/withRequestGuc:14 |
| /api/admin/members/\[id\]/export-data | route | GET | [app/api/admin/members/\[id\]/export-data/route.ts](../../../app/api/admin/members/%5Bid%5D/export-data/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:6, @/lib/db/withRequestGuc:9 |
| /api/admin/members/\[id\]/interview | route | PATCH | [app/api/admin/members/\[id\]/interview/route.ts](../../../app/api/admin/members/%5Bid%5D/interview/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/organization:6, @/lib/db/withRequestGuc:10 |
| /api/admin/members/\[id\]/messages | route | GET, POST, PATCH | [app/api/admin/members/\[id\]/messages/route.ts](../../../app/api/admin/members/%5Bid%5D/messages/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:5, @/lib/tenant/organization:6 |
| /api/admin/members/\[id\]/notes | route | GET, POST | [app/api/admin/members/\[id\]/notes/route.ts](../../../app/api/admin/members/%5Bid%5D/notes/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/withTenantScope:5, @/lib/tenant/organization:6, @/lib/db/withRequestGuc:12 |
| /api/admin/members/\[id\]/partner | route | PATCH | [app/api/admin/members/\[id\]/partner/route.ts](../../../app/api/admin/members/%5Bid%5D/partner/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:5, @/lib/db/withRequestGuc:9 |
| /api/admin/members/\[id\]/pipeline-stage | route | PATCH | [app/api/admin/members/\[id\]/pipeline-stage/route.ts](../../../app/api/admin/members/%5Bid%5D/pipeline-stage/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/withTenantScope:5, @/lib/tenant/organization:6, @/lib/db/withRequestGuc:11 |
| /api/admin/members/\[id\]/placed-outcome | route | POST | [app/api/admin/members/\[id\]/placed-outcome/route.ts](../../../app/api/admin/members/%5Bid%5D/placed-outcome/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/organization:6, @/lib/db/withRequestGuc:13 |
| /api/admin/members/\[id\]/program | route | PATCH | [app/api/admin/members/\[id\]/program/route.ts](../../../app/api/admin/members/%5Bid%5D/program/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:5, @/lib/tenant/adminSubjectAccess:6, @/lib/db/withRequestGuc:16 |
| /api/admin/members/\[id\]/readiness | route | GET, PATCH | [app/api/admin/members/\[id\]/readiness/route.ts](../../../app/api/admin/members/%5Bid%5D/readiness/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:5, @/lib/db/withRequestGuc:8 |
| /api/admin/members/\[id\]/reset-assessment | route | POST | [app/api/admin/members/\[id\]/reset-assessment/route.ts](../../../app/api/admin/members/%5Bid%5D/reset-assessment/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/withTenantScope:6, @/lib/tenant/organization:7, @/lib/db/withRequestGuc:9 |
| /api/admin/members/\[id\]/reset-password | route | POST | [app/api/admin/members/\[id\]/reset-password/route.ts](../../../app/api/admin/members/%5Bid%5D/reset-password/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/withTenantScope:4, @/lib/tenant/organization:5, @/lib/auth/passwordReset:6, @/lib/db/withRequestGuc:9 |
| /api/admin/members/\[id\]/resume-urls | route | GET | [app/api/admin/members/\[id\]/resume-urls/route.ts](../../../app/api/admin/members/%5Bid%5D/resume-urls/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:5, @/lib/db/withRequestGuc:9 |
| /api/admin/members/\[id\]/send-eligibility-link | route | POST | [app/api/admin/members/\[id\]/send-eligibility-link/route.ts](../../../app/api/admin/members/%5Bid%5D/send-eligibility-link/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:5, @/lib/tenant/organization:6 |
| /api/admin/members/\[id\]/send-interview-link | route | POST | [app/api/admin/members/\[id\]/send-interview-link/route.ts](../../../app/api/admin/members/%5Bid%5D/send-interview-link/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:5, @/lib/tenant/organization:6 |
| /api/admin/members/\[id\]/skill-checkpoints | route | POST | [app/api/admin/members/\[id\]/skill-checkpoints/route.ts](../../../app/api/admin/members/%5Bid%5D/skill-checkpoints/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/organization:6, @/lib/db/withRequestGuc:14 |
| /api/admin/members/\[id\]/status | route | PATCH | [app/api/admin/members/\[id\]/status/route.ts](../../../app/api/admin/members/%5Bid%5D/status/route.ts) | @/lib/auth/server:3, @/lib/rate-limit:4, @/lib/tenant/organization:5, @/lib/db/withRequestGuc:11 |
| /api/admin/members/\[id\]/subgroup | route | POST, DELETE | [app/api/admin/members/\[id\]/subgroup/route.ts](../../../app/api/admin/members/%5Bid%5D/subgroup/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:5, @/lib/db/withRequestGuc:10 |
| /api/admin/members/\[id\]/summary | route | POST | [app/api/admin/members/\[id\]/summary/route.ts](../../../app/api/admin/members/%5Bid%5D/summary/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:4, @/lib/rate-limit:7, @/lib/db/withRequestGuc:8 |
| /api/admin/members/\[id\]/upload-resume | route | POST | [app/api/admin/members/\[id\]/upload-resume/route.ts](../../../app/api/admin/members/%5Bid%5D/upload-resume/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:25, @/lib/db/withRequestGuc:29 |
| /api/admin/members/\[id\]/wioa-review | route | PATCH | [app/api/admin/members/\[id\]/wioa-review/route.ts](../../../app/api/admin/members/%5Bid%5D/wioa-review/route.ts) | @/lib/auth/server:3, @/lib/tenant/withTenantScope:4, @/lib/tenant/organization:5, @/lib/db/withRequestGuc:17 |
| /api/admin/members/\[id\]/workspace-email | route | POST, DELETE | [app/api/admin/members/\[id\]/workspace-email/route.ts](../../../app/api/admin/members/%5Bid%5D/workspace-email/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/organization:8, @/lib/db/withRequestGuc:11 |
| /api/admin/members/at-risk | route | GET, PATCH | [app/api/admin/members/at-risk/route.ts](../../../app/api/admin/members/at-risk/route.ts) | @/lib/auth/roles:3, @/lib/tenant/organization:4, @/lib/db/withRequestGuc:8 |
| /api/admin/members/bulk-email | route | POST | [app/api/admin/members/bulk-email/route.ts](../../../app/api/admin/members/bulk-email/route.ts) | @/lib/auth/server:5, @/lib/auth/roles:6, @/lib/tenant/organization:17, @/lib/tenant/withTenantScope:18, @/lib/tenant/organizationBranding:19, @/lib/rate-limit:20, @/lib/db/withRequestGuc:21 |
| /api/admin/members/bulk-export | route | POST | [app/api/admin/members/bulk-export/route.ts](../../../app/api/admin/members/bulk-export/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/organization:8, @/lib/tenant/withTenantScope:9, @/lib/db/withRequestGuc:12 |
| /api/admin/members/bulk-update | route | POST | [app/api/admin/members/bulk-update/route.ts](../../../app/api/admin/members/bulk-update/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/organization:8, @/lib/tenant/withTenantScope:9, @/lib/db/withRequestGuc:13 |
| /api/admin/members/create | route | POST | [app/api/admin/members/create/route.ts](../../../app/api/admin/members/create/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:13, @/lib/auth/passwordReset:15, @/lib/db/withRequestGuc:23 |
| /api/admin/members/duplicates | route | GET | [app/api/admin/members/duplicates/route.ts](../../../app/api/admin/members/duplicates/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:4, @/lib/db/withRequestGuc:8 |
| /api/admin/members/enhance-resume | route | POST | [app/api/admin/members/enhance-resume/route.ts](../../../app/api/admin/members/enhance-resume/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/rate-limit:6, @/lib/db/withRequestGuc:7 |
| /api/admin/members/export | route | GET | [app/api/admin/members/export/route.ts](../../../app/api/admin/members/export/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/organization:8, @/lib/tenant/withTenantScope:9, @/lib/db/withRequestGuc:15 |
| /api/admin/members/merge | route | GET, POST | [app/api/admin/members/merge/route.ts](../../../app/api/admin/members/merge/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:7 |
| /api/admin/members/parse-resume | route | POST | [app/api/admin/members/parse-resume/route.ts](../../../app/api/admin/members/parse-resume/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/rate-limit:5, @/lib/db/withRequestGuc:6 |
| /api/admin/members | route | GET | [app/api/admin/members/route.ts](../../../app/api/admin/members/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:5, @/lib/tenant/withTenantScope:6, @/lib/db/withRequestGuc:7 |
| /api/admin/members/send-eligibility-campaign | route | POST | [app/api/admin/members/send-eligibility-campaign/route.ts](../../../app/api/admin/members/send-eligibility-campaign/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/db/withRequestGuc:5, @/lib/tenant/organization:6, @/lib/tenant/withTenantScope:7, @/lib/rate-limit:8 |
| /api/admin/mentors/\[id\] | route | PATCH | [app/api/admin/mentors/\[id\]/route.ts](../../../app/api/admin/mentors/%5Bid%5D/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:7 |
| /api/admin/messages/stats | route | GET | [app/api/admin/messages/stats/route.ts](../../../app/api/admin/messages/stats/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:5 |
| /api/admin/messages/thread/\[threadId\] | route | GET | [app/api/admin/messages/thread/\[threadId\]/route.ts](../../../app/api/admin/messages/thread/%5BthreadId%5D/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:9 |
| /api/admin/messages/thread/\[threadId\]/staff | route | POST, PATCH | [app/api/admin/messages/thread/\[threadId\]/staff/route.ts](../../../app/api/admin/messages/thread/%5BthreadId%5D/staff/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:11 |
| /api/admin/messages/threads | route | GET, POST | [app/api/admin/messages/threads/route.ts](../../../app/api/admin/messages/threads/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:10 |
| /api/admin/metrics | route | GET | [app/api/admin/metrics/route.ts](../../../app/api/admin/metrics/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/organization:7, @/lib/db/withRequestGuc:10 |
| /api/admin/milestone-cascades/\[id\]/approve | route | POST | [app/api/admin/milestone-cascades/\[id\]/approve/route.ts](../../../app/api/admin/milestone-cascades/%5Bid%5D/approve/route.ts) | @/lib/auth/server:4, @/lib/auth/roles:5, @/lib/tenant/organization:6, @/lib/db/withRequestGuc:17 |
| /api/admin/milestone-cascades/\[id\]/dismiss | route | POST | [app/api/admin/milestone-cascades/\[id\]/dismiss/route.ts](../../../app/api/admin/milestone-cascades/%5Bid%5D/dismiss/route.ts) | @/lib/auth/server:4, @/lib/auth/roles:5, @/lib/tenant/organization:6, @/lib/db/withRequestGuc:11 |
| /api/admin/milestone-cascades/synthetic | route | POST | [app/api/admin/milestone-cascades/synthetic/route.ts](../../../app/api/admin/milestone-cascades/synthetic/route.ts) | @/lib/auth/server:4, @/lib/auth/roles:5, @/lib/tenant/organization:6, @/lib/db/withRequestGuc:10 |
| /api/admin/onet/auto-match | route | GET | [app/api/admin/onet/auto-match/route.ts](../../../app/api/admin/onet/auto-match/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:9 |
| /api/admin/onet/mappings | route | GET, POST, DELETE | [app/api/admin/onet/mappings/route.ts](../../../app/api/admin/onet/mappings/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/db/withRequestGuc:10 |
| /api/admin/onet/search | route | GET | [app/api/admin/onet/search/route.ts](../../../app/api/admin/onet/search/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:5 |
| /api/admin/onet/sync | route | POST | [app/api/admin/onet/sync/route.ts](../../../app/api/admin/onet/sync/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4 |
| /api/admin/organization/logo | route | POST | [app/api/admin/organization/logo/route.ts](../../../app/api/admin/organization/logo/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:7, @/lib/db/withRequestGuc:9 |
| /api/admin/outcomes/pdf | route | GET | [app/api/admin/outcomes/pdf/route.ts](../../../app/api/admin/outcomes/pdf/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:5, @/lib/db/withRequestGuc:8 |
| /api/admin/outcomes | route | GET | [app/api/admin/outcomes/route.ts](../../../app/api/admin/outcomes/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/organization:6, @/lib/db/withRequestGuc:10 |
| /api/admin/outcomes/snapshot | route | GET | [app/api/admin/outcomes/snapshot/route.ts](../../../app/api/admin/outcomes/snapshot/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:4, @/lib/tenant/organization:6 |
| /api/admin/partner-context | route | GET, POST | [app/api/admin/partner-context/route.ts](../../../app/api/admin/partner-context/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/db/withRequestGuc:8 |
| /api/admin/partner-payouts | route | GET | [app/api/admin/partner-payouts/route.ts](../../../app/api/admin/partner-payouts/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/withTenantScope:4, @/lib/tenant/organization:5, @/lib/db/withRequestGuc:8 |
| /api/admin/partners/\[id\]/approve | route | POST | [app/api/admin/partners/\[id\]/approve/route.ts](../../../app/api/admin/partners/%5Bid%5D/approve/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/withTenantScope:9, @/lib/tenant/organization:10, @/lib/db/withRequestGuc:12, @/lib/auth/roles:15 |
| /api/admin/partners/\[id\]/deactivate | route | POST | [app/api/admin/partners/\[id\]/deactivate/route.ts](../../../app/api/admin/partners/%5Bid%5D/deactivate/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/withTenantScope:5, @/lib/tenant/organization:6, @/lib/db/withRequestGuc:11 |
| /api/admin/partners/\[id\]/invite | route | POST | [app/api/admin/partners/\[id\]/invite/route.ts](../../../app/api/admin/partners/%5Bid%5D/invite/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/withTenantScope:5, @/lib/tenant/organization:6, @/lib/auth/supabaseAdminUsers:8, @/lib/auth/authProviderError:9, @/lib/db/withRequestGuc:17 |
| /api/admin/partners/\[id\]/quarterly-outcomes | route | GET | [app/api/admin/partners/\[id\]/quarterly-outcomes/route.ts](../../../app/api/admin/partners/%5Bid%5D/quarterly-outcomes/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:4, @/lib/tenant/withTenantScope:5, @/lib/db/withRequestGuc:11 |
| /api/admin/partners/\[id\]/reactivate | route | POST | [app/api/admin/partners/\[id\]/reactivate/route.ts](../../../app/api/admin/partners/%5Bid%5D/reactivate/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/withTenantScope:5, @/lib/tenant/organization:6, @/lib/db/withRequestGuc:10 |
| /api/admin/partners/\[id\]/reject | route | POST | [app/api/admin/partners/\[id\]/reject/route.ts](../../../app/api/admin/partners/%5Bid%5D/reject/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/withTenantScope:5, @/lib/tenant/organization:6, @/lib/db/withRequestGuc:14 |
| /api/admin/partners/\[id\] | route | PATCH | [app/api/admin/partners/\[id\]/route.ts](../../../app/api/admin/partners/%5Bid%5D/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/withTenantScope:6, @/lib/tenant/organization:7, @/lib/db/withRequestGuc:15 |
| /api/admin/partners/export | route | GET | [app/api/admin/partners/export/route.ts](../../../app/api/admin/partners/export/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:8, @/lib/tenant/withTenantScope:9, @/lib/db/withRequestGuc:10 |
| /api/admin/partners/invite | route | POST | [app/api/admin/partners/invite/route.ts](../../../app/api/admin/partners/invite/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/db/withRequestGuc:11 |
| /api/admin/partners | route | GET, POST | [app/api/admin/partners/route.ts](../../../app/api/admin/partners/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/withTenantScope:6, @/lib/tenant/organization:7, @/lib/db/withRequestGuc:15 |
| /api/admin/pipeline/at-risk-stats | route | GET | [app/api/admin/pipeline/at-risk-stats/route.ts](../../../app/api/admin/pipeline/at-risk-stats/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:4, @/lib/db/withRequestGuc:8 |
| /api/admin/pipeline | route | GET | [app/api/admin/pipeline/route.ts](../../../app/api/admin/pipeline/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/withTenantScope:4, @/lib/tenant/organization:5, @/lib/db/withRequestGuc:7 |
| /api/admin/pipeline/stale | route | GET | [app/api/admin/pipeline/stale/route.ts](../../../app/api/admin/pipeline/stale/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:4, @/lib/db/withRequestGuc:6 |
| /api/admin/pipeline/surveys | route | GET | [app/api/admin/pipeline/surveys/route.ts](../../../app/api/admin/pipeline/surveys/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:4, @/lib/db/withRequestGuc:6 |
| /api/admin/placement-surveys/resend | route | POST | [app/api/admin/placement-surveys/resend/route.ts](../../../app/api/admin/placement-surveys/resend/route.ts) | @/lib/auth/server:4, @/lib/auth/roles:5, @/lib/tenant/organization:6, @/lib/security/placementSurveyToken:8, @/lib/db/withRequestGuc:14 |
| /api/admin/placement-surveys | route | GET | [app/api/admin/placement-surveys/route.ts](../../../app/api/admin/placement-surveys/route.ts) | @/lib/auth/roles:3, @/lib/tenant/organization:4, @/lib/db/withRequestGuc:6 |
| /api/admin/placements | route | GET, POST, PATCH | [app/api/admin/placements/route.ts](../../../app/api/admin/placements/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/withTenantScope:5, @/lib/tenant/organization:11, @/lib/db/withRequestGuc:15 |
| /api/admin/program-change-requests/\[id\] | route | PATCH | [app/api/admin/program-change-requests/\[id\]/route.ts](../../../app/api/admin/program-change-requests/%5Bid%5D/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/organization:5, @/lib/db/withRequestGuc:9 |
| /api/admin/program-change-requests | route | GET | [app/api/admin/program-change-requests/route.ts](../../../app/api/admin/program-change-requests/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:4, @/lib/db/withRequestGuc:7 |
| /api/admin/programs/catalog | route | GET, POST, PATCH | [app/api/admin/programs/catalog/route.ts](../../../app/api/admin/programs/catalog/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/withTenantScope:5, @/lib/tenant/organization:6, @/lib/db/withRequestGuc:10 |
| /api/admin/programs/export-twc | route | GET | [app/api/admin/programs/export-twc/route.ts](../../../app/api/admin/programs/export-twc/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/withTenantScope:4, @/lib/tenant/organization:5, @/lib/db/withRequestGuc:6 |
| /api/admin/reports/quarterly-outcomes | route | GET | [app/api/admin/reports/quarterly-outcomes/route.ts](../../../app/api/admin/reports/quarterly-outcomes/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:4, @/lib/db/withRequestGuc:10 |
| /api/admin/reports/wioa/generate | route | POST | [app/api/admin/reports/wioa/generate/route.ts](../../../app/api/admin/reports/wioa/generate/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:5 |
| /api/admin/reports/wioa | route | GET | [app/api/admin/reports/wioa/route.ts](../../../app/api/admin/reports/wioa/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/withTenantScope:4, @/lib/tenant/organization:5, @/lib/db/withRequestGuc:11 |
| /api/admin/search | route | GET | [app/api/admin/search/route.ts](../../../app/api/admin/search/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:5, @/lib/db/withRequestGuc:6 |
| /api/admin/settings/organization | route | GET, PATCH | [app/api/admin/settings/organization/route.ts](../../../app/api/admin/settings/organization/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/organization:7, @/lib/db/withRequestGuc:9 |
| /api/admin/subgroups/\[id\]/members | route | GET | [app/api/admin/subgroups/\[id\]/members/route.ts](../../../app/api/admin/subgroups/%5Bid%5D/members/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:11 |
| /api/admin/subgroups/\[id\] | route | PATCH, DELETE | [app/api/admin/subgroups/\[id\]/route.ts](../../../app/api/admin/subgroups/%5Bid%5D/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:4, @/lib/db/withRequestGuc:8 |
| /api/admin/subgroups | route | GET, POST | [app/api/admin/subgroups/route.ts](../../../app/api/admin/subgroups/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:4, @/lib/db/withRequestGuc:8 |
| /api/admin/testimonials/\[id\] | route | PATCH, DELETE | [app/api/admin/testimonials/\[id\]/route.ts](../../../app/api/admin/testimonials/%5Bid%5D/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:4, @/lib/db/withRequestGuc:7 |
| /api/admin/testimonials | route | GET | [app/api/admin/testimonials/route.ts](../../../app/api/admin/testimonials/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:4, @/lib/db/withRequestGuc:7 |
| /api/admin/token-links | route | POST | [app/api/admin/token-links/route.ts](../../../app/api/admin/token-links/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/db/withRequestGuc:5, @/lib/tenant/organization:7, @/lib/auth/actAsSubject:8, @/lib/rate-limit:12 |
| /api/admin/training-progress/items | route | GET | [app/api/admin/training-progress/items/route.ts](../../../app/api/admin/training-progress/items/route.ts) | @/lib/auth/server:16, @/lib/auth/roles:17, @/lib/tenant/organization:18, @/lib/db/withRequestGuc:22 |
| /api/admin/users/\[id\]/free-email | route | POST | [app/api/admin/users/\[id\]/free-email/route.ts](../../../app/api/admin/users/%5Bid%5D/free-email/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/withTenantScope:4, @/lib/tenant/organization:5, @/lib/admin/authUserLifecycle:7, @/lib/auth/roleAccess:9, @/lib/db/withRequestGuc:12 |
| /api/admin/users/\[id\]/reset-password | route | POST | [app/api/admin/users/\[id\]/reset-password/route.ts](../../../app/api/admin/users/%5Bid%5D/reset-password/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/auth/roleAccess:4, @/lib/tenant/withTenantScope:5, @/lib/tenant/organization:6, @/lib/auth/passwordReset:7, @/lib/db/withRequestGuc:10 |
| /api/admin/users/\[id\]/restore | route | POST | [app/api/admin/users/\[id\]/restore/route.ts](../../../app/api/admin/users/%5Bid%5D/restore/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/auth/roleAccess:5, @/lib/tenant/withTenantScope:7, @/lib/tenant/organization:8, @/lib/admin/authUserLifecycle:13, @/lib/db/withRequestGuc:15 |
| /api/admin/users/\[id\] | route | DELETE, PATCH | [app/api/admin/users/\[id\]/route.ts](../../../app/api/admin/users/%5Bid%5D/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/auth/roleAccess:5, @/lib/tenant/withTenantScope:8, @/lib/tenant/organization:9, @/lib/admin/authUserLifecycle:13, @/lib/db/withRequestGuc:15 |
| /api/admin/users/free-deleted-emails | route | POST | [app/api/admin/users/free-deleted-emails/route.ts](../../../app/api/admin/users/free-deleted-emails/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/withTenantScope:4, @/lib/tenant/organization:5, @/lib/admin/authUserLifecycle:8, @/lib/auth/roleAccess:10, @/lib/db/withRequestGuc:11 |
| /api/admin/users | route | GET, POST | [app/api/admin/users/route.ts](../../../app/api/admin/users/route.ts) | @/lib/auth/server:4, @/lib/auth/roles:5, @/lib/tenant/organization:10, @/lib/tenant/withTenantScope:11, @/lib/auth/passwordReset:18, @/lib/auth/supabaseAdminUsers:19, @/lib/auth/authProviderError:20, @/lib/db/withRequestGuc:26 |
| /api/admin/webhook-events/export | route | GET | [app/api/admin/webhook-events/export/route.ts](../../../app/api/admin/webhook-events/export/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:4 |
| /api/admin/webhooks/process-retries | route | GET, POST | [app/api/admin/webhooks/process-retries/route.ts](../../../app/api/admin/webhooks/process-retries/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/cron/authorizeCronRequest:8 |
| /api/agent-tools/v1/\[tool\] | route | POST | [app/api/agent-tools/v1/\[tool\]/route.ts](../../../app/api/agent-tools/v1/%5Btool%5D/route.ts) |  |
| /api/ai/cover-letter | route | POST | [app/api/ai/cover-letter/route.ts](../../../app/api/ai/cover-letter/route.ts) | @/lib/auth/server:2, @/lib/auth/ensureUser:3, @/lib/rate-limit:4, @/lib/auth/actAsSubject:9, @/lib/db/withRequestGuc:14 |
| /api/ai/elevator-pitch | route | POST | [app/api/ai/elevator-pitch/route.ts](../../../app/api/ai/elevator-pitch/route.ts) | @/lib/auth/server:2, @/lib/auth/ensureUser:3, @/lib/rate-limit:4, @/lib/auth/actAsSubject:12, @/lib/db/withRequestGuc:14 |
| /api/ai/export-pdf | route | POST | [app/api/ai/export-pdf/route.ts](../../../app/api/ai/export-pdf/route.ts) | @/lib/auth/server:5 |
| /api/ai/extract-resume-skills | route | POST | [app/api/ai/extract-resume-skills/route.ts](../../../app/api/ai/extract-resume-skills/route.ts) | @/lib/auth/server:2, @/lib/auth/ensureUser:3, @/lib/rate-limit:8, @/lib/db/withRequestGuc:13 |
| /api/ai/extract-resume-text | route | POST | [app/api/ai/extract-resume-text/route.ts](../../../app/api/ai/extract-resume-text/route.ts) | @/lib/auth/server:2, @/lib/rate-limit:3 |
| /api/ai/gap-analyzer | route | POST | [app/api/ai/gap-analyzer/route.ts](../../../app/api/ai/gap-analyzer/route.ts) | @/lib/auth/server:2, @/lib/auth/ensureUser:3, @/lib/rate-limit:4, @/lib/auth/actAsSubject:9, @/lib/db/withRequestGuc:14 |
| /api/ai/interview-practice | route | POST | [app/api/ai/interview-practice/route.ts](../../../app/api/ai/interview-practice/route.ts) | @/lib/auth/server:2, @/lib/auth/ensureUser:3, @/lib/rate-limit:4, @/lib/auth/actAsSubject:12, @/lib/db/withRequestGuc:15 |
| /api/ai/interview-voice | route | POST | [app/api/ai/interview-voice/route.ts](../../../app/api/ai/interview-voice/route.ts) | @/lib/auth/server:2, @/lib/rate-limit:3 |
| /api/ai/interview/response | route | POST | [app/api/ai/interview/response/route.ts](../../../app/api/ai/interview/response/route.ts) | @/lib/auth/server:2, @/lib/rate-limit:3, @/lib/db/withRequestGuc:9 |
| /api/ai/interview/results | route | GET | [app/api/ai/interview/results/route.ts](../../../app/api/ai/interview/results/route.ts) | @/lib/auth/server:2, @/lib/rate-limit:3, @/lib/db/withRequestGuc:9 |
| /api/ai/interview/start | route | POST | [app/api/ai/interview/start/route.ts](../../../app/api/ai/interview/start/route.ts) | @/lib/auth/server:2, @/lib/rate-limit:4, @/lib/db/withRequestGuc:9 |
| /api/ai/job-match-scorer | route | POST | [app/api/ai/job-match-scorer/route.ts](../../../app/api/ai/job-match-scorer/route.ts) | @/lib/auth/server:2, @/lib/auth/ensureUser:3, @/lib/rate-limit:4, @/lib/auth/actAsSubject:17, @/lib/db/withRequestGuc:21 |
| /api/ai/job-tailor/\[jobId\] | route | POST | [app/api/ai/job-tailor/\[jobId\]/route.ts](../../../app/api/ai/job-tailor/%5BjobId%5D/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:3, @/lib/rate-limit:5 |
| /api/ai/linkedin-about | route | POST | [app/api/ai/linkedin-about/route.ts](../../../app/api/ai/linkedin-about/route.ts) | @/lib/auth/server:2, @/lib/auth/ensureUser:3, @/lib/rate-limit:4, @/lib/auth/actAsSubject:9, @/lib/db/withRequestGuc:15 |
| /api/ai/linkedin-headline | route | POST | [app/api/ai/linkedin-headline/route.ts](../../../app/api/ai/linkedin-headline/route.ts) | @/lib/auth/server:2, @/lib/auth/ensureUser:3, @/lib/rate-limit:4, @/lib/auth/actAsSubject:9, @/lib/db/withRequestGuc:14 |
| /api/ai/resume-rewriter | route | POST | [app/api/ai/resume-rewriter/route.ts](../../../app/api/ai/resume-rewriter/route.ts) | @/lib/auth/server:2, @/lib/auth/ensureUser:3, @/lib/rate-limit:4, @/lib/auth/actAsSubject:11, @/lib/db/withRequestGuc:18 |
| /api/ai/resume-strength | route | POST | [app/api/ai/resume-strength/route.ts](../../../app/api/ai/resume-strength/route.ts) | @/lib/auth/server:2, @/lib/auth/ensureUser:3, @/lib/rate-limit:4, @/lib/auth/actAsSubject:9, @/lib/db/withRequestGuc:14 |
| /api/ai/salary-negotiation | route | POST | [app/api/ai/salary-negotiation/route.ts](../../../app/api/ai/salary-negotiation/route.ts) | @/lib/auth/server:2, @/lib/auth/ensureUser:3, @/lib/rate-limit:4, @/lib/auth/actAsSubject:9, @/lib/db/withRequestGuc:15 |
| /api/ai/skill-mapper | route | GET | [app/api/ai/skill-mapper/route.ts](../../../app/api/ai/skill-mapper/route.ts) | @/lib/auth/server:8, @/lib/auth/ensureUser:9, @/lib/rate-limit:12, @/lib/db/withRequestGuc:18 |
| /api/apply/confirmation-email | route | POST | [app/api/apply/confirmation-email/route.ts](../../../app/api/apply/confirmation-email/route.ts) | @/lib/rate-limit:4, @/lib/db/withRequestGuc:9 |
| /api/apply/signup | route | POST | [app/api/apply/signup/route.ts](../../../app/api/apply/signup/route.ts) | @/lib/tenant/withTenantScope:3, @/lib/rate-limit:15, @/lib/tenant/resolveProvisionOrg:20, @/lib/db/withRequestGuc:23 |
| /api/apply/status-lookup | route | POST | [app/api/apply/status-lookup/route.ts](../../../app/api/apply/status-lookup/route.ts) | @/lib/rate-limit:3, @/lib/db/withRequestGuc:6 |
| /api/auth/check-mfa-required | route | GET | [app/api/auth/check-mfa-required/route.ts](../../../app/api/auth/check-mfa-required/route.ts) | @/lib/auth/mfaTrust:5, @/lib/auth/mfaConfig:7, @/lib/rate-limit:8, @/lib/db/withRequestGuc:13 |
| /api/auth/forgot-password | route | POST | [app/api/auth/forgot-password/route.ts](../../../app/api/auth/forgot-password/route.ts) | @/lib/rate-limit:2, @/lib/auth/passwordReset:4, @/lib/auth/postLoginRedirect:5 |
| /api/auth/login | route | POST | [app/api/auth/login/route.ts](../../../app/api/auth/login/route.ts) | @/lib/auth/postLoginRedirect:4, @/lib/rate-limit:6, @/lib/auth/mfaTrust:9, @/lib/auth/mfaConfig:11, @/lib/auth/supabaseAuthCookie:15, @/lib/db/withRequestGuc:17 |
| /api/auth/logout | route | POST | [app/api/auth/logout/route.ts](../../../app/api/auth/logout/route.ts) | @/lib/auth/server:3, @/lib/auth/mfaTrust:5, @/lib/auth/supabaseAuthCookie:7 |
| /api/auth/me | route | GET | [app/api/auth/me/route.ts](../../../app/api/auth/me/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/auth/portalRoleSwitcher:12, @/lib/db/withRequestGuc:14 |
| /api/auth/setup-mfa | route | POST, PATCH | [app/api/auth/setup-mfa/route.ts](../../../app/api/auth/setup-mfa/route.ts) | @/lib/auth/mfaConfig:5, @/lib/rate-limit:6 |
| /api/auth/verify-mfa | route | POST | [app/api/auth/verify-mfa/route.ts](../../../app/api/auth/verify-mfa/route.ts) | @/lib/auth/mfaTrust:5, @/lib/auth/mfaConfig:10, @/lib/rate-limit:12, @/lib/db/withRequestGuc:16 |
| /api/billing-packets/\[packetId\]/pdf | route | GET | [app/api/billing-packets/\[packetId\]/pdf/route.ts](../../../app/api/billing-packets/%5BpacketId%5D/pdf/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:3 |
| /api/billing-packets/\[packetId\]/send | route | POST | [app/api/billing-packets/\[packetId\]/send/route.ts](../../../app/api/billing-packets/%5BpacketId%5D/send/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:4 |
| /api/careers/occupation/\[onetCode\] | route | GET | [app/api/careers/occupation/\[onetCode\]/route.ts](../../../app/api/careers/occupation/%5BonetCode%5D/route.ts) | @/lib/rate-limit:7, @/lib/db/withRequestGuc:10 |
| /api/careers/program-matches/\[programSlug\] | route | GET | [app/api/careers/program-matches/\[programSlug\]/route.ts](../../../app/api/careers/program-matches/%5BprogramSlug%5D/route.ts) | @/lib/rate-limit:4, @/lib/db/withRequestGuc:8 |
| /api/careers/recommend | route | POST | [app/api/careers/recommend/route.ts](../../../app/api/careers/recommend/route.ts) | @/lib/rate-limit:2 |
| /api/consent/\[token\] | route | POST | [app/api/consent/\[token\]/route.ts](../../../app/api/consent/%5Btoken%5D/route.ts) | @/lib/db/withRequestGuc:4, @/lib/rate-limit:5, @/lib/consent/guardianConsentPersistence:8 |
| /api/contact | route | POST | [app/api/contact/route.ts](../../../app/api/contact/route.ts) | @/lib/rate-limit:2 |
| /api/counselor/analytics | route | GET | [app/api/counselor/analytics/route.ts](../../../app/api/counselor/analytics/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:6 |
| /api/counselor/bulk-followup | route | POST | [app/api/counselor/bulk-followup/route.ts](../../../app/api/counselor/bulk-followup/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/db/withRequestGuc:5 |
| /api/counselor/counselors | route | GET | [app/api/counselor/counselors/route.ts](../../../app/api/counselor/counselors/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:5, @/lib/tenant/organization:6 |
| /api/counselor/dashboard | route | GET | [app/api/counselor/dashboard/route.ts](../../../app/api/counselor/dashboard/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:7 |
| /api/counselor/feedback | route | POST | [app/api/counselor/feedback/route.ts](../../../app/api/counselor/feedback/route.ts) | @/lib/auth/server:2, @/lib/auth/ensureUser:3, @/lib/tenant/withTenantScope:9, @/lib/tenant/organization:10, @/lib/rate-limit:12, @/lib/db/withRequestGuc:14 |
| /api/counselor/inactive-members | route | GET | [app/api/counselor/inactive-members/route.ts](../../../app/api/counselor/inactive-members/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/tenant/organization:5, @/lib/db/withRequestGuc:7 |
| /api/counselor/inbox-zero/bulk | route | POST | [app/api/counselor/inbox-zero/bulk/route.ts](../../../app/api/counselor/inbox-zero/bulk/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/db/withRequestGuc:8, @/lib/tenant/organization:28, @/lib/tenant/withTenantScope:32 |
| /api/counselor/inbox-zero/dismiss | route | POST | [app/api/counselor/inbox-zero/dismiss/route.ts](../../../app/api/counselor/inbox-zero/dismiss/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/db/withRequestGuc:9 |
| /api/counselor/inbox-zero | route | GET | [app/api/counselor/inbox-zero/route.ts](../../../app/api/counselor/inbox-zero/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:5 |
| /api/counselor/members/\[memberId\]/activity-timeline | route | GET | [app/api/counselor/members/\[memberId\]/activity-timeline/route.ts](../../../app/api/counselor/members/%5BmemberId%5D/activity-timeline/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/db/withRequestGuc:7 |
| /api/counselor/members/\[memberId\]/award-points | route | POST | [app/api/counselor/members/\[memberId\]/award-points/route.ts](../../../app/api/counselor/members/%5BmemberId%5D/award-points/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:8 |
| /api/counselor/members/\[memberId\]/messages | route | GET, POST, PATCH | [app/api/counselor/members/\[memberId\]/messages/route.ts](../../../app/api/counselor/members/%5BmemberId%5D/messages/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/withTenantScope:5, @/lib/tenant/organization:6, @/lib/db/withRequestGuc:7 |
| /api/counselor/members/\[memberId\]/notes | route | GET, POST, DELETE | [app/api/counselor/members/\[memberId\]/notes/route.ts](../../../app/api/counselor/members/%5BmemberId%5D/notes/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/withTenantScope:5, @/lib/tenant/organization:6, @/lib/db/withRequestGuc:12 |
| /api/counselor/members/\[memberId\]/resume/docx-html | route | POST | [app/api/counselor/members/\[memberId\]/resume/docx-html/route.ts](../../../app/api/counselor/members/%5BmemberId%5D/resume/docx-html/route.ts) | @/lib/auth/server:3, @/lib/db/withRequestGuc:11 |
| /api/counselor/members/\[memberId\]/resume/preview | route | GET | [app/api/counselor/members/\[memberId\]/resume/preview/route.ts](../../../app/api/counselor/members/%5BmemberId%5D/resume/preview/route.ts) | @/lib/auth/server:3, @/lib/db/withRequestGuc:9 |
| /api/counselor/members/\[memberId\]/resume | route | GET | [app/api/counselor/members/\[memberId\]/resume/route.ts](../../../app/api/counselor/members/%5BmemberId%5D/resume/route.ts) | @/lib/auth/server:3, @/lib/db/withRequestGuc:10 |
| /api/counselor/members/\[memberId\] | route | GET | [app/api/counselor/members/\[memberId\]/route.ts](../../../app/api/counselor/members/%5BmemberId%5D/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:15 |
| /api/counselor/members/\[memberId\]/session-notes | route | GET, POST, DELETE | [app/api/counselor/members/\[memberId\]/session-notes/route.ts](../../../app/api/counselor/members/%5BmemberId%5D/session-notes/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/withTenantScope:5, @/lib/tenant/organization:6, @/lib/db/withRequestGuc:12 |
| /api/counselor/notifications | route | GET | [app/api/counselor/notifications/route.ts](../../../app/api/counselor/notifications/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:5 |
| /api/counselor/nudge | route | POST | [app/api/counselor/nudge/route.ts](../../../app/api/counselor/nudge/route.ts) | @/lib/auth/server:3, @/lib/tenant/withTenantScope:4, @/lib/tenant/organization:5, @/lib/db/withRequestGuc:21 |
| /api/counselor/placements | route | GET, POST | [app/api/counselor/placements/route.ts](../../../app/api/counselor/placements/route.ts) | @/lib/auth/server:4, @/lib/auth/roles:5, @/lib/db/withRequestGuc:13 |
| /api/counselor/profile | route | GET, PATCH | [app/api/counselor/profile/route.ts](../../../app/api/counselor/profile/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/db/withRequestGuc:7 |
| /api/counselor/remind-member | route | POST | [app/api/counselor/remind-member/route.ts](../../../app/api/counselor/remind-member/route.ts) | @/lib/auth/server:3, @/lib/tenant/withTenantScope:4, @/lib/tenant/organization:5, @/lib/db/withRequestGuc:11 |
| /api/counselor/session | route | POST | [app/api/counselor/session/route.ts](../../../app/api/counselor/session/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:4, @/lib/rate-limit:5, @/lib/db/withRequestGuc:16, @/lib/db/gucContext:17 |
| /api/counselor/sessions/email-packet | route | POST | [app/api/counselor/sessions/email-packet/route.ts](../../../app/api/counselor/sessions/email-packet/route.ts) | @/lib/auth/server:3, @/lib/tenant/withTenantScope:5, @/lib/tenant/organization:6, @/lib/auth/actAsSubject:12, @/lib/db/withRequestGuc:17 |
| /api/counselor/sessions/upload-resume | route | POST | [app/api/counselor/sessions/upload-resume/route.ts](../../../app/api/counselor/sessions/upload-resume/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/auth/actAsSubject:4, @/lib/tenant/withTenantScope:5, @/lib/tenant/organization:6, @/lib/db/withRequestGuc:23 |
| /api/counselor/sessions/voice-walkthrough | route | POST | [app/api/counselor/sessions/voice-walkthrough/route.ts](../../../app/api/counselor/sessions/voice-walkthrough/route.ts) | @/lib/auth/server:3, @/lib/rate-limit:5, @/lib/tenant/withTenantScope:6, @/lib/tenant/organization:7, @/lib/auth/actAsSubject:14, @/lib/db/withRequestGuc:17 |
| /api/counselor/sessions/walk-in | route | POST | [app/api/counselor/sessions/walk-in/route.ts](../../../app/api/counselor/sessions/walk-in/route.ts) | @/lib/auth/server:5, @/lib/auth/roles:6, @/lib/tenant/organization:9, @/lib/tenant/withTenantScope:10, @/lib/auth/supabaseAdminUsers:12, @/lib/db/withRequestGuc:16 |
| /api/cron/applicant-aging-digest | route | GET, POST | [app/api/cron/applicant-aging-digest/route.ts](../../../app/api/cron/applicant-aging-digest/route.ts) |  |
| /api/cron/applicant-followup | route | GET, POST | [app/api/cron/applicant-followup/route.ts](../../../app/api/cron/applicant-followup/route.ts) |  |
| /api/cron/at-risk-alerts | route | GET, POST | [app/api/cron/at-risk-alerts/route.ts](../../../app/api/cron/at-risk-alerts/route.ts) |  |
| /api/cron/at-risk-check | route | GET, POST | [app/api/cron/at-risk-check/route.ts](../../../app/api/cron/at-risk-check/route.ts) | @/lib/cron/authorizeCronRequest:9 |
| /api/cron/course-accountability | route | GET, POST | [app/api/cron/course-accountability/route.ts](../../../app/api/cron/course-accountability/route.ts) |  |
| /api/cron/coursera-auto-heal | route | GET, POST | [app/api/cron/coursera-auto-heal/route.ts](../../../app/api/cron/coursera-auto-heal/route.ts) |  |
| /api/cron/coursera-b4b-sync | route | GET, POST | [app/api/cron/coursera-b4b-sync/route.ts](../../../app/api/cron/coursera-b4b-sync/route.ts) |  |
| /api/cron/coursera-sync | route | GET, POST | [app/api/cron/coursera-sync/route.ts](../../../app/api/cron/coursera-sync/route.ts) |  |
| /api/cron/coursera-training-sync | route | GET | [app/api/cron/coursera-training-sync/route.ts](../../../app/api/cron/coursera-training-sync/route.ts) |  |
| /api/cron/data-cleanup | route | GET, POST | [app/api/cron/data-cleanup/route.ts](../../../app/api/cron/data-cleanup/route.ts) |  |
| /api/cron/deploy-health | route | GET, POST | [app/api/cron/deploy-health/route.ts](../../../app/api/cron/deploy-health/route.ts) |  |
| /api/cron/employer-pending-applicants | route | GET, POST | [app/api/cron/employer-pending-applicants/route.ts](../../../app/api/cron/employer-pending-applicants/route.ts) |  |
| /api/cron/inactive-nudge | route | GET, POST | [app/api/cron/inactive-nudge/route.ts](../../../app/api/cron/inactive-nudge/route.ts) |  |
| /api/cron/inactivity-nudge | route | GET, POST | [app/api/cron/inactivity-nudge/route.ts](../../../app/api/cron/inactivity-nudge/route.ts) |  |
| /api/cron/interview-reminders | route | GET | [app/api/cron/interview-reminders/route.ts](../../../app/api/cron/interview-reminders/route.ts) |  |
| /api/cron/job-alerts | route | GET, POST | [app/api/cron/job-alerts/route.ts](../../../app/api/cron/job-alerts/route.ts) |  |
| /api/cron/job-expiry | route | GET, POST | [app/api/cron/job-expiry/route.ts](../../../app/api/cron/job-expiry/route.ts) |  |
| /api/cron/milestone-cascade-draft | route | GET, POST | [app/api/cron/milestone-cascade-draft/route.ts](../../../app/api/cron/milestone-cascade-draft/route.ts) |  |
| /api/cron/milestone-cascade-expire | route | GET, POST | [app/api/cron/milestone-cascade-expire/route.ts](../../../app/api/cron/milestone-cascade-expire/route.ts) |  |
| /api/cron/milestone-celebration | route | GET, POST | [app/api/cron/milestone-celebration/route.ts](../../../app/api/cron/milestone-celebration/route.ts) |  |
| /api/cron/onboarding-stalls | route | GET, POST | [app/api/cron/onboarding-stalls/route.ts](../../../app/api/cron/onboarding-stalls/route.ts) |  |
| /api/cron/partner-outcome-digest | route | GET, POST | [app/api/cron/partner-outcome-digest/route.ts](../../../app/api/cron/partner-outcome-digest/route.ts) |  |
| /api/cron/placement-survey | route | GET, POST | [app/api/cron/placement-survey/route.ts](../../../app/api/cron/placement-survey/route.ts) |  |
| /api/cron/retention-decisions | route | GET, POST | [app/api/cron/retention-decisions/route.ts](../../../app/api/cron/retention-decisions/route.ts) |  |
| /api/cron/smoke-test | route | GET, POST | [app/api/cron/smoke-test/route.ts](../../../app/api/cron/smoke-test/route.ts) |  |
| /api/cron/stale-training-check | route | GET | [app/api/cron/stale-training-check/route.ts](../../../app/api/cron/stale-training-check/route.ts) |  |
| /api/cron/verification | route | GET, POST | [app/api/cron/verification/route.ts](../../../app/api/cron/verification/route.ts) |  |
| /api/cron/weekly-recap-email | route | GET, POST | [app/api/cron/weekly-recap-email/route.ts](../../../app/api/cron/weekly-recap-email/route.ts) |  |
| /api/cron/weekly-recap | route | GET, POST | [app/api/cron/weekly-recap/route.ts](../../../app/api/cron/weekly-recap/route.ts) |  |
| /api/cron/wioa-report | route | GET, POST | [app/api/cron/wioa-report/route.ts](../../../app/api/cron/wioa-report/route.ts) |  |
| /api/employer/applications/\[id\]/messages | route | GET, POST, PATCH | [app/api/employer/applications/\[id\]/messages/route.ts](../../../app/api/employer/applications/%5Bid%5D/messages/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/messages/rateLimit:6, @/lib/db/withRequestGuc:11 |
| /api/employer/applications/\[id\]/resume | route | GET | [app/api/employer/applications/\[id\]/resume/route.ts](../../../app/api/employer/applications/%5Bid%5D/resume/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:11 |
| /api/employer/applications/\[id\] | route | PATCH | [app/api/employer/applications/\[id\]/route.ts](../../../app/api/employer/applications/%5Bid%5D/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:10 |
| /api/employer/applications | route | GET | [app/api/employer/applications/route.ts](../../../app/api/employer/applications/route.ts) | @/lib/auth/server:4, @/lib/auth/roles:5, @/lib/db/withRequestGuc:9 |
| /api/employer/checkout | route | POST | [app/api/employer/checkout/route.ts](../../../app/api/employer/checkout/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/withTenantScope:11, @/lib/db/withRequestGuc:13 |
| /api/employer/hiring-intents | route | GET, POST | [app/api/employer/hiring-intents/route.ts](../../../app/api/employer/hiring-intents/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/db/withRequestGuc:10 |
| /api/employer/jobs/\[id\]/applicants | route | GET, PATCH | [app/api/employer/jobs/\[id\]/applicants/route.ts](../../../app/api/employer/jobs/%5Bid%5D/applicants/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:10 |
| /api/employer/jobs/\[id\]/applications/export | route | GET | [app/api/employer/jobs/\[id\]/applications/export/route.ts](../../../app/api/employer/jobs/%5Bid%5D/applications/export/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:8 |
| /api/employer/jobs/\[id\]/matches/\[studentId\] | route | PATCH | [app/api/employer/jobs/\[id\]/matches/\[studentId\]/route.ts](../../../app/api/employer/jobs/%5Bid%5D/matches/%5BstudentId%5D/route.ts) | @/lib/auth/server:5, @/lib/auth/roles:6, @/lib/db/withRequestGuc:10 |
| /api/employer/jobs/\[id\]/matches | route | GET | [app/api/employer/jobs/\[id\]/matches/route.ts](../../../app/api/employer/jobs/%5Bid%5D/matches/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:6 |
| /api/employer/jobs/\[id\] | route | GET, PATCH, DELETE | [app/api/employer/jobs/\[id\]/route.ts](../../../app/api/employer/jobs/%5Bid%5D/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:11 |
| /api/employer/jobs/bulk-delete | route | POST | [app/api/employer/jobs/bulk-delete/route.ts](../../../app/api/employer/jobs/bulk-delete/route.ts) | @/lib/auth/server:6, @/lib/auth/roles:7, @/lib/db/withRequestGuc:11 |
| /api/employer/jobs/import-bulk | route | POST | [app/api/employer/jobs/import-bulk/route.ts](../../../app/api/employer/jobs/import-bulk/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/rate-limit:22, @/lib/db/withRequestGuc:26 |
| /api/employer/jobs/import | route | POST | [app/api/employer/jobs/import/route.ts](../../../app/api/employer/jobs/import/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/rate-limit:20, @/lib/db/withRequestGuc:25 |
| /api/employer/jobs | route | GET, POST | [app/api/employer/jobs/route.ts](../../../app/api/employer/jobs/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/withTenantScope:11, @/lib/db/withRequestGuc:14 |
| /api/employer/logo | route | POST | [app/api/employer/logo/route.ts](../../../app/api/employer/logo/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:8 |
| /api/employer/loi | route | POST, GET | [app/api/employer/loi/route.ts](../../../app/api/employer/loi/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:7 |
| /api/employer/messages | route | GET, POST, PATCH | [app/api/employer/messages/route.ts](../../../app/api/employer/messages/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/messages/rateLimit:10, @/lib/db/withRequestGuc:14 |
| /api/employer/onboarding-profile | route | PATCH | [app/api/employer/onboarding-profile/route.ts](../../../app/api/employer/onboarding-profile/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/db/withRequestGuc:9 |
| /api/employer/outcomes | route | GET | [app/api/employer/outcomes/route.ts](../../../app/api/employer/outcomes/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/organization:5, @/lib/db/withRequestGuc:8 |
| /api/employer/settings | route | PATCH | [app/api/employer/settings/route.ts](../../../app/api/employer/settings/route.ts) | @/lib/auth/server:4, @/lib/auth/roles:5, @/lib/db/withRequestGuc:10 |
| /api/employer/signup | route | POST | [app/api/employer/signup/route.ts](../../../app/api/employer/signup/route.ts) | @/lib/rate-limit:4 |
| /api/employer/subscribe | route | POST | [app/api/employer/subscribe/route.ts](../../../app/api/employer/subscribe/route.ts) | @/lib/auth/server:6, @/lib/auth/roles:11, @/lib/db/withRequestGuc:12 |
| /api/employer/voice-session | route | POST | [app/api/employer/voice-session/route.ts](../../../app/api/employer/voice-session/route.ts) | @/lib/auth/server:4, @/lib/rate-limit:6, @/lib/auth/roles:7, @/lib/db/withRequestGuc:12 |
| /api/employer/webhook | route | POST | [app/api/employer/webhook/route.ts](../../../app/api/employer/webhook/route.ts) | @/lib/db/withRequestGuc:8 |
| /api/events | route | POST | [app/api/events/route.ts](../../../app/api/events/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:8 |
| /api/feature-flags | route | GET | [app/api/feature-flags/route.ts](../../../app/api/feature-flags/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:8 |
| /api/gdpr/consent | route | GET, PATCH | [app/api/gdpr/consent/route.ts](../../../app/api/gdpr/consent/route.ts) | @/lib/auth/server:5, @/lib/db/withRequestGuc:8 |
| /api/gdpr/delete | route | POST | [app/api/gdpr/delete/route.ts](../../../app/api/gdpr/delete/route.ts) | @/lib/auth/server:6, @/lib/gdpr/deleteAuthUser:10, @/lib/db/withRequestGuc:16 |
| /api/gdpr/export | route | GET | [app/api/gdpr/export/route.ts](../../../app/api/gdpr/export/route.ts) | @/lib/auth/server:3, @/lib/db/withRequestGuc:5 |
| /api/health/ready | route | OPTIONS, GET | [app/api/health/ready/route.ts](../../../app/api/health/ready/route.ts) | @/lib/db/withRequestGuc:3, @/lib/rate-limit:6, @/lib/tenant/organization:7 |
| /api/health | route | OPTIONS, GET | [app/api/health/route.ts](../../../app/api/health/route.ts) | @/lib/rate-limit:4 |
| /api/health/slo | route | GET | [app/api/health/slo/route.ts](../../../app/api/health/slo/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:6 |
| /api/interview/history | route | GET, POST | [app/api/interview/history/route.ts](../../../app/api/interview/history/route.ts) | @/lib/auth/ensureUser:2, @/lib/auth/server:3, @/lib/rate-limit:11, @/lib/db/withRequestGuc:13 |
| /api/interview/session | route | POST | [app/api/interview/session/route.ts](../../../app/api/interview/session/route.ts) | @/lib/auth/server:3, @/lib/rate-limit:5, @/lib/db/withRequestGuc:13 |
| /api/invite/accept | route | POST | [app/api/invite/accept/route.ts](../../../app/api/invite/accept/route.ts) | @/lib/tenant/organization:6, @/lib/tenant/resolveOrgFromRequest:7, @/lib/rate-limit:13, @/lib/auth/supabaseAdminUsers:15, @/lib/db/withRequestGuc:30 |
| /api/invite/validate | route | GET | [app/api/invite/validate/route.ts](../../../app/api/invite/validate/route.ts) | @/lib/rate-limit:6, @/lib/db/withRequestGuc:9 |
| /api/leader/chapters/\[id\] | route | GET | [app/api/leader/chapters/\[id\]/route.ts](../../../app/api/leader/chapters/%5Bid%5D/route.ts) | @/lib/auth/server:2, @/lib/tenant/organization:3, @/lib/tenant/withTenantScope:4, @/lib/db/withRequestGuc:5 |
| /api/leader/chapters | route | GET | [app/api/leader/chapters/route.ts](../../../app/api/leader/chapters/route.ts) | @/lib/auth/server:2, @/lib/tenant/organization:3, @/lib/tenant/withTenantScope:4, @/lib/db/withRequestGuc:5 |
| /api/leads/careers | route | POST | [app/api/leads/careers/route.ts](../../../app/api/leads/careers/route.ts) | @/lib/rate-limit:2 |
| /api/leads/employer | route | GET | [app/api/leads/employer/route.ts](../../../app/api/leads/employer/route.ts) |  |
| /api/member/ai-history | route | GET | [app/api/member/ai-history/route.ts](../../../app/api/member/ai-history/route.ts) | @/lib/auth/server:3, @/lib/db/withRequestGuc:6 |
| /api/member/application-ai-feedback | route | POST | [app/api/member/application-ai-feedback/route.ts](../../../app/api/member/application-ai-feedback/route.ts) | @/lib/auth/server:4, @/lib/db/withRequestGuc:8 |
| /api/member/application-onboarding | route | PATCH | [app/api/member/application-onboarding/route.ts](../../../app/api/member/application-onboarding/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:7 |
| /api/member/applications/\[id\]/messages | route | GET, POST | [app/api/member/applications/\[id\]/messages/route.ts](../../../app/api/member/applications/%5Bid%5D/messages/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:7 |
| /api/member/applications/\[id\] | route | PATCH, DELETE | [app/api/member/applications/\[id\]/route.ts](../../../app/api/member/applications/%5Bid%5D/route.ts) | @/lib/auth/server:2, @/lib/auth/ensureUser:3, @/lib/db/withRequestGuc:8 |
| /api/member/applications | route | GET, POST | [app/api/member/applications/route.ts](../../../app/api/member/applications/route.ts) | @/lib/auth/server:2, @/lib/auth/ensureUser:3, @/lib/db/withRequestGuc:10 |
| /api/member/assessment/reset | route | POST | [app/api/member/assessment/reset/route.ts](../../../app/api/member/assessment/reset/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:6 |
| /api/member/assessment/submit | route | POST | [app/api/member/assessment/submit/route.ts](../../../app/api/member/assessment/submit/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:16 |
| /api/member/benefits/request | route | POST | [app/api/member/benefits/request/route.ts](../../../app/api/member/benefits/request/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:6 |
| /api/member/career-business-coach/completion | route | POST | [app/api/member/career-business-coach/completion/route.ts](../../../app/api/member/career-business-coach/completion/route.ts) | @/lib/auth/server:2, @/lib/auth/ensureUser:4, @/lib/db/withRequestGuc:10 |
| /api/member/career-business-coach/voice-session | route | POST | [app/api/member/career-business-coach/voice-session/route.ts](../../../app/api/member/career-business-coach/voice-session/route.ts) | @/lib/auth/server:2, @/lib/rate-limit:4, @/lib/db/gucContext:6, @/lib/db/withRequestGuc:9 |
| /api/member/certifications/export | route | GET | [app/api/member/certifications/export/route.ts](../../../app/api/member/certifications/export/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:6 |
| /api/member/certifications | route | GET, POST | [app/api/member/certifications/route.ts](../../../app/api/member/certifications/route.ts) | @/lib/auth/server:2, @/lib/auth/ensureUser:3, @/lib/db/withRequestGuc:7 |
| /api/member/certifications/upload | route | POST | [app/api/member/certifications/upload/route.ts](../../../app/api/member/certifications/upload/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:6 |
| /api/member/coursera/auto-sync | route | POST | [app/api/member/coursera/auto-sync/route.ts](../../../app/api/member/coursera/auto-sync/route.ts) | @/lib/auth/server:3, @/lib/tenant/organization:10, @/lib/tenant/withTenantScope:11, @/lib/db/withRequestGuc:12 |
| /api/member/coursera/enroll-in-course | route | POST | [app/api/member/coursera/enroll-in-course/route.ts](../../../app/api/member/coursera/enroll-in-course/route.ts) | @/lib/auth/server:3, @/lib/tenant/withTenantScope:5, @/lib/tenant/organization:6, @/lib/db/withRequestGuc:12 |
| /api/member/coursera/identity | route | POST | [app/api/member/coursera/identity/route.ts](../../../app/api/member/coursera/identity/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:4, @/lib/rate-limit:5 |
| /api/member/coursera/launch | route | GET | [app/api/member/coursera/launch/route.ts](../../../app/api/member/coursera/launch/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:4 |
| /api/member/coursera/refresh-progress | route | POST | [app/api/member/coursera/refresh-progress/route.ts](../../../app/api/member/coursera/refresh-progress/route.ts) | @/lib/auth/server:3, @/lib/db/withRequestGuc:8 |
| /api/member/coursera | route | GET | [app/api/member/coursera/route.ts](../../../app/api/member/coursera/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:10 |
| /api/member/courses/complete | route | POST | [app/api/member/courses/complete/route.ts](../../../app/api/member/courses/complete/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:8 |
| /api/member/dashboard-profile | route | PATCH | [app/api/member/dashboard-profile/route.ts](../../../app/api/member/dashboard-profile/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:7 |
| /api/member/delete-account | route | POST | [app/api/member/delete-account/route.ts](../../../app/api/member/delete-account/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:7, @/lib/db/withRequestGuc:9 |
| /api/member/eligibility | route | GET, PATCH | [app/api/member/eligibility/route.ts](../../../app/api/member/eligibility/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:9 |
| /api/member/enroll | route | POST | [app/api/member/enroll/route.ts](../../../app/api/member/enroll/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:22 |
| /api/member/enrollments/\[id\] | route | GET | [app/api/member/enrollments/\[id\]/route.ts](../../../app/api/member/enrollments/%5Bid%5D/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:5 |
| /api/member/enrollments/\[id\]/set-primary | route | POST | [app/api/member/enrollments/\[id\]/set-primary/route.ts](../../../app/api/member/enrollments/%5Bid%5D/set-primary/route.ts) | @/lib/auth/server:3, @/lib/db/withRequestGuc:6 |
| /api/member/enrollments | route | GET | [app/api/member/enrollments/route.ts](../../../app/api/member/enrollments/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:10 |
| /api/member/export-data | route | GET | [app/api/member/export-data/route.ts](../../../app/api/member/export-data/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:5 |
| /api/member/feedback | route | POST | [app/api/member/feedback/route.ts](../../../app/api/member/feedback/route.ts) | @/lib/auth/server:2, @/lib/auth/ensureUser:3, @/lib/db/withRequestGuc:9 |
| /api/member/goals/\[id\] | route | PATCH, DELETE | [app/api/member/goals/\[id\]/route.ts](../../../app/api/member/goals/%5Bid%5D/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:7 |
| /api/member/goals/\[id\]/steps | route | GET, POST, PATCH | [app/api/member/goals/\[id\]/steps/route.ts](../../../app/api/member/goals/%5Bid%5D/steps/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:6 |
| /api/member/goals | route | GET, POST | [app/api/member/goals/route.ts](../../../app/api/member/goals/route.ts) | @/lib/auth/server:2, @/lib/auth/ensureUser:3, @/lib/db/withRequestGuc:10 |
| /api/member/interest-profiler/questions | route | GET | [app/api/member/interest-profiler/questions/route.ts](../../../app/api/member/interest-profiler/questions/route.ts) | @/lib/auth/server:2 |
| /api/member/interest-profiler/score | route | POST | [app/api/member/interest-profiler/score/route.ts](../../../app/api/member/interest-profiler/score/route.ts) | @/lib/auth/server:3, @/lib/rate-limit:4, @/lib/auth/ensureUser:11, @/lib/db/withRequestGuc:13 |
| /api/member/interview-request | route | POST | [app/api/member/interview-request/route.ts](../../../app/api/member/interview-request/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:6 |
| /api/member/job-applications/\[id\] | route | PATCH | [app/api/member/job-applications/\[id\]/route.ts](../../../app/api/member/job-applications/%5Bid%5D/route.ts) | @/lib/auth/ensureUser:3, @/lib/auth/server:4, @/lib/db/withRequestGuc:15 |
| /api/member/job-applications/log-external | route | POST | [app/api/member/job-applications/log-external/route.ts](../../../app/api/member/job-applications/log-external/route.ts) | @/lib/auth/server:3, @/lib/auth/ensureUser:4, @/lib/db/withRequestGuc:12 |
| /api/member/job-applications | route | GET, POST | [app/api/member/job-applications/route.ts](../../../app/api/member/job-applications/route.ts) | @/lib/auth/server:2, @/lib/auth/ensureUser:3, @/lib/db/withRequestGuc:11 |
| /api/member/job-applications/track-curated | route | POST | [app/api/member/job-applications/track-curated/route.ts](../../../app/api/member/job-applications/track-curated/route.ts) | @/lib/auth/server:3, @/lib/auth/ensureUser:4, @/lib/db/withRequestGuc:9 |
| /api/member/labs/\[labId\] | route | GET, PUT | [app/api/member/labs/\[labId\]/route.ts](../../../app/api/member/labs/%5BlabId%5D/route.ts) | @/lib/auth/server:1, @/lib/db/withRequestGuc:2 |
| /api/member/labs/\[labId\]/submit | route | POST | [app/api/member/labs/\[labId\]/submit/route.ts](../../../app/api/member/labs/%5BlabId%5D/submit/route.ts) | @/lib/auth/server:1, @/lib/db/withRequestGuc:2 |
| /api/member/learning-progress | route | GET, POST | [app/api/member/learning-progress/route.ts](../../../app/api/member/learning-progress/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:6 |
| /api/member/linkedin-enrich | route | POST | [app/api/member/linkedin-enrich/route.ts](../../../app/api/member/linkedin-enrich/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:7 |
| /api/member/matched-jobs | route | GET | [app/api/member/matched-jobs/route.ts](../../../app/api/member/matched-jobs/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:15 |
| /api/member/messages | route | GET, POST, PATCH | [app/api/member/messages/route.ts](../../../app/api/member/messages/route.ts) | @/lib/auth/server:2, @/lib/messages/rateLimit:12, @/lib/db/withRequestGuc:16 |
| /api/member/nba/\[id\] | route | PATCH | [app/api/member/nba/\[id\]/route.ts](../../../app/api/member/nba/%5Bid%5D/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:5 |
| /api/member/notifications/\[id\]/read | route | PUT, PATCH | [app/api/member/notifications/\[id\]/read/route.ts](../../../app/api/member/notifications/%5Bid%5D/read/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:4 |
| /api/member/notifications/\[id\] | route | DELETE | [app/api/member/notifications/\[id\]/route.ts](../../../app/api/member/notifications/%5Bid%5D/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:4 |
| /api/member/notifications/dismiss-all | route | POST | [app/api/member/notifications/dismiss-all/route.ts](../../../app/api/member/notifications/dismiss-all/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:4 |
| /api/member/notifications/read-all | route | POST | [app/api/member/notifications/read-all/route.ts](../../../app/api/member/notifications/read-all/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:4 |
| /api/member/notifications | route | GET | [app/api/member/notifications/route.ts](../../../app/api/member/notifications/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:4 |
| /api/member/pathway-steps/\[pathwayId\]/\[stepIndex\]/complete | route | POST | [app/api/member/pathway-steps/\[pathwayId\]/\[stepIndex\]/complete/route.ts](../../../app/api/member/pathway-steps/%5BpathwayId%5D/%5BstepIndex%5D/complete/route.ts) | @/lib/auth/server:2, @/lib/auth/ensureUser:3, @/lib/db/withRequestGuc:17 |
| /api/member/pathway-steps/progress | route | GET | [app/api/member/pathway-steps/progress/route.ts](../../../app/api/member/pathway-steps/progress/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:5 |
| /api/member/pitch-deployments | route | GET, POST | [app/api/member/pitch-deployments/route.ts](../../../app/api/member/pitch-deployments/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:6 |
| /api/member/pre-screening/draft | route | GET, PUT | [app/api/member/pre-screening/draft/route.ts](../../../app/api/member/pre-screening/draft/route.ts) | @/lib/auth/server:3, @/lib/db/withRequestGuc:6 |
| /api/member/pre-screening | route | GET, POST | [app/api/member/pre-screening/route.ts](../../../app/api/member/pre-screening/route.ts) | @/lib/auth/server:3, @/lib/db/withRequestGuc:7 |
| /api/member/prep-bundle | route | GET | [app/api/member/prep-bundle/route.ts](../../../app/api/member/prep-bundle/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:4 |
| /api/member/prep-bundle/send | route | POST | [app/api/member/prep-bundle/send/route.ts](../../../app/api/member/prep-bundle/send/route.ts) | @/lib/auth/server:2, @/lib/rate-limit:6, @/lib/db/withRequestGuc:7 |
| /api/member/profile-photo | route | GET, DELETE | [app/api/member/profile-photo/route.ts](../../../app/api/member/profile-photo/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:5 |
| /api/member/profile-photo/upload | route | POST | [app/api/member/profile-photo/upload/route.ts](../../../app/api/member/profile-photo/upload/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:5 |
| /api/member/profile/completeness | route | GET | [app/api/member/profile/completeness/route.ts](../../../app/api/member/profile/completeness/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:5 |
| /api/member/profile | route | GET, PATCH | [app/api/member/profile/route.ts](../../../app/api/member/profile/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:6 |
| /api/member/program-change-request | route | GET, POST | [app/api/member/program-change-request/route.ts](../../../app/api/member/program-change-request/route.ts) | @/lib/auth/server:3, @/lib/auth/ensureUser:4, @/lib/db/withRequestGuc:8 |
| /api/member/program-comparison | route | GET | [app/api/member/program-comparison/route.ts](../../../app/api/member/program-comparison/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:4 |
| /api/member/readiness | route | GET | [app/api/member/readiness/route.ts](../../../app/api/member/readiness/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:5 |
| /api/member/readiness/summary | route | POST | [app/api/member/readiness/summary/route.ts](../../../app/api/member/readiness/summary/route.ts) | @/lib/auth/server:2, @/lib/rate-limit:3, @/lib/db/withRequestGuc:5 |
| /api/member/readiness/voice-session | route | POST | [app/api/member/readiness/voice-session/route.ts](../../../app/api/member/readiness/voice-session/route.ts) | @/lib/auth/server:2, @/lib/rate-limit:4, @/lib/db/withRequestGuc:9 |
| /api/member/referral | route | GET | [app/api/member/referral/route.ts](../../../app/api/member/referral/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:4 |
| /api/member/request-help | route | POST | [app/api/member/request-help/route.ts](../../../app/api/member/request-help/route.ts) | @/lib/auth/server:2, @/lib/rate-limit:8, @/lib/db/withRequestGuc:10 |
| /api/member/resources/\[id\]/download | route | GET | [app/api/member/resources/\[id\]/download/route.ts](../../../app/api/member/resources/%5Bid%5D/download/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:6 |
| /api/member/resources/\[id\]/progress | route | POST, GET | [app/api/member/resources/\[id\]/progress/route.ts](../../../app/api/member/resources/%5Bid%5D/progress/route.ts) | @/lib/auth/server:2, @/lib/auth/ensureUser:3, @/lib/db/withRequestGuc:8 |
| /api/member/resources/progress | route | GET | [app/api/member/resources/progress/route.ts](../../../app/api/member/resources/progress/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:5 |
| /api/member/resume-coach/live-suggestions | route | POST | [app/api/member/resume-coach/live-suggestions/route.ts](../../../app/api/member/resume-coach/live-suggestions/route.ts) | @/lib/auth/server:3, @/lib/rate-limit:4, @/lib/db/withRequestGuc:7 |
| /api/member/resume-coach/parse-suggestions | route | POST | [app/api/member/resume-coach/parse-suggestions/route.ts](../../../app/api/member/resume-coach/parse-suggestions/route.ts) | @/lib/auth/server:2, @/lib/auth/ensureUser:4, @/lib/db/withRequestGuc:14 |
| /api/member/resume-coach/session | route | POST | [app/api/member/resume-coach/session/route.ts](../../../app/api/member/resume-coach/session/route.ts) | @/lib/auth/server:3, @/lib/rate-limit:14, @/lib/db/withRequestGuc:16 |
| /api/member/resume/docx-html | route | POST | [app/api/member/resume/docx-html/route.ts](../../../app/api/member/resume/docx-html/route.ts) | @/lib/auth/server:3, @/lib/db/withRequestGuc:10 |
| /api/member/resume/generate | route | POST | [app/api/member/resume/generate/route.ts](../../../app/api/member/resume/generate/route.ts) | @/lib/auth/server:2, @/lib/rate-limit:10, @/lib/db/withRequestGuc:23 |
| /api/member/resume/plain-text | route | POST | [app/api/member/resume/plain-text/route.ts](../../../app/api/member/resume/plain-text/route.ts) | @/lib/auth/server:2, @/lib/rate-limit:16, @/lib/db/withRequestGuc:18 |
| /api/member/resume/preview | route | GET | [app/api/member/resume/preview/route.ts](../../../app/api/member/resume/preview/route.ts) | @/lib/auth/server:3, @/lib/db/withRequestGuc:8 |
| /api/member/resume | route | GET | [app/api/member/resume/route.ts](../../../app/api/member/resume/route.ts) | @/lib/auth/server:3, @/lib/db/withRequestGuc:15 |
| /api/member/resume/upload | route | POST | [app/api/member/resume/upload/route.ts](../../../app/api/member/resume/upload/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:18, @/lib/rate-limit:21 |
| /api/member/saved-jobs | route | GET, POST, DELETE | [app/api/member/saved-jobs/route.ts](../../../app/api/member/saved-jobs/route.ts) | @/lib/auth/server:2, @/lib/auth/ensureUser:3, @/lib/db/withRequestGuc:8 |
| /api/member/settings | route | PATCH | [app/api/member/settings/route.ts](../../../app/api/member/settings/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:6 |
| /api/member/signup | route | POST | [app/api/member/signup/route.ts](../../../app/api/member/signup/route.ts) | @/lib/tenant/withTenantScope:2, @/lib/db/withRequestGuc:3, @/lib/rate-limit:10 |
| /api/member/skill-assessment | route | POST | [app/api/member/skill-assessment/route.ts](../../../app/api/member/skill-assessment/route.ts) | @/lib/auth/ensureUser:4, @/lib/auth/server:5, @/lib/db/withRequestGuc:10 |
| /api/member/skill-checkpoints | route | POST | [app/api/member/skill-checkpoints/route.ts](../../../app/api/member/skill-checkpoints/route.ts) | @/lib/auth/server:2, @/lib/auth/ensureUser:3, @/lib/db/withRequestGuc:9 |
| /api/member/skill-profile | route | GET | [app/api/member/skill-profile/route.ts](../../../app/api/member/skill-profile/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:10 |
| /api/member/training-workspace | route | GET, PUT | [app/api/member/training-workspace/route.ts](../../../app/api/member/training-workspace/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:3 |
| /api/member/voice-interview/recording | route | GET, POST | [app/api/member/voice-interview/recording/route.ts](../../../app/api/member/voice-interview/recording/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:9 |
| /api/member/voice-interview/session | route | POST | [app/api/member/voice-interview/session/route.ts](../../../app/api/member/voice-interview/session/route.ts) | @/lib/auth/server:3, @/lib/rate-limit:5, @/lib/db/withRequestGuc:10 |
| /api/member/voice-interview/transcript | route | POST | [app/api/member/voice-interview/transcript/route.ts](../../../app/api/member/voice-interview/transcript/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:9 |
| /api/member/voice-session/checkpoint | route | POST | [app/api/member/voice-session/checkpoint/route.ts](../../../app/api/member/voice-session/checkpoint/route.ts) | @/lib/auth/server:2, @/lib/auth/ensureUser:4, @/lib/db/withRequestGuc:8 |
| /api/member/weekly-recap | route | GET, POST | [app/api/member/weekly-recap/route.ts](../../../app/api/member/weekly-recap/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:6 |
| /api/member/wioa-qualification | route | GET, POST | [app/api/member/wioa-qualification/route.ts](../../../app/api/member/wioa-qualification/route.ts) | @/lib/auth/server:3, @/lib/db/withRequestGuc:9 |
| /api/member/wioa-qualification/voice-session | route | POST | [app/api/member/wioa-qualification/voice-session/route.ts](../../../app/api/member/wioa-qualification/voice-session/route.ts) | @/lib/auth/server:2, @/lib/rate-limit:4, @/lib/db/withRequestGuc:9 |
| /api/mentor/letter | route | GET | [app/api/mentor/letter/route.ts](../../../app/api/mentor/letter/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:5 |
| /api/mentors/\[id\]/sessions | route | GET, POST | [app/api/mentors/\[id\]/sessions/route.ts](../../../app/api/mentors/%5Bid%5D/sessions/route.ts) | @/lib/auth/server:4, @/lib/db/withRequestGuc:6 |
| /api/mentors/apply | route | POST | [app/api/mentors/apply/route.ts](../../../app/api/mentors/apply/route.ts) | @/lib/auth/server:4, @/lib/db/withRequestGuc:6 |
| /api/mentors | route | GET | [app/api/mentors/route.ts](../../../app/api/mentors/route.ts) | @/lib/db/withRequestGuc:4 |
| /api/og/career-quiz | route | GET | [app/api/og/career-quiz/route.tsx](../../../app/api/og/career-quiz/route.tsx) |  |
| /api/og/dynamic-card | route | GET | [app/api/og/dynamic-card/route.tsx](../../../app/api/og/dynamic-card/route.tsx) |  |
| /api/og/program | route | GET | [app/api/og/program/route.tsx](../../../app/api/og/program/route.tsx) |  |
| /api/og | route | GET | [app/api/og/route.tsx](../../../app/api/og/route.tsx) |  |
| /api/onboarding/complete | route | POST | [app/api/onboarding/complete/route.ts](../../../app/api/onboarding/complete/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/db/withRequestGuc:7 |
| /api/onboarding/reset | route | POST | [app/api/onboarding/reset/route.ts](../../../app/api/onboarding/reset/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/db/withRequestGuc:7 |
| /api/onboarding/step | route | POST | [app/api/onboarding/step/route.ts](../../../app/api/onboarding/step/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/db/withRequestGuc:6 |
| /api/onboarding/tour-complete | route | POST | [app/api/onboarding/tour-complete/route.ts](../../../app/api/onboarding/tour-complete/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/db/withRequestGuc:7 |
| /api/org/\[slug\]/outcomes | route | GET | [app/api/org/\[slug\]/outcomes/route.ts](../../../app/api/org/%5Bslug%5D/outcomes/route.ts) | @/lib/db/withRequestGuc:3, @/lib/rate-limit:5 |
| /api/org/\[slug\]/settings | route | GET, PUT | [app/api/org/\[slug\]/settings/route.ts](../../../app/api/org/%5Bslug%5D/settings/route.ts) | @/lib/tenant/organizationBranding:5, @/lib/auth/server:6, @/lib/auth/roles:7, @/lib/db/withRequestGuc:9 |
| /api/org/onboard | route | POST | [app/api/org/onboard/route.ts](../../../app/api/org/onboard/route.ts) | @/lib/db/withRequestGuc:2 |
| /api/partner/connect | route | POST | [app/api/partner/connect/route.ts](../../../app/api/partner/connect/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/tenant/withTenantScope:6, @/lib/db/withRequestGuc:10 |
| /api/partner/dashboard | route | GET | [app/api/partner/dashboard/route.ts](../../../app/api/partner/dashboard/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:6 |
| /api/partner/earnings | route | GET | [app/api/partner/earnings/route.ts](../../../app/api/partner/earnings/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:8 |
| /api/partner/export/referrals | route | GET | [app/api/partner/export/referrals/route.ts](../../../app/api/partner/export/referrals/route.ts) | @/lib/auth/server:4, @/lib/auth/roles:5, @/lib/db/withRequestGuc:9 |
| /api/partner/invitations | route | POST | [app/api/partner/invitations/route.ts](../../../app/api/partner/invitations/route.ts) | @/lib/auth/roles:4, @/lib/auth/server:5, @/lib/rate-limit:10, @/lib/db/withRequestGuc:12 |
| /api/partner/members/needs-attention | route | GET | [app/api/partner/members/needs-attention/route.ts](../../../app/api/partner/members/needs-attention/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:5 |
| /api/partner/members | route | GET | [app/api/partner/members/route.ts](../../../app/api/partner/members/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:5 |
| /api/partner/messages | route | GET, POST, PATCH | [app/api/partner/messages/route.ts](../../../app/api/partner/messages/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/messages/rateLimit:10, @/lib/db/withRequestGuc:16 |
| /api/partner/milestones | route | GET | [app/api/partner/milestones/route.ts](../../../app/api/partner/milestones/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:8 |
| /api/partner/onboarding-profile | route | PATCH | [app/api/partner/onboarding-profile/route.ts](../../../app/api/partner/onboarding-profile/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/db/withRequestGuc:7 |
| /api/partner/outreach | route | GET, POST | [app/api/partner/outreach/route.ts](../../../app/api/partner/outreach/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/db/withRequestGuc:10 |
| /api/partner/payout | route | POST | [app/api/partner/payout/route.ts](../../../app/api/partner/payout/route.ts) | @/lib/auth/server:4, @/lib/auth/roles:5, @/lib/tenant/withTenantScope:8, @/lib/tenant/organization:9, @/lib/db/withRequestGuc:14 |
| /api/partner/referral-members | route | GET | [app/api/partner/referral-members/route.ts](../../../app/api/partner/referral-members/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:5 |
| /api/partner/referrals/\[memberId\] | route | PATCH | [app/api/partner/referrals/\[memberId\]/route.ts](../../../app/api/partner/referrals/%5BmemberId%5D/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/db/withRequestGuc:8 |
| /api/partner/referrals | route | GET, POST | [app/api/partner/referrals/route.ts](../../../app/api/partner/referrals/route.ts) | @/lib/auth/server:3, @/lib/auth/roles:4, @/lib/db/withRequestGuc:9 |
| /api/partner/settings/contact | route | PATCH | [app/api/partner/settings/contact/route.ts](../../../app/api/partner/settings/contact/route.ts) | @/lib/auth/server:4, @/lib/auth/roles:5, @/lib/db/withRequestGuc:9 |
| /api/partner/settings/notifications | route | PATCH | [app/api/partner/settings/notifications/route.ts](../../../app/api/partner/settings/notifications/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:7 |
| /api/partner/signup | route | POST | [app/api/partner/signup/route.ts](../../../app/api/partner/signup/route.ts) | @/lib/rate-limit:4, @/lib/tenant/resolveProvisionOrg:11, @/lib/db/withRequestGuc:12 |
| /api/partner/team-assign | route | GET | [app/api/partner/team-assign/route.ts](../../../app/api/partner/team-assign/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:6 |
| /api/partner/voice-session | route | POST | [app/api/partner/voice-session/route.ts](../../../app/api/partner/voice-session/route.ts) | @/lib/auth/server:4, @/lib/rate-limit:6, @/lib/auth/roles:7, @/lib/db/withRequestGuc:12 |
| /api/placement-survey | route | POST, GET | [app/api/placement-survey/route.ts](../../../app/api/placement-survey/route.ts) | @/lib/security/placementSurveyToken:3, @/lib/rate-limit:4, @/lib/db/withRequestGuc:10 |
| /api/portal/nav-badges | route | GET | [app/api/portal/nav-badges/route.ts](../../../app/api/portal/nav-badges/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:4 |
| /api/public/career-quiz/score | route | POST | [app/api/public/career-quiz/score/route.ts](../../../app/api/public/career-quiz/score/route.ts) | @/lib/rate-limit:8 |
| /api/public/interest-profiler/questions | route | GET | [app/api/public/interest-profiler/questions/route.ts](../../../app/api/public/interest-profiler/questions/route.ts) | @/lib/rate-limit:4 |
| /api/public/interest-profiler/score | route | POST | [app/api/public/interest-profiler/score/route.ts](../../../app/api/public/interest-profiler/score/route.ts) | @/lib/rate-limit:8 |
| /api/public/wioa-qualification | route | POST | [app/api/public/wioa-qualification/route.ts](../../../app/api/public/wioa-qualification/route.ts) | @/lib/rate-limit:5, @/lib/tenant/organization:8, @/lib/db/withRequestGuc:9 |
| /api/public/wioa-qualification/voice-session | route | POST | [app/api/public/wioa-qualification/voice-session/route.ts](../../../app/api/public/wioa-qualification/voice-session/route.ts) | @/lib/rate-limit:5 |
| /api/push/subscribe | route | POST, DELETE | [app/api/push/subscribe/route.ts](../../../app/api/push/subscribe/route.ts) | @/lib/auth/server:8, @/lib/db/withRequestGuc:10 |
| /api/q/\[token\]/submit | route | POST | [app/api/q/\[token\]/submit/route.ts](../../../app/api/q/%5Btoken%5D/submit/route.ts) | @/lib/db/withRequestGuc:8, @/lib/rate-limit:13, @/lib/tenant/organization:35 |
| /api/recommend | route | GET | [app/api/recommend/route.ts](../../../app/api/recommend/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:9 |
| /api/referral-sources | route | GET | [app/api/referral-sources/route.ts](../../../app/api/referral-sources/route.ts) | @/lib/db/withRequestGuc:9 |
| /api/skill-missions/\[courseSlug\]/evaluate | route | POST | [app/api/skill-missions/\[courseSlug\]/evaluate/route.ts](../../../app/api/skill-missions/%5BcourseSlug%5D/evaluate/route.ts) | @/lib/auth/server:3, @/lib/db/withRequestGuc:4, @/lib/rate-limit:6 |
| /api/skill-missions/\[courseSlug\]/quiz-check | route | POST | [app/api/skill-missions/\[courseSlug\]/quiz-check/route.ts](../../../app/api/skill-missions/%5BcourseSlug%5D/quiz-check/route.ts) | @/lib/auth/server:3, @/lib/db/withRequestGuc:4 |
| /api/staff/lab-reviews/\[submissionId\] | route | GET, POST | [app/api/staff/lab-reviews/\[submissionId\]/route.ts](../../../app/api/staff/lab-reviews/%5BsubmissionId%5D/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:3 |
| /api/staff/lab-reviews | route | GET | [app/api/staff/lab-reviews/route.ts](../../../app/api/staff/lab-reviews/route.ts) | @/lib/auth/server:2, @/lib/db/withRequestGuc:3 |
| /api/stripe/webhook | route | POST | [app/api/stripe/webhook/route.ts](../../../app/api/stripe/webhook/route.ts) | @/lib/db/withRequestGuc:10 |
| /api/subgroup/dashboard | route | GET | [app/api/subgroup/dashboard/route.ts](../../../app/api/subgroup/dashboard/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:9 |
| /api/subgroup/members/\[id\] | route | GET | [app/api/subgroup/members/\[id\]/route.ts](../../../app/api/subgroup/members/%5Bid%5D/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:12 |
| /api/subgroup/members | route | GET | [app/api/subgroup/members/route.ts](../../../app/api/subgroup/members/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:11 |
| /api/test/xapi-access-token | route | GET | [app/api/test/xapi-access-token/route.ts](../../../app/api/test/xapi-access-token/route.ts) |  |
| /api/tours/\[tourKey\] | route | POST | [app/api/tours/\[tourKey\]/route.ts](../../../app/api/tours/%5BtourKey%5D/route.ts) | @/lib/auth/server:3, @/lib/db/withRequestGuc:5 |
| /api/tours/state | route | GET | [app/api/tours/state/route.ts](../../../app/api/tours/state/route.ts) | @/lib/auth/server:2, @/lib/auth/roles:3, @/lib/db/withRequestGuc:5 |
| /api/unsubscribe | route | POST, GET | [app/api/unsubscribe/route.ts](../../../app/api/unsubscribe/route.ts) | @/lib/db/withRequestGuc:14, @/lib/rate-limit:18 |
| /api/webhooks/coursera | route | POST | [app/api/webhooks/coursera/route.ts](../../../app/api/webhooks/coursera/route.ts) | @/lib/rate-limit:4, @/lib/coursera/webhookAuth:9, @/lib/db/withRequestGuc:19, @/lib/tenant/resolveOrgFromRequest:20 |
| /api/webhooks/learning-completion | route | POST | [app/api/webhooks/learning-completion/route.ts](../../../app/api/webhooks/learning-completion/route.ts) | @/lib/rate-limit:2, @/lib/db/withRequestGuc:10 |
| /api/webhooks/resend | route | POST | [app/api/webhooks/resend/route.ts](../../../app/api/webhooks/resend/route.ts) | @/lib/db/withRequestGuc:17, @/lib/rate-limit:27 |
| /api/xapi/about | route | GET | [app/api/xapi/about/route.ts](../../../app/api/xapi/about/route.ts) |  |
| /api/xapi/config | route | GET, POST | [app/api/xapi/config/route.ts](../../../app/api/xapi/config/route.ts) | @/lib/rate-limit:4 |
| /api/xapi/oauth/token | route | GET, POST | [app/api/xapi/oauth/token/route.ts](../../../app/api/xapi/oauth/token/route.ts) | @/lib/rate-limit:4 |
| /api/xapi | route | POST | [app/api/xapi/route.ts](../../../app/api/xapi/route.ts) |  |
| /api/xapi/statements | route | POST, GET | [app/api/xapi/statements/route.ts](../../../app/api/xapi/statements/route.ts) | @/lib/rate-limit:15, @/lib/db/withRequestGuc:27, @/lib/tenant/resolveOrgFromRequest:28 |
| /apply/confirmation | loading |  | [app/apply/confirmation/loading.tsx](../../../app/apply/confirmation/loading.tsx) |  |
| /apply/confirmation | page |  | [app/apply/confirmation/page.tsx](../../../app/apply/confirmation/page.tsx) | @/lib/auth/server:14 |
| /apply/create-account | error |  | [app/apply/create-account/error.tsx](../../../app/apply/create-account/error.tsx) |  |
| /apply/create-account | loading |  | [app/apply/create-account/loading.tsx](../../../app/apply/create-account/loading.tsx) |  |
| /apply/create-account | page |  | [app/apply/create-account/page.tsx](../../../app/apply/create-account/page.tsx) |  |
| /apply | error |  | [app/apply/error.tsx](../../../app/apply/error.tsx) |  |
| /apply | layout |  | [app/apply/layout.tsx](../../../app/apply/layout.tsx) |  |
| /apply | loading |  | [app/apply/loading.tsx](../../../app/apply/loading.tsx) |  |
| /apply | not-found |  | [app/apply/not-found.tsx](../../../app/apply/not-found.tsx) |  |
| /apply | page |  | [app/apply/page.tsx](../../../app/apply/page.tsx) |  |
| /apply/results | error |  | [app/apply/results/error.tsx](../../../app/apply/results/error.tsx) |  |
| /apply/results | loading |  | [app/apply/results/loading.tsx](../../../app/apply/results/loading.tsx) |  |
| /apply/results | page |  | [app/apply/results/page.tsx](../../../app/apply/results/page.tsx) |  |
| /apply/status | error |  | [app/apply/status/error.tsx](../../../app/apply/status/error.tsx) |  |
| /apply/status | loading |  | [app/apply/status/loading.tsx](../../../app/apply/status/loading.tsx) |  |
| /apply/status | page |  | [app/apply/status/page.tsx](../../../app/apply/status/page.tsx) | @/lib/auth/server:6 |
| /auth/callback | route | GET | [app/auth/callback/route.ts](../../../app/auth/callback/route.ts) | @/lib/auth/safeRedirectPath:6, @/lib/auth/postLoginRedirect:7 |
| /consent/\[token\] | page |  | [app/consent/\[token\]/page.tsx](../../../app/consent/%5Btoken%5D/page.tsx) | ./GuardianConsentForm:3 |
| /dev/astryx/ai-chat-landing | page |  | [app/dev/astryx/ai-chat-landing/page.tsx](../../../app/dev/astryx/ai-chat-landing/page.tsx) |  |
| /dev/astryx/components | page |  | [app/dev/astryx/components/page.tsx](../../../app/dev/astryx/components/page.tsx) |  |
| /dev/astryx/dashboard | page |  | [app/dev/astryx/dashboard/page.tsx](../../../app/dev/astryx/dashboard/page.tsx) |  |
| /dev/astryx/file-explorer | page |  | [app/dev/astryx/file-explorer/page.tsx](../../../app/dev/astryx/file-explorer/page.tsx) |  |
| /dev/astryx/kanban-board | page |  | [app/dev/astryx/kanban-board/page.tsx](../../../app/dev/astryx/kanban-board/page.tsx) |  |
| /dev/astryx | layout |  | [app/dev/astryx/layout.tsx](../../../app/dev/astryx/layout.tsx) |  |
| /dev/astryx/login-sso | page |  | [app/dev/astryx/login-sso/page.tsx](../../../app/dev/astryx/login-sso/page.tsx) |  |
| /dev/astryx/overlays | page |  | [app/dev/astryx/overlays/page.tsx](../../../app/dev/astryx/overlays/page.tsx) |  |
| /dev/astryx | page |  | [app/dev/astryx/page.tsx](../../../app/dev/astryx/page.tsx) |  |
| /dev/astryx/settings | page |  | [app/dev/astryx/settings/page.tsx](../../../app/dev/astryx/settings/page.tsx) |  |
| /dev/astryx/side-gallery | page |  | [app/dev/astryx/side-gallery/page.tsx](../../../app/dev/astryx/side-gallery/page.tsx) |  |
| /dev/astryx/table-page | page |  | [app/dev/astryx/table-page/page.tsx](../../../app/dev/astryx/table-page/page.tsx) |  |
| /dev/astryx/table | page |  | [app/dev/astryx/table/page.tsx](../../../app/dev/astryx/table/page.tsx) |  |
| /dev/compare | layout |  | [app/dev/compare/layout.tsx](../../../app/dev/compare/layout.tsx) |  |
| /dev/compare | page |  | [app/dev/compare/page.tsx](../../../app/dev/compare/page.tsx) |  |
| /dev/dashboard | layout |  | [app/dev/dashboard/layout.tsx](../../../app/dev/dashboard/layout.tsx) |  |
| /dev/dashboard | page |  | [app/dev/dashboard/page.tsx](../../../app/dev/dashboard/page.tsx) |  |
| /dev/kit | layout |  | [app/dev/kit/layout.tsx](../../../app/dev/kit/layout.tsx) |  |
| /dev/kit | page |  | [app/dev/kit/page.tsx](../../../app/dev/kit/page.tsx) |  |
| /dev/member/assessment | page |  | [app/dev/member/assessment/page.tsx](../../../app/dev/member/assessment/page.tsx) |  |
| /dev/member/benefits-cliff | page |  | [app/dev/member/benefits-cliff/page.tsx](../../../app/dev/member/benefits-cliff/page.tsx) |  |
| /dev/member/career-business-coach | page |  | [app/dev/member/career-business-coach/page.tsx](../../../app/dev/member/career-business-coach/page.tsx) |  |
| /dev/member/certificates-empty | page |  | [app/dev/member/certificates-empty/page.tsx](../../../app/dev/member/certificates-empty/page.tsx) |  |
| /dev/member/certificates | page |  | [app/dev/member/certificates/page.tsx](../../../app/dev/member/certificates/page.tsx) |  |
| /dev/member/cover-letter | page |  | [app/dev/member/cover-letter/page.tsx](../../../app/dev/member/cover-letter/page.tsx) |  |
| /dev/member/elevator-pitch | page |  | [app/dev/member/elevator-pitch/page.tsx](../../../app/dev/member/elevator-pitch/page.tsx) |  |
| /dev/member/gap-analyzer | page |  | [app/dev/member/gap-analyzer/page.tsx](../../../app/dev/member/gap-analyzer/page.tsx) |  |
| /dev/member/home | page |  | [app/dev/member/home/page.tsx](../../../app/dev/member/home/page.tsx) |  |
| /dev/member/interview-coach | page |  | [app/dev/member/interview-coach/page.tsx](../../../app/dev/member/interview-coach/page.tsx) |  |
| /dev/member/interview-practice | page |  | [app/dev/member/interview-practice/page.tsx](../../../app/dev/member/interview-practice/page.tsx) |  |
| /dev/member/interview-prep | page |  | [app/dev/member/interview-prep/page.tsx](../../../app/dev/member/interview-prep/page.tsx) |  |
| /dev/member/job-match | page |  | [app/dev/member/job-match/page.tsx](../../../app/dev/member/job-match/page.tsx) |  |
| /dev/member/jobs-empty | page |  | [app/dev/member/jobs-empty/page.tsx](../../../app/dev/member/jobs-empty/page.tsx) |  |
| /dev/member/jobs | page |  | [app/dev/member/jobs/page.tsx](../../../app/dev/member/jobs/page.tsx) |  |
| /dev/member | layout |  | [app/dev/member/layout.tsx](../../../app/dev/member/layout.tsx) |  |
| /dev/member/linkedin-about | page |  | [app/dev/member/linkedin-about/page.tsx](../../../app/dev/member/linkedin-about/page.tsx) |  |
| /dev/member/linkedin-headline | page |  | [app/dev/member/linkedin-headline/page.tsx](../../../app/dev/member/linkedin-headline/page.tsx) |  |
| /dev/member/messages | page |  | [app/dev/member/messages/page.tsx](../../../app/dev/member/messages/page.tsx) |  |
| /dev/member/missions | page |  | [app/dev/member/missions/page.tsx](../../../app/dev/member/missions/page.tsx) |  |
| /dev/member/profile | page |  | [app/dev/member/profile/page.tsx](../../../app/dev/member/profile/page.tsx) |  |
| /dev/member/program | page |  | [app/dev/member/program/page.tsx](../../../app/dev/member/program/page.tsx) |  |
| /dev/member/progress | page |  | [app/dev/member/progress/page.tsx](../../../app/dev/member/progress/page.tsx) |  |
| /dev/member/resume-rewriter | page |  | [app/dev/member/resume-rewriter/page.tsx](../../../app/dev/member/resume-rewriter/page.tsx) |  |
| /dev/member/resume-strength | page |  | [app/dev/member/resume-strength/page.tsx](../../../app/dev/member/resume-strength/page.tsx) |  |
| /dev/member/resume-studio | page |  | [app/dev/member/resume-studio/page.tsx](../../../app/dev/member/resume-studio/page.tsx) |  |
| /dev/member/salary-negotiation | page |  | [app/dev/member/salary-negotiation/page.tsx](../../../app/dev/member/salary-negotiation/page.tsx) |  |
| /dev/member/toolkit | page |  | [app/dev/member/toolkit/page.tsx](../../../app/dev/member/toolkit/page.tsx) |  |
| /dev/member/wioa-qualification | page |  | [app/dev/member/wioa-qualification/page.tsx](../../../app/dev/member/wioa-qualification/page.tsx) |  |
| /dev/staff/admin-command | page |  | [app/dev/staff/admin-command/page.tsx](../../../app/dev/staff/admin-command/page.tsx) |  |
| /dev/staff/counselor-atrisk | page |  | [app/dev/staff/counselor-atrisk/page.tsx](../../../app/dev/staff/counselor-atrisk/page.tsx) |  |
| /dev/staff/counselor-command | page |  | [app/dev/staff/counselor-command/page.tsx](../../../app/dev/staff/counselor-command/page.tsx) |  |
| /dev/staff/counselors | layout |  | [app/dev/staff/counselors/layout.tsx](../../../app/dev/staff/counselors/layout.tsx) |  |
| /dev/staff/counselors | page |  | [app/dev/staff/counselors/page.tsx](../../../app/dev/staff/counselors/page.tsx) |  |
| /dev/staff/crons-monitor | layout |  | [app/dev/staff/crons-monitor/layout.tsx](../../../app/dev/staff/crons-monitor/layout.tsx) |  |
| /dev/staff/crons-monitor | page |  | [app/dev/staff/crons-monitor/page.tsx](../../../app/dev/staff/crons-monitor/page.tsx) |  |
| /dev/staff/employer-command | page |  | [app/dev/staff/employer-command/page.tsx](../../../app/dev/staff/employer-command/page.tsx) |  |
| /dev/staff/employer-jobs | page |  | [app/dev/staff/employer-jobs/page.tsx](../../../app/dev/staff/employer-jobs/page.tsx) |  |
| /dev/staff/jobs-board | layout |  | [app/dev/staff/jobs-board/layout.tsx](../../../app/dev/staff/jobs-board/layout.tsx) |  |
| /dev/staff/jobs-board | page |  | [app/dev/staff/jobs-board/page.tsx](../../../app/dev/staff/jobs-board/page.tsx) |  |
| /dev/staff | layout |  | [app/dev/staff/layout.tsx](../../../app/dev/staff/layout.tsx) |  |
| /dev/staff/partner-command | page |  | [app/dev/staff/partner-command/page.tsx](../../../app/dev/staff/partner-command/page.tsx) |  |
| /dev/staff/partner-members | page |  | [app/dev/staff/partner-members/page.tsx](../../../app/dev/staff/partner-members/page.tsx) |  |
| /dev/staff/partner | layout |  | [app/dev/staff/partner/layout.tsx](../../../app/dev/staff/partner/layout.tsx) |  |
| /dev/staff/partner | page |  | [app/dev/staff/partner/page.tsx](../../../app/dev/staff/partner/page.tsx) |  |
| /dev/staff/people | page |  | [app/dev/staff/people/page.tsx](../../../app/dev/staff/people/page.tsx) |  |
| /dev/staff/pipeline-funnel | layout |  | [app/dev/staff/pipeline-funnel/layout.tsx](../../../app/dev/staff/pipeline-funnel/layout.tsx) |  |
| /dev/staff/pipeline-funnel | page |  | [app/dev/staff/pipeline-funnel/page.tsx](../../../app/dev/staff/pipeline-funnel/page.tsx) |  |
| /dev/staff/placements | layout |  | [app/dev/staff/placements/layout.tsx](../../../app/dev/staff/placements/layout.tsx) |  |
| /dev/staff/placements | page |  | [app/dev/staff/placements/page.tsx](../../../app/dev/staff/placements/page.tsx) |  |
| /dev/staff/students-roster | page |  | [app/dev/staff/students-roster/page.tsx](../../../app/dev/staff/students-roster/page.tsx) |  |
| /dev/staff/training-progress | page |  | [app/dev/staff/training-progress/page.tsx](../../../app/dev/staff/training-progress/page.tsx) |  |
| /dev/voice-studio | layout |  | [app/dev/voice-studio/layout.tsx](../../../app/dev/voice-studio/layout.tsx) |  |
| /dev/voice-studio | page |  | [app/dev/voice-studio/page.tsx](../../../app/dev/voice-studio/page.tsx) |  |
| /employer/loi | page |  | [app/employer/loi/page.tsx](../../../app/employer/loi/page.tsx) |  |
| /employer/outcomes | page |  | [app/employer/outcomes/page.tsx](../../../app/employer/outcomes/page.tsx) | @/lib/auth/server:4, @/lib/auth/roles:5 |
| /employer/thank-you | page |  | [app/employer/thank-you/page.tsx](../../../app/employer/thank-you/page.tsx) |  |
| /employers/signup | layout |  | [app/employers/signup/layout.tsx](../../../app/employers/signup/layout.tsx) |  |
| /employers/signup | page |  | [app/employers/signup/page.tsx](../../../app/employers/signup/page.tsx) |  |
| /enroll/\[school\] | page |  | [app/enroll/\[school\]/page.tsx](../../../app/enroll/%5Bschool%5D/page.tsx) |  |
| / | error |  | [app/error.tsx](../../../app/error.tsx) |  |
| / | global-error |  | [app/global-error.tsx](../../../app/global-error.tsx) |  |
| /invite | layout |  | [app/invite/layout.tsx](../../../app/invite/layout.tsx) |  |
| /invite | page |  | [app/invite/page.tsx](../../../app/invite/page.tsx) | @/lib/auth/safeRedirectPath:9 |
| / | layout |  | [app/layout.tsx](../../../app/layout.tsx) | @/lib/db/gucContext:19, @/lib/auth/roles:24, @/lib/auth/layoutUserId:25, @/lib/auth/server:26, @/lib/tenant/resolveOrgFromRequest:30, @/lib/db/gucContext:115 |
| /mentor/apply | layout |  | [app/mentor/apply/layout.tsx](../../../app/mentor/apply/layout.tsx) |  |
| /mentor/apply | page |  | [app/mentor/apply/page.tsx](../../../app/mentor/apply/page.tsx) |  |
| / | not-found |  | [app/not-found.tsx](../../../app/not-found.tsx) |  |
| /org/\[slug\]/outcomes | page |  | [app/org/\[slug\]/outcomes/page.tsx](../../../app/org/%5Bslug%5D/outcomes/page.tsx) |  |
| /org/onboard | layout |  | [app/org/onboard/layout.tsx](../../../app/org/onboard/layout.tsx) |  |
| /org/onboard | page |  | [app/org/onboard/page.tsx](../../../app/org/onboard/page.tsx) |  |
| /partner-signup | layout |  | [app/partner-signup/layout.tsx](../../../app/partner-signup/layout.tsx) |  |
| /partner-signup | page |  | [app/partner-signup/page.tsx](../../../app/partner-signup/page.tsx) |  |
| /placement-survey | page |  | [app/placement-survey/page.tsx](../../../app/placement-survey/page.tsx) | @/lib/security/placementSurveyToken:3 |
| /pwa-start | page |  | [app/pwa-start/page.tsx](../../../app/pwa-start/page.tsx) | @/lib/auth/server:3, @/lib/auth/roles:4 |
| /q/\[token\] | page |  | [app/q/\[token\]/page.tsx](../../../app/q/%5Btoken%5D/page.tsx) |  |
| /r/\[code\] | route | GET | [app/r/\[code\]/route.ts](../../../app/r/%5Bcode%5D/route.ts) |  |
| /share/achievement | page |  | [app/share/achievement/page.tsx](../../../app/share/achievement/page.tsx) |  |
| /survey/placement/\[token\] | page |  | [app/survey/placement/\[token\]/page.tsx](../../../app/survey/placement/%5Btoken%5D/page.tsx) | @/lib/security/placementSurveyToken:2 |
| /wioa-qualification | layout |  | [app/wioa-qualification/layout.tsx](../../../app/wioa-qualification/layout.tsx) |  |
| /wioa-qualification | page |  | [app/wioa-qualification/page.tsx](../../../app/wioa-qualification/page.tsx) |  |
| /\[lang\] | astro-page |  | [marketing/src/pages/\[lang\]/index.astro](../../../marketing/src/pages/%5Blang%5D/index.astro) |  |
| /about | astro-page |  | [marketing/src/pages/about.astro](../../../marketing/src/pages/about.astro) |  |
| /accessibility | astro-page |  | [marketing/src/pages/accessibility.astro](../../../marketing/src/pages/accessibility.astro) |  |
| /blog | astro-page |  | [marketing/src/pages/blog.astro](../../../marketing/src/pages/blog.astro) |  |
| /blog/\[slug\] | astro-page |  | [marketing/src/pages/blog/\[slug\].astro](../../../marketing/src/pages/blog/%5Bslug%5D.astro) |  |
| /career-quiz | astro-page |  | [marketing/src/pages/career-quiz.astro](../../../marketing/src/pages/career-quiz.astro) |  |
| /careers | astro-page |  | [marketing/src/pages/careers.astro](../../../marketing/src/pages/careers.astro) |  |
| /careers/thank-you | astro-page |  | [marketing/src/pages/careers/thank-you.astro](../../../marketing/src/pages/careers/thank-you.astro) |  |
| /contact | astro-page |  | [marketing/src/pages/contact.astro](../../../marketing/src/pages/contact.astro) |  |
| /contact/thanks | astro-page |  | [marketing/src/pages/contact/thanks.astro](../../../marketing/src/pages/contact/thanks.astro) |  |
| /donate | astro-page |  | [marketing/src/pages/donate.astro](../../../marketing/src/pages/donate.astro) |  |
| /employers | astro-page |  | [marketing/src/pages/employers.astro](../../../marketing/src/pages/employers.astro) |  |
| /faq | astro-page |  | [marketing/src/pages/faq.astro](../../../marketing/src/pages/faq.astro) |  |
| /find-your-path | astro-page |  | [marketing/src/pages/find-your-path.astro](../../../marketing/src/pages/find-your-path.astro) |  |
| /how-it-works | astro-page |  | [marketing/src/pages/how-it-works.astro](../../../marketing/src/pages/how-it-works.astro) |  |
| /impact | astro-page |  | [marketing/src/pages/impact.astro](../../../marketing/src/pages/impact.astro) |  |
| / | astro-page |  | [marketing/src/pages/index.astro](../../../marketing/src/pages/index.astro) |  |
| /insights/empowering-nonprofits-through-skill | astro-page |  | [marketing/src/pages/insights/empowering-nonprofits-through-skill.astro](../../../marketing/src/pages/insights/empowering-nonprofits-through-skill.astro) |  |
| /interest-profiler | astro-page |  | [marketing/src/pages/interest-profiler.astro](../../../marketing/src/pages/interest-profiler.astro) |  |
| /leadership | astro-page |  | [marketing/src/pages/leadership.astro](../../../marketing/src/pages/leadership.astro) |  |
| /leadership/\[slug\] | astro-page |  | [marketing/src/pages/leadership/\[slug\].astro](../../../marketing/src/pages/leadership/%5Bslug%5D.astro) |  |
| /lp/google-it-automation | astro-page |  | [marketing/src/pages/lp/google-it-automation.astro](../../../marketing/src/pages/lp/google-it-automation.astro) |  |
| /mentor | astro-page |  | [marketing/src/pages/mentor.astro](../../../marketing/src/pages/mentor.astro) |  |
| /partners | astro-page |  | [marketing/src/pages/partners.astro](../../../marketing/src/pages/partners.astro) |  |
| /partners/thank-you | astro-page |  | [marketing/src/pages/partners/thank-you.astro](../../../marketing/src/pages/partners/thank-you.astro) |  |
| /privacy | astro-page |  | [marketing/src/pages/privacy.astro](../../../marketing/src/pages/privacy.astro) |  |
| /program-comparison | astro-page |  | [marketing/src/pages/program-comparison.astro](../../../marketing/src/pages/program-comparison.astro) |  |
| /programs | astro-page |  | [marketing/src/pages/programs.astro](../../../marketing/src/pages/programs.astro) |  |
| /programs/\[slug\] | astro-page |  | [marketing/src/pages/programs/\[slug\].astro](../../../marketing/src/pages/programs/%5Bslug%5D.astro) |  |
| /programs/google-it-support | astro-page |  | [marketing/src/pages/programs/google-it-support.astro](../../../marketing/src/pages/programs/google-it-support.astro) |  |
| /programs/price-list | astro-page |  | [marketing/src/pages/programs/price-list.astro](../../../marketing/src/pages/programs/price-list.astro) |  |
| /salary-guide | astro-page |  | [marketing/src/pages/salary-guide.astro](../../../marketing/src/pages/salary-guide.astro) |  |
| /terms | astro-page |  | [marketing/src/pages/terms.astro](../../../marketing/src/pages/terms.astro) |  |
| /what-we-do | astro-page |  | [marketing/src/pages/what-we-do.astro](../../../marketing/src/pages/what-we-do.astro) |  |
|  | pages-framework |  | [pages/_app.tsx](../../../pages/_app.tsx) |  |
