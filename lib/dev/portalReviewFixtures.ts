/** Preview navigation, not acceptance evidence. Keep scenarios tied to owning pages. */
export type FixtureRole = 'member' | 'counselor' | 'admin' | 'employer' | 'partner';
export type FixtureScenario = { title: string; href: string };
export type PortalReviewFixture = {
  role: FixtureRole;
  route: string;
  title: string;
  description: string;
  canTry: string;
  blocked: string;
  availability?: 'local-development';
  scenarios: FixtureScenario[];
};

type ScenarioInput = readonly [title: string, query: string];
function fixture(role: FixtureRole, slug: string, title: string, description: string, canTry: string, blocked: string, scenarios: readonly ScenarioInput[] = [], availability?: PortalReviewFixture['availability']): PortalReviewFixture {
  const route = `/dev/${role === 'member' ? 'member' : 'staff'}/${slug}`;
  return { role, route, title, description, canTry, blocked, availability, scenarios: scenarios.map(([name, query]) => ({ title: name, href: `${route}?${query}` })) };
}
const filled: readonly ScenarioInput[] = [['Sample result', 'state=filled']];
const toolLimit = 'Generating new output, loading account history and saving to an account require an approved signed-in session and configured providers.';
const staffLimit = 'Record links and business actions can enter the signed-in portal. Account access, real records, writes and authorization checks remain blocked.';

