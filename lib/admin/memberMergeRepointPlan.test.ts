/**
 * The merge plan, checked against the Prisma schema rather than trusted.
 *
 * `repoint('invitation', 'inviterId')` and `repoint('memberSubgroup', 'userId')`
 * named columns that do not exist, so those two relations had never moved a
 * row. Nothing caught it: the executor's blanket `catch` reported the Prisma
 * validation error as "constraint conflict", and no test compared the list
 * against the schema. This is that comparison. It reads the generated DMMF, so
 * it re-derives every claim in the plan from the schema instead of restating it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { Prisma } from '@prisma/client';

import {
  MEMBER_MERGE_PREVIEW_ONLY,
  MEMBER_MERGE_REPOINT_PLAN,
  STRANDING_NOT_SURFACED,
  USER_FK_HANDLED_ELSEWHERE,
  USER_FK_NOT_REPOINTED,
  type RepointSpec,
} from './memberMergeRepointPlan';

type DmmfModel = (typeof Prisma.dmmf.datamodel.models)[number];

/** Prisma exposes `Model` as the `model` delegate: lower-case the first letter only. */
const MODELS_BY_DELEGATE = new Map<string, DmmfModel>(
  Prisma.dmmf.datamodel.models.map((model) => [model.name[0].toLowerCase() + model.name.slice(1), model]),
);

/** Every unique constraint (including a compound primary key) the column belongs to. */
function uniqueConstraintsContaining(model: DmmfModel, field: string): string[][] {
  const constraints: string[][] = [];
  for (const unique of model.uniqueFields ?? []) {
    if (unique.includes(field)) constraints.push([...unique]);
  }
  for (const modelField of model.fields) {
    if (modelField.name === field && modelField.isUnique) constraints.push([field]);
  }
  if (model.primaryKey && model.primaryKey.fields.includes(field)) {
    constraints.push([...model.primaryKey.fields]);
  }
  return constraints;
}

const ALL_SPECS: RepointSpec[] = [...MEMBER_MERGE_REPOINT_PLAN, ...MEMBER_MERGE_PREVIEW_ONLY];

test('the plan is not empty and has no duplicate model/field pairs', () => {
  assert.ok(MEMBER_MERGE_REPOINT_PLAN.length > 20, 'the merge repoints dozens of relations');
  assert.ok(MEMBER_MERGE_PREVIEW_ONLY.length > 0);
  const seen = new Set<string>();
  for (const spec of ALL_SPECS) {
    const key = `${spec.model}.${spec.field}`;
    assert.equal(seen.has(key), false, `${key} is listed twice`);
    seen.add(key);
  }
  assert.equal(seen.size, ALL_SPECS.length);
});

test('every planned model is a real Prisma delegate', () => {
  assert.ok(ALL_SPECS.length > 0, 'nothing to check means nothing is proven');
  for (const spec of ALL_SPECS) {
    assert.ok(
      MODELS_BY_DELEGATE.has(spec.model),
      `"${spec.model}" is not a Prisma model (delegate names are camelCase, e.g. aIToolResult)`,
    );
  }
});

test('every planned column exists on its model', () => {
  assert.ok(ALL_SPECS.length > 0, 'nothing to check means nothing is proven');
  for (const spec of ALL_SPECS) {
    const model = MODELS_BY_DELEGATE.get(spec.model);
    assert.ok(model, `${spec.model} missing`);
    const field = model.fields.find((candidate) => candidate.name === spec.field);
    assert.ok(
      field,
      `${spec.model}.${spec.field} is not a column. Candidates: ${model.fields
        .filter((candidate) => candidate.kind === 'scalar' && /id$/i.test(candidate.name))
        .map((candidate) => candidate.name)
        .join(', ')}`,
    );
    assert.equal(field.kind, 'scalar', `${spec.model}.${spec.field} must be a scalar FK column`);
  }
});

