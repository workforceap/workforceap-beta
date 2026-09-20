/**
 * Structured, multi-dimensional scorer for O*NET → WorkforceAP program auto-match.
 *
 * Replaces the previous token-overlap-only scorer with six weighted dimensions
 * that use O*NET's full taxonomy:
 *
 *   1. Domain / category bridge        (0.25)
 *   2. Knowledge area overlap            (0.25)
 *   3. Skill direct match              (0.20)
 *   4. Work activity alignment         (0.15)
 *   5. Education / job zone alignment  (0.10)
 *   6. Token overlap (tiebreaker)     (0.05)
 *
 * Each dimension returns a score in [0,1] and a reason string. The final score
 * is a weighted sum, clamped to [0,1]. The composite `reason` text explains the
 * strongest dimensions so admin users understand *why* a program matched.
 *
 * The old token helpers (tokenize, buildOccupationTokens, buildProgramKeywords)
 * are preserved for backward compatibility and used by Dimension 6.
 */

import type { Program } from '@/lib/content/programs';
import { inferProgramDifficulty, scoreJobZoneAlignment } from '@/lib/onet/jobZoneMap';
import { scoreKnowledgeAreas } from '@/lib/onet/knowledgeAreaMap';
import { scoreSkillMapping } from '@/lib/onet/skillMapping';
import { scoreWorkActivities } from '@/lib/onet/workActivityMap';

/** Minimal, non-DB shape of an O*NET occupation needed for structured scoring.
 *  All new taxonomy fields are optional so existing callers keep working. */
export type OccupationForMatch = {
  title: string;
  description?: string | null;
  jobFamily?: string | null;
  outlookSummary?: string | null;
  jobZone?: number | null;
  skills: { skillName: string }[];
  tasks: { taskText: string }[];
  technologies?: { technologyName: string }[];
  /** O*NET abilities (from /details/abilities) */
  abilities?: { name: string; importance: number | null; level: number | null }[];
  /** O*NET knowledge areas (from /details/knowledge) */
  knowledge?: { name: string; importance: number | null; level: number | null }[];
  /** O*NET work activities (from /details/work_activities) */
  workActivities?: { name: string; importance: number | null; level: number | null }[];
  /** O*NET education/training/experience (from /details/education_training_experience) */
  education?: { title: string; category: string; percent?: number | null; required?: boolean | null }[];
  /** O*NET sample / alternate titles (from /summary/alternate_titles) */
  sampleTitles?: { title: string; shortTitle?: boolean }[];
};

export type AutoMatchResult = {
  programSlug: string;
  programTitle: string;
  /** Weighted composite score in [0, 1], rounded to 3 decimals. */
  score: number;
  reason: string;
  recommendationType: 'primary' | 'bridge' | 'stretch';
  experienceBand: 'beginner' | 'some_experience' | 'experienced';
  /** Per-dimension breakdown for admin debugging. */
  dimensionBreakdown?: { name: string; score: number; weight: number; reason: string }[];
};

/** ── tokenization helpers (preserved, used by Dimension 6) ───────────────── */

const MIN_TOKEN_LENGTH = 2;

