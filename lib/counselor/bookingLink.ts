export type CounselorContactLink = {
  kind: 'booking' | 'message';
  url: string;
  label: 'Book 15 minutes' | 'Message your counselor';
};

function httpsUrl(value: string | undefined): URL | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

/** Resolve at send/render time; a missing calendar offers the existing inbox. */
export function getCounselorContactLink(calendarUrl?: string): CounselorContactLink {
  const booking = httpsUrl(calendarUrl) ?? httpsUrl(process.env.COUNSELOR_BOOKING_URL);
  if (booking) return { kind: 'booking', url: booking.href, label: 'Book 15 minutes' };

  const site = httpsUrl(process.env.NEXT_PUBLIC_SITE_URL)
    ?? new URL('https://www.workforceap.org');
  return {
    kind: 'message',
    url: new URL('/dashboard/messages', site).href,
    label: 'Message your counselor',
  };
}
