import type { ReactNode } from 'react';
import { Blob as NodeBlob } from 'node:buffer';
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Keep these tests on the real checklist behavior. Presentation primitives use
// native controls so no popover, table-layout or provider behavior is simulated.
vi.mock('next/link', () => ({ default: ({ children, href, target, rel }: {
  children: ReactNode; href: string; target?: string; rel?: string;
}) => <a href={href} target={target} rel={rel}>{children}</a> }));
vi.mock('@astryxdesign/core/Selector', () => ({ Selector: ({ label, value, options, isDisabled, onChange }: {
  label: string; value: string; options: { value: string; label: string }[];
  isDisabled?: boolean; onChange: (value: string) => void;
}) => <label>{label}<select value={value} disabled={isDisabled} onChange={(event) => onChange(event.target.value)}>
  {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
</select></label> }));
vi.mock('@astryxdesign/core/TextInput', () => ({ TextInput: ({ label, value, onChange }: {
  label: string; value: string; onChange: (value: string) => void;
}) => <label>{label}<input value={value} onChange={(event) => onChange(event.target.value)} /></label> }));
vi.mock('@astryxdesign/core/TextArea', () => ({ TextArea: ({ label, value, isDisabled, onChange }: {
  label: string; value: string; isDisabled?: boolean; onChange: (value: string) => void;
}) => <label>{label}<textarea value={value} disabled={isDisabled} onChange={(event) => onChange(event.target.value)} /></label> }));
vi.mock('@astryxdesign/core/CheckboxInput', () => ({ CheckboxInput: ({ label, value, isDisabled, onChange }: {
  label: string; value: boolean; isDisabled?: boolean; onChange: (value: boolean) => void;
}) => <label>{label}<input type="checkbox" checked={value} disabled={isDisabled} onChange={(event) => onChange(event.target.checked)} /></label> }));
vi.mock('@/components/portal/kit', () => ({
  DesignSurface: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  StatusTag: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  PageOpener: ({ title, lede, action }: { title: string; lede: string; action: ReactNode }) => <header><h1>{title}</h1><p>{lede}</p>{action}</header>,
  DataTable: ({ rows, columns, rowKey }: {
    rows: { id: string }[];
    columns: { key: string; render: (row: { id: string }) => ReactNode }[];
    rowKey: (row: { id: string }) => string;
  }) => <div>{rows.map((row) => <section key={rowKey(row)}>{columns.map((column) => <div key={column.key}>{column.render(row)}</div>)}</section>)}</div>,
}));

import PortalReviewClient from '@/app/dev/portal-review/PortalReviewClient';

const revision = 'review-revision-a';
const resumeRoute = '/dashboard/resume?view=files';
const repliesRoute = '/counselor/today?view=replies';
const caseKey = (route: string, revisionId = revision) => `wap-portal-review:${revisionId}:case:${encodeURIComponent(`focus:${route}`)}`;
const inventory = {
  focusCases: [
    { role: 'member', route: resumeRoute, title: 'Resume files', checks: 'Check original and revised files.' },
    { role: 'counselor', route: repliesRoute, title: 'Awaiting reply', checks: 'Check the scoped member thread.' },
  ],
  routes: [
    { role: 'member', route: '/dashboard/resume', source: 'app/(portal)/dashboard/resume/page.tsx', dynamic: false, openFrom: '/dashboard/resume' },
  ],
};
const row = (notes: string, status = 'not-started') => ({ status, light: false, dark: false, phone: false, notes });
const review = (revisionId = revision) => <PortalReviewClient inventory={inventory} revision={revisionId} />;
const notes = (container: HTMLElement, title: string) => within(container).getByRole('textbox', { name: `Notes: ${title}` });
const result = (container: HTMLElement, title: string) => within(container).getByRole('combobox', { name: `Result: ${title}` });
const setNotes = (container: HTMLElement, title: string, value: string) => fireEvent.change(notes(container, title), { target: { value } });
const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.useFakeTimers();
  vi.stubGlobal('Blob', NodeBlob);
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:review-csv') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate);
  else Reflect.deleteProperty(URL, 'createObjectURL');
  if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
  else Reflect.deleteProperty(URL, 'revokeObjectURL');
});

