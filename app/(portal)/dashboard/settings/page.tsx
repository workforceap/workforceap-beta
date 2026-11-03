import { redirect } from 'next/navigation';

export default async function DashboardSettingsPage() {
  // HTTP Location cannot carry a fragment. The profile page focuses #settings
  // from this query so the alias still lands on notification settings.
  redirect('/dashboard/profile?section=settings');
}