test('uniqueWith is declared exactly when the column can collide, and matches the schema', () => {
  assert.ok(ALL_SPECS.length > 0, 'nothing to check means nothing is proven');
  let collidable = 0;
  for (const spec of ALL_SPECS) {
    const model = MODELS_BY_DELEGATE.get(spec.model)!;
    const constraints = uniqueConstraintsContaining(model, spec.field);

    // `uniqueWith` is a single list, which is only meaningful while a column
    // belongs to at most one unique constraint. If that ever stops being true
    // the collision planner needs to consider both, so fail loudly here.
    assert.ok(
      constraints.length <= 1,
      `${spec.model}.${spec.field} is in ${constraints.length} unique constraints; uniqueWith cannot express that`,
    );

    if (constraints.length === 0) {
      assert.equal(
        spec.uniqueWith,
        undefined,
        `${spec.model}.${spec.field} is in no unique constraint, so it must not declare uniqueWith`,
      );
      continue;
    }

    collidable += 1;
    const expected = constraints[0].filter((column) => column !== spec.field);
    assert.ok(
      spec.uniqueWith,
      `${spec.model}.${spec.field} is unique on (${constraints[0].join(', ')}) and must declare uniqueWith: [${expected
        .map((column) => `'${column}'`)
        .join(', ')}]`,
    );
    assert.deepEqual(
      [...spec.uniqueWith].sort(),
      [...expected].sort(),
      `${spec.model}.${spec.field} declares the wrong uniqueWith`,
    );
    for (const column of spec.uniqueWith) {
      assert.ok(
        model.fields.some((candidate) => candidate.name === column),
        `${spec.model}.${column} (from uniqueWith) is not a column`,
      );
    }
  }
  // The whole point of the plan: collisions are common, not exotic.
  assert.ok(collidable > 10, `expected many collidable relations, found ${collidable}`);
});

test('the two columns that never existed are named correctly now', () => {
  const invitation = MEMBER_MERGE_REPOINT_PLAN.filter((spec) => spec.model === 'invitation');
  const subgroup = MEMBER_MERGE_REPOINT_PLAN.filter((spec) => spec.model === 'memberSubgroup');
  assert.ok(invitation.length > 0 && subgroup.length > 0);
  assert.deepEqual(invitation.map((spec) => spec.field).sort(), ['acceptedById', 'invitedById']);
  assert.deepEqual(subgroup.map((spec) => spec.field).sort(), ['assignedBy', 'memberId']);
  assert.equal(
    MEMBER_MERGE_REPOINT_PLAN.some((spec) => spec.field === 'inviterId'),
    false,
    'invitation.inviterId is not a column and never was',
  );
});

test('the preview-only list stays disjoint from what the executor moves', () => {
  assert.ok(MEMBER_MERGE_PREVIEW_ONLY.length > 0, 'nothing to check means nothing is proven');
  const planned = new Set(MEMBER_MERGE_REPOINT_PLAN.map((spec) => `${spec.model}.${spec.field}`));
  for (const spec of MEMBER_MERGE_PREVIEW_ONLY) {
    assert.equal(
      planned.has(`${spec.model}.${spec.field}`),
      false,
      `${spec.model}.${spec.field} is both previewed-only and repointed`,
    );
  }
});


/** Scalar or enum columns that look like progress or a status. */
function stateCarryingColumns(model: DmmfModel): string[] {
  return model.fields
    .filter(
      (field) =>
        field.kind !== 'object' &&
        /status|completed|complete|approved|active|score|progress|earned|verified|accepted|rejected/i.test(field.name),
    )
    .map((field) => field.name);
}

const COLLIDABLE = MEMBER_MERGE_REPOINT_PLAN.filter((spec) => spec.uniqueWith);

test('only a relation that can collide may declare what it strands', () => {
  assert.ok(MEMBER_MERGE_REPOINT_PLAN.length > 0, 'nothing to check means nothing is proven');
  for (const spec of MEMBER_MERGE_REPOINT_PLAN) {
    if (spec.uniqueWith) continue;
    assert.equal(
      spec.stranded,
      undefined,
      `${spec.model}.${spec.field} cannot collide, so it can never strand a row`,
    );
  }
});

test('every collidable relation either names what it strands or says why it does not', () => {
  assert.ok(COLLIDABLE.length > 10, `expected many collidable relations, found ${COLLIDABLE.length}`);
  for (const spec of COLLIDABLE) {
    const key = `${spec.model}.${spec.field}`;
    const declared = Boolean(spec.stranded);
    const excused = Object.prototype.hasOwnProperty.call(STRANDING_NOT_SURFACED, key);
    assert.ok(
      declared !== excused,
      declared
        ? `${key} both declares a stranded label and is listed as not surfaced`
        : `${key} can strand a row but neither names it nor gives a reason in STRANDING_NOT_SURFACED. ` +
          `A new collidable relation must not default to silence.`,
    );
    if (excused) {
      assert.ok(
        STRANDING_NOT_SURFACED[key].length > 20,
        `${key} needs a real reason, not a placeholder`,
      );
    }
  }
});

