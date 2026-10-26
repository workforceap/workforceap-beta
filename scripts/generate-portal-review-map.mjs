#!/usr/bin/env node
/** Source inventory for the preview hand-test index. It does not certify behavior. */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const roots = [
  'app/(portal)', 'app/admin', 'app/(auth)', 'app/apply', 'app/consent',
  'app/employer', 'app/employers/signup', 'app/enroll', 'app/invite', 'app/join',
  'app/mentor/apply', 'app/org', 'app/partner-signup', 'app/placement-survey',
  'app/pwa-start', 'app/q', 'app/share/achievement', 'app/survey/placement', 'app/wioa-qualification',
];
function pages(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.posix.join(dir, entry.name);
    return entry.isDirectory() ? pages(file) : entry.name === 'page.tsx' ? [file] : [];
  });
}
const sources = [...new Set(roots.flatMap(pages))].sort();
const roleFor = (route, source) => {
  for (const [prefix, role] of [['dashboard', 'member'], ['admin', 'admin'], ['counselor', 'counselor'], ['employer', 'employer'], ['partner', 'partner']]) {
    if (route === `/${prefix}` || route.startsWith(`/${prefix}/`)) return role;
  }
  return source.startsWith('app/(portal)/') ? 'shared' : 'entry';
};
const routes = sources.map((source) => {
  const route = '/' + source.split('/').slice(1, -1).filter((part) => !part.startsWith('(')).join('/');
  return { route, source, role: roleFor(route, source), dynamic: route.includes('[') };
}).sort((a, b) => a.role.localeCompare(b.role) || a.route.localeCompare(b.route));
const routeSet = new Set(routes.map((item) => item.route));
if (routeSet.size !== routes.length) throw new Error('Duplicate route in portal review inventory');
for (const item of routes) {
  let parent = item.route.slice(0, item.route.lastIndexOf('/'));
  while (parent && (!routeSet.has(parent) || parent.includes('['))) parent = parent.slice(0, parent.lastIndexOf('/'));
  item.openFrom = item.dynamic ? parent || null : item.route;
}
const focused = [
  ['member', '/dashboard/resume?view=files', 'Resume · Files', 'Upload a real test resume. Switch views and return. Download the original and a revised copy; check that existing application snapshots are unchanged.'],
  ['member', '/dashboard/resume?view=score', 'Resume · Score', 'Choose or paste a resume, score it, and reopen the saved result. Confirm the selected source and score history.'],
  ['member', '/dashboard/resume?view=rewrite', 'Resume · Rewrite', 'Enter a draft, change views, return, and confirm the draft survives. Generate and download a revised copy without replacing the original.'],
  ['member', '/dashboard/resume?view=coach', 'Resume · Coach', 'Open coaching for the selected resume. Check its source label, provider failure/retry and return to Files.'],
  ['member', '/dashboard/learning/interest-profiler', 'Career path · Interests', 'Complete or open saved interests, inspect suggested occupations, and continue to Skill Mapper.'],
  ['member', '/dashboard/ai-tools/skill-mapper', 'Career path · O*NET and graph', 'Look up an occupation. Check O*NET identity/source, skills, related occupations, graph/list controls and a saved run. Continue to Training Bridge from that exact run.'],
  ['member', '/dashboard/ai-tools/training-bridge', 'Career path · Training Bridge', 'Open from a saved Skill Mapper result. Confirm the occupation and source, distinguish occupation evidence from personal proficiency, then review the program/curriculum handoff. A bad result ID must not select another run.'],
  ['member', '/dashboard/ai-tools/interviews', 'Interview practice · Choose a format', 'Open each offered interview mode. Verify written, voice and coaching labels match the actual tool, and histories still open.'],
  ['member', '/dashboard/program', 'My program · Learning handoff', 'Open assigned training, the Learning Hub and provider launch. Confirm enrollment, progress and prerequisite gates remain accurate.'],
  ['member', '/dashboard/messages', 'Messages · Human counselor', 'Confirm the destination is the human counselor conversation, separate from the AI Advisor. Use test accounts for any send.'],
  ['counselor', '/counselor/today?view=attention', 'Today · Needs attention', 'Check the same scoped members and reasons, counts, partial-load warning and per-member actions. Open a record and return to this view.'],
  ['counselor', '/counselor/today?view=attention&filter=priorities', 'Today · By priority', 'Compare urgency ordering and row actions with the legacy triage URL.'],
  ['counselor', '/counselor/today?view=attention&filter=at-risk', 'Today · At-risk cases', 'Check risk reasons, filters and member access. Reopen the guided tour and its at-risk step.'],
  ['counselor', '/counselor/today?view=attention&filter=inactive', 'Today · Inactive members', 'Check scoped members, inactivity windows and contact details. Use a designated test record to check outreach success and failure feedback.'],
  ['counselor', '/counselor/today?view=replies', 'Today · Awaiting reply', 'Open the waiting member thread. Check unread/reply-age counts and message actions without combining notification counts.'],
  ['counselor', '/counselor/today?view=decisions', 'Today · Decisions', 'Review application and intake actions with authorized test records. Check decision feedback and oldest-first order.'],
  ['counselor', '/counselor/today?view=followup', 'Today · Follow-up', 'Prepare a follow-up, record a test contact, and verify the next handoff/status.'],
  ['counselor', '/counselor/today?view=overview', 'Today · Overview', 'Check caseload, sessions and activity. Verify all old overview links still reach their tools.'],
  ['admin', '/admin/students?view=roster', 'Students · Roster', 'Filter, sort and page the roster; open a member and return with the same search, filters and page.'],
  ['admin', '/admin/students?view=manage', 'Students · Manage', 'Check program/status/partner/date/staff filters, selected rows, bulk actions and matching CSV export. Use test records for writes.'],
  ['admin', '/admin/students?view=training', 'Students · Training', 'Check curriculum, provider coverage, pace and unmatched records. Verify progress definitions match the existing view.'],
  ['admin', '/admin/students?view=readiness', 'Students · Interview ready', 'Check interview eligibility and its evidence. Verify the old interview-ready link still works.'],
  ['admin', '/admin/students?view=readiness&readiness=job', 'Students · Training 70%+', 'Check training completion separately from interview eligibility. Verify the old job-ready link still works.'],
  ...['overview', 'outcomes', 'training', 'coursera', 'exports'].map((tab) => ['admin', `/admin/reporting?tab=${tab}`, `Reporting · ${tab}`, 'Check selected period, population, definitions and download context. Compare on-screen totals with the matching export, accounting for distinct metric definitions.']),
  ['employer', '/employer/jobs', 'Jobs · Post and import', 'Check Post and Import on phone and desktop. Open full, quick and import flows; confirm draft/pending counts and return filters.'],
  ['employer', '/employer/candidates?view=applicants', 'Candidates · Applicants', 'Filter by job/status and open an application. Check evidence, status actions, pagination and return context.'],
  ['employer', '/employer/candidates?view=matches', 'Candidates · Matches', 'Review AI suggestions for the chosen posting. Keep suggested matches distinct from submitted applications and preserve filters.'],
  ['employer', '/employer/candidates?view=pipeline', 'Candidates · Pipeline', 'Move an authorized test candidate through a hiring stage. Check mobile alternatives, feedback, persistence and the candidate detail return.'],
  ['partner', '/partner/impact?view=outcomes', 'Impact · Outcomes', 'Check the period, population and placement definition. Compare with the old Outcomes URL.'],
  ['partner', '/partner/impact?view=milestones', 'Impact · Milestones', 'Check milestone filters, details and new counts. Keep reported milestones distinct from verified placements.'],
  ['partner', '/partner/impact?view=exports', 'Impact · Exports', 'Download an authorized test CSV and verify scope, headers, consent restrictions and dates.'],
  ['partner', '/partner/referred-members', 'Partner members · Return context', 'Filter by stage and search on phone and desktop, open a member, then return with the same list.'],
];
const focusCases = focused.map(([role, route, title, checks]) => ({ role, route, title, checks }));
for (const item of focusCases) {
  if (!routeSet.has(item.route.split('?')[0])) throw new Error(`Missing focused route ${item.route}`);
}
const inventory = {
  schemaVersion: 1,
  scope: 'Member, counselor, employer, partner, admin, shared portal and entry page files. Includes compatibility redirects. Source inventory is not functional acceptance.',
  routes,
  focusCases,
};
const out = 'docs/qa/portal-consolidation';
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/route-inventory.json`, JSON.stringify(inventory, null, 2) + '\n');
const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const rows = [['Type', 'Role', 'Route', 'Open from', 'Check', 'Light', 'Dark', 'Phone', 'Result', 'Notes']];
for (const item of focusCases) rows.push(['Focused', item.role, item.route, item.route, item.checks, '', '', '', 'Not started', '']);
for (const item of routes) rows.push(['Route', item.role, item.route, item.openFrom, item.dynamic ? 'Open a real record or valid issued link. Check access, actions and return context.' : 'Check load, main action, empty/error state and return navigation. Compatibility URLs should reach the intended destination.', '', '', '', 'Not started', '']);
writeFileSync(`${out}/screen-checklist.csv`, rows.map((row) => row.map(quote).join(',')).join('\n') + '\n');
console.log(`Review map: ${routes.length} page routes and ${focusCases.length} focused cases.`);
