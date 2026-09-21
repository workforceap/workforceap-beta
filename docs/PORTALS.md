# WorkforceAP — Portal Documentation

> Generated: 2026-06-16  
> Covers: Member, Admin, Counselor, Employer, Partner portals

---

## Member Portal (`/dashboard/*`)

### Dashboard Home

The member dashboard is the primary experience for enrolled members. It adapts between desktop and mobile layouts.

**Desktop Layout:**
- Sidebar navigation with portal sections
- Main content area with cards and widgets
- Top bar with notifications, points, profile

**Mobile Layout:**
- Bottom navigation icon bar (Home, Education, Skills, Messages, Portfolio, Profile)
- Scrollable card-based feed
- Priority action cards at top

**Key Components:**
- `DesktopDashboard` — full desktop layout
- `MobileDiscoverSection` — mobile feed
- `MobileJourneyTimeline` — visual progress
- `MobilePointsSection` — gamification
- `MobilePriorityActionCard` — next recommended action
- `MobileProgramTrainingCard` — active training
- `MobileQuickActions` — quick buttons
- `MobileRecentActivity` — activity feed
- `MobileStateANextStepCard` — state-specific steps

### AI Tools Suite (`/dashboard/ai-tools/*`)

**Resume & Profile:**
- `resume-analysis` — AI reviews resume for gaps and strengths
- `resume-rewriter` — AI rewrites resume for target roles
- `resume-coach` — Live coaching session for resume improvement
- `resume-studio` — Visual resume builder
- `linkedin-headline` — Optimizes LinkedIn headline
- `linkedin-about` — Writes LinkedIn about section
- `elevator-pitch` — Generates elevator pitch

**Job Search:**
- `job-match-scorer` — Scores fit between resume and job
- `gap-analyzer` — Identifies skill gaps for target role
- `skill-mapper` — Maps skills to job requirements
- `skill-checkpoints` — Verifies skill claims
- `application-tracker` — Tracks job applications

**Interview Prep:**
- `interview-coach` — Interview strategy coaching
- `interview-practice` — Practice questions
- `interview-prep` — Prep materials
- `voice-interview` — Voice practice with AI feedback

**Career Development:**
- `cover-letter` — Cover letter generator
- `salary-negotiation` — Negotiation prep
- `career-business-coach` — Business coaching
- `readiness-coach` — Readiness assessment
- `training-bridge` — Training gap analysis
- `benefits-cliff` — Benefits impact analysis

**History:**
- `history` — All AI tool usage history

### Learning Hub (`/dashboard/learning/*`)

- `interest-profiler` — 30-question interest assessment
- `find-your-career` — Career finder based on interests
- `wioa-qualification` — WIOA eligibility check
- `coursera` — Coursera course integration
- `training` — Training progress tracking
- `assessment` — Skills assessments
- `certifications` — Certification management

### Jobs Board (`/dashboard/jobs/*`)

- `jobs` — Job board with filters and search
- `jobs/[id]` — Job detail with apply funnel
- `job-applications` — My applications tracking

### Career Support (`/dashboard/*`)

- `counselor` — Lilley, the member AI career coach (not an assigned staff counselor)
- `mentor` — My mentor
- `mentors` — Mentor directory
- `messages` — Platform messaging
- `weekly-recap` — Weekly progress recap
- `missions` — Skill missions and challenges
- `survey` — Surveys and feedback
- `readiness` — Job readiness dashboard
- `resume` — Resume management
- `profile` — Profile settings
- `settings` — Account settings
- `points` — Gamification points
- `program` — Current program details
- `program/change` — Change program
- `program/start` — Path to certification (enrollment guide; uses the same CourseEnrollment resolver as My Program)
- `program/employer-screening` — Employer screening
- `eligibility` — Eligibility verification
- `help` — Help center

---

## Admin Portal (`/admin/*`)

### Dashboard & Analytics

- `dashboard` — Overview with key metrics
- `analytics` — Analytics hub
- `analytics/ai-efficacy` — AI tool usage and efficacy
- `metrics` — Key performance metrics
- `health` — System health dashboard
- `diagnostics` — System diagnostics
- `growth` — Growth metrics

### Member Management

- `members` — Member list with filters
- `members/[id]` — Member detail page
- `members/[id]/lifecycle` — Redirects to the member record's Activity tab (`members/[id]?tab=activity`)
- `members/[id]/readiness` — Readiness assessment
- `members/[id]/stakeholder` — Stakeholder view
- `members/new` — Add new member wizard
- `members/duplicates` — Duplicate detection
- `members/merge` — Merge duplicate members
- `members/training` — Training progress
- `members/job-ready` — Job-ready members
- `members/interview-ready` — Interview-ready members
- `members/at-risk` — At-risk members

### Program & Training

- `programs` — Program management
- `coursera` — Coursera integration admin
- `coursera/csv-import` — CSV import tool
- `coursera/health` — Health check dashboard
- `coursera/learners/[userId]` — Learner detail
- `training-progress` — Training progress tracking
- `assessments` — Assessment management
- `certifications` — Certification management
- `program-change-requests` — Change request approval
- `career-mappings` — ONET career mappings

### Employer Management

- `employers` — Employer list
- `employers/[id]` — Employer detail
- `employer-screening-packs` — Screening pack management
- `jobs` — Job management
- `jobs/[id]` — Job detail
- `placements` — Placement tracking
- `placements/new` — New placement
- `pipeline` — Hiring pipeline
- `placement-surveys` — Placement surveys

### Partner Management

- `partners` — Partner list
- `partners/[id]` — Partner detail
- `partners/new` — New partner onboarding

### Outcomes & Reporting

