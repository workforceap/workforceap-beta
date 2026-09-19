import { permanentRedirect } from 'next/navigation';

export default async function AssessmentsPage() {
  permanentRedirect('/dashboard/assessment');
}
