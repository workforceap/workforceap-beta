/**
 * Where the member shell shows the "No resume on file yet" banner.
 *
 * The banner promises to "power AI tools and your coach", so it belongs on
 * home and on the surfaces that actually read the resume. On messages, the
 * profile, the WIOA screener or the program page it is noise (member audit,
 * 2026-09-20, Better 1).
 */
const RESUME_HINT_EXACT = new Set<string>(['/dashboard', '/dashboard/resume']);

const RESUME_HINT_PREFIXES = [
  '/dashboard/ai-tools',
  '/dashboard/coach',
  '/dashboard/counselor',
  '/dashboard/jobs',
  '/dashboard/interview-prep',
  '/dashboard/readiness',
];

function stripLocale(pathname: string): string {
  const m = pathname.match(/^\/(en|es|fr|pt)(\/.*)?$/);
  return m ? (m[2] ?? '/') : pathname;
}

/** True when `pathname` (locale prefix allowed) is home or a resume-consuming tool. */
export function shouldShowResumeUploadHint(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = stripLocale(pathname.split(/[?#]/)[0]).replace(/\/+$/, '') || '/';
  if (RESUME_HINT_EXACT.has(path)) return true;
  return RESUME_HINT_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
