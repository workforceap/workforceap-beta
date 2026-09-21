'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type KeyboardEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  type NavBadgeKey,
  type PortalNavItem,
  GROUP_ORDER,
  NAV_GROUP_COLLAPSED_BY_DEFAULT,
  NAV_GROUP_LABELS,
  badgeTotalForItem,
  navChildrenOf,
} from '@/lib/nav/portalNav';

/**
 * Grouped command rail (admin): every nav group is a collapsible section whose
 * header is a real `<button aria-expanded>`; rows with `parentHref` children
 * get a second disclosure that opens the nested list. Collapsed content stays
 * in the DOM under `hidden`, so every destination (and every `data-tour`
 * anchor) is always present — it is just not shown until opened.
 *
 * Open/closed state persists per browser under `storageKey`. The section (and
 * parent) holding the current page always opens on arrival; the person can
 * still close it, and it re-opens on the next navigation into it. While a
 * guided tour is running (`forceExpanded`) every section is open so each
 * anchor has a real box for the spotlight.
 *
 * Keyboard: Enter/Space toggle (native button); ArrowRight opens, ArrowLeft
 * closes — the tree-view convention.
 */
export type WorkspaceSidebarSectionsProps = {
  items: PortalNavItem[];
  activeHref: string | null;
  badges: Partial<Record<NavBadgeKey, number>>;
  translateLabel: (label: string) => string;
  onNavigate: () => void;
  storageKey: string;
  forceExpanded?: boolean;
};

const sectionId = (group: string) => `section:${group}`;
const parentId = (href: string) => `item:${href}`;
const domId = (id: string) => `wa-nav-${id.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}`;

type Prefs = Record<string, boolean>;

