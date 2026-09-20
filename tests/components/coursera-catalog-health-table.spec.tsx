import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * `/admin/coursera` catalog health on the kit table: Program, Coursera
 * mapped, Provider and one Issues count; the unmapped / stale / wrong-type /
 * off-syllabus lists live in a sub-row that opens per program.
 */

import { CourseraCatalogHealthSection, CourseraCatalogHealthTable } from '@/components/admin/CourseraCatalogHealthTable';
import type { ValidatedProgramCatalogEntry } from '@/lib/coursera/programCourseList';

function entry(overrides: Partial<ValidatedProgramCatalogEntry> & Pick<ValidatedProgramCatalogEntry, 'programSlug' | 'programTitle'>): ValidatedProgramCatalogEntry {
  return {
    source: 'static',
    courses: [],
    unmappedSlugs: [],
    staleCourseraIds: [],
    catalogHealth: {
      providerStatus: 'unavailable',
      syllabusCount: 10,
      mappedCount: 9,
      localCourseCount: 0,
      providerCourseCount: null,
      validProviderCourseCount: null,
      invalidContentTypeIds: [],
      additionalCourseraContents: [],
    },
    ...overrides,
  };
}

const healthy = entry({
  programSlug: 'it-support-professional-certificate-ibm',
  programTitle: 'IT Support Professional Certificate (IBM)',
  catalogHealth: {
    providerStatus: 'available',
    syllabusCount: 10,
    mappedCount: 10,
    localCourseCount: 0,
    providerCourseCount: 10,
    validProviderCourseCount: 10,
    invalidContentTypeIds: [],
    additionalCourseraContents: [],
  },
});

const troubled = entry({
  programSlug: 'health-information-technology-mchit',
  programTitle: 'Medical Billing, Coding, and Health Information Technician Certificate (MBCHIT)',
  unmappedSlugs: ['hipaa-basics', 'icd-10-coding'],
  staleCourseraIds: ['COURSE~STALE1'],
  catalogHealth: {
    providerStatus: 'available',
    syllabusCount: 16,
    mappedCount: 7,
    localCourseCount: 2,
    providerCourseCount: 40,
    validProviderCourseCount: 6,
    invalidContentTypeIds: [{ id: 'COURSE~WRONG', contentType: 'Specialization' }],
    additionalCourseraContents: [{ id: 'COURSE~EXTRA', slug: 'extra-course', name: 'Extra course', contentType: 'Course' }],
  },
});

afterEach(() => cleanup());

describe('CourseraCatalogHealthTable', () => {
  it('shows four columns plus the details toggle, with issues collapsed to one count', () => {
    render(<CourseraCatalogHealthTable rows={[healthy, troubled]} />);
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Details', 'Program', 'Coursera mapped', 'Provider', 'Issues']);
    expect(screen.getByRole('columnheader', { name: 'Program' })).toHaveClass('wa-kit-table-sticky-left');

    const healthyRow = screen.getByText(healthy.programSlug).closest('tr')!;
    expect(within(healthyRow).getByText('No issues')).toHaveClass('wa-kit-tag--ok');
    expect(within(healthyRow).getByText('Available · 10 courses')).toHaveClass('wa-kit-tag--ok');
    expect(within(healthyRow).queryByRole('button')).toBeNull();

    const troubledRow = screen.getByText(troubled.programSlug).closest('tr')!;
    expect(within(troubledRow).getByText('5 issues')).toHaveClass('wa-kit-tag--warn');
    expect(within(troubledRow).getByText('2 unmapped · 1 stale ids · 1 wrong type · 1 additional coursera activity')).toBeInTheDocument();
    expect(within(troubledRow).getByText('7 / 16')).toBeInTheDocument();
    expect(within(troubledRow).getByText('6 provider-valid · + 2 WorkforceAP labs')).toBeInTheDocument();
    expect(screen.queryByTestId('catalog-issues')).toBeNull();
  });

  it('opens the grouped issue lists in a sub-row for that program only', () => {
    render(<CourseraCatalogHealthTable rows={[healthy, troubled]} />);
    fireEvent.click(screen.getByRole('button', { name: `Show details for ${troubled.programTitle}` }));
    const details = screen.getByTestId('catalog-issues');
    expect(details.closest('tr')).toHaveClass('wa-kit-table-subrow');
    expect(within(details).getByRole('heading', { level: 4, name: 'Unmapped · 2' })).toBeInTheDocument();
    expect(within(details).getByText('hipaa-basics')).toBeInTheDocument();
    expect(within(details).getByText('icd-10-coding')).toBeInTheDocument();
    expect(within(details).getByRole('heading', { level: 4, name: 'Stale IDs · 1' })).toBeInTheDocument();
    expect(within(details).getByText('COURSE~STALE1')).toBeInTheDocument();
    expect(within(details).getByText('COURSE~WRONG (Specialization)')).toBeInTheDocument();
    expect(within(details).getByText('Extra course · Course · COURSE~EXTRA')).toBeInTheDocument();
    expect(screen.getAllByTestId('catalog-issues')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: `Hide details for ${troubled.programTitle}` }));
    expect(screen.queryByTestId('catalog-issues')).toBeNull();
  });

  it('labels provider states without inventing health', () => {
    render(
      <CourseraCatalogHealthTable
        rows={[
          entry({ programSlug: 'a', programTitle: 'A', catalogHealth: { ...healthy.catalogHealth, providerStatus: 'not_checked', providerCourseCount: null } }),
          entry({ programSlug: 'b', programTitle: 'B', catalogHealth: { ...healthy.catalogHealth, providerStatus: 'available', providerCourseCount: 0 } }),
          entry({ programSlug: 'c', programTitle: 'C' }),
        ]}
      />,
    );
    expect(screen.getByText('Not checked')).toHaveClass('wa-kit-tag--muted');
    expect(screen.getByText('Available · healthy empty')).toHaveClass('wa-kit-tag--ok');
    expect(screen.getByText('Unavailable')).toHaveClass('wa-kit-tag--alert');
  });
});

describe('CourseraCatalogHealthSection', () => {
  it('keeps the section heading and distinguishes a failed audit from an empty catalog', () => {
    const { rerender } = render(<CourseraCatalogHealthSection rows={[]} loadFailed />);
    expect(screen.getByRole('heading', { level: 2, name: 'Catalog health' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('The tenant catalog audit could not be loaded.');
    expect(screen.queryByRole('table')).toBeNull();

    rerender(<CourseraCatalogHealthSection rows={[]} loadFailed={false} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('heading', { level: 3, name: 'No programs in the tenant catalog' })).toBeInTheDocument();
  });
});