test('STRANDING_NOT_SURFACED does not excuse relations that are not in the plan', () => {
  const collidableKeys = new Set(COLLIDABLE.map((spec) => `${spec.model}.${spec.field}`));
  const keys = Object.keys(STRANDING_NOT_SURFACED);
  assert.ok(keys.length > 0, 'nothing to check means nothing is proven');
  for (const key of keys) {
    assert.ok(collidableKeys.has(key), `${key} is excused but is not a collidable relation in the plan`);
  }
});

test('a stranded label is grounded in a column that actually exists', () => {
  const labelled = MEMBER_MERGE_REPOINT_PLAN.filter((spec) => spec.stranded);
  assert.ok(labelled.length > 5, `expected several labelled relations, found ${labelled.length}`);
  for (const spec of labelled) {
    const model = MODELS_BY_DELEGATE.get(spec.model)!;
    const impact = spec.stranded!;
    assert.ok(impact.noun.trim().length > 0, `${spec.model} needs a singular noun`);
    assert.ok(impact.plural.trim().length > 0, `${spec.model} needs a plural`);
    assert.notEqual(impact.noun, impact.plural, `${spec.model}: singular and plural must differ`);
    assert.ok(
      ['state', 'review'].includes(impact.weight),
      `${spec.model} has an unknown stranding weight`,
    );
    // messageThread carries no status column; what is lost there is the
    // conversation itself, so it is labelled without one on purpose.
    if (spec.model !== 'messageThread' && spec.model !== 'placedOutcome' && spec.model !== 'courseEnrollment') {
      assert.ok(
        stateCarryingColumns(model).length > 0,
        `${spec.model} is labelled as carrying state but has no status-like column`,
      );
    }
  }
});

test('the merge refuses to decide exactly where two real records compete', () => {
  const review = MEMBER_MERGE_REPOINT_PLAN.filter((spec) => spec.stranded?.weight === 'review');
  assert.ok(review.length > 0, 'nothing to check means nothing is proven');
  // Each of these is a distinct real-world thing where only one row can
  // survive and no rule can pick honestly: two placements, two intake
  // responses, or two conversations with a counselor. Widening or narrowing
  // this set is a product decision, so it is pinned.
  assert.deepEqual(
    review.map((spec) => spec.model).sort(),
    ['messageThread', 'placedOutcome', 'placementRecord', 'preScreeningResponse'],
  );
  for (const spec of review) {
    assert.ok(spec.uniqueWith, `${spec.model} must be collidable to ever need review`);
    assert.equal(
      spec.uniqueWith.length,
      0,
      `${spec.model} is unique on the member column alone, so ANY row on both sides collides`,
    );
    assert.equal(
      spec.resolution?.strategy,
      'requireDecision',
      `${spec.model} is flagged for review, so the merge must refuse rather than pick`,
    );
    // A refusal that cannot name the competing records is a dead end for the
    // admin, so the describing columns are required and must be real.
    assert.ok(
      spec.resolution.strategy === 'requireDecision' && spec.resolution.describeBy.length > 0,
      `${spec.model} must declare describeBy so the conflict can name both records`,
    );
    const model = MODELS_BY_DELEGATE.get(spec.model)!;
    for (const column of spec.resolution.describeBy) {
      assert.ok(
        model.fields.some((field) => field.name === column),
        `${spec.model}.${column} (describeBy) is not a column`,
      );
    }
  }
});

test('nothing that carries earned state is resolved by keeping the primary', () => {
  // The bug this rule replaces: an ACTIVE training request, a 90%-complete
  // pathway and an approved certification were all silently revoked because
  // keepPrimary was the default for everything.
  const mustNotKeepPrimary = [
    'trainingAccessRequest',
    'benefitRequest',
    'learningProgress',
    'resourceProgress',
    'pathwayStepProgress',
    'userCertification',
    'readinessChecklist',
    'courseraSkillsetProgress',
  ];
  assert.ok(mustNotKeepPrimary.length > 0, 'nothing to check means nothing is proven');
  for (const model of mustNotKeepPrimary) {
    const spec = MEMBER_MERGE_REPOINT_PLAN.find((entry) => entry.model === model && entry.uniqueWith);
    assert.ok(spec, `${model} should be a collidable relation in the plan`);
    assert.equal(
      spec.resolution?.strategy,
      'preferStronger',
      `${model} carries state the member earned; keeping the primary's row revokes it`,
    );
  }
});


