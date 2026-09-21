import { getTranslations } from 'next-intl/server';
import {
  ExportsKit,
  type ExportOption,
} from '@/components/portal/kit/pages/admin-subviews/ExportsKit';

/**
 * Exports tab: the card grid of every REAL export the admin exposes, moved
 * from the default view of `/admin/exports`. The filterable Member Training
 * Report form and the eligibility datasheet keep their in-portal pages behind
 * `/admin/exports?ui=legacy`; the other tiles are file endpoints.
 *
 * Also rendered by the exports route spec, so the list stays the single
 * source of the outcomes snapshot files (admin audit 2026-09-20, Outcomes).
 */
export async function ReportingExportsSection() {
  const t = await getTranslations('admin');

  const exports: ExportOption[] = [
    {
      id: 'member-training-report',
      title: 'Member Training Report',
      description: 'Demographics, progress, certs, placements & eligibility · filterable CSV',
      href: '/admin/exports?ui=legacy',
      iconKey: 'filters',
      tone: 'accent',
    },
    {
      id: 'eligibility-datasheet',
      title: 'Eligibility screening datasheet',
      description: 'WS4 fields · in-admin table + CSV (not Google Sheets)',
      href: '/admin/exports?ui=legacy#eligibility-datasheet',
      iconKey: 'csv',
      tone: 'gold',
    },
    {
      id: 'funder-program-summary',
      title: t('exportFunderCsvTitle'),
      description: 'Grant reporting · per-program enrollment, completion & placements',
      href: '/api/admin/funder-program-summary',
      iconKey: 'csv',
      tone: 'success',
      download: true,
      actionLabel: t('exportFunderCsvDownload'),
    },
    {
      id: 'program-catalog',
      title: 'Program Catalog',
      description: 'State agency submissions · costs, duration & certifications',
      href: '/api/admin/programs/export-twc',
      iconKey: 'roster',
      tone: 'info',
      download: true,
    },
    // Outcomes snapshots used to be listed again on /admin/outcomes; this is
    // now their only list (admin audit 2026-09-20, Outcomes).
    {
      id: 'outcomes-csv',
      title: 'Outcomes CSV',
      description: 'Board-ready · funnel waterfall (counts + conversion), all time',
      href: '/api/admin/outcomes/snapshot?period=all-time&format=csv',
      iconKey: 'csv',
      tone: 'success',
      download: true,
    },
    {
      id: 'board-packet-pdf',
      title: 'Board meeting PDF',
      description: 'Printable snapshot with KPIs, cohorts and methodology notes, all time',
      href: '/api/admin/outcomes/snapshot?period=all-time&format=pdf',
      iconKey: 'download',
      tone: 'muted',
      download: true,
    },
  ];

  return <ExportsKit embedded exports={exports} />;
}