export const PORTAL_REVIEW_FIXTURES: PortalReviewFixture[] = [
  fixture('member', 'home', 'Home and next step', 'Review the résumé-to-consultation handoff and progress states.', 'Inspect the next action, handoff evidence, program switch and alternate notices. The fixture tour stays local without account-progress or analytics writes.', 'Email/calendar reconciliation and provider access are not connected. Offer, check-in and onboarding-wizard saves use real endpoints; do not submit them without approved records. Real tour completion telemetry still needs separate investigation.', [
    ['Focused handoff', 'approval=off&offer=off&first90=off&handoff=received'],
    ['Handoff unknown', 'handoff=unknown'], ['Handoff awaiting confirmation', 'handoff=pending'], ['Résumé received', 'handoff=received'], ['Confirmed contract example', 'handoff=confirmed'],
    ['Application pending', 'approval=live'], ['Application closed', 'approval=closed'], ['Approval complete', 'approval=complete'], ['Approval hidden', 'approval=off'],
    ['Training not started', 'course=zero'], ['Training stalled', 'course=zero-stale'],
    ['First week', 'first90=week_1'], ['Day 30', 'first90=day_30'], ['Day 60', 'first90=day_60'], ['Day 90', 'first90=day_90'], ['Check-in hidden', 'first90=off'],
    ['Offer hidden', 'offer=off'], ['Youth notice', 'youth=17'], ['No goals', 'goals=none'], ['First-login wizard', 'onboarding=on'], ['Guided tour', 'onboarding=tour'],
    ['Two programs', 'programs=2'], ['Secondary program', 'programs=2&program=comptia-a-professional-certificate'], ['Staff view', 'staff=1'], ['No advisor', 'advisor=off'],
  ]),
  fixture('member', 'resume-studio', 'Résumé workspace', 'Original files, scoring, rewriting and coaching in one workspace.', 'Edit Score or Rewrite inputs, switch tabs, reload and return through Home in the same tab. Inspect saved/restored status, clear the saved copy and expand optional settings.', 'Uploads, generation, account reads and voice are disabled. Same-tab input drafts expire after 24 hours; account-scoped recovery/logout, generated-result history and actual downloads require separate signed-in acceptance.', [
    ['Files', 'view=files'], ['Score form', 'view=score'], ['Sample score', 'view=score&state=filled'], ['Rewrite form', 'view=rewrite'], ['Sample rewrite', 'view=rewrite&state=filled'], ['Coach empty state', 'view=coach'],
  ]),
  fixture('member', 'skill-mapper', 'Skill Mapper', 'Occupation requirements and estimated profile comparison.', 'Compare the two synthetic radars, open numeric alternatives and inspect skill details.', 'Search, extraction and export are disabled. Training options enters a signed-in tool; owned lookup persistence and O*NET/provider calls remain blocked.'),
  fixture('member', 'jobs', 'Job board and applications', 'Sample application pipeline, open roles and job details.', 'Filter and save sample jobs locally, open a matching detail, copy the referral text, exercise application consent/confirmation and return to the sample board. These preview interactions make no member or provider API calls.', 'Nothing is sent to an employer or persisted to an account; reload resets the simulation. Real applications, saved-job persistence, employer delivery and account history remain separate acceptance checks.', [
    ['Open roles', 'state=board'], ['No open roles', 'state=board-empty'], ['Searchable listing', 'state=listing'], ['Empty listing', 'state=listing-empty'], ['Job detail and apply', 'state=detail'],
    ['Remote job detail', 'state=detail&job=j2'], ['Support job detail', 'state=detail&job=j3'], ['Hybrid job detail', 'state=detail&job=j4'], ['Load error', 'state=error'],
  ]),
  fixture('member', 'jobs-empty', 'Applications · empty', 'An application pipeline before the first application.', 'Inspect the empty state and browse open roles.', 'Real applications and account persistence require an approved signed-in member.'),
  fixture('member', 'program', 'My program', 'Enrolled AWS curriculum, training workspace and a separate DigitalLearn example.', 'Inspect module states and the program picker. Resume/Continue opens the AWS training workspace; DigitalLearn lessons are a separate example.', 'Provider launches leave this environment. Module-complete and training-save actions use real endpoints; provider access and recorded completion remain blocked.', [
    ['Choose a program', 'state=empty'], ['Training workspace', 'state=workspace'], ['Separate DigitalLearn example', 'state=lessons'],
  ]),
  fixture('member', 'assessment', 'Training preassessment', 'Completed, locked and in-progress skills checks.', 'Inspect the wizard steps, answer controls, lock explanation and sample result.', 'Final submission uses the real assessment endpoint. A sample score does not prove scoring, persistence or training eligibility.', [
    ['Locked', 'state=locked'], ['About you', 'state=form'], ['Questions', 'state=questions'], ['Submitted result', 'state=confirm'],
  ]),
  fixture('member', 'missions', 'Skill missions', 'Empty, active, challenge and passed mission presentations.', 'Inspect challenge controls and ready, retry, passed and locked states.', 'Preview challenges do not submit evidence or save résumé bullets. Real grading and persistence remain blocked.', [
    ['Enrolled, no missions', 'state=enrolled'], ['Active journey', 'state=active'], ['Challenge', 'state=challenge'], ['Passed challenge', 'state=passed'], ['Home teaser', 'state=teaser'],
  ]),
  fixture('member', 'progress', 'Readiness progress', 'Sample readiness scores, milestones and unavailable data.', 'Inspect category details and distinct empty/error presentations.', 'Sample scores do not verify real readiness calculations or eligibility.', [['Empty progress', 'state=empty'], ['Load error', 'state=error']]),
  fixture('member', 'messages', 'Human counselor messages', 'Populated inbox, provisioning state and empty thread.', 'Inspect conversation layout and the local composer where available.', 'No message delivery or realtime session is connected. Support email links leave the preview; no send is part of this review.', [['Inbox unavailable', 'state=empty'], ['Empty thread', 'state=thread-empty']]),
  fixture('member', 'profile', 'Profile and preferences', 'Sample account details and notification settings.', 'Edit local fields and inspect disabled save controls in the default preview.', 'Account saves are not connected by default. Do not enable the live query override without an approved session.', [['Live-save controls · account required', 'live=1']]),
  fixture('member', 'certificates', 'Certificates', 'Populated achievement and credential presentation.', 'Inspect cards, labels and responsive layout.', 'Real credential verification, downloads and sharing require account/provider checks.'),
  fixture('member', 'certificates-empty', 'Certificates · empty', 'Before the first earned certificate.', 'Inspect the empty state and its next-step link.', 'The training destination may require sign-in; no credential is earned by this fixture.'),
  fixture('member', 'toolkit', 'AI Career Tools', 'Coach chooser, practice, résumé panel and tool catalog.', 'Switch workspace tabs, choose a coach and inspect tool destinations.', 'Voice start controls use real session endpoints. Do not start microphone, recording or provider sessions here; most tool links enter the signed-in portal.', [
    ['Coaches', 'tab=coaches'], ['Practice', 'tab=session'], ['Résumé panel', 'tab=studio'], ['All tools', 'tab=toolkit'],
    ['Readiness coach', 'tab=session&agent=readiness'], ['Résumé coach', 'tab=session&agent=resume'], ['Mock interview', 'tab=session&agent=mock'], ['AI counselor', 'tab=session&agent=counselor'], ['Business coach', 'tab=session&agent=business'],
  ]),
  fixture('member', 'interviews', 'Interview format chooser', 'Written, voice and coaching destinations.', 'Edit the target role and inspect each format description.', 'Format links open signed-in tools. Choosing a format does not validate microphone, recording, coaching or email.'),
  fixture('member', 'interview-prep', 'Interview preparation bundle', 'Empty bundle and selected sample preparation materials.', 'Inspect the prepared bundle and source labels.', toolLimit, filled),
  fixture('member', 'interview-practice', 'Written interview practice', 'Question-generation form and a sample question set.', 'Edit local form inputs and inspect sample questions.', toolLimit, filled),
  fixture('member', 'interview-coach', 'Interview coaching', 'Preparation, first question and feedback presentation.', 'Inspect question controls and sample feedback.', toolLimit, [['First question', 'state=interview'], ['Feedback', 'state=feedback']]),
  fixture('member', 'resume-rewriter', 'Résumé rewriter · standalone', 'Standalone rewrite form and sample output.', 'Edit local inputs and inspect a sample rewrite.', toolLimit, filled),
  fixture('member', 'resume-strength', 'Résumé score · standalone', 'Standalone scoring form and sample analysis.', 'Inspect scoring layout, sample advice and form controls.', toolLimit, filled),
  fixture('member', 'cover-letter', 'Cover letter', 'Company/role inputs and a sample letter.', 'Edit local text and inspect the sample result.', toolLimit, filled),
  fixture('member', 'linkedin-headline', 'LinkedIn headline', 'Headline inputs and generated sample options.', 'Edit local inputs and inspect output choices.', toolLimit, filled),
  fixture('member', 'linkedin-about', 'LinkedIn About', 'Profile inputs and sample About text.', 'Edit local inputs and inspect the sample result.', toolLimit, filled),
  fixture('member', 'job-match', 'Job match analysis', 'Match form, sample results and tool-error presentation.', 'Edit local inputs and inspect the sample analysis/error state.', toolLimit, [...filled, ['Tool error', 'state=error']]),
  fixture('member', 'salary-negotiation', 'Salary negotiation', 'Offer preparation form and sample phone script.', 'Edit local inputs and inspect the sample script.', toolLimit, filled),
  fixture('member', 'elevator-pitch', 'Elevator pitch', 'Pitch form, sample review and rehearsal presentation.', 'Edit local inputs and inspect the camera-well layout; the rehearsal fixture does not request camera access.', toolLimit, [...filled, ['Rehearsal', 'state=rehearse']]),
  fixture('member', 'gap-analyzer', 'Skills gap analysis', 'Target-role form and sample gap analysis.', 'Edit local inputs and inspect the sample result.', toolLimit, filled),
  fixture('member', 'benefits-cliff', 'Benefits cliff calculator', 'Offer and household inputs with benefit guidance.', 'Inspect form controls, validation and explanatory copy.', 'Calculations and applicable benefit rules need separate functional review; no household record or financial outcome is verified here.'),
  fixture('member', 'career-business-coach', 'Career and business coach', 'Voice coaching entry and session chrome.', 'Inspect the session controls and explanation.', 'Start uses real voice/provider endpoints. Microphone, recording, session completion and provider behavior remain blocked.'),
  fixture('member', 'wioa-qualification', 'WIOA screening', 'Eligibility questionnaire and next-step presentation.', 'Inspect question navigation and the save/next-step layout.', 'Save and voice controls use real member endpoints. Eligibility, persistence and voice sessions require approved account/provider acceptance.'),

  fixture('counselor', 'counselor-workspace', 'Counselor Today', 'Attention, replies, decisions, follow-up and overview.', 'Switch views and attention filters; inspect empty and load-error states.', 'Most fixture views are empty shells. Member records, decisions, messages and outreach require the authenticated counselor portal.', [
    ['Needs attention', 'view=attention'], ['Priorities', 'view=attention&filter=priorities'], ['At risk', 'view=attention&filter=at-risk'], ['Inactive', 'view=attention&filter=inactive'],
    ['Awaiting reply', 'view=replies'], ['Decisions', 'view=decisions'], ['Follow-up', 'view=followup'], ['Overview', 'view=overview'],
    ['Attention load error', 'view=attention&state=error'], ['Decisions load error', 'view=decisions&state=error'],
  ]),
  fixture('counselor', 'counselor-command', 'Counselor command view', 'Populated counselor dashboard presentation.', 'Inspect queue density, summary metrics and responsive layout.', staffLimit),
  fixture('counselor', 'counselor-atrisk', 'At-risk members', 'Sample risk reasons and intervention presentation.', 'Inspect headings, dates, filters and risk labels.', staffLimit),
  fixture('counselor', 'counselors', 'Counselor directory', 'Sample counselor coverage and workload roster.', 'Inspect roster layout and workload indicators.', staffLimit),
  fixture('admin', 'admin-shell', 'Admin navigation', 'Full admin rail and phone drawer around Today.', 'Open/close navigation, use Escape and inspect keyboard focus.', 'Navigation destinations enter the signed-in admin portal. Read-only fixture chrome does not certify permissions.'),
  fixture('admin', 'admin-command', 'Admin Today', 'Sample admin queues and operational summary.', 'Inspect queue hierarchy, actions and responsive density.', staffLimit),
  fixture('admin', 'students-workspace', 'Students workspace', 'Synthetic roster and empty management/readiness queues.', 'Filter, sort and page the synthetic roster; switch workspace views.', 'Manage/readiness views are empty. Account changes, bulk actions, real CSVs and role gates require approved admin records.', [
    ['Roster', 'view=roster'], ['Manage', 'view=manage'], ['Training', 'view=training'], ['Interview readiness', 'view=readiness'], ['Training 70%+', 'view=readiness&readiness=job'],
  ]),
  fixture('admin', 'students-roster', 'Students roster · standalone', 'Populated roster and learner status presentation.', 'Inspect table/card layout, search and filter controls.', staffLimit),
  fixture('admin', 'training-progress', 'Training progress', 'Sample curriculum and learner progress rows.', 'Inspect progress definitions, row density and responsive presentation.', staffLimit),
  fixture('admin', 'people', 'People directory', 'Synthetic member, staff and user-management views.', 'Inspect local directory search, role filters and view navigation.', 'Local development only: built previews return 404 by design. Global search and management actions use real APIs; permissions and writes remain blocked.', [
    ['Members', 'view=members'], ['Staff', 'view=staff'], ['Manage users', 'view=manage'], ['Search example', 'view=members&search=Jordan'], ['Counselor role', 'view=staff&role=counselor'],
  ], 'local-development'),
  fixture('admin', 'reporting', 'Reporting', 'Overview, outcomes, training, provider coverage and exports.', 'Switch report tabs and inspect synthetic metric definitions.', 'Funder, catalog, outcomes and PDF download links use real authenticated admin endpoints. Export contents and scope remain blocked.', [
    ['Overview', 'tab=overview'], ['Outcomes', 'tab=outcomes'], ['Training', 'tab=training'], ['Coursera', 'tab=coursera'], ['Exports', 'tab=exports'],
  ]),
  fixture('admin', 'jobs-board', 'Admin jobs board', 'Sample job administration presentation.', 'Inspect job rows, status labels and action layout.', staffLimit),
  fixture('admin', 'pipeline-funnel', 'Member pipeline funnel', 'Synthetic stage counts and conversion presentation.', 'Inspect chart alternatives, labels and responsive layout.', 'Real populations, metric calculations and exports require authenticated data acceptance.'),
  fixture('admin', 'placements', 'Placements', 'Sample placement and retention presentation.', 'Inspect status labels, table/card layout and controls.', staffLimit),
  fixture('admin', 'crons-monitor', 'Scheduled jobs monitor', 'Synthetic successful, failed and overdue runs.', 'Inspect status and freshness distinctions.', 'No jobs run from this fixture; actual execution, retries and operational freshness are not verified.'),
  fixture('employer', 'employer-command', 'Employer work queue', 'Sample daily employer work and pipeline summary.', 'Inspect queue hierarchy and action layout.', staffLimit),
  fixture('employer', 'employer-jobs', 'Employer jobs', 'Sample posting management and job status presentation.', 'Inspect Post, Quick Post and Import entry controls and responsive layout.', 'Posting, import, editing and job records require an approved employer session; entry links can leave the fixture.'),
  fixture('employer', 'employer-candidates', 'Employer candidates', 'Applicants, suggested matches and pipeline empty states.', 'Switch views and inspect filters and mobile empty-state layout.', 'Populated candidate evidence, status changes, interviews and hiring persistence require approved employer records.', [
    ['Applicants', 'view=applicants'], ['Matches', 'view=matches'], ['Pipeline', 'view=pipeline'],
  ]),
  fixture('partner', 'partner', 'Partner overview', 'Sample referrals, progress and outcome summary.', 'Inspect summary hierarchy and phone navigation.', staffLimit),
  fixture('partner', 'partner-command', 'Partner command view', 'Sample partner attention and activity presentation.', 'Inspect queue hierarchy and summary links.', staffLimit),
  fixture('partner', 'partner-members', 'Partner members', 'Synthetic referrals across milestone stages.', 'Search/filter the sample roster and inspect wrapping filter chips.', 'Record links enter the signed-in partner portal. Return context, disclosure permissions and consent require approved records.'),
  fixture('partner', 'partner-member-detail', 'Partner member detail', 'Synthetic referral detail and progress presentation.', 'Inspect the page heading, progress and supporting sections.', 'This is a sample record; account access, consent and real updates remain blocked.'),
  fixture('partner', 'partner-impact', 'Partner impact', 'Empty outcomes, sample milestones and export restrictions.', 'Switch views, compare reported/verified milestones and inspect restricted export options.', 'Fixture exports return to an explanation, not a file. Real CSVs, population/date semantics and consent restrictions require signed-in acceptance.', [
    ['Outcomes', 'view=outcomes'], ['Milestones', 'view=milestones'], ['Exports', 'view=exports'], ['Restricted exports', 'view=exports&tier=restricted'],
  ]),
];

