/**
 * Synthetic attendance fixtures for `npm run preview:local`. Fake names, example.test
 * emails only, fixed ids. Attendance "entries" are the dated minutes/codes an admin types
 * into /admin/attendance/draft (the app stores no daily attendance), so they live here and
 * the screenshot script replays them. Nothing here is real student data.
 */
export const PREVIEW_ORG_SLUG = 'workforceap';
export const PREVIEW_PROGRAM_SLUG = 'it-support-professional-certificate-ibm';

export type PreviewLearner = { id: string; enrollmentId: string; fullName: string; email: string; phone: string };

export const PREVIEW_LEARNERS: PreviewLearner[] = [
  { id: '00000000-0000-4000-8000-0000000bb001', enrollmentId: '00000000-0000-4000-8000-0000000cc001', fullName: 'Preview Student', email: 'preview-student@example.test', phone: '5550100001' },
  { id: '00000000-0000-4000-8000-0000000bb002', enrollmentId: '00000000-0000-4000-8000-0000000cc002', fullName: 'Avery Testwell', email: 'avery.testwell@example.test', phone: '5550100002' },
  { id: '00000000-0000-4000-8000-0000000bb003', enrollmentId: '00000000-0000-4000-8000-0000000cc003', fullName: 'Rowan Sample-Person', email: 'rowan.sample@example.test', phone: '5550100003' },
];

/** Monday 2026-09-07 week plus a few days either side; minutes or W/CR/A codes. */
export const PREVIEW_ENTRIES = [
  { date: '2026-09-07', minutes: 240 },
  { date: '2026-09-08', minutes: 255 },
  { date: '2026-09-09', code: 'W' },
  { date: '2026-09-10', minutes: 180 },
  { date: '2026-09-11', code: 'CR' },
] as const;
export const PREVIEW_SELECTED_DATE = '2026-09-09';

export const PREVIEW_COURSES = [
  { id: 'preview-course-1', name: 'Technical Support Fundamentals (synthetic)', hours: 18.5, completed: true, progress: 100 },
  { id: 'preview-course-2', name: 'The Bits and Bytes of Computer Networking (synthetic)', hours: 11.25, completed: false, progress: 45 },
];
