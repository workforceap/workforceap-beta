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
