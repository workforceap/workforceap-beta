import { notFound } from 'next/navigation';

// Unknown member URLs must 404 at the routing layer. A sibling
// `dashboard/loading.tsx` used to stream the home skeleton at HTTP 200
// before this `notFound()` could run, which hid missing routes from
// the signed-in inventory. Home loading now lives under `(home)/`.
export const dynamicParams = false;

export function generateStaticParams() {
  return [];
}

export default function DashboardCatchAllNotFoundPage() {
  notFound();
}