- `outcomes` — Outcomes dashboard
- `outcomes/methodology` — Outcomes methodology
- `outcomes/board.pdf` — Board report PDF
- `reports/quarterly-outcomes` — Quarterly reports
- `reports/wioa` — WIOA reports
- `reports/wioa/generate` — Generate WIOA report
- `board` — Board view
- `board/print` — Print board view
- `weekly-recap` — Weekly recaps

### Communications

- `messages` — Message admin
- `email-templates` — Email template management
- `email-crons` — Scheduled email jobs
- `feedback` — User feedback
- `testimonials` — Testimonial management
- `blog` — Blog management
- `blog/[id]/edit` — Edit blog post
- `blog/new` — New blog post
- `blog/ai` — AI blog tools
- `blog/preview/[slug]` — Blog preview

### System Administration

- `users` — User management
- `users/deleted` — Deleted users
- `invites` — Invitations
- `invites/new` — New invite
- `settings` — System settings
- `feature-flags` — Feature flags
- `crons` — Cron job management
- `exports` — Data exports
- `audit-logs` — Audit trail
- `webhook-events` — Webhook event log
- `data-retention` — Data retention policies
- `agent-inbox` — Agent inbox
- `counselors` — Counselor management
- `mentors` — Mentor management
- `subgroups` — Subgroup management
- `subgroups/new` — New subgroup
- `subgroups/[id]` — Subgroup detail
- `subgroups/[id]/edit` — Edit subgroup
- `sessions` — Session management
- `sessions/walk-in` — Walk-in sessions
- `sessions/[memberId]/run` — Run counseling session

---

## Counselor Portal (`/counselor/*`)

- `dashboard` — Counselor dashboard with queue
- `students` — Student list
- `students/[memberId]` — Student detail with notes
- `inbox` — Message inbox
- `messages` — Messages
- `placements` — Placement tracking
- `queue` — Student queue
- `triage` — Student triage
- `inactive-members` — Inactive member follow-up
- `resources` — Counselor resources
- `guide` — Counselor guide
- `sessions` — Session management
- `sessions/walk-in` — Walk-in sessions
- `sessions/[memberId]/run` — Run session
- `notifications` — Notifications

---

## Employer Portal (`/employer/*`)

- `dashboard` — Employer dashboard
- `jobs` — Job management
- `jobs/new` — Post new job
- `jobs/post` — Post job (alt)
- `jobs/[id]` — Job detail
- `jobs/[id]/edit` — Edit job
- `jobs/[id]/applicants` — Job applicants
- `jobs/import` — Import jobs
- `candidates` — Candidate pool
- `candidates/[studentId]` — Candidate detail
- `applications` — Applications
- `applications/[id]` — Application detail
- `pipeline` — Hiring pipeline
- `matches` — Candidate matches
- `messages` — Messages
- `settings` — Settings
- `billing` — Billing/Stripe checkout
- `guide` — Employer guide
- `work-queue` — Work queue

---

## Partner Portal (`/partner/*`)

- `dashboard` — Partner dashboard
- `members` — Referred members
- `members/[id]` — Member detail
- `referred-members` — Referred members (alt)
- `referred-members/[memberId]` — Member detail
- `milestones` — Milestone tracking
- `outcomes` — Outcome tracking
- `exports` — Data exports
- `attention` — Members needing attention
- `resources` — Partner resources
- `messages` — Messages
- `settings` — Settings
- `guide` — Partner guide

---

## Key Features by Portal

### Member Portal Features
- AI-powered resume analysis and rewriting
- Job matching and skill gap analysis
- Interview preparation with voice practice
- LinkedIn profile optimization
- Career coaching and readiness assessment
- Gamification with points and missions
- Weekly progress recaps
- Program training tracking
- Certification management
- Direct messaging with counselor/mentor

### Admin Portal Features
- Full member lifecycle management
- AI efficacy analytics
- Outcomes tracking and reporting
- WIOA compliance reporting
- Employer and partner management
- Email campaign management
- Blog content management with AI tools
- Feature flag management
- Data export and audit logs
- Webhook event monitoring
- System health diagnostics

### Counselor Portal Features
- Student queue and triage
- Session management (scheduled and walk-in)
- Placement tracking
- Inactive member follow-up
- Direct messaging
- Resource library
- Student detail with notes and timeline

### Employer Portal Features
- Job posting and management
- Candidate pool browsing
- Application review
- Hiring pipeline tracking
- Candidate matching
- Stripe billing integration
- Direct messaging with candidates
- Work queue for tasks

### Partner Portal Features
- Referred member tracking
- Milestone and outcome tracking
- Data exports
- Attention alerts for at-risk members
- Resource library
- Direct messaging
- Settings and notifications

---

## Data Flows

### Member Onboarding
1. `/apply` — Eligibility check and application
2. `/apply/create-account` — Account creation
3. `/apply/results` — Application results
4. `/dashboard` — Member dashboard
5. `/dashboard/learning/interest-profiler` — Interest assessment
6. `/dashboard/ai-tools/resume-analysis` — Resume analysis
7. `/dashboard/program` — Program enrollment

### Job Placement Flow
1. `/dashboard/jobs` — Browse jobs
2. `/dashboard/jobs/[id]` — View job detail
3. `/dashboard/ai-tools/job-match-scorer` — Score fit
4. `/dashboard/jobs/[id]/apply` — Apply
5. `/dashboard/job-applications` — Track application
6. Employer reviews in `/employer/applications`
7. Placement logged in `/admin/placements`

### Counselor Session Flow
1. `/counselor/queue` — Student queue
2. `/counselor/sessions/[memberId]/run` — Run session
3. Notes saved to member profile
4. `/counselor/placements` — Log placement
5. `/counselor/inactive-members` — Follow-up

---

*Document version: 1.0*  
*Last updated: 2026-06-16*
