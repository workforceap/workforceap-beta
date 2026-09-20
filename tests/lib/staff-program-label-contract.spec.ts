import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');

const STAFF_PROGRAM_SURFACES = [
  'app/(portal)/counselor/page.tsx',
  'components/portal/counselor/AtRiskDashboard.tsx',
  'components/portal/counselor/CounselorCommandCenter.tsx',
  'components/portal/counselor/CounselorPriorityQueue.tsx',
  'components/portal/counselor/CounselorStudentsRosterClient.tsx',
  'components/admin/AdminCommandCenterClient.tsx',
  'components/admin/AdminPipelineKanban.tsx',
] as const;

describe('staff-facing program labels', () => {
  it.each(STAFF_PROGRAM_SURFACES)('%s resolves catalog titles instead of exposing stable slugs', (file) => {
    const source = readFileSync(path.join(root, file), 'utf8');
    expect(source).toContain('programDisplayTitle');
  });
});
