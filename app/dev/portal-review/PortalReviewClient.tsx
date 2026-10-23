'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { DataTable, DesignSurface, PageOpener, StatusTag, type Column } from '@/components/portal/kit';
import styles from './review.module.css';

type Route = { role: string; route: string; source: string; dynamic: boolean; openFrom: string | null };
type FocusCase = { role: string; route: string; title: string; checks: string };
type Inventory = { routes: Route[]; focusCases: FocusCase[] };
type ReviewStatus = 'not-started' | 'pass' | 'issue' | 'blocked';
type Result = { status: ReviewStatus; light: boolean; dark: boolean; phone: boolean; notes: string };
const EMPTY: Result = { status: 'not-started', light: false, dark: false, phone: false, notes: '' };
const STATUS_OPTIONS = [
  { value: 'not-started', label: 'Not started' }, { value: 'pass', label: 'Pass' },
  { value: 'issue', label: 'Issue' }, { value: 'blocked', label: 'Blocked' },
];
const ROLES = ['member', 'counselor', 'admin', 'employer', 'partner', 'shared', 'entry'];
const roleLabel = (role: string) => role === 'entry' ? 'Sign-in & entry' : role.charAt(0).toUpperCase() + role.slice(1);
const csvCell = (value: string) => {
  const content = value.trimStart();
  // Spreadsheet readers may discard leading whitespace before interpreting a
  // formula. Other leading control characters also remain explicitly text.
  const firstCode = content.charCodeAt(0);
  const text = /^[=+@-]/.test(content) || firstCode < 32 || firstCode === 127 ? "'" + value : value;
  return `"${text.replaceAll('"', '""')}"`;
};

function readResult(value: unknown): Result | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const row = value as Partial<Result>;
  return {
    status: STATUS_OPTIONS.some((option) => option.value === row.status) ? row.status! : 'not-started',
    light: row.light === true, dark: row.dark === true, phone: row.phone === true,
    notes: typeof row.notes === 'string' ? row.notes.slice(0, 3000) : '',
  };
}

