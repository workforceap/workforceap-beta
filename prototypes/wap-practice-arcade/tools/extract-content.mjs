// Builds data/source/<program-slug>.json from the repo's own curriculum files.
// Read-only against lib/ and shared/. Run: node tools/extract-content.mjs
// Needs Node 23.6+ (imports .ts with type stripping).
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {dirname, join, resolve} from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..', '..');
const out = resolve(here, '..', 'data', 'source');
mkdirSync(out, {recursive: true});

const cat = await import(pathToFileURL(join(root, 'lib/content/skillMissionCatalog.ts')).href);
const syl = await import(pathToFileURL(join(root, 'shared/programSyllabi.ts')).href);
const SYLLABI = syl.PROGRAM_SYLLABI;

// Program list (title, category, slug) from the mkProgram(...) calls in programs.ts.
const src = readFileSync(join(root, 'lib/content/programs.ts'), 'utf8');
const start = src.indexOf('export const PROGRAMS');
const body = src.slice(start);
const programs = [];
const strRe = /'((?:[^'\\]|\\.)*)'/g;
let i = 0;
while ((i = body.indexOf('mkProgram(', i)) !== -1) {
  let depth = 0, j = i + 'mkProgram'.length, inStr = null;
  for (; j < body.length; j++) {
    const c = body[j];
    if (inStr) { if (c === '\\') j++; else if (c === inStr) inStr = null; continue; }
    if (c === "'" || c === '"' || c === '`') inStr = c;
    else if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) break; }
  }
  const call = body.slice(i, j + 1);
  const strs = [...call.matchAll(strRe)].map((m) => m[1].replace(/\\'/g, "'"));
  const slug = strs.find((s) => /^[a-z0-9]+(-[a-z0-9]+){1,}$/.test(s) && !['ai-subtitles'].includes(s) && strs.indexOf(s) > 4);
  programs.push({title: strs[0], category: strs[1], categoryLabel: strs[2], color: strs[3], slugGuess: slug, raw: strs.slice(0, 6)});
  i = j;
}

const bySlug = new Map();
for (const m of cat.getSkillMissionDefinitionsForProgram ? [] : []) void m;
const allSlugs = new Set();
// Enumerate catalog by probing every syllabus slug and every slug guess, then
// fall back to scanning the source for programSlug values.
const catSrc = readFileSync(join(root, 'lib/content/skillMissionCatalog.ts'), 'utf8');
for (const m of catSrc.matchAll(/programSlug:\s*"([^"]+)"/g)) allSlugs.add(m[1]);

const index = [];
for (const slug of allSlugs) {
  const missions = cat.getSkillMissionDefinitionsForProgram(slug);
  if (!missions.length) continue;
  const s = SYLLABI[slug];
  const prog = programs.find((p) => p.slugGuess === slug) || programs.find((p) => p.title === missions[0].programTitle);
  const courses = missions.map((m, n) => {
    const sc = s?.courses?.find((c) => c.name.toLowerCase() === m.courseTitle.toLowerCase());
    return {
      order: n + 1,
      courseSlug: m.courseSlug,
      courseTitle: m.courseTitle,
      hours: sc?.hours ?? null,
      syllabusDescription: sc?.description ?? null,
      courseraSlug: sc?.courseraSlug ?? null,
      missionName: m.missionName,
      missionTagline: m.missionTagline,
      skillLabels: m.skillLabels,
      scenarioPrompt: m.scenarioPrompt,
      quiz: m.quizQuestions.map((q) => ({text: q.text, options: q.options, correctIndex: q.correctIndex, explanation: q.explanation}))
    };
  });
  const pack = {
    programSlug: slug,
    programTitle: s?.title ?? missions[0].programTitle,
    category: prog?.category ?? null,
    categoryLabel: prog?.categoryLabel ?? null,
    brandColor: prog?.color ?? null,
    providers: s?.providers ?? null,
    programDescription: s?.description ?? null,
    hasTwcSyllabus: !!s,
    courses
  };
  writeFileSync(join(out, slug + '.json'), JSON.stringify(pack, null, 1) + '\n');
  index.push({programSlug: slug, programTitle: pack.programTitle, category: pack.category, categoryLabel: pack.categoryLabel, hasTwcSyllabus: pack.hasTwcSyllabus, courseCount: courses.length, quizCount: courses.reduce((a, c) => a + c.quiz.length, 0), courses: courses.map((c) => c.courseTitle)});
}
writeFileSync(join(out, '_index.json'), JSON.stringify({generatedFrom: ['lib/content/skillMissionCatalog.ts', 'shared/programSyllabi.ts', 'lib/content/programs.ts'], programCount: index.length, programs: index}, null, 1) + '\n');

const catalogTitles = new Set(index.map((p) => p.programTitle));
console.log(`programs with missions: ${index.length}`);
for (const p of index) console.log(`${String(p.courseCount).padStart(2)} courses ${String(p.quizCount).padStart(3)} q  [${p.category ?? '?'}]  ${p.programSlug}  —  ${p.programTitle}`);
console.log('\nprograms.ts entries: ' + programs.length);
for (const p of programs) console.log(`  ${catalogTitles.has(p.title) || index.some((x) => x.programSlug === p.slugGuess) ? 'ok ' : 'NO MISSIONS'}  ${p.slugGuess ?? '(slug?)'}  —  ${p.title}`);
