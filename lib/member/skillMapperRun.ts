/** A saved occupation lookup is target evidence, not a member proficiency test. */
export type SavedSkillMapperRun = {
  id: string;
  occupationTitle: string;
  occupationCode: string;
  skills: { name: string; score: number }[];
  radarAxes: { axis: string; value: number }[];
  createdAt: string;
  demo: boolean;
};

export const SKILL_MAPPER_LOOKUP_PREFIX = 'Skill mapper lookup';
export const ONET_OCCUPATION_CODE = /^\d{2}-\d{4}\.\d{2}$/;
const AXES = new Set(['Analytics', 'Engineering', 'Design', 'Strategy', 'Service', 'Research']);

export function parseSavedSkillMapperRun(row: { id: string; output: string; createdAt: Date | string } | null): SavedSkillMapperRun | null {
  if (!row) return null;
  try {
    const data: unknown = JSON.parse(row.output);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const value = data as Record<string, unknown>;
    if (typeof value.occupationCode !== 'string' || !ONET_OCCUPATION_CODE.test(value.occupationCode)) return null;
    const skills = (Array.isArray(value.skills) ? value.skills : []).flatMap((item: unknown) => {
      if (!item || typeof item !== 'object') return [];
      const skill = item as Record<string, unknown>;
      if (typeof skill.name !== 'string' || !skill.name.trim() || typeof skill.score !== 'number' || !Number.isFinite(skill.score)) return [];
      return [{ name: skill.name.trim(), score: Math.max(0, Math.min(100, skill.score)) }];
    });
    const radarAxes = (Array.isArray(value.radarAxes) ? value.radarAxes : []).flatMap((item: unknown) => {
      if (!item || typeof item !== 'object') return [];
      const point = item as Record<string, unknown>;
      const axis = point.axis === 'Ethics' ? 'Service' : point.axis;
      if (typeof axis !== 'string' || !AXES.has(axis) || typeof point.value !== 'number' || !Number.isFinite(point.value)) return [];
      return [{ axis, value: Math.max(0, Math.min(100, point.value)) }];
    });
    if (skills.length === 0 && radarAxes.length === 0) return null;
    const createdAt = new Date(row.createdAt).toISOString();
    return {
      id: row.id,
      occupationCode: value.occupationCode,
      occupationTitle: typeof value.occupationTitle === 'string' && value.occupationTitle.trim() ? value.occupationTitle.trim() : value.occupationCode,
      skills,
      radarAxes,
      createdAt,
      demo: value.demo === true,
    };
  } catch {
    return null;
  }
}
