import { redirect } from 'next/navigation';

/** Legacy reduced toolkit; the full toolkit now lives inside AI Career Tools. */
export default function DashboardToolkitPage() {
  redirect('/dashboard/ai-tools?tab=toolkit');
}
