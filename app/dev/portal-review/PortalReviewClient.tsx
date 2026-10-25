'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { DataTable, DesignSurface, PageOpener, StatusTag, type Column } from '@/components/portal/kit';
import { PORTAL_REVIEW_FIXTURES, PORTAL_REVIEW_WALKS, type PortalReviewFixture } from '@/lib/dev/portalReviewFixtures';
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
  const [mode, setMode] = useState('fixtures');
  const [role, setRole] = useState('all');
  const [search, setSearch] = useState('');
  const [resultFilter, setResultFilter] = useState('all');
  const [results, setResults] = useState<Record<string, Result>>({});
  const resultsRef = useRef<Record<string, Result>>({});
  const pendingWrites = useRef<Record<string, Result>>({});
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [limit, setLimit] = useState(10);
  const cases = useMemo(() => [
    ...PORTAL_REVIEW_FIXTURES.map((item) => ({ ...item, id: `fixture:${item.route}`, type: 'fixtures', openFrom: item.route, dynamic: false, fixture: item as PortalReviewFixture | undefined,
      checks: `${item.canTry} Limits: ${item.blocked} Scenarios: ${item.scenarios.map((scenario) => `${scenario.title} (${scenario.href})`).join('; ') || 'Default screen'}` })),
    ...inventory.focusCases.map((item) => ({ ...item, id: `focus:${item.route}`, type: 'focused', openFrom: item.route, dynamic: false, fixture: undefined as PortalReviewFixture | undefined })),
    ...inventory.routes.map((item) => ({ ...item, id: `route:${item.route}`, type: 'routes', title: item.route,
      fixture: undefined as PortalReviewFixture | undefined,
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
  const scenarioCount = PORTAL_REVIEW_FIXTURES.reduce((total, item) => total + item.scenarios.length, 0);

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
    {item.openFrom ? <Link href={item.openFrom} target="_blank" rel="noreferrer" prefetch={false} className="wa-kit-cta wa-kit-cta--ghost">{item.dynamic ? 'Open starting list' : 'Open screen'}{' '}<span className="wa-sr-only">in a new tab: {item.title}</span></Link> : <p className={styles.context}>Requires a valid issued link.</p>}
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

  const fixtureCard = (item: ReviewCase) => {
    const proof = item.fixture!;
    const result = results[item.id] ?? EMPTY;
    return <article className={styles.fixture} key={item.id}>
      <div className={styles.fixtureHeading}>
        <div className={styles.fixtureIdentity}>
          <h3 className={styles.fixtureTitle}>{item.title}</h3>
          <div className={styles.fixtureMeta}>
            {proof.availability === 'local-development' && <span>Local development only</span>}
            <span>{proof.scenarios.length ? `${proof.scenarios.length} scenarios` : 'Default state'}</span>
            <StatusTag tone={result.status === 'issue' ? 'alert' : result.status === 'pass' ? 'ok' : 'muted'}>{STATUS_OPTIONS.find((option) => option.value === result.status)!.label}</StatusTag>
          </div>
        </div>
        <Link href={item.route} target="_blank" rel="noreferrer" prefetch={false} className={`wa-kit-cta wa-kit-cta--ghost ${styles.openLink}`}>
          Open screen{' '}<span className="wa-sr-only">in a new tab: {item.title}</span>
        </Link>
      </div>
      <details className={styles.details}>
        <summary>Scenarios & review<span aria-hidden="true">+</span></summary>
        <div className={styles.detailBody}>
          <p className={styles.description}>{proof.description}</p>
          <code className={styles.path}>{item.route}</code>
          <div className={styles.capabilities}>
            <p><strong>Try here</strong>{proof.canTry}</p>
            <p><strong>Needs separate acceptance</strong>{proof.blocked}</p>
          </div>
          {proof.scenarios.length > 0 && <nav className={styles.scenarios} aria-label={`${item.title} scenarios`}>
            {proof.scenarios.map((scenario) => <Link key={scenario.href} href={scenario.href} target="_blank" rel="noreferrer" prefetch={false} className="wa-kit-focus">
              {scenario.title}{' '}<span className="wa-sr-only">in a new tab</span>
            </Link>)}
          </nav>}
          <div className={styles.manualReview}>
            <p className={styles.context}>Record the scenario tested. Opening a screen does not mark it passed.</p>
            {coverageCell(item)}{resultCell(item)}
          </div>
        </div>
      </details>
    </article>;
  };

  return (
    <DesignSurface surface="dense">
      <section className={styles.page} aria-labelledby="portal-review-title">
        <div id="portal-review-title"><PageOpener kicker="WorkforceAP" title="Screen review" lede={`${PORTAL_REVIEW_FIXTURES.length} sample screens · ${scenarioCount} scenarios`} /></div>
        <p className={styles.boundary}>Sample data. Live actions need an approved test account.</p>
        <div className={styles.reviewToolbar}>
          <details className={`${styles.details} ${styles.reviewOptions}`}>
            <summary>Review options{resultFilter !== 'all' ? ` · ${STATUS_OPTIONS.find((option) => option.value === resultFilter)?.label}` : ''}<span aria-hidden="true">+</span></summary>
            <div className={styles.optionsBody}>
              <p className={styles.context}>Revision <code>{revision.slice(0, 12)}</code>. Read each screen’s limits before saves, sends or provider actions. Notes stay in this browser for this revision. Check light, dark and phone layouts separately; use Blocked for unavailable workflows.</p>
              <div className={styles.summary} role="status" aria-live="polite">
                <StatusTag tone="info">{reviewed} reviewed</StatusTag>
                <StatusTag tone={issues ? 'alert' : 'muted'}>{issues} issues</StatusTag>
                <span>{loaded ? storageError ? 'Browser saving is unavailable. Export the CSV before closing.' : 'Review changes save in this browser.' : 'Loading your review…'}</span>
              </div>
              <Selector label="Result" value={resultFilter} options={[{ value: 'all', label: 'All results' }, ...STATUS_OPTIONS]} onChange={(value) => { setResultFilter(value); setLimit(10); }} />
            </div>
          </details>
          <button type="button" className={`wa-kit-cta wa-kit-cta--ghost ${styles.exportButton}`} aria-label="Export review CSV" onClick={exportResults} disabled={!loaded}>Export CSV</button>
        </div>
        {storageError && <p role="alert" className={styles.boundary}>Review notes could not be saved. Export the CSV before closing.</p>}
        <div className={styles.filters}>
          <Selector label="Checklist" value={mode} options={[{ value: 'fixtures', label: 'Sample screens' }, { value: 'focused', label: 'Signed-in flows' }, { value: 'routes', label: 'All routes' }]} onChange={(value) => { setMode(value); setRole('all'); setLimit(10); }} />
          <Selector label="Portal" value={role} options={[{ value: 'all', label: 'All portals' }, ...ROLES.filter((value) => mode !== 'fixtures' || !['shared', 'entry'].includes(value)).map((value) => ({ value, label: roleLabel(value) }))]} onChange={(value) => { setRole(value); setLimit(10); }} />
          <div className={styles.searchFilter}><TextInput label="Find a screen or scenario" value={search} onChange={(value) => { setSearch(value); setLimit(10); }} hasClear /></div>
        </div>
        {mode === 'fixtures' && !search && role === 'all' && <details className={`${styles.details} ${styles.walkthroughs}`}>
          <summary>Member walkthroughs<span aria-hidden="true">+</span></summary>
          <div className={styles.walkGrid}>{PORTAL_REVIEW_WALKS.map((walk) => <section key={walk.title}>
            <h2 className={styles.title}>{walk.title}</h2><p className={styles.description}>{walk.description}</p>
            <ol>{walk.steps.map((step) => <li key={step.href}><Link href={step.href} target="_blank" rel="noreferrer" prefetch={false} className="wa-kit-focus">{step.title}{' '}<span className="wa-sr-only">in a new tab</span></Link></li>)}</ol>
          </section>)}</div>
        </details>}
        <p className={styles.matchCount}>{filtered.length} matching {mode === 'fixtures' ? 'screens' : 'checks'} · Showing {visible.length}</p>
        {mode === 'fixtures' ? <div className={styles.catalog}>
          {ROLES.filter((group) => visible.some((item) => item.role === group)).map((group) => <section key={group} aria-labelledby={`fixture-role-${group}`}>
            <h2 className={styles.groupTitle} id={`fixture-role-${group}`}>{roleLabel(group)}</h2>
            {visible.filter((item) => item.role === group).map(fixtureCard)}
          </section>)}
          {!visible.length && <p className={styles.empty}>No screens match. Choose another portal or clear your search.</p>}
        </div> : <>
        <p className={styles.acceptanceNote}>These {mode === 'focused' ? inventory.focusCases.length + ' workflows' : inventory.routes.length + ' routes'} retain normal access checks. Use approved preview accounts and records. Dynamic routes open their starting list; issued links must be supplied. Rendering a sample screen does not pass these checks.</p>
        <DataTable className={styles.table} columns={columns} rows={visible} rowKey={(item) => item.id} aria-label="Portal screen acceptance checklist" mobile="cards" minWidth={850}
          cardRender={(item) => <section className={styles.mobileRow}>{screenCell(item)}{coverageCell(item)}{resultCell(item)}</section>}
          empty={{ kind: 'filtered', title: 'No screens match these filters', description: 'Choose another portal or clear your search.' }} /></>}
        {visible.length < filtered.length && <button type="button" className={`wa-kit-cta wa-kit-cta--ghost ${styles.showMore}`} onClick={() => setLimit((value) => value + 10)}>Show 10 more {mode === 'fixtures' ? 'screens' : 'checks'}</button>}
      </section>
    </DesignSurface>
  );
}
