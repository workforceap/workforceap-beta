import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import {
  EMPLOYERS_DIRECTORY_EMPTY,
  PARTNERS_DIRECTORY_EMPTY,
  SUBGROUPS_DIRECTORY_EMPTY,
} from '@/lib/admin/directoryEmptyState';
import { PartnersDirectoryKit } from './PartnersDirectoryKit';
import { EmployersDirectoryKit } from './EmployersDirectoryKit';
import { SubgroupsDirectoryKit } from './SubgroupsDirectoryKit';

/**
 * The three admin directories render the shared empty copy through the kit
 * KitEmptyState (left-aligned heading + lede + kit CTA), never the Astryx
 * EmptyState card. Formerly asserted by reading the kit sources in
 * lib/admin/directoryEmptyState.test.ts.
 */
const cases = [
  ['partners', PARTNERS_DIRECTORY_EMPTY, () => <PartnersDirectoryKit partners={[]} total={0} />],
  ['employers', EMPLOYERS_DIRECTORY_EMPTY, () => <EmployersDirectoryKit employers={[]} />],
  ['subgroups', SUBGROUPS_DIRECTORY_EMPTY, () => <SubgroupsDirectoryKit subgroups={[]} />],
] as const;

afterEach(cleanup);

describe('admin directory kits empty state', () => {
  it.each(cases)('%s directory renders the shared copy as a kit empty state with a kit CTA', (_name, copy, make) => {
    const { container } = render(make());

    const heading = screen.getByRole('heading', { name: copy.title });
    expect(heading.style.textAlign).not.toBe('center');
    // KitEmptyState markup: heading + .wa-kit-lede description inside a kit card.
    const shell = heading.parentElement as HTMLElement;
    expect(shell.closest('.wa-kit-card')).not.toBeNull();
    expect(within(shell).getByText(copy.description).className).toContain('wa-kit-lede');

    const cta = within(shell).getByRole('link', { name: copy.primaryCta.label });
    expect(cta.getAttribute('href')).toBe(copy.primaryCta.href);
    expect(cta.className).toContain('wa-kit-cta');

    // No Astryx EmptyState card (its icon well + centered layout).
    expect(container.querySelector('[class*="EmptyState"], [class*="empty-state"]')).toBeNull();
  });
});
