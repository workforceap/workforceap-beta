// Validate game definitions and their coverage of the curriculum packs.
// Usage: node tools/validate.mjs [game-id ... | --all] [--json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateGame } from '../kit/schema.mjs';

const ROOT = process.env.WAP_ARCADE_ROOT ? path.resolve(process.env.WAP_ARCADE_ROOT) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAMES = path.join(ROOT, 'games');
const SOURCE = path.join(ROOT, 'data', 'source');

function itemCount(lv) {
  const list = lv.items || lv.questions || lv.rounds;
  return Array.isArray(list) ? list.length : 0;
}

export async function validateOne(id) {
  const out = { id, errors: [], warnings: [], levels: 0, mechanics: [], items: 0, def: null };
  const file = path.join(GAMES, id, 'game.mjs');
  if (!fs.existsSync(file)) {
    out.errors.push({ path: '', msg: `games/${id}/game.mjs not found` });
    return out;
  }
  let def;
  try {
    // cache-bust so repeated calls in one process see edits
    def = (await import(pathToFileURL(file).href + '?t=' + Date.now())).default;
  } catch (e) {
    out.errors.push({ path: '', msg: `import failed: ${e.message}` });
    return out;
  }
  out.def = def;
  const r = validateGame(def);
  out.errors.push(...r.errors);
  out.warnings.push(...r.warnings);
  if (def && typeof def === 'object') {
    if (def.id !== id) out.errors.push({ path: 'id', msg: `game id "${def.id}" must equal its folder name "${id}"` });
    const levels = Array.isArray(def.levels) ? def.levels : [];
    out.levels = levels.length;
    out.mechanics = [...new Set(levels.map((l) => l && l.mechanic).filter(Boolean))];
    out.items = levels.reduce((n, l) => n + (l && typeof l === 'object' ? itemCount(l) : 0), 0);
    const packFile = path.join(SOURCE, `${id}.json`);
    if (fs.existsSync(packFile)) {
      let pack;
      try { pack = JSON.parse(fs.readFileSync(packFile, 'utf8')); } catch (e) { out.errors.push({ path: 'coverage', msg: `pack unreadable: ${e.message}` }); pack = null; }
      if (pack) {
        const courses = [...(pack.courses || [])].sort((a, b) => a.order - b.order);
        if (courses.length !== levels.length) out.errors.push({ path: 'coverage', msg: `pack has ${courses.length} courses but game has ${levels.length} levels (need exactly one level per course)` });
        courses.forEach((c, i) => {
          const lv = levels[i];
          if (!lv) return out.errors.push({ path: `levels[${i}]`, msg: `missing level for course ${c.order} "${c.courseTitle}"` });
          if (lv.courseSlug !== c.courseSlug) out.errors.push({ path: `levels[${i}].courseSlug`, msg: `is "${lv.courseSlug}"; pack course ${c.order} is "${c.courseSlug}"` });
          if (lv.courseTitle !== c.courseTitle) out.errors.push({ path: `levels[${i}].courseTitle`, msg: `is "${lv.courseTitle}"; pack course ${c.order} is "${c.courseTitle}"` });
        });
        if (def.program && pack.programTitle && def.program !== pack.programTitle) {
          out.warnings.push({ path: 'program', msg: `"${def.program}" differs from pack programTitle "${pack.programTitle}"` });
        }
      }
    }
  }
  return out;
}

export function lessonMapEntry(id, def) {
  return {
    programSlug: id,
    programTitle: def.program,
    gameTitle: def.title,
    levels: def.levels.map((l) => ({
      order: l.order,
      courseSlug: l.courseSlug,
      courseTitle: l.courseTitle,
      levelId: l.id,
      levelTitle: l.title,
      mechanic: l.mechanic,
      skill: l.skill,
      link: `play.html?game=${id}&level=${l.id}`,
    })),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const all = args.includes('--all');
  let ids = args.filter((a) => !a.startsWith('--'));
  if (all) {
    ids = fs.existsSync(GAMES)
      ? fs.readdirSync(GAMES, { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(GAMES, d.name, 'game.mjs'))).map((d) => d.name).sort()
      : [];
  }
  if (!ids.length) {
    console.error(all ? 'No games found under games/*/game.mjs' : 'Usage: node tools/validate.mjs [game-id ... | --all] [--json]');
    process.exit(1);
  }
  const results = [];
  for (const id of ids) results.push(await validateOne(id));
  const failed = results.filter((r) => r.errors.length);
  let mapWritten = null;
  if (all && !failed.length) {
    const map = { generated: new Date().toISOString(), games: results.map((r) => lessonMapEntry(r.id, r.def)) };
    mapWritten = path.join(ROOT, 'data', 'lesson-map.json');
    fs.writeFileSync(mapWritten, JSON.stringify(map, null, 2) + '\n');
  }
  if (json) {
    console.log(JSON.stringify({
      ok: !failed.length,
      lessonMap: mapWritten,
      games: results.map(({ def, ...r }) => r),
    }, null, 2));
  } else {
    for (const r of results) {
      console.log(`${r.errors.length ? 'FAIL' : 'ok  '} ${r.id}  levels=${r.levels} mechanics=[${r.mechanics.join(',')}] items=${r.items} errors=${r.errors.length} warnings=${r.warnings.length}`);
      for (const e of r.errors) console.log(`   error  ${e.path || '(game)'}: ${e.msg}`);
      for (const w of r.warnings) console.log(`   warn   ${w.path || '(game)'}: ${w.msg}`);
    }
    console.log(`\n${results.length - failed.length}/${results.length} games valid` + (mapWritten ? `; wrote ${path.relative(ROOT, mapWritten)}` : ''));
  }
  process.exit(failed.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
