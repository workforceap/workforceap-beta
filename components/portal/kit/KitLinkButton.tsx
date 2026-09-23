'use client';

import type { ReactNode } from 'react';
import NextLink from 'next/link';
import { Button } from '@astryxdesign/core/Button';
import { cx, type KitBaseProps, type KitDataAttrs } from './base';

type KitLinkButtonProps = KitBaseProps<HTMLAnchorElement> &
  KitDataAttrs & {
    /** Destination. Rendered as a Next.js client-side link. */
    href: string;
    /** Visible text and accessible name. */
    label: string;
    /** Astryx Button variant. @default 'secondary' */
    variant?: 'primary' | 'secondary';
    /** Astryx Button size. @default 'sm' */
    size?: 'sm' | 'md';
    /** Optional leading icon (mark it `aria-hidden`). */
    icon?: ReactNode;
    /** Optional trailing icon, e.g. an arrow (mark it `aria-hidden`). */
    endContent?: ReactNode;
  };

/**
 * A navigation action that looks like an Astryx Button but is ONE link
 * (WAP-252). Wrapping `<Button>` in an Astryx `<Link>` rendered
 * `<a><button>`: invalid HTML, and two tab stops with the same name for
 * keyboard and screen-reader users. Astryx's own guidance: "Don't use a
 * button for navigation… use a link instead."
 *
 * Astryx `Button` renders itself as the link when given `href` + `as`, so the
 * variant, size, hover and pressed styling stay exactly Astryx's (brand tokens
 * via the §9 bridge, no raw colours). `wa-kit-focus` gives it the kit's
 * `:focus-visible` ring, the same one as every other portal control.
 */
export function KitLinkButton({
  href,
  label,
  variant = 'secondary',
  size = 'sm',
  icon,
  endContent,
  className,
  style,
  ref,
  ...rest
}: KitLinkButtonProps) {
  return (
    <Button
      {...rest}
      href={href}
      as={NextLink as never}
      label={label}
      variant={variant}
      size={size}
      icon={icon}
      endContent={endContent}
      className={cx('wa-kit-focus', className)}
      style={style}
      ref={ref as never}
    />
  );
}