const DOMAIN_SYNONYMS: string[][] = [
  ['computer', 'computing', 'information', 'technology', 'technical', 'tech', 'it'],
  ['network', 'networking', 'networks', 'lan', 'wan', 'tcp', 'cisco', 'wireless', 'infrastructure'],
  ['security', 'cybersecurity', 'cyber', 'risk', 'cryptography', 'protection', 'defense'],
  ['support', 'helpdesk', 'help', 'desk', 'troubleshoot', 'troubleshooting', 'service', 'services'],
  ['hardware', 'software', 'systems', 'system', 'operating'],
  ['database', 'databases', 'sql', 'mysql', 'postgresql', 'data'],
  ['cloud', 'aws', 'azure', 'gcp', 'amazon', 'serverless', 'devops', 'containers'],
  ['programming', 'development', 'developer', 'software', 'coding', 'code', 'engineering', 'engineer'],
  ['python', 'javascript', 'java', 'csharp', 'ruby', 'php', 'golang'],
  ['web', 'website', 'frontend', 'backend', 'fullstack', 'react', 'angular', 'vue', 'node'],
  ['ai', 'artificial', 'intelligence', 'machine', 'learning', 'ml', 'deep', 'neural', 'nlp'],
  ['data', 'analytics', 'analyst', 'analysis', 'visualization', 'tableau', 'powerbi', 'bi'],
  ['testing', 'qa', 'quality', 'assurance', 'validation'],
  ['medical', 'healthcare', 'health', 'clinical', 'patient', 'hospital'],
  ['billing', 'coding', 'coder', 'icd', 'cpt', 'hcpcs', 'revenue'],
  ['ehr', 'emr', 'electronic', 'record', 'records', 'health', 'information'],
  ['hipaa', 'compliance', 'privacy', 'security'],
  ['project', 'program', 'portfolio', 'management', 'manager', 'pm'],
  ['agile', 'scrum', 'kanban', 'sprint', 'waterfall', 'lean'],
  ['business', 'operations', 'operational', 'process', 'workflow'],
  ['marketing', 'digital', 'seo', 'sem', 'social', 'content', 'email'],
  ['sales', 'selling', 'customer', 'client', 'account'],
  ['manufacturing', 'production', 'fabrication', 'assembly', 'machining'],
  ['logistics', 'supply', 'chain', 'warehouse', 'inventory', 'transportation', 'distribution'],
  ['construction', 'building', 'carpentry', 'masonry', 'electrical', 'plumbing'],
  ['safety', 'osha', 'compliance', 'inspection', 'hazard'],
  ['quality', 'control', 'inspection', 'assurance', 'sixsigma'],
  ['digital', 'literacy', 'computer', 'basic', 'fundamentals', 'foundations'],
  ['office', 'administrative', 'clerical', 'secretary', 'assistant'],
  ['excel', 'spreadsheet', 'word', 'powerpoint', 'microsoft', 'google', 'suite'],
];

function buildSynonymMap(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const group of DOMAIN_SYNONYMS) {
    const normalized = group.map((t) => t.toLowerCase());
    const set = new Set(normalized);
    for (const token of normalized) {
      const existing = map.get(token);
      if (existing) {
        for (const s of set) existing.add(s);
      } else {
        map.set(token, new Set(set));
      }
    }
  }
  return map;
}
const SYNONYM_MAP = buildSynonymMap();

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
  'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his',
  'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who',
  'boy', 'did', 'she', 'use', 'her', 'than', 'them', 'well', 'were',
  'been', 'have', 'said', 'each', 'which', 'their', 'time', 'will',
  'about', 'if', 'up', 'out', 'many', 'then', 'them', 'these', 'so',
  'some', 'her', 'would', 'make', 'like', 'into', 'him', 'has', 'two',
  'more', 'very', 'what', 'know', 'just', 'first', 'also', 'after',
  'back', 'other', 'many', 'than', 'only', 'those', 'come', 'day',
  'most', 'us', 'is', 'it', 'an', 'as', 'at', 'be', 'by', 'do', 'go',
  'he', 'me', 'my', 'no', 'of', 'on', 'or', 'to', 'we',
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length >= MIN_TOKEN_LENGTH && !STOP_WORDS.has(w));
}

function expandWithSynonyms(tokens: Set<string>): Set<string> {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    const syns = SYNONYM_MAP.get(token);
    if (syns) {
      for (const s of syns) expanded.add(s);
    }
  }
  return expanded;
}

export function buildOccupationTokens(occ: OccupationForMatch): Set<string> {
  const titleTokens = tokenize(occ.title);
  const blob = [
    ...titleTokens,
    ...titleTokens,
    occ.description ?? '',
    occ.jobFamily ?? '',
    occ.outlookSummary ?? '',
    occ.skills.map((s) => s.skillName).join(' '),
    occ.tasks.map((t) => t.taskText).join(' '),
    occ.technologies?.map((t) => t.technologyName).join(' ') ?? '',
    occ.abilities?.map((a) => a.name).join(' ') ?? '',
    occ.knowledge?.map((k) => k.name).join(' ') ?? '',
    occ.workActivities?.map((w) => w.name).join(' ') ?? '',
    occ.education?.map((e) => e.title).join(' ') ?? '',
    occ.sampleTitles?.map((s) => s.title).join(' ') ?? '',
  ].join(' ');
  const raw = new Set(tokenize(blob));
  return expandWithSynonyms(raw);
}

export function buildProgramKeywords(prog: Program): string[] {
  const raw = [
    prog.title,
    prog.category,
    prog.categoryLabel,
    ...prog.skills,
    prog.partner,
    ...prog.courses.map((c) => c.name),
  ].join(' ');
  const tokens = [...new Set(tokenize(raw))];
  return tokens;
}

