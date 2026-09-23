'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * Plain-language notice for a failed Coursera launch.
 *
 * lib/coursera/launchRouteCore.ts redirects a launch it cannot complete to
 * /dashboard/training?error=<code>, which forwards to My Program with the
 * query intact. This reads that code once on mount and says what happened and
 * what to do next. Only the three codes the launch route produces are mapped;
 * any other value (or none) renders nothing, so a hand-edited URL can never
 * put arbitrary text on the page.
 *
 * It reads window.location in an effect rather than useSearchParams so the
 * server-rendered page needs no Suspense boundary, then drops ?error from the
 * address bar so a reload or a shared link does not repeat a stale notice.
 */
const LAUNCH_ERROR_COPY = {
  launch_failed: {
    title: "We couldn't open your course on Coursera.",
    body: 'Try the launch button again in a few minutes. If it still does not open, message your counselor.',
  },
  course_not_assigned: {
    title: "That course isn't part of your program.",
    body: 'Choose a course from your program list. If you think it should be included, message your counselor.',
  },
  curriculum_track_pending: {
    title: 'Your Coursera courses are still being set up.',
    body: 'Check back later. You can message your counselor for an update.',
  },
} as const;

type LaunchErrorCode = keyof typeof LAUNCH_ERROR_COPY;

function isLaunchErrorCode(value: string | null): value is LaunchErrorCode {
  return value != null && Object.prototype.hasOwnProperty.call(LAUNCH_ERROR_COPY, value);
}

export default function CourseraLaunchErrorNotice() {
  const [code, setCode] = useState<LaunchErrorCode | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const value = url.searchParams.get('error');
    if (!isLaunchErrorCode(value)) return;
    setCode(value);
    url.searchParams.delete('error');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  if (!code) return null;
  const copy = LAUNCH_ERROR_COPY[code];

  return (
    <div className="wa-kit-card wa-mb-4" role="status" data-coursera-launch-error={code}>
      <strong>{copy.title}</strong> {copy.body}{' '}
      <Link href="/dashboard/messages">Message your counselor</Link>
    </div>
  );
}
