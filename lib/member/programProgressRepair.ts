/**
 * Pure planner for the `member_program_progress` repair (WAP-181).
 *
 * The audit found three faults in the stored rollups, all of them data rather
 * than computation:
 *
 *   - rollups with no `course_progress` rows underneath that still claim
 *     completions (`computeTrainingProgress` trusts a rollup whenever one
 *     exists, so those numbers reach the member, the counselor and the funder
 *     denominators);
 *   - rollups whose `average_percent` no longer matches the mean of the rows
 *     underneath;
 *   - users holding two rollups for one program, under `comptia-a-plus` and
 *     `comptia-a-professional-certificate`.
 *
 * How progress is computed going forward is *not* changed here -- #2421 and
 * #2425 fixed that. The caller recomputes each program with exactly the
 * pipeline the live writer uses (`loadValidatedProgramCourses` +
 * `reconcileProgramProgress`, as in lib/member/courseProgress.ts and
 * scripts/canonicalize-course-progress-slugs.ts) and hands the result in. This
 * module only decides which stored rows to keep, rewrite or fold together, and
 * -- the part that matters for a production run -- which rows it refuses to
 * touch because it cannot explain them.
 *
 * Pure and Prisma-free so the decisions can be tested without a database.
 */
import { canonicalizeProgramSlug } from '@/lib/content/programSlug';

export type StoredRollup = {
  id: string;
  userId: string;
  /** As stored. May be a legacy alias of the canonical program slug. */
  programSlug: string;
  coursesCompleted: number;
  averagePercent: number;
};

/** What the live pipeline says the rollup should read, or why it could not say. */
export type ProgramRecompute =
  | {
      status: 'computed';
      coursesCompleted: number;
      averagePercent: number;
      /** `course_progress` rows underneath, across every alias of the program. */
      courseRowCount: number;
      /** Courses in the validated program list; the rollup's denominator. */
      totalCourses: number;
    }
  | { status: 'unresolved'; reason: string };

/** Why a group was rewritten. A group can carry more than one. */
export type RepairReason =
  | 'alias_duplicate'
  | 'orphan_rollup'
  | 'drifted_average'
  | 'drifted_completions';

export type RollupRepairAction =
  | {
      kind: 'update';
      userId: string;
      canonicalProgramSlug: string;
      /** The row that survives and is rewritten in place. */
      keepId: string;
      storedProgramSlug: string;
      /** Set when the survivor is an alias row that must also be re-keyed. */
      renameProgramSlugTo?: string;
      /** Duplicate rows folded into the survivor and then removed. */
      deleteIds: readonly string[];
      before: { coursesCompleted: number; averagePercent: number };
      after: { coursesCompleted: number; averagePercent: number };
      courseRowCount: number;
      totalCourses: number;
      reasons: readonly RepairReason[];
    }
  | {
      kind: 'keep';
      userId: string;
      canonicalProgramSlug: string;
      keepId: string;
      value: { coursesCompleted: number; averagePercent: number };
    };

export type UnexplainedRollup = {
  userId: string;
  canonicalProgramSlug: string;
  ids: readonly string[];
  storedProgramSlugs: readonly string[];
  reason: string;
};

export type RollupRepairPlan = {
  /** Rows to rewrite, in a stable order. */
  updates: readonly Extract<RollupRepairAction, { kind: 'update' }>[];
  /** Rows already correct. */
  unchanged: readonly Extract<RollupRepairAction, { kind: 'keep' }>[];
  /** Rows deliberately left alone because the plan cannot justify a value. */
  unexplained: readonly UnexplainedRollup[];
  summary: {
    rollupsScanned: number;
    groupsScanned: number;
    rowsRewritten: number;
    rowsDeleted: number;
    rowsRekeyed: number;
    aliasDuplicateGroups: number;
    orphanRollups: number;
    driftedAverages: number;
    driftedCompletions: number;
    unexplainedRollups: number;
  };
};

/** `average_percent` is stored as an integer; the audit's threshold is one point. */
export const AVERAGE_PERCENT_TOLERANCE = 1;

