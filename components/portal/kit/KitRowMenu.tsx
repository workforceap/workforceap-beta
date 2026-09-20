'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Ellipsis } from 'lucide-react';
import { cx, type KitBaseProps, type KitDataAttrs } from './base';

export type KitRowMenuItem = {
  key: string;
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  /** Kept visible but inert, with `reason` as the tooltip (never hidden). */
  disabled?: boolean;
  reason?: string;
  /** Destructive items paint with `--wa-danger`. */
  tone?: 'default' | 'danger';
};

interface KitRowMenuProps extends KitBaseProps<HTMLDivElement>, KitDataAttrs {
  /** Accessible name of the trigger, e.g. `Actions for Dana Reyes`. */
  label: string;
  items: KitRowMenuItem[];
}

/**
 * Row action menu for kit tables — one icon trigger, a `role="menu"` list on
 * `--wa-*`. Closes on Escape, outside click and after an item runs. Arrow keys
 * move between items; disabled items stay visible with a reason so a staff
 * member learns why an action is off instead of hunting for it.
 */
export function KitRowMenu({ label, items, className, style, ref, ...rest }: KitRowMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLUListElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])');
    first?.focus();
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const moveFocus = (delta: number) => {
    const nodes = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (nodes.length === 0) return;
    const index = nodes.findIndex((n) => n === document.activeElement);
    const next = (index + delta + nodes.length) % nodes.length;
    nodes[next]?.focus();
  };

  return (
    <div
      ref={(node) => {
        rootRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      className={cx('wa-kit-row-menu', className)}
      style={style}
      {...rest}
    >
      <button
        ref={triggerRef}
        type="button"
        className="wa-kit-row-menu__trigger wa-kit-focus"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Ellipsis size={18} aria-hidden />
      </button>
      {open ? (
        <ul
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className="wa-kit-row-menu__list"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              moveFocus(1);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              moveFocus(-1);
            } else if (e.key === 'Tab') {
              setOpen(false);
            }
          }}
        >
          {items.map((item) => (
            <li key={item.key} role="none">
              <button
                type="button"
                role="menuitem"
                className={cx('wa-kit-row-menu__item wa-kit-focus', item.tone === 'danger' && 'wa-kit-row-menu__item--danger')}
                aria-disabled={item.disabled || undefined}
                title={item.disabled ? item.reason : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  if (item.disabled) return;
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.icon ? (
                  <span className="wa-kit-row-menu__icon" aria-hidden>
                    {item.icon}
                  </span>
                ) : null}
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
