/**
 * Static guard: a NOT NULL alteration must be preceded by a backfill.
 *
 * `ALTER TABLE t ALTER COLUMN c SET NOT NULL` scans the table and raises
 * SQLSTATE 23502 if a single pre-existing row holds NULL. Adding a DEFAULT in
 * the same migration does NOT help: `ALTER COLUMN ... SET DEFAULT` writes the
 * catalog only and leaves existing rows alone (only `ADD COLUMN ... DEFAULT`
 * fills rows, and even that is a catalog-level fast default). The production
 * build runs `prisma migrate deploy` (package.json `build:with-migrate` ->
 * scripts/safe-migrate.cjs), so such a failure aborts the migration's
 * transaction and fails the deploy.
 *
 * So every `SET NOT NULL` in a new migration must be preceded, in the same
 * file, by an idempotent backfill of the same table and column:
 *
 *   UPDATE "t" SET "c" = <the column's own default> WHERE "c" IS NULL;
 *   ALTER TABLE "t" ALTER COLUMN "c" SET NOT NULL;
 *
 * This check contacts no database and reads no production data.
 *
 * Scope notes:
 *   - `ADD COLUMN ... NOT NULL DEFAULT ...` is not flagged: a column that does
 *     not exist yet has no pre-existing rows to violate the constraint.
 *   - Comments are stripped first, so a `SET NOT NULL` that only appears inside
 *     a commented-out `-- Down` block is not flagged.
 *   - LEGACY_WITHOUT_BACKFILL freezes the migrations that already shipped this
 *     way before the guard existed. Their SQL bytes are pinned by
 *     scripts/check-duplicate-migrations.mjs and must not be rewritten, so they
 *     are recorded rather than fixed. The list may only shrink; never add to it
 *     for a new migration.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATIONS = join(ROOT, 'prisma', 'migrations');

/**
 * Migrations that shipped a NOT NULL alteration with no in-file UPDATE backfill
 * before this guard existed. Frozen inventory — this list may only shrink.
 */
export const LEGACY_WITHOUT_BACKFILL = new Set([
  // counselors.affiliation is added NULL, then filled by two complementary
  // UPDATEs that partition every row on a *different* column
  // (`WHERE partner_id IS NOT NULL` / `WHERE partner_id IS NULL`), so the
  // column is exhaustively assigned — a shape this static check does not model.
  // Its SQL bytes are pinned by scripts/check-duplicate-migrations.mjs and the
  // migration is already applied in production, so it is recorded here rather
  // than rewritten.
  '20260519030000_add_counselor_affiliation',
]);

/** Remove `--` line comments and `/* *​/` block comments, preserving offsets. */
export function stripComments(sql) {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    if (two === '--') {
      while (i < sql.length && sql[i] !== '\n') {
        out += ' ';
        i++;
      }
      continue;
    }
    if (two === '/*') {
      const end = sql.indexOf('*/', i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      for (; i < stop; i++) out += sql[i] === '\n' ? '\n' : ' ';
      continue;
    }
    if (sql[i] === "'") {
      // Copy the whole literal so a `--` or `;` inside it is not misread.
      out += sql[i];
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          out += "''";
          i += 2;
          continue;
        }
        out += sql[i];
        if (sql[i] === "'") {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    out += sql[i];
    i++;
  }
  return out;
}

const unquote = (value) => value.replace(/^"|"$/g, '').toLowerCase();

/** Split into `;`-delimited statements, each with its start offset. */
function statements(sql) {
  const parts = [];
  let start = 0;
  for (let i = 0; i < sql.length; i++) {
    if (sql[i] === ';') {
      parts.push({ text: sql.slice(start, i), start });
      start = i + 1;
    }
  }
  if (sql.slice(start).trim()) parts.push({ text: sql.slice(start), start });
  return parts;
}

/** Every `ALTER COLUMN c SET NOT NULL` as { table, column, offset }. */
export function notNullAlterations(sql) {
  const found = [];
  for (const { text, start } of statements(stripComments(sql))) {
    if (!/SET\s+NOT\s+NULL/i.test(text)) continue;
    const table = /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:IF\s+EXISTS\s+)?(?:"?public"?\.)?("[^"]+"|[A-Za-z0-9_]+)/i.exec(text);
    if (!table) continue;
    for (const [, column] of text.matchAll(
      /ALTER\s+(?:COLUMN\s+)?("[^"]+"|[A-Za-z0-9_]+)\s+SET\s+NOT\s+NULL/gi,
    )) {
      found.push({ table: unquote(table[1]), column: unquote(column), offset: start });
    }
  }
  return found;
}