export const PORTAL_REVIEW_WALKS = [
  { title: 'Résumé to consultation', description: 'Review truthful next steps and continue a draft. Booking remains a separate acceptance check.', steps: [
    { title: 'Home handoff', href: '/dev/member/home?approval=off&offer=off&first90=off&handoff=received' },
    { title: 'Rewrite a résumé', href: '/dev/member/resume-studio?view=rewrite' },
    { title: 'Counselor messages', href: '/dev/member/messages?state=thread-empty' },
  ] },
  { title: 'Find a job and apply', description: 'Filter/save sample jobs, review consent and confirmation, then return to the board. No application is delivered or persisted.', steps: [
    { title: 'Open roles', href: '/dev/member/jobs?state=board' }, { title: 'Search jobs', href: '/dev/member/jobs?state=listing' }, { title: 'Details and apply', href: '/dev/member/jobs?state=detail' },
  ] },
  { title: 'Explore skills and training', description: 'Inspect synthetic skill evidence and curriculum. Provider launch remains blocked.', steps: [
    { title: 'Compare skills', href: '/dev/member/skill-mapper' }, { title: 'Training workspace', href: '/dev/member/program?state=workspace' }, { title: 'Readiness progress', href: '/dev/member/progress' },
  ] },
] satisfies Array<{ title: string; description: string; steps: FixtureScenario[] }>;
