# UI Design System & Migration Playbook

**Audience:** Whoever is iterating on portal / admin UI in Cursor (or any local session with a running dev server).
**Goal:** Reduce 8,791 inline `style={{}}` blocks across 435 files by routing them through 6 primitives.

---

## Why this exists

The May 2026 routing audit (`docs/ROUTING-AUDIT-2026-05-07.md`) flagged that the codebase has:
- 300 components, 8,791 inline style blocks across 435 files
- 4 components over 1000 lines
- The same shapes (stat card, data table, empty state, section header) repeated dozens of times with subtly varying paddings, font sizes, and overflow handling

Centralizing these into a small primitive set means a future style change (denser admin layout, mobile card-collapse, sticky headers, dark-mode tweak) lives in one place instead of 30.

This is **best done in a local session** (Cursor or a dev server with hot reload) so visual regressions are caught immediately.

---

## The primitives

### Existing (already in `components/portal/ui/`)

| Component | What it does | Use when |
|---|---|---|
| `PortalCard` | A bordered card with optional header (title + subtitle + action) and body. | Need a section container with consistent padding and a built-in title row. |
| `PortalActionCard` | Tile with icon hero + eyebrow + title + description + CTA. Renders as `<Link>`. | Linking to another route from a grid (e.g. AI Tools dashboard, program tiles). |
| `PortalMetricCard` | Stat card: icon + value + label + optional trend + optional `href`. | Showing a number above a label (KPIs, counts, scores). Replaces the repeated `display: 'flex'; gap` stat blocks. |
| `PortalInput` | Form input wrapper. | Form fields. |
| `PortalEmptyState` (in `components/portal/`) | Illustrated empty state with icon + title + description + 1–2 CTAs. | When a list / queue / table is empty. |
| `StatusBadge` (in `components/portal/`) | Pill badge with variant colors (`success`, `accent`, `gold`, `error`). | Status labels. |

### New (added in this PR)

| Component | What it does | Use when |
|---|---|---|
| **`DataTable<TRow>`** | Generic typed data table with column config, density, mobile-hide. Wraps in scroll container. | Any tabular list — replaces inline `<table>` + repeated `borderBottom: '1px solid var(--outline-variant)'`. |
| **`SectionHeader`** | Title + optional subtitle + right-aligned action row. | Inside a card or section, when you need a heading row but `PortalCard`'s built-in header is too heavyweight. |

---

## Portal surfaces (counselor + employer)

These routes use the same **`DataTable`** + **`SectionHeader`** + **`PortalEmptyState`** patterns as admin, with **`variant="portal"`** on counselor tables (built-in cell chrome) and **`variant="admin"`** where employer CSS reuses `admin-table`:

| Area | Files |
| --- | --- |
| Counselor | `app/(portal)/counselor/placements/page.tsx`, `inactive-members/page.tsx` |
| Employer | `components/employer/EmployerApplicationsClient.tsx` (expandable chat via `renderSubRow`), `EmployerMatchHistoryClient.tsx` |

Forms on placements use **`FormField`** (and **`Toggle`**) from `components/portal/kit/FormField.tsx`, re-exported through `@/components/portal/kit`.

---

## Reference migration — see this PR's diff

`app/admin/coursera/learners/unmatched/[externalEmail]/page.tsx` migrates **all** tabular sections on that screen:

| Section | Data source (DB) | Primitive usage |
| --- | --- | --- |
| Map-to-user intro | N/A (identity copy + `MapToUserActions`) | `<SectionHeader>` for title + explanatory subtitle |
| Unmatched xAPI preview | `loadUnmatchedXapiEventsByExternalEmail` → underlying xAPI / ingest pipeline (see `XapiStatement` in Prisma schema). Preview capped; overflow → `/events`. | `<SectionHeader>` + `<DataTable>` + “View all” footer |
| Coursera courses (CSV) | `coursera_course_progress` keyed by `external_email` | `<SectionHeader>` + `<DataTable>` |
| Specializations / badges (CSV) | `coursera_badge_progress` | `<SectionHeader>` + `<DataTable>` |

Inline `style={{}}` remains only inside cell renderers (status pills, badge chips, secondary lines).

---

## Migration playbook (run in Cursor with dev server running)

For each candidate page (start with the bigger admin pages — they have the most repetition):

### Step 1 — Find a candidate

Run from repo root:

```bash
# Find files with raw <table> + inline style
grep -rln "borderCollapse: 'collapse'" app components --include="*.tsx" \
  | xargs wc -l | sort -n | tail -20
```

The largest hits at the top of that list are the highest-leverage migrations.

### Step 2 — Identify the section to extract

Inside the file, look for the pattern:

```tsx
<table style={{ width: '100%', borderCollapse: 'collapse', ... }}>
  <thead>
    <tr style={{ textAlign: 'left' }}>
      <th style={{ padding: '...', borderBottom: '...' }}>...</th>
      ...
    </tr>
  </thead>
  <tbody>
    {rows.map((row) => ( ... ))}
  </tbody>
</table>
```

That's a `<DataTable>` waiting to happen.

### Step 3 — Convert columns to a config

For each `<th>` in the original, write a column entry:

```tsx
{
  key: 'received',                            // stable key (from <th> identity)
  header: 'Received',                         // <th> children
  cell: (row) => <span>{row.receivedAt}</span>, // <td> renderer for that column
  align: 'right',                             // optional, copies <td>'s textAlign
  hideOnMobile: true,                         // optional, drops the column < 640px
}
```

The cell renderer can be anything — JSX, code blocks, badges, multi-line content. **The body stays inline** in the cell renderer — `DataTable` only standardizes the surrounding `<table>` / `<tr>` / `<td>` chrome.

### Step 4 — Replace the section

```tsx
<DataTable<RowType>
  columns={[ ... ]}
  rows={data}
  rowKey={(row) => row.id}
  density="compact"           // or omit for default
  emptyState={<PortalEmptyState .../>}  // optional
/>
```

If the section had a header row (h2 + subtitle + action), wrap with `<SectionHeader>` above the `<DataTable>`.

### Step 5 — Visually verify

With `npm run dev` running, hit the page. Compare side-by-side with production (or a tab of master). The visual diff should be:
- Identical desktop rendering
- Compact density may shrink slightly — confirm acceptable
- Mobile (< 640px): columns flagged `hideOnMobile` drop out

### Step 6 — Commit per file

One file per commit. Do not bulk-replace — visual regressions are easier to bisect when each migration is its own commit.

---

## High-leverage migration targets (sorted by file size)

After this PR lands, these are the next files to migrate. Each has multiple inline tables:

| File | Lines | Estimated tables |
|---|---:|---:|
| `app/admin/coursera/page.tsx` | 760 | 4–5 |
| `app/admin/page.tsx` | 697 | 3–4 |
| `app/admin/members/[id]/page.tsx` | 695 | 5+ (one per tab) |
| `app/admin/members/page.tsx` | 248 | 1 |
| `components/admin/CourseraMappingsAdmin.tsx` | 983 | 2–3 |
| `components/admin/EmailCronsClient.tsx` | 838 | 2 |
| `components/admin/AdminSuperMessagesClient.tsx` | 780 | 1–2 |
| `components/admin/BoardOutcomesView.tsx` | 463 | 4–5 |
| `components/portal/AiResultRenderer.tsx` | 629 | varies |

---

## Patterns to extract NEXT (after `DataTable` adoption settles)

These are the next primitives to consider once `DataTable` is the default:

| Candidate | Pattern |
|---|---|
| `<KvList>` | The `<dl>` with `gridTemplateColumns: 'minmax(8rem, max-content) 1fr'` pattern that shows up on every detail page. |
| `<Tag>` / `<Pill>` | The inline `borderRadius: 999, padding: '0.1rem 0.45rem'` mini-badges (separate from `StatusBadge` which is heavier). |
| `<AdminSection>` | A `PortalCard` wrapper with consistent admin padding + the in-card section style admin pages use. Reduce the `className="content-card" style={{ padding: '1rem 1.1rem' }}` repetition. |
| `<DefinitionGrid>` | The label/value pairs that appear in identity cards, member detail tabs, etc. |

Don't build these speculatively — wait until 2–3 different pages actually want them.

---

## What NOT to migrate

Some inline styles are appropriate and shouldn't be primitive-ized:

- **One-off layout** (a single `display: 'grid', gap: '1rem'` wrapper). Inline is clearer than naming a one-off component.
- **Animation / transition** values that are intrinsically per-element.
- **Mobile/desktop split conditionals** (`wa-block md:wa-hidden` style). The existing pattern works; don't replace it without reason.
- **Charts** and other deeply custom visual elements where the styling IS the component.

---

## Pre-merge checklist for any UI migration PR

- [ ] Visual diff vs master on the changed page(s) — desktop AND mobile
- [ ] No regression on dark mode (toggle in nav)
- [ ] `npx tsc --noEmit` clean
- [ ] If the migration touches a high-traffic page (admin home, member dashboard), test at least one full user flow that lands on it
- [ ] Update this doc if a new pattern emerges that should become a primitive

---

## Document history

| Date | Change |
|---|---|
| 2026-05-07 | Initial doc; `DataTable` + `SectionHeader` primitives added; reference migration in `app/admin/coursera/learners/unmatched/[externalEmail]/page.tsx`. |
| 2026-05-08 | Reference page: merged with master (pagination + test-traffic SQL); CSV course/badge tables migrated to `DataTable`; mapping card uses `SectionHeader`. |

---

*This is a living doc. Update it as the design system evolves.*