function buildProgramTokens(prog: Program): Set<string> {
  return expandWithSynonyms(new Set(buildProgramKeywords(prog)));
}

function isPartialMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 2 || b.length < 2) return false;
  if (a.startsWith(b) || b.startsWith(a)) return true;
  if (a.includes(b) || b.includes(a)) return true;
  return false;
}

function countMatches(
  keywords: string[],
  occTokens: Set<string>
): { exact: number; partial: number; matchedTerms: string[] } {
  const exactTerms: string[] = [];
  const partialTerms: string[] = [];

  for (const kw of keywords) {
    if (occTokens.has(kw)) {
      exactTerms.push(kw);
      continue;
    }
    let foundPartial = false;
    for (const token of occTokens) {
      if (isPartialMatch(token, kw)) {
        foundPartial = true;
        break;
      }
    }
    if (foundPartial) {
      partialTerms.push(kw);
    }
  }

  return {
    exact: exactTerms.length,
    partial: partialTerms.length,
    matchedTerms: [...exactTerms, ...partialTerms],
  };
}

/** ── domain bridge (Dimension 1) ────────────────────────────────────────── */

const DOMAIN_PATTERNS: Array<{ name: string; occRegex: RegExp; programCategories: Set<string> }> = [
  {
    name: 'IT & Cybersecurity',
    occRegex: /\b(computer|information|technology|network|cyber|security|software|hardware|systems|technical|support|helpdesk|database|cloud|programming|developer|web|data|analytics|ai|artificial|intelligence|machine|learning)\b/i,
    programCategories: new Set(['it-cyber', 'ai-software', 'cloud-data']),
  },
  {
    name: 'Healthcare',
    occRegex: /\b(medical|health|healthcare|clinical|patient|hospital|billing|coding|ehr|emr|hipaa|pharmacy|nursing|caregiver)\b/i,
    programCategories: new Set(['healthcare']),
  },
  {
    name: 'Business & Project Management',
    occRegex: /\b(business|project|management|manager|marketing|sales|finance|accounting|administrative|office|customer|client|account|hr|human|resources)\b/i,
    programCategories: new Set(['business']),
  },
  {
    name: 'Manufacturing & Logistics',
    occRegex: /\b(manufacturing|production|logistics|supply|chain|warehouse|inventory|transportation|distribution|machining|assembly|fabrication|quality|control|sixsigma)\b/i,
    programCategories: new Set(['manufacturing']),
  },
  {
    name: 'Construction & Trades',
    occRegex: /\b(construction|building|carpentry|masonry|electrical|plumbing|hvac|welding|safety|osha|blueprint|trades|laborer)\b/i,
    programCategories: new Set(['manufacturing']),
  },
];

function detectDomain(occ: OccupationForMatch): string | null {
  const text = `${occ.title} ${occ.description ?? ''}`.toLowerCase();
  for (const domain of DOMAIN_PATTERNS) {
    if (domain.occRegex.test(text)) return domain.name;
  }
  return null;
}

function scoreDomainBridge(occ: OccupationForMatch, prog: Program): { score: number; reason: string } {
  const detectedDomain = detectDomain(occ);
  if (!detectedDomain) return { score: 0, reason: '' };
  for (const domain of DOMAIN_PATTERNS) {
    if (domain.name === detectedDomain && domain.programCategories.has(prog.category)) {
      return {
        score: 0.35, // baseline score within this dimension; will be multiplied by dimension weight
        reason: `Aligned ${detectedDomain} domain`,
      };
    }
  }
  return { score: 0, reason: '' };
}

/** ── recommendation tier + experience band (preserved) ───────────────────── */

export function scoreToRecommendationType(score: number): AutoMatchResult['recommendationType'] {
  if (score >= 0.25) return 'primary';
  if (score >= 0.1) return 'bridge';
  return 'stretch';
}

export function inferExperienceBand(occ: OccupationForMatch): AutoMatchResult['experienceBand'] {
  const text = [occ.title, occ.description ?? ''].join(' ').toLowerCase();
  if (/\b(entry[- ]?level|junior|trainee|assistant|intern|beginner)\b/.test(text)) return 'beginner';
  if (/\b(senior|lead|principal|manager|director|expert|specialist)\b/.test(text)) return 'experienced';
  return 'some_experience';
}

/** ── structured multi-dimensional scorer ─────────────────────────────────── */