export function recomputeKey(userId: string, canonicalProgramSlug: string): string {
  return `${userId}\u0000${canonicalProgramSlug}`;
}

function groupRollups(rollups: readonly StoredRollup[]): Map<string, StoredRollup[]> {
  const groups = new Map<string, StoredRollup[]>();
  for (const rollup of rollups) {
    const key = recomputeKey(rollup.userId, canonicalizeProgramSlug(rollup.programSlug));
    const bucket = groups.get(key);
    if (bucket) bucket.push(rollup);
    else groups.set(key, [rollup]);
  }
  // Deterministic order so a dry run and the apply that follows it agree.
  for (const bucket of groups.values()) bucket.sort((a, b) => a.id.localeCompare(b.id));
  return groups;
}

/**
 * Pick the row that survives a duplicate group: the one already on the
 * canonical program slug, otherwise the lowest id, which is then re-keyed.
 */
function chooseSurvivor(group: readonly StoredRollup[], canonical: string): StoredRollup {
  return group.find((row) => row.programSlug === canonical) ?? group[0];
}

export function planProgramProgressRepair(args: {
  rollups: readonly StoredRollup[];
  /** Keyed by `recomputeKey(userId, canonicalProgramSlug)`. */
  recomputes: ReadonlyMap<string, ProgramRecompute>;
}): RollupRepairPlan {
  const updates: Extract<RollupRepairAction, { kind: 'update' }>[] = [];
  const unchanged: Extract<RollupRepairAction, { kind: 'keep' }>[] = [];
  const unexplained: UnexplainedRollup[] = [];
  let aliasDuplicateGroups = 0;
  let orphanRollups = 0;
  let driftedAverages = 0;
  let driftedCompletions = 0;

  const groups = [...groupRollups(args.rollups).entries()].sort(([a], [b]) => a.localeCompare(b));

  for (const [key, group] of groups) {
    const canonical = key.slice(key.indexOf('\u0000') + 1);
    const userId = group[0].userId;
    const recompute = args.recomputes.get(key);

    if (!recompute || recompute.status === 'unresolved') {
      unexplained.push({
        userId,
        canonicalProgramSlug: canonical,
        ids: group.map((row) => row.id),
        storedProgramSlugs: group.map((row) => row.programSlug),
        reason: recompute?.status === 'unresolved' ? recompute.reason : 'no recomputed value was produced',
      });
      continue;
    }

    // A program with no validated course list has no denominator, so a
    // recomputed 0 would be an assertion, not a measurement. Leave it.
    if (recompute.totalCourses === 0) {
      unexplained.push({
        userId,
        canonicalProgramSlug: canonical,
        ids: group.map((row) => row.id),
        storedProgramSlugs: group.map((row) => row.programSlug),
        reason: 'the program has no validated course list, so the rollup has no denominator',
      });
      continue;
    }

    const survivor = chooseSurvivor(group, canonical);
    const duplicates = group.filter((row) => row.id !== survivor.id);
    const reasons: RepairReason[] = [];

    if (duplicates.length > 0) {
      reasons.push('alias_duplicate');
      aliasDuplicateGroups += 1;
    }
    if (recompute.courseRowCount === 0 && group.some((row) => row.coursesCompleted > 0 || row.averagePercent > 0)) {
      reasons.push('orphan_rollup');
      orphanRollups += group.filter((row) => row.coursesCompleted > 0 || row.averagePercent > 0).length;
    }
    if (Math.abs(survivor.averagePercent - recompute.averagePercent) > AVERAGE_PERCENT_TOLERANCE) {
      reasons.push('drifted_average');
      driftedAverages += 1;
    }
    if (survivor.coursesCompleted !== recompute.coursesCompleted) {
      reasons.push('drifted_completions');
      driftedCompletions += 1;
    }

    const needsRekey = survivor.programSlug !== canonical;
    const valueChanges =
      survivor.coursesCompleted !== recompute.coursesCompleted ||
      survivor.averagePercent !== recompute.averagePercent;

    if (reasons.length === 0 && !needsRekey && !valueChanges) {
      unchanged.push({
        kind: 'keep',
        userId,
        canonicalProgramSlug: canonical,
        keepId: survivor.id,
        value: { coursesCompleted: survivor.coursesCompleted, averagePercent: survivor.averagePercent },
      });
      continue;
    }

    updates.push({
      kind: 'update',
      userId,
      canonicalProgramSlug: canonical,
      keepId: survivor.id,
      storedProgramSlug: survivor.programSlug,
      ...(needsRekey ? { renameProgramSlugTo: canonical } : {}),
      deleteIds: duplicates.map((row) => row.id),
      before: { coursesCompleted: survivor.coursesCompleted, averagePercent: survivor.averagePercent },
      after: { coursesCompleted: recompute.coursesCompleted, averagePercent: recompute.averagePercent },
      courseRowCount: recompute.courseRowCount,
      totalCourses: recompute.totalCourses,
      reasons,
    });
  }

  return {
    updates,
    unchanged,
    unexplained,
    summary: {
      rollupsScanned: args.rollups.length,
      groupsScanned: groups.length,
      rowsRewritten: updates.length,
      rowsDeleted: updates.reduce((total, row) => total + row.deleteIds.length, 0),
      rowsRekeyed: updates.filter((row) => row.renameProgramSlugTo).length,
      aliasDuplicateGroups,
      orphanRollups,
      driftedAverages,
      driftedCompletions,
      unexplainedRollups: unexplained.reduce((total, row) => total + row.ids.length, 0),
    },
  };
}

