import { redirect } from 'next/navigation';
import { resumeWorkspaceHref, resumeWorkspaceView } from '@/lib/member/memberWorkspace';

/** Preserve Studio deep links and their context in the unified Resume workspace. */
export default async function ResumeStudioPage({ searchParams }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const incoming = await searchParams ?? {};
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(incoming)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
  }
  // The old Studio default was Score; the canonical Resume default is My resume.
  const view = incoming.view === undefined ? 'score' : resumeWorkspaceView(params.get('view'));
  redirect(resumeWorkspaceHref(view, params));
}
