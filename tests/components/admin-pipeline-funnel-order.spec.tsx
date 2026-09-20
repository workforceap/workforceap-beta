import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PipelineFunnelKitProps } from '@/components/portal/kit/pages/admin-subviews/PipelineFunnelKit';

/**
 * /admin/pipeline walks the funnel in the order applicants pass it and
 * explains the WIOA screening count instead of printing "Eligibility cleared
 * 0" above "Enrolled 8" (admin audit 2026-09-20, Pipeline).
 */

const mocks = vi.hoisted(() => ({ kit: vi.fn(), counts: [8, 8, 0, 8, 7] }));

vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'admin-1' }) }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: async () => 'org-1' }));
vi.mock('@/lib/tenant/withTenantScope', () => ({ withTenantScope: vi.fn() }));
vi.mock('@/lib/tenant/adminPageScope', () => ({
  resolveAdminPageTenant: async () => ({ ok: true, orgId: 'org-1', superAdmin: false }),
  inheritUserOrg: () => ({}), inheritMemberOrg: () => ({}), inheritLeaderOrg: () => ({}), inheritInvitedByOrg: () => ({}),
  withAdminPageScope: (_scope: unknown, run: (db: unknown) => unknown) => {
    let call = 0;
    return run({ user: { count: async () => mocks.counts[call++] } });
  },
}));
vi.mock('@/app/admin/pipeline/PipelineLegacyView', () => ({ default: () => null }));
vi.mock('@/app/admin/pipeline/PlacementRecordedToast', () => ({ default: () => null }));
vi.mock('@/components/portal/kit/pages/admin-subviews/PipelineFunnelKit', () => ({
  PipelineFunnelKit: (props: PipelineFunnelKitProps) => { mocks.kit(props); return null; },
}));

import PipelinePage from '@/app/admin/pipeline/page';

async function kitProps(): Promise<PipelineFunnelKitProps> {
  render(await PipelinePage({ searchParams: Promise.resolve({}) }));
  return mocks.kit.mock.calls.at(-1)?.[0];
}

beforeEach(() => { vi.clearAllMocks(); mocks.counts = [8, 8, 0, 8, 7]; });
afterEach(cleanup);

describe('/admin/pipeline funnel order', () => {
  it('orders the bars by funnel position and keeps eligibility out of them', async () => {
    const props = await kitProps();
    expect(props.funnel?.map((bar) => [bar.label, bar.value])).toEqual([
      ['Started application', '8'],
      ['Completed intake', '8'],
      ['Enrolled', '8'],
      ['Active', '7'],
    ]);
    expect(props.funnelSubtitle).toMatch(/^last 90 days · .*each stage counts the ones who reached it$/);
  });

  it('shows the WIOA screening count as a captioned tile', async () => {
    const props = await kitProps();
    const wioa = props.kpis?.find((kpi) => kpi.label === 'WIOA screened');
    expect(wioa).toMatchObject({ value: '0', deltaTone: 'muted' });
    expect(wioa?.delta).toMatch(/not a gate/);
    expect(props.kpis?.map((kpi) => kpi.label)).toEqual(['Started', 'Enrolled', 'Active', 'Started → Active', 'WIOA screened']);
  });

  it('passes an empty funnel and no tiles when nobody started in the window', async () => {
    mocks.counts = [0, 0, 0, 0, 0];
    const props = await kitProps();
    expect(props.funnel).toEqual([]);
    expect(props.kpis).toBeUndefined();
  });
});
