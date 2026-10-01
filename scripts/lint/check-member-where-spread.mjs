#!/usr/bin/env node
/**
 * Member-where spread guard (#2457 follow-up).
 *
 * `MEMBER_ONLY_WHERE`, `MEMBER_OR_DOGFOOD_WHERE` and `MEMBER_ONLY_EMAIL_WHERE`
 * (lib/admin/memberOnlyWhere.ts) own exactly two top-level keys of a
 * `prisma.user` where: `email` and `NOT`. ~150 call sites spread one of them
 * into their own literal. A caller that also writes its own `NOT:` or
 * `email:` on that literal, or spreads two of the helpers together, does not
 * get an error: whichever key comes later silently replaces the other, and
 * the member filter is gone with every test still green. Object-literal
 * duplicate keys are a compile error only when both are written out; a
 * spread hides the duplicate from the compiler.
 *
 * This scans product source with the TypeScript parser and fails on any
 * object literal that spreads one of those helpers and also
 *   - declares a top-level `NOT` or `email` property, or
 *   - spreads a second one of the helpers.
 *
 * A caller's own `AND` / `OR` next to the spread is fine (the helpers never
 * use those keys; `memberOnlyWhere.test.ts` pins that), and a caller wanting
 * its own `NOT` puts it inside `AND: [...]` instead.
 *
 * Escape hatch: a line containing `member-where-allow` is skipped. Say why in
 * the same comment.
 *
 * Usage:
 *   node scripts/lint/check-member-where-spread.mjs          # report, exit 1 on findings
 *   node scripts/lint/check-member-where-spread.mjs --json   # machine-readable findings
 *
 * Wired into `npm run lint` so CI and local lint share one gate.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const HELPER_SPREADS = new Set(['MEMBER_ONLY_WHERE', 'MEMBER_OR_DOGFOOD_WHERE', 'MEMBER_ONLY_EMAIL_WHERE']);
export const OWNED_KEYS = new Set(['NOT', 'email']);
export const ALLOW_MARKER = 'member-where-allow';

/** Directories scanned, relative to the repo root. */
export const SCAN_ROOTS = ['app', 'lib', 'components'];
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx']);
/** The helper module itself composes `...MEMBER_ONLY_EMAIL_WHERE` with its own `NOT` on purpose: it is the definition, not a caller. */
export const DEFINITION_MODULE = 'lib/admin/memberOnlyWhere.ts';
const IGNORED_PATH_RE = [/(^|\/)node_modules\//, /(^|\/)\.next\//, /\.(test|spec)\.[cm]?[jt]sx?$/, /\.d\.ts$/];

function propertyName(node) {
  if (!node.name) return null;
  if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) return node.name.text;
  return null;
}

/**
 * Scan one source string. Returns findings sorted by position, each
 * `{ line, column, rule, helper, key }`.
 */
export function scanSource(source, fileName = 'source.tsx') {
  const kind = fileName.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.TSX;
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const lines = source.split('\n');
  const findings = [];
  const at = (node) => {
    const { line, character } = file.getLineAndCharacterOfPosition(node.getStart(file));
    return { line: line + 1, column: character + 1 };
  };
  const visit = (node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const spreads = node.properties.filter(
        (p) => ts.isSpreadAssignment(p) && ts.isIdentifier(p.expression) && HELPER_SPREADS.has(p.expression.text),
      );
      if (spreads.length > 0) {
        const helper = spreads[0].expression.text;
        for (const p of node.properties) {
          const pos = at(p);
          if (lines[pos.line - 1].includes(ALLOW_MARKER)) continue;
          if (ts.isSpreadAssignment(p) && p !== spreads[0] && spreads.includes(p)) {
            findings.push({ ...pos, rule: 'two-helpers', helper, key: p.expression.text });
          } else if ((ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && OWNED_KEYS.has(propertyName(p))) {
            findings.push({ ...pos, rule: 'own-key', helper, key: propertyName(p) });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return findings.sort((a, b) => a.line - b.line || a.column - b.column);
}

export function describeFinding(f) {
  return f.rule === 'two-helpers'
    ? `\`...${f.key}\` spread next to \`...${f.helper}\`: both own \`NOT\` and \`email\`, the later one silently replaces the earlier`
    : `own \`${f.key}\` next to \`...${f.helper}\`: whichever comes later silently replaces the other (put a caller's NOT inside AND: [...])`;
}

export function listSourceFiles(root) {
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      const rel = relative(root, abs).split(sep).join('/');
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walk(abs);
        continue;
      }
      const dot = entry.name.lastIndexOf('.');
      if (dot < 0 || !SCAN_EXTENSIONS.has(entry.name.slice(dot))) continue;
      if (rel === DEFINITION_MODULE || IGNORED_PATH_RE.some((re) => re.test(rel))) continue;
      files.push(rel);
    }
  };
  for (const scanRoot of SCAN_ROOTS) {
    const abs = join(root, scanRoot);
    try {
      if (statSync(abs).isDirectory()) walk(abs);
    } catch {
      // optional root
    }
  }
  return files.sort();
}

export function runCheck(root) {
  const results = [];
  for (const rel of listSourceFiles(root)) {
    const source = readFileSync(join(root, rel), 'utf8');
    // Cheap pre-filter: the parser only runs on files that name a helper.
    if (![...HELPER_SPREADS].some((name) => source.includes(name))) continue;
    const findings = scanSource(source, rel);
    if (findings.length) results.push({ file: rel, findings });
  }
  return results;
}

function main() {
  const args = new Set(process.argv.slice(2));
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const results = runCheck(root);
  const flat = results.flatMap((r) => r.findings.map((f) => ({ file: r.file, ...f })));
  if (args.has('--json')) {
    process.stdout.write(`${JSON.stringify({ findings: flat }, null, 2)}\n`);
  } else {
    for (const f of flat) console.error(`${f.file}:${f.line}:${f.column} ${describeFinding(f)} [${f.rule}]`);
    if (flat.length) {
      console.error(`\n[member-where] FAIL — ${flat.length} spread(s) of a member-only where next to a key it owns (lib/admin/memberOnlyWhere.ts).`);
    } else {
      console.log(`[member-where] OK — no member-only where spread next to its own NOT / email in ${SCAN_ROOTS.join(', ')}.`);
    }
  }
  process.exit(flat.length ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
