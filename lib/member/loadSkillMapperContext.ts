import { prisma } from '@/lib/db/prisma';
import { parseSavedSkillMapperRun, SKILL_MAPPER_LOOKUP_PREFIX } from './skillMapperRun';

/** Never substitutes a newer or another member's run for an explicit selection. */
export async function loadSkillMapperContext(userId: string, requestedId?: string) {
  const where = { userId, toolType: 'skill_assessment' as const, inputSummary: { startsWith: SKILL_MAPPER_LOOKUP_PREFIX } };
  const select = { id: true, output: true, createdAt: true } as const;
  const validId = !!requestedId && requestedId.length <= 128 && /^[A-Za-z0-9_-]+$/.test(requestedId);
  const [rows, selectedRow] = await Promise.all([
    prisma.aIToolResult.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 20, select }),
    validId ? prisma.aIToolResult.findFirst({ where: { ...where, id: requestedId }, select }) : Promise.resolve(null),
  ]);
  const selected = parseSavedSkillMapperRun(selectedRow);
  return {
    recent: rows.flatMap(row => { const run = parseSavedSkillMapperRun(row); return run ? [run] : []; }),
    selected,
    selectionUnavailable: !!requestedId && !selected,
  };
}