const DIMENSIONS = [
  { name: 'Domain bridge', weight: 0.25 },
  { name: 'Knowledge areas', weight: 0.25 },
  { name: 'Skill match', weight: 0.20 },
  { name: 'Work activities', weight: 0.15 },
  { name: 'Education/zone', weight: 0.10 },
  { name: 'Token overlap', weight: 0.05 },
] as const;

/** Build the full element list used for skill + knowledge + ability scoring. */
function buildAllElements(occ: OccupationForMatch): { name: string; importance: number | null; level: number | null }[] {
  const all: { name: string; importance: number | null; level: number | null }[] = [];
  if (occ.skills?.length) all.push(...occ.skills.map((s) => ({ name: s.skillName, importance: null, level: null })));
  if (occ.technologies?.length) all.push(...occ.technologies.map((t) => ({ name: t.technologyName, importance: null, level: null })));
  if (occ.abilities?.length) all.push(...occ.abilities);
  if (occ.knowledge?.length) all.push(...occ.knowledge);
  if (occ.workActivities?.length) all.push(...occ.workActivities);
  return all;
}

function scoreProgramStructured(prog: Program, occ: OccupationForMatch): AutoMatchResult {
  const allElements = buildAllElements(occ);
  const occTokens = buildOccupationTokens(occ);
  const keywords = buildProgramKeywords(prog);

  // Dimension 1: Domain / category bridge
  const d1 = scoreDomainBridge(occ, prog);

  // Dimension 2: Knowledge area overlap
  const knowledgeAreas = occ.knowledge ?? [];
  const d2Raw = scoreKnowledgeAreas(knowledgeAreas, prog.category);
  const d2 = { score: d2Raw.score, reason: d2Raw.reasons.join(', ') || 'No knowledge area overlap' };

  // Dimension 3: Skill direct match (abilities + knowledge + work activities + skills)
  const d3Raw = scoreSkillMapping(allElements, prog.skills);
  const d3 = { score: d3Raw.score, reason: d3Raw.reasons.join(', ') || 'No direct skill matches' };

  // Dimension 4: Work activity alignment
  const d4Raw = scoreWorkActivities(occ.workActivities ?? [], prog.category);
  const d4 = { score: d4Raw.score, reason: d4Raw.reasons.join(', ') || 'No work activity alignment' };

  // Dimension 5: Education / job zone alignment
  const progDifficulty = inferProgramDifficulty(prog);
  const d5 = scoreJobZoneAlignment(occ.jobZone, progDifficulty);

  // Dimension 6: Token overlap (legacy, tiebreaker)
  const progTokens = buildProgramTokens(prog);
  const { exact, partial, matchedTerms } = countMatches(keywords, occTokens);
  const rawTokenScore = keywords.length > 0 ? (exact + partial * 0.5) / keywords.length : 0;
  const d6 = {
    score: Math.min(1, rawTokenScore),
    reason: matchedTerms.length
      ? `Token overlap: ${exact} exact, ${partial} partial (${matchedTerms.slice(0, 4).join(', ')})`
      : 'Low token overlap',
  };

  // Weighted composite
  const dims = [
    { name: DIMENSIONS[0].name, score: d1.score, weight: DIMENSIONS[0].weight, reason: d1.reason || 'No domain bridge' },
    { name: DIMENSIONS[1].name, score: d2.score, weight: DIMENSIONS[1].weight, reason: d2.reason },
    { name: DIMENSIONS[2].name, score: d3.score, weight: DIMENSIONS[2].weight, reason: d3.reason },
    { name: DIMENSIONS[3].name, score: d4.score, weight: DIMENSIONS[3].weight, reason: d4.reason },
    { name: DIMENSIONS[4].name, score: d5.score, weight: DIMENSIONS[4].weight, reason: d5.reason },
    { name: DIMENSIONS[5].name, score: d6.score, weight: DIMENSIONS[5].weight, reason: d6.reason },
  ];

  const compositeScore = dims.reduce((sum, dim) => sum + dim.score * dim.weight, 0);
  const score = Math.min(1, Math.round(compositeScore * 1000) / 1000);

  // Build reason string from top 2-3 contributing dimensions
  const contributing = dims
    .filter((d) => d.score > 0.05)
    .sort((a, b) => b.score * b.weight - a.score * a.weight)
    .slice(0, 3);

  let reason: string;
  if (contributing.length === 0) {
    reason = 'Low multi-dimensional overlap — stretch recommendation based on adjacent career pathway.';
  } else {
    const parts = contributing.map((d) => {
      const prefix = d.name;
      const detail = d.reason;
      return `${prefix}: ${detail}`;
    });
    reason = parts.join(' | ');
  }

  const recommendationType = scoreToRecommendationType(score);
  const experienceBand = inferExperienceBand(occ);

  return {
    programSlug: prog.slug,
    programTitle: prog.title,
    score,
    reason,
    recommendationType,
    experienceBand,
    dimensionBreakdown: dims,
  };
}