export default function PortalReviewClient({ inventory, revision }: { inventory: Inventory; revision: string }) {
  const storageKey = `wap-portal-review:${revision}`;
  const [mode, setMode] = useState('focused');
  const [role, setRole] = useState('all');
  const [search, setSearch] = useState('');
  const [resultFilter, setResultFilter] = useState('all');
  const [results, setResults] = useState<Record<string, Result>>({});
  const resultsRef = useRef<Record<string, Result>>({});
  const pendingWrites = useRef<Record<string, Result>>({});
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [limit, setLimit] = useState(30);
  const cases = useMemo(() => [
    ...inventory.focusCases.map((item) => ({ ...item, id: `focus:${item.route}`, type: 'focused', openFrom: item.route, dynamic: false })),
    ...inventory.routes.map((item) => ({ ...item, id: `route:${item.route}`, type: 'routes', title: item.route,
      checks: item.dynamic
        ? 'Open a real record from the linked list, or use a valid issued invitation/token. Check access, actions and return navigation.'
        : 'Check page load, primary action, empty/error state and return navigation. A compatibility URL should reach its intended destination.',
    })),
  ], [inventory]);
  const caseKeys = useMemo(() => new Map(cases.map((item) =>
    [item.id, `${storageKey}:case:${encodeURIComponent(item.id)}`],
  )), [cases, storageKey]);

  useEffect(() => {
    const next: Record<string, Result> = {};
    let failed = false;
    setLoaded(false);
    pendingWrites.current = {};
    try {
      // Preserve progress saved by the first review-index version. New writes
      // use independent records, with those records taking precedence here.
      const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        for (const item of cases) {
          const row = readResult((saved as Record<string, unknown>)[item.id]);
          if (row) next[item.id] = row;
        }
      }
    } catch { failed = true; }
    for (const [id, key] of caseKeys) {
      try {
        const raw = localStorage.getItem(key);
        if (raw !== null) {
          const row = readResult(JSON.parse(raw));
          if (row) next[id] = row;
          else failed = true;
        }
      } catch { failed = true; }
    }
    resultsRef.current = next;
    setResults(next);
    setStorageError(failed);
    setLoaded(true);

    const idsByKey = new Map(Array.from(caseKeys, ([id, key]) => [key, id]));
    const reconcile = (event: StorageEvent) => {
      try {
        if (event.storageArea && event.storageArea !== localStorage) return;
        if (event.key === null) {
          // Keep unsaved local drafts available for export if another tab clears
          // browser storage. Successfully saved rows follow that explicit clear.
          const cleared = { ...pendingWrites.current };
          resultsRef.current = cleared;
          setResults(cleared);
          return;
        }
        const id = idsByKey.get(event.key);
        if (!id || pendingWrites.current[id]) return;
        // Read the latest value instead of replaying a possibly older event.
        const raw = localStorage.getItem(event.key);
        const row = raw === null ? undefined : readResult(JSON.parse(raw));
        if (raw !== null && !row) throw new Error('Invalid review record');
        const reconciled = { ...resultsRef.current };
        if (row) reconciled[id] = row;
        else delete reconciled[id];
        resultsRef.current = reconciled;
        setResults(reconciled);
      } catch { setStorageError(true); }
    };
    window.addEventListener('storage', reconcile);
    return () => window.removeEventListener('storage', reconcile);
  }, [caseKeys, cases, storageKey]);

  function update(id: string, patch: Partial<Result>) {
    const key = caseKeys.get(id);
    if (!loaded || !key) return;
    let current = resultsRef.current[id] ?? EMPTY;
    try {
      // A different tab may have changed this case before its storage event was
      // delivered. Preserve its other fields when applying this edit.
      const saved = readResult(JSON.parse(localStorage.getItem(key) ?? 'null'));
      if (saved && !pendingWrites.current[id]) current = saved;
    } catch { /* Keep the local draft editable and report a failed save below. */ }
    const row = { ...current, ...patch };
    const next = { ...resultsRef.current, [id]: row };
    resultsRef.current = next;
    setResults(next);
    pendingWrites.current[id] = row;
    // Retry any earlier failed rows without ever replacing unrelated case keys.
    for (const [pendingId, pending] of Object.entries(pendingWrites.current)) {
      try {
        localStorage.setItem(caseKeys.get(pendingId)!, JSON.stringify(pending));
        delete pendingWrites.current[pendingId];
      } catch { /* Retain the unsaved row in memory for retry and CSV export. */ }
    }
    setStorageError(Object.keys(pendingWrites.current).length > 0);
  }

  const filtered = cases.filter((item) => item.type === mode
    && (role === 'all' || item.role === role)
    && `${item.title} ${item.route} ${item.checks}`.toLowerCase().includes(search.toLowerCase())
    && (resultFilter === 'all' || (results[item.id]?.status ?? 'not-started') === resultFilter));
  const visible = filtered.slice(0, limit);
  const reviewed = cases.filter((item) => (results[item.id]?.status ?? 'not-started') !== 'not-started').length;
  const issues = cases.filter((item) => results[item.id]?.status === 'issue').length;

  function exportResults() {
    const rows = [['Revision', 'Type', 'Role', 'Route', 'Check', 'Light', 'Dark', 'Phone', 'Result', 'Notes']];
    for (const item of cases) {
      const result = results[item.id] ?? EMPTY;
      rows.push([revision, item.type, item.role, item.route, item.checks, String(result.light), String(result.dark), String(result.phone), result.status, result.notes]);
    }
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `workforceap-preview-review-${revision.slice(0, 12)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  type ReviewCase = (typeof cases)[number];
  const screenCell = (item: ReviewCase) => <>
    <p className={styles.role}>{roleLabel(item.role)}</p><h2 className={styles.title}>{item.title}</h2>
    {item.title !== item.route && <code className={styles.path}>{item.route}</code>}
    <p className={styles.check}>{item.checks}</p>
    {item.openFrom ? <Link href={item.openFrom} target="_blank" rel="noreferrer" prefetch={false} className="wa-kit-cta wa-kit-cta--ghost">{item.dynamic ? 'Open starting list' : 'Open screen'}<span className="wa-sr-only"> in a new tab: {item.title}</span></Link> : <p className={styles.context}>Requires a valid issued link.</p>}
  </>;
  const coverageCell = (item: ReviewCase) => <fieldset className={styles.coverage}><legend className="wa-sr-only">{item.title} coverage</legend>
    {(['light', 'dark', 'phone'] as const).map((key) => <CheckboxInput key={key} label={`${key.charAt(0).toUpperCase() + key.slice(1)} checked`} value={(results[item.id] ?? EMPTY)[key]} isDisabled={!loaded} onChange={(value) => update(item.id, { [key]: value })} />)}
  </fieldset>;
  const resultCell = (item: ReviewCase) => {
    const result = results[item.id] ?? EMPTY;
    return <div className={styles.result}>
      <Selector label={`Result: ${item.title}`} isLabelHidden value={result.status} options={STATUS_OPTIONS} isDisabled={!loaded} onChange={(value) => update(item.id, { status: value as ReviewStatus })} />
      <TextArea label={`Notes: ${item.title}`} isLabelHidden value={result.notes} placeholder="What happened, expected result, and steps to reproduce" rows={3} isDisabled={!loaded} onChange={(value) => update(item.id, { notes: value.slice(0, 3000) })} />
    </div>;
  };
  const columns: Column<ReviewCase>[] = [
    { key: 'screen', header: 'Screen and check', render: screenCell, minWidth: '24rem' },
    { key: 'coverage', header: 'Coverage', render: coverageCell, minWidth: '10rem' },
    { key: 'result', header: 'Result and notes', render: resultCell, minWidth: '18rem' },
  ];

  return (
    <DesignSurface surface="dense">
      <main className={styles.page}>
        <PageOpener kicker="WorkforceAP · Preview review" title="Every screen, one review list" lede={`${inventory.routes.length} page routes and ${inventory.focusCases.length} focused checks for the consolidation pass.`}
          action={<button type="button" className="wa-kit-cta" onClick={exportResults} disabled={!loaded}>Export review CSV</button>} />
        <p className={styles.context}>Revision <code>{revision.slice(0, 12)}</code>. Open screens with your normal test accounts. Dynamic records use the linked list or a valid issued link. Results and notes stay in this browser for this revision; export them to share.</p>
        <div className={styles.summary} role="status" aria-live="polite">
          <StatusTag tone="info">{reviewed} reviewed</StatusTag>
          <StatusTag tone={issues ? 'alert' : 'muted'}>{issues} issues</StatusTag>
          <span>{loaded ? storageError ? 'Browser saving is unavailable. Export the CSV before closing.' : 'Review changes save in this browser.' : 'Loading your review…'}</span>
        </div>
        <div className={styles.filters}>
          <Selector label="Checklist" value={mode} options={[{ value: 'focused', label: 'Start here · changed workflows' }, { value: 'routes', label: 'All page routes' }]} onChange={(value) => { setMode(value); setLimit(30); }} />
          <Selector label="Portal" value={role} options={[{ value: 'all', label: 'All portals' }, ...ROLES.map((value) => ({ value, label: roleLabel(value) }))]} onChange={(value) => { setRole(value); setLimit(30); }} />
          <TextInput label="Find a screen" value={search} onChange={(value) => { setSearch(value); setLimit(30); }} hasClear />
          <Selector label="Result" value={resultFilter} options={[{ value: 'all', label: 'All results' }, ...STATUS_OPTIONS]} onChange={(value) => { setResultFilter(value); setLimit(30); }} />
        </div>
        <p className={styles.context}>{filtered.length} matching checks. For each screen, review light mode, dark mode, and phone width. Record a blocker separately from a visual or functional issue.</p>
        <DataTable className={styles.table} columns={columns} rows={visible} rowKey={(item) => item.id} aria-label="Portal screen acceptance checklist" mobile="cards" minWidth={850}
          cardRender={(item) => <section className={styles.mobileRow}>{screenCell(item)}{coverageCell(item)}{resultCell(item)}</section>}
          empty={{ kind: 'filtered', title: 'No screens match these filters', description: 'Choose another portal or clear your search.' }} />
        {visible.length < filtered.length && <button type="button" className="wa-kit-cta wa-kit-cta--ghost" onClick={() => setLimit((value) => value + 30)}>Show 30 more checks</button>}
      </main>
    </DesignSurface>
  );
}