/** Every `<delegate>.<column>` in the schema that points at a User row. */
function allUserForeignKeys(): string[] {
  const keys: string[] = [];
  for (const model of Prisma.dmmf.datamodel.models) {
    const delegate = model.name[0].toLowerCase() + model.name.slice(1);
    for (const field of model.fields) {
      if (field.kind !== 'object' || field.type !== 'User') continue;
      for (const column of field.relationFromFields ?? []) {
        keys.push(`${delegate}.${column}`);
      }
    }
  }
  return [...new Set(keys)];
}

test('every User foreign key in the schema is repointed, handled, or explicitly excused', () => {
  // The reverse of the checks above. Those prove the plan is a subset of the
  // schema; without this one, a relation missing from the plan entirely is
  // invisible — which is how 28 of them came to be unmoved without anyone
  // deciding that.
  const keys = allUserForeignKeys();
  assert.ok(keys.length > 50, `expected many User foreign keys, found ${keys.length}`);

  const planned = new Set(
    [...MEMBER_MERGE_REPOINT_PLAN, ...MEMBER_MERGE_PREVIEW_ONLY].map((spec) => `${spec.model}.${spec.field}`),
  );
  const unaccounted = keys.filter(
    (key) =>
      !planned.has(key) &&
      !Object.prototype.hasOwnProperty.call(USER_FK_HANDLED_ELSEWHERE, key) &&
      !Object.prototype.hasOwnProperty.call(USER_FK_NOT_REPOINTED, key),
  );
  assert.deepEqual(
    unaccounted,
    [],
    `These User foreign keys are neither moved by the merge nor explicitly excused. ` +
      `Add them to the plan, or to USER_FK_NOT_REPOINTED with a reason:\n  ${unaccounted.join('\n  ')}`,
  );
});

test('the excuse lists only name columns that really exist', () => {
  const keys = new Set(allUserForeignKeys());
  const listed = [...Object.keys(USER_FK_NOT_REPOINTED), ...Object.keys(USER_FK_HANDLED_ELSEWHERE)];
  assert.ok(listed.length > 0, 'nothing to check means nothing is proven');
  for (const key of listed) {
    assert.ok(keys.has(key), `${key} is excused but is not a User foreign key in the schema`);
  }
  for (const [key, reason] of Object.entries(USER_FK_NOT_REPOINTED)) {
    assert.ok(reason.length > 20, `${key} needs a real reason, not a placeholder`);
  }
});

test('a relation that can collide declares how the collision is resolved', () => {
  assert.ok(COLLIDABLE.length > 10, 'nothing to check means nothing is proven');
  for (const spec of COLLIDABLE) {
    const key = `${spec.model}.${spec.field}`;
    const excused = Object.prototype.hasOwnProperty.call(STRANDING_NOT_SURFACED, key);
    if (excused) continue;
    // A state-bearing relation must not reach keepPrimary by omission, which
    // is exactly how an ACTIVE training request and a 90%-complete pathway
    // were silently revoked.
    assert.ok(
      spec.resolution,
      `${key} can strand a row that carries state and must declare a resolution`,
    );
    if (spec.resolution.strategy === 'preferStronger') {
      const model = MODELS_BY_DELEGATE.get(spec.model)!;
      assert.ok(spec.resolution.rankBy.length > 0, `${key} needs something to rank by`);
      assert.ok(spec.resolution.copy.length > 0, `${key} needs columns to copy`);
      for (const entry of spec.resolution.rankBy) {
        assert.ok(
          model.fields.some((field) => field.name === entry.column),
          `${key} ranks by ${entry.column}, which is not a column`,
        );
        if (entry.kind === 'rank') {
          assert.ok(entry.order.length > 1, `${key}.${entry.column} needs a real order`);
        }
      }
      for (const column of spec.resolution.copy) {
        assert.ok(
          model.fields.some((field) => field.name === column),
          `${key} copies ${column}, which is not a column`,
        );
      }
      // The lift addresses the primary's row by id. `userRole` has a compound
      // primary key and no id column, and selecting one there threw at
      // runtime — so a preferStronger relation must actually have an id.
      assert.ok(
        model.fields.some((field) => field.name === 'id' && field.kind === 'scalar'),
        `${key} is resolved by lifting values onto the primary's row, which addresses it by id, but ${spec.model} has no id column`,
      );
    }
  }
});
