import { beforeEach, describe, expect, it, vi } from 'vitest';
import { interviewModeHref, normalizeInterviewRole, resumeWorkspaceHref, resumeWorkspaceView, skillMapperHref, trainingBridgeHref } from '@/lib/member/memberWorkspace';
import { parseSavedSkillMapperRun } from '@/lib/member/skillMapperRun';

const db = vi.hoisted(() => ({ findMany: vi.fn(), findFirst: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { aIToolResult: db } }));
import { loadSkillMapperContext } from '@/lib/member/loadSkillMapperContext';

const output = { occupationTitle: 'User Support', occupationCode: '15-1232.00', skills: [{ name: 'Troubleshooting', score: 80 }], radarAxes: [{ axis: 'Engineering', value: 70 }], demo: false };
const row = (id: string) => ({ id, output: JSON.stringify(output), createdAt: new Date('2026-10-21T12:00:00Z') });

beforeEach(() => { db.findMany.mockReset().mockResolvedValue([row('newest')]); db.findFirst.mockReset().mockResolvedValue(null); });

describe('member workspace destinations', () => {
  it('keeps result, source and repeated context parameters when switching Resume views', () => {
    const url = new URL(resumeWorkspaceHref('coach', 'view=rewrite&regenerateFrom=old-run&source=history&tag=a&tag=b'), 'https://example.test');
    expect(url.pathname).toBe('/dashboard/resume');
    expect(url.searchParams.get('view')).toBe('coach');
    expect(url.searchParams.get('regenerateFrom')).toBe('old-run');
    expect(url.searchParams.getAll('tag')).toEqual(['a', 'b']);
    expect(resumeWorkspaceView('bogus')).toBe('files');
  });

  it('encodes the same role into all four specialized interview routes without changing their mode', () => {
    const expected = { answers: 'interview-practice', coach: 'interview-coach', recorded: 'voice-interview', bundle: 'interview-prep' } as const;
    for (const [mode, route] of Object.entries(expected)) {
      const url = new URL(interviewModeHref(mode as keyof typeof expected, '  IT & cloud / support  '), 'https://example.test');
      expect(url.pathname).toBe(`/dashboard/ai-tools/${route}`);
      expect(url.searchParams.get('role')).toBe('IT & cloud / support');
      expect(url.searchParams.get('prefill')).toBe(mode === 'answers' ? 'true' : null);
    }
    expect(normalizeInterviewRole(['wrong'])).toBe('');
    expect(normalizeInterviewRole('a'.repeat(300))).toHaveLength(200);
  });

  it('gives an explicitly selected saved result precedence over a suggested occupation', () => {
    expect(skillMapperHref({ resultId: 'owned_1', occupationCode: '15-1252.00' })).toBe('/dashboard/ai-tools/skill-mapper?result=owned_1');
    expect(trainingBridgeHref('owned/1')).toBe('/dashboard/ai-tools/training-bridge?result=owned%2F1');
    const url = new URL(skillMapperHref({ occupationCode: '15-1232.00', occupationTitle: 'A & B' }), 'https://example.test');
    expect(url.searchParams.get('title')).toBe('A & B');
  });
});

describe('saved occupation lookup parsing', () => {
  it('preserves source identity, raw radar scale, sample provenance and legacy axis meaning', () => {
    const run = parseSavedSkillMapperRun({ ...row('selected'), output: JSON.stringify({ ...output, demo: true, radarAxes: [{ axis: 'Ethics', value: 115 }], skills: [{ name: ' Listening ', score: -4 }] }) });
    expect(run).toEqual(expect.objectContaining({ id: 'selected', demo: true, skills: [{ name: 'Listening', score: 0 }], radarAxes: [{ axis: 'Service', value: 100 }], createdAt: '2026-10-21T12:00:00.000Z' }));
  });
  it.each(['bad json', '[]', '{}', JSON.stringify({ ...output, occupationCode: '../other' }), JSON.stringify({ ...output, skills: [], radarAxes: [{ axis: 'invented', value: 8 }] })])('rejects a malformed or unrelated saved assessment (%s)', (value) => {
    expect(parseSavedSkillMapperRun({ ...row('bad'), output: value })).toBeNull();
  });
});

describe('explicit owned Skill Mapper result context', () => {
  it('loads the requested older run with member, tool and lookup provenance restrictions', async () => {
    db.findFirst.mockResolvedValue(row('older-owned'));
    const context = await loadSkillMapperContext('member-a', 'older-owned');
    expect(context.selected?.id).toBe('older-owned');
    expect(context.recent.map(run => run.id)).toEqual(['newest']);
    expect(db.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'member-a', toolType: 'skill_assessment', inputSummary: { startsWith: 'Skill mapper lookup' }, id: 'older-owned' } }));
    expect(db.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'member-a', toolType: 'skill_assessment', inputSummary: { startsWith: 'Skill mapper lookup' } } }));
  });
  it('does not replace an inaccessible explicit lookup with a recent owned result', async () => {
    const context = await loadSkillMapperContext('member-a', 'foreign-or-deleted');
    expect(context.selected).toBeNull();
    expect(context.selectionUnavailable).toBe(true);
    expect(context.recent).toHaveLength(1);
  });
  it('does not select the newest result when no lookup is requested', async () => {
    const context = await loadSkillMapperContext('member-a');
    expect(context.selected).toBeNull();
    expect(context.selectionUnavailable).toBe(false);
    expect(db.findFirst).not.toHaveBeenCalled();
  });
  it('rejects malformed IDs without attempting a selected-row query', async () => {
    const context = await loadSkillMapperContext('member-a', '../invalid');
    expect(context.selected).toBeNull();
    expect(context.selectionUnavailable).toBe(true);
    expect(db.findFirst).not.toHaveBeenCalled();
  });
  it('surfaces database failure rather than pretending there are no saved runs', async () => {
    db.findMany.mockRejectedValue(new Error('offline'));
    await expect(loadSkillMapperContext('member-a', 'selected')).rejects.toThrow('offline');
  });
});
