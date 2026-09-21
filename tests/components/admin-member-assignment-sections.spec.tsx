import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const router = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

import MemberPartnerSection from '@/components/admin/MemberPartnerSection';
import MemberSubgroupSection from '@/components/admin/MemberSubgroupSection';

/**
 * Admin audit gap map, item 5: the Partner and Subgroup assignment sections on
 * the member record Overview tab sit in the same kit card as their neighbours
 * (Counselor assignment, Workspace email), each a region named by its h2.
 */
describe('MemberPartnerSection', () => {
  it('is a kit card region named by its heading with the partner control inside', () => {
    render(<MemberPartnerSection memberId="m1" partners={[{ id: 'p1', name: 'Northside Church' }]} currentPartnerId={null} />);
    const region = screen.getByRole('region', { name: 'Partner assignment' });
    expect(region.tagName).toBe('SECTION');
    expect(region.className).toContain('wa-kit-card');
    expect(screen.getByRole('heading', { level: 2, name: 'Partner assignment' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Partner organization' })).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Northside Church' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('preselects the current partner', () => {
    render(<MemberPartnerSection memberId="m1" partners={[{ id: 'p1', name: 'Northside Church' }]} currentPartnerId="p1" />);
    expect(screen.getByRole('combobox', { name: 'Partner organization' })).toHaveValue('p1');
  });
});

describe('MemberSubgroupSection', () => {
  const subgroups = [
    { id: 's1', name: 'Cohort A', type: 'partner' },
    { id: 's2', name: 'Cohort B', type: 'manager' },
  ];

  it('is a kit card region named by its heading listing current subgroups and the add control', () => {
    render(<MemberSubgroupSection memberId="m1" subgroups={subgroups} currentSubgroupIds={['s1']} />);
    const region = screen.getByRole('region', { name: 'Subgroup assignment' });
    expect(region.className).toContain('wa-kit-card');
    expect(screen.getByRole('heading', { level: 2, name: 'Subgroup assignment' })).toBeInTheDocument();
    expect(screen.getByText('Cohort A')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove from Cohort A' })).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Cohort B (manager)' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Cohort A (partner)' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add to subgroup' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says when no subgroups exist instead of showing an empty control', () => {
    render(<MemberSubgroupSection memberId="m1" subgroups={[]} currentSubgroupIds={[]} />);
    expect(screen.getByText('No subgroups exist.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
