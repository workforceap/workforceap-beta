import { redirect } from 'next/navigation';
import { withLocalePrefix } from '@/lib/i18n/config';
import { getExplicitRequestLocale } from '@/lib/i18n/server';

export default async function ApplicationTrackerPage() {
  const explicitLocale = await getExplicitRequestLocale();
  const destination = '/dashboard/job-applications';
  redirect(explicitLocale ? withLocalePrefix(destination, explicitLocale) : destination);
}