function readPrefs(key: string): Prefs {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Prefs = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'boolean') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export default function WorkspaceSidebarSections({
  items,
  activeHref,
  badges,
  translateLabel,
  onNavigate,
  storageKey,
  forceExpanded = false,
}: WorkspaceSidebarSectionsProps) {
  const [prefs, setPrefs] = useState<Prefs>({});
  // Disclosures the person closed while they held the current page: keyed by
  // id → the pathname it was closed on, so a later navigation re-opens them.
  const [closedOnRoute, setClosedOnRoute] = useState<Record<string, string>>({});

  useEffect(() => {
    setPrefs(readPrefs(storageKey));
  }, [storageKey]);

  const activeItem = items.find((item) => item.href === activeHref);
  const activeSectionId = activeItem ? sectionId(activeItem.group) : null;
  const activeParentId = activeItem
    ? parentId(activeItem.parentHref ?? activeItem.href)
    : null;

  const isExpanded = useCallback(
    (id: string, defaultOpen: boolean): boolean => {
      if (forceExpanded) return true;
      const holdsCurrentPage = id === activeSectionId || id === activeParentId;
      if (holdsCurrentPage && closedOnRoute[id] !== activeHref) return true;
      return prefs[id] ?? defaultOpen;
    },
    [forceExpanded, activeSectionId, activeParentId, closedOnRoute, activeHref, prefs],
  );

  const toggle = useCallback(
    (id: string, defaultOpen: boolean) => {
      const next = !isExpanded(id, defaultOpen);
      setPrefs((current) => {
        const updated = { ...current, [id]: next };
        try {
          localStorage.setItem(storageKey, JSON.stringify(updated));
        } catch {
          /* private mode / quota — the session state still applies */
        }
        return updated;
      });
      const holdsCurrentPage = id === activeSectionId || id === activeParentId;
      if (holdsCurrentPage && activeHref) {
        setClosedOnRoute((current) => {
          if (next) {
            const { [id]: _dropped, ...rest } = current;
            return rest;
          }
          return { ...current, [id]: activeHref };
        });
      }
    },
    [isExpanded, storageKey, activeSectionId, activeParentId, activeHref],
  );

  const arrowKeys = (id: string, defaultOpen: boolean) => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowRight' && !isExpanded(id, defaultOpen)) {
      event.preventDefault();
      toggle(id, defaultOpen);
    } else if (event.key === 'ArrowLeft' && isExpanded(id, defaultOpen)) {
      event.preventDefault();
      toggle(id, defaultOpen);
    }
  };

  const renderLink = (item: PortalNavItem, extraClass: string, badge: number) => {
    const isActive = activeHref === item.href;
    const Icon = item.Icon;
    return (
      <Link
        href={item.href}
        prefetch={false}
        className={`workspace-sidebar-link${isActive ? ' active' : ''}${extraClass}`}
        aria-current={isActive ? 'page' : undefined}
        onClick={onNavigate}
        {...(item.tourTarget ? { 'data-tour': item.tourTarget } : {})}
      >
        {Icon ? (
          <span className="workspace-sidebar-icon" aria-hidden>
            <Icon size={20} className="text-current" />
          </span>
        ) : null}
        <span className="workspace-sidebar-link-label">{translateLabel(item.label)}</span>
        {badge > 0 ? <span className="workspace-nav-badge">{badge > 99 ? '99+' : badge}</span> : null}
      </Link>
    );
  };

  return (
    <>
      {GROUP_ORDER.map((group) => {
        // Repeated shortcuts must not paint two current-page entries.
        const inGroup = items.filter(
          (item, index) => item.group === group && items.findIndex((candidate) => candidate.href === item.href) === index,
        );
        if (inGroup.length === 0) return null;
        const groupLabel = NAV_GROUP_LABELS[group];
        const sid = sectionId(group);
        const sectionDefaultOpen = !NAV_GROUP_COLLAPSED_BY_DEFAULT[group];
        const sectionOpen = groupLabel ? isExpanded(sid, sectionDefaultOpen) : true;
        const panelId = domId(sid);
        const sectionBadge = inGroup.reduce((total, item) => total + badgeTotalForItem(badges, item), 0);
        const topLevel = inGroup.filter((item) => !item.parentHref);
        return (
          <li key={group} className="workspace-sidebar-group workspace-sidebar-group--section" data-section={group} data-expanded={sectionOpen ? 'true' : 'false'}>
            {groupLabel ? (
              <button
                type="button"
                className="workspace-sidebar-section-btn wa-kit-focus wa-kit-focus--on-dark"
                aria-expanded={sectionOpen}
                aria-controls={panelId}
                data-section={group}
                onClick={() => toggle(sid, sectionDefaultOpen)}
                onKeyDown={arrowKeys(sid, sectionDefaultOpen)}
              >
                <span className="workspace-sidebar-section-btn__label">{translateLabel(groupLabel)}</span>
                {!sectionOpen && sectionBadge > 0 ? (
                  <span className="workspace-nav-badge">{sectionBadge > 99 ? '99+' : sectionBadge}</span>
                ) : null}
                <ChevronDown size={16} aria-hidden className="workspace-sidebar-section-btn__chevron" />
              </button>
            ) : null}
            <ul id={panelId} className="workspace-sidebar-list" hidden={groupLabel ? !sectionOpen : undefined}>
              {topLevel.map((item) => {
                const children = navChildrenOf(inGroup, item.href);
                if (children.length === 0) {
                  return <li key={item.href}>{renderLink(item, '', badgeTotalForItem(badges, item))}</li>;
                }
                const pid = parentId(item.href);
                const childrenOpen = isExpanded(pid, false);
                const childPanelId = domId(pid);
                const childBadge = children.reduce((total, child) => total + badgeTotalForItem(badges, child), 0);
                const ownBadge = badgeTotalForItem(badges, item) + (childrenOpen ? 0 : childBadge);
                const label = translateLabel(item.label);
                return (
                  <li key={item.href} className="workspace-sidebar-item--parent">
                    <div className="workspace-sidebar-row">
                      {renderLink(item, ' workspace-sidebar-link--parent', ownBadge)}
                      <button
                        type="button"
                        className="workspace-sidebar-children-toggle wa-kit-focus wa-kit-focus--on-dark"
                        aria-expanded={childrenOpen}
                        aria-controls={childPanelId}
                        aria-label={`${childrenOpen ? 'Hide' : 'Show'} ${children.length} more under ${label}`}
                        data-testid="sidebar-children-toggle"
                        data-parent={item.href}
                        onClick={() => toggle(pid, false)}
                        onKeyDown={arrowKeys(pid, false)}
                      >
                        <ChevronDown size={14} aria-hidden />
                      </button>
                    </div>
                    <ul id={childPanelId} className="workspace-sidebar-list workspace-sidebar-list--children" hidden={!childrenOpen}>
                      {children.map((child) => (
                        <li key={child.href}>{renderLink(child, ' workspace-sidebar-link--child', badgeTotalForItem(badges, child))}</li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </>
  );
}