function notifyStorage(key: string | null, storageArea = localStorage) {
  act(() => window.dispatchEvent(new StorageEvent('storage', { key, storageArea, newValue: key ? storageArea.getItem(key) : null })));
}

async function exportCsv(container: HTMLElement) {
  fireEvent.click(within(container).getByRole('button', { name: 'Export review CSV' }));
  const blob = vi.mocked(URL.createObjectURL).mock.calls.at(-1)![0] as unknown as NodeBlob;
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  expect(Array.from(new Uint8Array(await blob.arrayBuffer()).slice(0, 3))).toEqual([239, 187, 191]);
  return blob.text();
}

describe('browser-local portal review results', () => {
  it('preserves separate screen edits from two stale tabs and restores both on reload', () => {
    const first = render(review());
    const second = render(review());
    setNotes(first.container, 'Resume files', 'Original file download verified');
    fireEvent.change(result(first.container, 'Resume files'), { target: { value: 'pass' } });
    // No storage notification has reached this second tab yet.
    setNotes(second.container, 'Awaiting reply', 'Reply action needs investigation');
    fireEvent.change(result(second.container, 'Awaiting reply'), { target: { value: 'issue' } });
    first.unmount();
    second.unmount();
    const restored = render(review());
    expect(notes(restored.container, 'Resume files')).toHaveValue('Original file download verified');
    expect(result(restored.container, 'Resume files')).toHaveValue('pass');
    expect(notes(restored.container, 'Awaiting reply')).toHaveValue('Reply action needs investigation');
    expect(result(restored.container, 'Awaiting reply')).toHaveValue('issue');
    expect(localStorage.getItem(`wap-portal-review:${revision}`)).toBeNull();
  });

  it('reconciles saved records and removals, ignoring other revisions and session storage', () => {
    const view = render(review());
    localStorage.setItem(caseKey(resumeRoute), JSON.stringify(row('Checked in another tab', 'pass')));
    notifyStorage(caseKey(resumeRoute));
    expect(notes(view.container, 'Resume files')).toHaveValue('Checked in another tab');
    expect(result(view.container, 'Resume files')).toHaveValue('pass');

    localStorage.setItem(caseKey(resumeRoute), JSON.stringify(row('Not yet notified')));
    sessionStorage.setItem(caseKey(resumeRoute), JSON.stringify(row('Wrong storage area')));
    notifyStorage(caseKey(resumeRoute), sessionStorage);
    notifyStorage(caseKey(resumeRoute, 'another-revision'));
    expect(notes(view.container, 'Resume files')).toHaveValue('Checked in another tab');

    localStorage.removeItem(caseKey(resumeRoute));
    notifyStorage(caseKey(resumeRoute));
    expect(notes(view.container, 'Resume files')).toHaveValue('');
    expect(result(view.container, 'Resume files')).toHaveValue('not-started');
  });

  it('keeps newer fields on the same case when its storage event has not arrived yet', () => {
    const view = render(review());
    localStorage.setItem(caseKey(resumeRoute), JSON.stringify({ ...row('Remote note', 'pass'), dark: true }));
    setNotes(view.container, 'Resume files', 'Local follow-up');
    expect(result(view.container, 'Resume files')).toHaveValue('pass');
    expect(within(view.container).getByRole('group', { name: 'Resume files coverage' })).toContainElement(
      within(view.container).getAllByRole('checkbox', { name: 'Dark checked' })[0],
    );
    expect(within(view.container).getAllByRole('checkbox', { name: 'Dark checked' })[0]).toBeChecked();
    expect(JSON.parse(localStorage.getItem(caseKey(resumeRoute))!)).toMatchObject({ notes: 'Local follow-up', status: 'pass', dark: true });
  });

  it('preserves legacy results, prioritizes case records and isolates another revision', () => {
    localStorage.setItem(`wap-portal-review:${revision}`, JSON.stringify({
      [`focus:${resumeRoute}`]: row('Legacy resume note', 'pass'),
      [`focus:${repliesRoute}`]: row('Legacy reply note', 'blocked'),
    }));
    localStorage.setItem(caseKey(resumeRoute), JSON.stringify(row('Newer case note', 'issue')));
    const view = render(review());
    expect(notes(view.container, 'Resume files')).toHaveValue('Newer case note');
    expect(result(view.container, 'Resume files')).toHaveValue('issue');
    expect(notes(view.container, 'Awaiting reply')).toHaveValue('Legacy reply note');
    view.rerender(review('review-revision-b'));
    expect(notes(view.container, 'Resume files')).toHaveValue('');
    expect(notes(view.container, 'Awaiting reply')).toHaveValue('');
    notifyStorage(caseKey(resumeRoute));
    expect(notes(view.container, 'Resume files')).toHaveValue('');
  });

  it('keeps failed saves editable and exportable, and retries them on the next edit', async () => {
    const view = render(review());
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    setNotes(view.container, 'Resume files', 'Unsaved but recoverable');
    expect(within(view.container).getByText('Browser saving is unavailable. Export the CSV before closing.')).toBeInTheDocument();
    expect(await exportCsv(view.container)).toContain('Unsaved but recoverable');
    expect(localStorage.getItem(caseKey(resumeRoute))).toBeNull();

    setNotes(view.container, 'Awaiting reply', 'Next review');
    expect(within(view.container).getByText('Review changes save in this browser.')).toBeInTheDocument();
    view.unmount();
    const restored = render(review());
    expect(notes(restored.container, 'Resume files')).toHaveValue('Unsaved but recoverable');
    expect(notes(restored.container, 'Awaiting reply')).toHaveValue('Next review');
  });

  it('ignores malformed stored rows without blanking valid results', () => {
    localStorage.setItem(caseKey(resumeRoute), '{broken');
    localStorage.setItem(caseKey(repliesRoute), JSON.stringify({ status: 'invented', light: 'yes', dark: true, notes: 'x'.repeat(3010) }));
    const view = render(review());
    expect(notes(view.container, 'Resume files')).toHaveValue('');
    expect(notes(view.container, 'Awaiting reply')).toHaveValue('x'.repeat(3000));
    expect(result(view.container, 'Awaiting reply')).toHaveValue('not-started');
    const coverage = within(within(view.container).getByRole('group', { name: 'Awaiting reply coverage' }));
    expect(coverage.getByRole('checkbox', { name: 'Light checked' })).not.toBeChecked();
    expect(coverage.getByRole('checkbox', { name: 'Dark checked' })).toBeChecked();
  });
});