/**
 * Statements that make a later `SET NOT NULL` safe, as { table, column, offset }.
 * Three accepted shapes, all of which guarantee the constraint is satisfiable
 * or else fail before any row is corrupted:
 *
 *   1. Targeted backfill — `UPDATE t [alias] SET c = <default> WHERE c IS NULL`.
 *      The idempotent shape new migrations should use: re-running matches zero
 *      rows, and it never overwrites a real value.
 *   2. Total backfill — the same UPDATE with no WHERE clause at all, so every
 *      row is assigned. Used where the column was added in the same migration.
 *      An assignment of a literal NULL does not count.
 *   3. Loud precondition — a statement that `RAISE EXCEPTION`s while any
 *      `c IS NULL` remains, so the migration aborts with its own message
 *      instead of a bare 23502 and nothing is corrupted.
 */
export function preconditions(sql) {
  const found = [];
  for (const { text, start } of statements(stripComments(sql))) {
    // Shape 3: an explicit RAISE EXCEPTION guarded on `c IS NULL`.
    if (/RAISE\s+EXCEPTION/i.test(text)) {
      for (const [, column] of text.matchAll(/("[^"]+"|[A-Za-z0-9_]+)\s+IS\s+NULL/gi)) {
        const table = /\bFROM\s+(?:ONLY\s+)?(?:"?public"?\.)?("[^"]+"|[A-Za-z0-9_]+)/i.exec(text);
        if (table) found.push({ table: unquote(table[1]), column: unquote(column), offset: start });
      }
    }

    // Shapes 1 and 2: UPDATE <table> [AS] [alias] SET ...
    const update =
      /^\s*UPDATE\s+(?:ONLY\s+)?(?:"?public"?\.)?("[^"]+"|[A-Za-z0-9_]+)(?:\s+AS)?(?:\s+(?!SET\b)[A-Za-z0-9_]+)?\s+SET\s/i.exec(
        text,
      );
    if (!update) continue;
    const table = unquote(update[1]);
    const where = /\bWHERE\b/i.test(text);
    for (const [, column, value] of text.matchAll(/("[^"]+"|[A-Za-z0-9_]+)\s*=\s*([^,;]*)/g)) {
      const name = unquote(column);
      // Assigning a literal NULL is the opposite of a backfill.
      if (/^\s*NULL\s*$/i.test(value)) continue;
      if (!where) {
        found.push({ table, column: name, offset: start }); // shape 2
        continue;
      }
      const isNull = new RegExp(`(?:"${name}"|\\b${name}\\b)\\s+IS\\s+NULL`, 'i');
      if (isNull.test(text)) found.push({ table, column: name, offset: start }); // shape 1
    }
  }
  return found;
}

/** Alterations with no earlier precondition for the same table+column. */
export function findUnbackfilled(sql) {
  const safe = preconditions(sql);
  return notNullAlterations(sql)
    .filter(
      ({ table, column, offset }) =>
        !safe.some((s) => s.table === table && s.column === column && s.offset < offset),
    )
    .map(({ table, column }) => `${table}.${column}`);
}

export function check(root = ROOT) {
  const dir = join(root, 'prisma', 'migrations');
  const failures = [];
  const staleAllowlist = [];
  let scanned = 0;
  let guarded = 0;

  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || !/^\d+_/.test(entry.name)) continue;
    scanned++;
    const sql = readFileSync(join(dir, entry.name, 'migration.sql'), 'utf8');
    const unbackfilled = findUnbackfilled(sql);
    const legacy = LEGACY_WITHOUT_BACKFILL.has(entry.name);

    if (unbackfilled.length && !legacy) {
      failures.push(
        `prisma/migrations/${entry.name}/migration.sql alters ${unbackfilled.join(', ')} ` +
          'to NOT NULL with no preceding backfill. A single pre-existing NULL row raises ' +
          'SQLSTATE 23502 and fails `prisma migrate deploy`. Add, before each alteration:\n' +
          unbackfilled
            .map((ref) => {
              const [table, column] = ref.split('.');
              return `      UPDATE "${table}" SET "${column}" = <the column's own default> WHERE "${column}" IS NULL;`;
            })
            .join('\n'),
      );
    }
    if (!unbackfilled.length && legacy) staleAllowlist.push(entry.name);
    if (notNullAlterations(sql).length && !unbackfilled.length) guarded++;
  }

  for (const name of staleAllowlist) {
    failures.push(
      `${name} is in LEGACY_WITHOUT_BACKFILL but now backfills every NOT NULL alteration. ` +
        'Remove it from the list — the inventory may only shrink.',
    );
  }

  if (failures.length) {
    console.error(failures.map((line) => `  ✗ ${line}`).join('\n'));
    return 1;
  }
  console.log(
    `PASS NOT NULL backfill guard: ${scanned} migrations scanned; ${guarded} with a backfilled ` +
      `NOT NULL alteration; ${LEGACY_WITHOUT_BACKFILL.size} frozen legacy exception(s).`,
  );
  return 0;
}