/** One line per change, so a dry run names every row it would touch. */
export function formatRepairPlan(plan: RollupRepairPlan): string {
  const lines: string[] = [];
  lines.push(`member_program_progress repair plan (WAP-181)`);
  lines.push(`  rollups scanned      ${plan.summary.rollupsScanned} in ${plan.summary.groupsScanned} (user, program) groups`);
  lines.push(`  rows to rewrite      ${plan.summary.rowsRewritten}`);
  lines.push(`  duplicate rows to remove ${plan.summary.rowsDeleted} (${plan.summary.aliasDuplicateGroups} alias-duplicate groups)`);
  lines.push(`  rows to re-key       ${plan.summary.rowsRekeyed}`);
  lines.push(`  orphan rollups       ${plan.summary.orphanRollups} (claim progress with no course_progress rows underneath)`);
  lines.push(`  drifted averages     ${plan.summary.driftedAverages} (> ${AVERAGE_PERCENT_TOLERANCE} point from the recomputed mean)`);
  lines.push(`  drifted completions  ${plan.summary.driftedCompletions}`);
  lines.push(`  left alone           ${plan.summary.unexplainedRollups} rollups this plan cannot explain`);
  lines.push(`  already correct      ${plan.unchanged.length}`);

  if (plan.updates.length > 0) {
    lines.push('');
    lines.push('CHANGES');
    for (const update of plan.updates) {
      lines.push(
        `  ${update.userId} / ${update.canonicalProgramSlug}` +
          `\n      keep    ${update.keepId} (stored as ${update.storedProgramSlug})` +
          (update.renameProgramSlugTo ? `  -> re-key program_slug to ${update.renameProgramSlugTo}` : '') +
          `\n      value   completed ${update.before.coursesCompleted} -> ${update.after.coursesCompleted}` +
          `, average ${update.before.averagePercent}% -> ${update.after.averagePercent}%` +
          `\n      basis   ${update.courseRowCount} course_progress rows over ${update.totalCourses} validated courses` +
          (update.deleteIds.length > 0 ? `\n      remove  ${update.deleteIds.join(', ')}` : '') +
          `\n      reasons ${update.reasons.join(', ') || 'value refresh'}`,
      );
    }
  }

  if (plan.unexplained.length > 0) {
    lines.push('');
    lines.push('LEFT ALONE (not touched in --apply)');
    for (const row of plan.unexplained) {
      lines.push(
        `  ${row.userId} / ${row.canonicalProgramSlug}` +
          `\n      rows    ${row.ids.join(', ')} (stored as ${[...new Set(row.storedProgramSlugs)].join(', ')})` +
          `\n      reason  ${row.reason}`,
      );
    }
  }

  return lines.join('\n');
}
