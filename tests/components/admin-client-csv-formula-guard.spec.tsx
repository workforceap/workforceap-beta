/**
 * S01/P02 part 3: CSVs the admin UI builds in the browser must show a
 * member- or employer-typed formula as text in Excel/Sheets, the same way the
 * server-built exports do since #2563 / #2587.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import PlacementsTableClient from '@/components/admin/PlacementsTableClient';
import AssessmentsTable from '@/components/admin/AssessmentsTable';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(),
}));

let blobs: Blob[] = [];
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;

beforeEach(() => {
  blobs = [];
  URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
    blobs.push(b as Blob);
    return 'blob:test';
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  vi.restoreAllMocks();
});

async function lastCsv(): Promise<string[]> {
  expect(blobs).toHaveLength(1);
  const text = await blobs[0].text();
  return text.split('\n');
}

describe('admin placements CSV download', () => {
  it('shows a member-typed formula in the member cell as text and keeps the header row', async () => {
    render(
      <PlacementsTableClient
        placements={[
          {
            id: 'p1',
            employerName: '@SUM(1+1)',
            jobTitle: '+Dispatcher',
            startDate: '2026-09-01T00:00:00.000Z',
            startDateVerified: false,
            memberReported: true,
            salaryOffered: 52000,
            placedAt: '2026-08-20T00:00:00.000Z',
            user: { id: 'u1', fullName: "=cmd|' /C calc'!A0", email: 'taylor@example.test', enrolledProgram: 'it-support' },
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/ }));
    const [header, row] = await lastCsv();
    expect(header).toBe('Member,Email,Program,Employer,Role,Start date,Wage (USD),Status,Placed at');
    expect(row.startsWith("'=cmd|' /C calc'!A0,")).toBe(true);
    expect(row).toBe(
      "'=cmd|' /C calc'!A0,taylor@example.test,it-support,'@SUM(1+1),'+Dispatcher,2026-09-01,52000,member_reported_unverified,2026-08-20",
    );
  });
});

describe('admin assessments CSV download', () => {
  it('shows formula-looking names and phones as text and keeps the header row', async () => {
    render(
      <AssessmentsTable
        users={[
          {
            id: 'u1',
            fullName: '=HYPERLINK("http://evil/","x")',
            email: 'ana@example.test',
            phone: '+1 512 555 0100',
            programInterest: 'IT, Support',
            assessmentScore: 8,
            assessmentScorePct: 80,
            assessmentCompletedAt: new Date('2026-09-01T12:00:00.000Z'),
            assessmentAnswers: null,
          },
        ]}
        correctnessByUserId={{}}
        totalCount={1}
        currentPage={1}
        pageSize={25}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    const [header, row] = await lastCsv();
    expect(header).toBe('Name,Email,Phone,Program Interest,Score %,Date Completed');
    expect(row).toBe(
      `"'=HYPERLINK(""http://evil/"",""x"")",ana@example.test,'+1 512 555 0100,"IT, Support",80,2026-09-01T12:00:00.000Z`,
    );
  });
});