// Self-test: the guard must actually catch the shape it exists to catch.
const UNSAFE = `ALTER TABLE "t" ALTER COLUMN "c" SET DEFAULT false;
ALTER TABLE "t" ALTER COLUMN "c" SET NOT NULL;`;
const SAFE = `ALTER TABLE "t" ALTER COLUMN "c" SET DEFAULT false;
UPDATE "t" SET "c" = false WHERE "c" IS NULL;
ALTER TABLE "t" ALTER COLUMN "c" SET NOT NULL;`;
const WRONG_ORDER = `ALTER TABLE "t" ALTER COLUMN "c" SET NOT NULL;
UPDATE "t" SET "c" = false WHERE "c" IS NULL;`;
const OTHER_COLUMN = `UPDATE "t" SET "d" = false WHERE "d" IS NULL;
ALTER TABLE "t" ALTER COLUMN "c" SET NOT NULL;`;
const ONLY_IN_COMMENT = `-- ALTER TABLE "t" ALTER COLUMN "c" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "i" ON "t"("c");`;
const ADD_COLUMN = `ALTER TABLE "t" ADD COLUMN "c" BOOLEAN NOT NULL DEFAULT false;`;
const ALIASED = `UPDATE t x SET c = o.v FROM o WHERE x.c IS NULL;
ALTER TABLE t ALTER COLUMN c SET NOT NULL;`;
const TOTAL = `ALTER TABLE "t" ADD COLUMN "c" INTEGER;
UPDATE "t" SET "c" = COALESCE("d", now());
ALTER TABLE "t" ALTER COLUMN "c" SET NOT NULL;`;
const NULLED_OUT = `UPDATE "t" SET "c" = NULL;
ALTER TABLE "t" ALTER COLUMN "c" SET NOT NULL;`;
const LOUD = `DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM t WHERE c IS NULL) THEN
    RAISE EXCEPTION 't has NULL c rows; run the backfill first';
  END IF;
END $$;
ALTER TABLE t ALTER COLUMN c SET NOT NULL;`;

assert.deepEqual(findUnbackfilled(UNSAFE), ['t.c'], 'must flag SET NOT NULL with no backfill');
assert.deepEqual(findUnbackfilled(SAFE), [], 'must accept a preceding same-column backfill');
assert.deepEqual(findUnbackfilled(WRONG_ORDER), ['t.c'], 'a backfill after the alteration is too late');
assert.deepEqual(findUnbackfilled(OTHER_COLUMN), ['t.c'], 'a backfill of a different column must not count');
assert.deepEqual(findUnbackfilled(ONLY_IN_COMMENT), [], 'a commented-out alteration is not real DDL');
assert.deepEqual(findUnbackfilled(ADD_COLUMN), [], 'ADD COLUMN NOT NULL DEFAULT has no pre-existing rows');
assert.deepEqual(findUnbackfilled(ALIASED), [], 'an aliased UPDATE is still a backfill');
assert.deepEqual(findUnbackfilled(TOTAL), [], 'an UPDATE with no WHERE assigns every row');
assert.deepEqual(findUnbackfilled(NULLED_OUT), ['t.c'], 'assigning literal NULL is not a backfill');
assert.deepEqual(findUnbackfilled(LOUD), [], 'a RAISE EXCEPTION precondition fails loudly instead');
console.log('PASS guard self-test (10 cases)');

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = check();
}
