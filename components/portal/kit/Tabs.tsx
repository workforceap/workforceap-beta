'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cx, type KitBaseProps, type KitDataAttrs } from './base';
import { useListFocus } from './hooks/useListFocus';

/**
 * Portal Design Kit — section tabs.
 *
 * A client island around server-rendered panels: every `<TabPanel>` renders
 * on the server (so there is no second fetch and no layout shift), inactive
 * panels carry the `hidden` attribute, and the tablist swaps which one shows.
 *
 *  - WAI-ARIA tabs pattern: `role=tablist/tab/tabpanel`, `aria-selected`,
 *    `aria-controls` / `aria-labelledby`, roving tabindex with Arrow / Home /
 *    End keys (via `useListFocus`), selection follows focus.
 *  - Deep links keep working: an in-page anchor (`#some-section-id`) that sits
 *    inside a panel opens that panel on load (and on `hashchange`) and scrolls
 *    to the anchor. `?<urlParam>=<tab>` is mirrored with `history.replaceState`
 *    on every switch — no navigation, no refetch.
 *  - Styling is `.wa-kit-tabs` / `.wa-kit-tab` / `.wa-kit-tabpanel` in
 *    css/portal-kit.css (`--wa-*` only; the row scrolls sideways on phones).
 *
 * Usage:
 *
 *   <Tabs items={TABS} defaultValue={initialTab} label="Member record" idBase="member-record" urlParam="tab">
 *     <TabPanel value="profile">…</TabPanel>
 *     <TabPanel value="notes">…</TabPanel>
 *   </Tabs>
 */

export interface KitTabItem {
  /** Stable id: used for `?urlParam=` values and element ids. */
  id: string;
  label: string;
}

interface TabsProps extends KitBaseProps<HTMLDivElement>, KitDataAttrs {
  items: ReadonlyArray<KitTabItem>;
  /** Selected tab when neither the URL param nor an in-page anchor decides. Falls back to the first item. */
  defaultValue?: string;
  /** Accessible name of the tablist. */
  label: string;
  /** Prefix for tab / panel element ids (`<idBase>-tab-<id>`, `<idBase>-panel-<id>`). Defaults to a React id. */
  idBase?: string;
  /** Query-string key mirrored on switch (`history.replaceState`); omit to leave the URL alone. */
  urlParam?: string;
  children: ReactNode;
}

type TabsContextValue = { value: string; idBase: string };

const TabsContext = createContext<TabsContextValue | null>(null);

const PANEL_ATTR = 'data-kit-tabpanel';

function anchorTarget(): HTMLElement | null {
  const raw = window.location.hash.slice(1);
  if (!raw) return null;
  let id = raw;
  try {
    id = decodeURIComponent(raw);
  } catch {
    id = raw;
  }
  return document.getElementById(id);
}

export function Tabs({
  items,
  defaultValue,
  label,
  idBase,
  urlParam,
  className,
  style,
  ref,
  children,
  ...rest
}: TabsProps) {
  const reactId = useId();
  const base = idBase ?? `kit-tabs-${reactId.replace(/:/g, '')}`;
  const ids = useMemo(() => items.map((item) => item.id), [items]);
  const [value, setValue] = useState<string>(() =>
    defaultValue && ids.includes(defaultValue) ? defaultValue : ids[0],
  );
  const { containerRef, onKeyDown } = useListFocus<HTMLDivElement>({ orientation: 'horizontal' });
  const pendingScroll = useRef<HTMLElement | null>(null);

  const select = useCallback(
    (next: string) => {
      if (!ids.includes(next)) return;
      setValue(next);
      if (!urlParam || typeof window === 'undefined') return;
      const url = new URL(window.location.href);
      url.searchParams.set(urlParam, next);
      url.hash = '';
      window.history.replaceState(window.history.state, '', url);
    },
    [ids, urlParam],
  );

  // Deep links: `#anchor` inside a panel opens that panel; `?tab=` on
  // back/forward re-selects. Runs after hydration so the server markup (default
  // tab) stays identical to the first client render.
  useEffect(() => {
    const applyHash = () => {
      const target = anchorTarget();
      if (!target) return;
      const panel = target.closest<HTMLElement>(`[${PANEL_ATTR}]`);
      if (!panel || !panel.id.startsWith(`${base}-panel-`)) return;
      const next = panel.getAttribute(PANEL_ATTR);
      if (!next || !ids.includes(next)) return;
      pendingScroll.current = target;
      setValue((current) => (current === next ? current : next));
    };
    const applyParam = () => {
      if (!urlParam) return;
      const next = new URL(window.location.href).searchParams.get(urlParam);
      if (next && ids.includes(next)) setValue(next);
    };
    applyHash();
    const onPopState = () => {
      applyParam();
      applyHash();
    };
    window.addEventListener('hashchange', applyHash);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('hashchange', applyHash);
      window.removeEventListener('popstate', onPopState);
    };
  }, [base, ids, urlParam]);

  // Scroll to the anchor once its panel is visible (after the commit that
  // dropped `hidden`), so the browser lands on the section, not the tab row.
  useEffect(() => {
    const target = pendingScroll.current;
    if (!target) return;
    pendingScroll.current = null;
    if (typeof target.scrollIntoView === 'function') target.scrollIntoView({ block: 'start' });
  }, [value]);

  const ctx = useMemo<TabsContextValue>(() => ({ value, idBase: base }), [value, base]);

  return (
    <TabsContext.Provider value={ctx}>
      <div ref={ref} className={cx('wa-kit-tabs-root', className)} style={style} {...rest}>
        <div
          ref={containerRef}
          role="tablist"
          aria-label={label}
          className="wa-kit-tabs"
          onKeyDown={onKeyDown}
        >
          {items.map((item) => {
            const selected = item.id === value;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`${base}-tab-${item.id}`}
                aria-selected={selected}
                aria-controls={`${base}-panel-${item.id}`}
                tabIndex={selected ? 0 : -1}
                data-kit-list-item
                className="wa-kit-tab"
                onClick={() => select(item.id)}
                onFocus={() => {
                  if (!selected) select(item.id);
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

interface TabPanelProps extends KitBaseProps<HTMLDivElement>, KitDataAttrs {
  /** Matches the `id` of the owning `Tabs` item. */
  value: string;
  children: ReactNode;
}

export function TabPanel({ value, className, style, ref, children, ...rest }: TabPanelProps) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('<TabPanel> must render inside <Tabs>');
  const active = ctx.value === value;
  return (
    <div
      ref={ref}
      role="tabpanel"
      id={`${ctx.idBase}-panel-${value}`}
      aria-labelledby={`${ctx.idBase}-tab-${value}`}
      tabIndex={0}
      hidden={!active}
      {...{ [PANEL_ATTR]: value }}
      className={cx('wa-kit-tabpanel', className)}
      style={style}
      {...rest}
    >
      {children}
    </div>
  );
}