/** ── rankPrograms entry point (signature preserved) ──────────────────────── */

export const MIN_INCLUDED_SCORE = 0.04;
export const TOP_N = 8;

/** Title-only fallback when structured scoring yields nothing useful. */
function rankProgramsByTitle(occ: OccupationForMatch, programs: ReadonlyArray<Program>): AutoMatchResult[] {
  const titleTokens = expandWithSynonyms(new Set(tokenize(occ.title)));
  if (titleTokens.size === 0) return [];

  return programs
    .map((p) => {
      const progTokens = buildProgramTokens(p);
      let exact = 0;
      let partial = 0;
      const matched: string[] = [];

      for (const token of titleTokens) {
        let hit = false;
        for (const pt of progTokens) {
          if (pt === token) {
            exact++;
            hit = true;
            break;
          }
          if (isPartialMatch(pt, token)) {
            partial++;
            hit = true;
            break;
          }
        }
        if (hit) matched.push(token);
      }

      const score = Math.min(1, Math.round(((exact + partial * 0.5) / titleTokens.size) * 1000) / 1000);
      const matchedDisplay = matched.slice(0, 5);

      let reason: string;
      if (exact + partial > 0) {
        reason = `Title match: shares ${exact + partial} term${exact + partial !== 1 ? 's' : ''}${matchedDisplay.length ? ` including ${matchedDisplay.join(', ')}` : ''}.`;
      } else {
        const detectedDomain = detectDomain(occ);
        let domainBonus = 0;
        if (detectedDomain) {
          for (const domain of DOMAIN_PATTERNS) {
            if (domain.name === detectedDomain && domain.programCategories.has(p.category)) {
              domainBonus = 0.06;
              break;
            }
          }
        }
        if (domainBonus > 0) {
          reason = `Aligned ${detectedDomain} domain — career pathway recommendation.`;
        } else {
          reason = 'Low title overlap — stretch recommendation.';
        }
      }

      return {
        programSlug: p.slug,
        programTitle: p.title,
        score: Math.max(score, 0),
        reason,
        recommendationType: scoreToRecommendationType(Math.max(score, 0)),
        experienceBand: inferExperienceBand(occ),
      };
    })
    .filter((m) => m.score >= MIN_INCLUDED_SCORE || (m.reason.includes('domain') && m.score > 0))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_N);
}

/**
 * A result has real content signal when any dimension other than the
 * Education/zone alignment scored above zero. Education/zone returns a
 * NEUTRAL 0.5 when the occupation has no job-zone data, which alone
 * contributes 0.05 — enough to clear MIN_INCLUDED_SCORE and "match" every
 * program for totally unrelated occupations. Neutral padding must never be
 * the only reason a program is recommended.
 */
function hasContentSignal(m: AutoMatchResult): boolean {
  // 0.05 noise floor: a single spurious partial token (e.g. "os" inside
  // "cosmic") scores ~0.016 on Token overlap and is not real signal.
  return (m.dimensionBreakdown ?? []).some((d) => d.name !== 'Education/zone' && d.score > 0.05);
}

/** Run the full auto-match pipeline for an occupation against a program list. */
export function rankPrograms(occ: OccupationForMatch, programs: ReadonlyArray<Program>): AutoMatchResult[] {
  const ranked = programs
    .map((p) => scoreProgramStructured(p, occ))
    .filter((m) => hasContentSignal(m) && (m.score >= MIN_INCLUDED_SCORE || (m.reason.includes('domain') && m.score > 0)))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_N);

  if (ranked.length === 0) {
    return rankProgramsByTitle(occ, programs);
  }

  return ranked;
}


/** Legacy single-program scorer (signature preserved for unit tests). */
export function scoreProgram(prog: Program, occTokens: Set<string>, occ: OccupationForMatch): AutoMatchResult {
  // Build a shallow OccupationForMatch that only has the fields the old callers set,
  // then run the structured scorer. The structured scorer ignores the pre-built
  // token set when taxonomy fields are absent, so this stays backward-compatible.
  return scoreProgramStructured(prog, occ);
}
