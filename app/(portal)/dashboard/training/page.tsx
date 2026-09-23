import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth/server';

/**
 * Training home consolidated into /dashboard/program ("My Program").
 *
 * This route is a redirect stub with no UI of its own. It used to forward to
 * /dashboard, but the dashboard's own "Resume module" / "Continue training"
 * CTAs point here, so that made the primary CTA a do-loop: the member landed
 * back on the page they had just clicked from. Forwarding to /dashboard/program
 * puts them on the surface that actually lists their modules and lessons, and
 * rescues every other inbound caller at once (notification deep links,
 * recap/course-completion emails, the member assistant's portal handoffs, and
 * the Coursera launch error redirects in lib/coursera/launchRouteCore.ts).
 *
 * Query params are preserved (e.g. ?program=google-it-support for multi-program
 * tab switches and external bookmarks, and ?error=... from a failed Coursera
 * launch) so nothing that appends state to this URL loses it in transit.
 */
export default async function TrainingPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getUser();
  const params = await searchParams;

  const search = params
    ? '?' +
      new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v != null)
          .flatMap(([k, v]) =>
            Array.isArray(v) ? v.map((val) => [k, val]) : [[k, v]]
          )
          .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      ).toString()
    : '';

  if (!user) {
    // The query belongs to the post-login destination, not to /login itself,
    // so ?program= / ?course= survive sign-in.
    const back = '/dashboard/program' + (search === '?' ? '' : search);
    redirect('/login?redirectTo=' + encodeURIComponent(back));
  }

  redirect('/dashboard/program' + search);
}