describe('review CSV downloads', () => {
  it.each([
    ['=1+1', '"\'=1+1"'],
    [' \t\r\n@SUM(A1)', '"\' \t\r\n@SUM(A1)"'],
    ['\n -1+2', '"\'\n -1+2"'],
    [' \u0001+1', '"\' \u0001+1"'],
  ])('exports formula-looking notes as text: %j', async (note, expectedCell) => {
    // Saved notes can retain CRLF/control characters that a textarea normalizes
    // while typing; exercise the exported bytes from that persisted boundary.
    localStorage.setItem(caseKey(resumeRoute), JSON.stringify(row(note)));
    const view = render(review());
    expect(await exportCsv(view.container)).toContain(expectedCell);
  });

  it('quotes multiline text and exports all cases even when the list is filtered', async () => {
    const view = render(review());
    setNotes(view.container, 'Resume files', 'First line, "quoted"\nSecond line');
    fireEvent.change(within(view.container).getByRole('combobox', { name: 'Portal' }), { target: { value: 'member' } });
    expect(within(view.container).queryByRole('textbox', { name: 'Notes: Awaiting reply' })).toBeNull();
    const csv = await exportCsv(view.container);
    expect(csv).toContain('"First line, ""quoted""\nSecond line"');
    expect(csv).toContain('"focused","counselor","/counselor/today?view=replies"');
    expect(csv).toContain('"routes","member","/dashboard/resume"');
    expect(csv).toContain('"Revision","Type","Role","Route","Check","Light","Dark","Phone","Result","Notes"');
  });
});
