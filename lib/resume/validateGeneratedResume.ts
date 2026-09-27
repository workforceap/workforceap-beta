type ResumeSection = 'experience' | 'education' | 'skills' | 'certifications';

const SECTION_HEADINGS: Record<ResumeSection, RegExp> = {
  experience: /^(?:#{1,4}\s*)?(?:(?:professional|work|employment)\s+)?experience\b\s*:?[ \t]*(.*)$/i,
  education: /^(?:#{1,4}\s*)?education\b\s*:?[ \t]*(.*)$/i,
  skills: /^(?:#{1,4}\s*)?(?:(?:technical|professional|core)\s+)?skills\b\s*:?[ \t]*(.*)$/i,
  certifications: /^(?:#{1,4}\s*)?certifications?\b\s*:?[ \t]*(.*)$/i,
};

const OTHER_SECTION_HEADING = /^(?:#{1,4}\s*)?(?:professional summary|summary|projects)\s*:?[ \t]*$/i;

const MISSING_SECTION_CLAIMS: Record<ResumeSection, RegExp> = {
  experience: /(?:^|\n)\s*(?:[-*]\s*)?\**No\s+(?:(?:employment|work|job)\s+(?:history|experience)|professional experience)\s+(?:(?:was|is|has been)\s+)?(?:provided|included|listed|available)\b/im,
  education: /(?:^|\n)\s*(?:[-*]\s*)?\**No\s+(?:educational?\s+(?:background|history)|education)\s+(?:(?:was|is|has been)\s+)?(?:provided|included|listed|available)\b/im,
  skills: /(?:^|\n)\s*(?:[-*]\s*)?\**No\s+(?:(?:specific|relevant)\s+)?skills?\s+(?:(?:were|are|have been)\s+)?(?:provided|included|listed|available)\b/im,
  certifications: /(?:^|\n)\s*(?:[-*]\s*)?\**No\s+(?:(?:completed|earned)\s+)?certifications?\s+(?:(?:were|are|have been)\s+)?(?:provided|included|listed|available)\b/im,
};

const NARRATIVE_OPENING = /^(?:with|in|of|using|for|from|on|at|as|is|was|were|has|have|can|needed|desired)\b/i;

function hasMissingSectionClaim(generated: string, section: ResumeSection): boolean {
  return generated.replace(/\r\n?/g, '\n').split('\n').some((rawLine) => {
    const line = rawLine.trim().replace(/^#{1,4}\s*/, '');
    const heading = line.match(SECTION_HEADINGS[section]);
    const content = heading
      ? heading[1].replace(/^[\s:—–-]+/, '').trim()
      : line;
    return MISSING_SECTION_CLAIMS[section].test(`\n${content}`);
  });
}

function hasPopulatedSection(source: string, section: ResumeSection): boolean {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    const match = line.match(SECTION_HEADINGS[section]);
    if (!match) continue;

    // PDF extraction sometimes merges a heading and its first entry.
    const inline = match[1].replace(/^[\s:—–-]+/, '').trim();
    const headingPrefix = line.slice(0, line.length - match[1].length);
    const explicitlyDelimited = /[:—–]|\s{2,}$/.test(headingPrefix);
    if (inline && !explicitlyDelimited && NARRATIVE_OPENING.test(inline)) continue;
    if (inline.length >= 15 && !hasMissingSectionClaim(inline, section)
      && (explicitlyDelimited || /^[A-Z0-9]/.test(inline))) return true;

    for (let next = index + 1; next < lines.length; next += 1) {
      const entry = lines[next].trim();
      if (OTHER_SECTION_HEADING.test(entry)
        || (Object.keys(SECTION_HEADINGS) as ResumeSection[]).some(
          (other) => other !== section && SECTION_HEADINGS[other].test(entry),
        )) break;
      if (entry.length >= 15 && !hasMissingSectionClaim(entry, section)) return true;
    }
  }
  return false;
}

/** Fail closed when a model says a populated source section was absent. */
export function hasContradictoryMissingResumeSection(source: string, generated: string): boolean {
  if (!source || !generated) return false;
  return (Object.keys(SECTION_HEADINGS) as ResumeSection[]).some(
    (section) => hasMissingSectionClaim(generated, section) && hasPopulatedSection(source, section),
  );
}

/*
 * Narrow, fail-closed factuality check for AI resume drafts.
 *
 * This is NOT general fact validation. It rejects a draft only for a short
 * list of claim kinds that can be detected with high precision, and it
 * compares names by normalized token sets (order-insensitive, generic words
 * such as "Community", "College" and "Inc." ignored) so that formatting and
 * paraphrase of real source facts do not block a member. A rejected draft is
 * never saved; the caller keeps the member's previous draft.
 */

export type UnsupportedResumeClaim =
  | 'missing_section_filler'
  | 'placeholder'
  | 'unsupported_contact'
  | 'unsupported_date'
  | 'unsupported_number'
  | 'unsupported_credential'
  | 'unsupported_organization'
  | 'unsupported_entry_detail';

export interface ResumeClaimSources {
  /** The member's own history: extracted resume text plus profile fields. */
  history: string;
  /**
   * Goals such as the target program. They never support an earned claim; a
   * detail found only here is accepted only on a line phrased as a goal.
   */
  goals?: string;
}

// ─── Filler and placeholders ───

/** "No certifications were provided.", "Skills: Not provided", "Phone: N/A". */
const FILLER_LINE =
  /^(?:(?:not|none)\s+(?:provided|specified|listed|available|given)|n\/a|none|tbd|no\s+(?:[a-z]+\s+){0,3}(?:(?:was|were|is|are|has been|have been)\s+)?(?:provided|specified|listed|included|available|given))\.?$/i;
const PLACEHOLDER = /\[(?:[^\]\n]{0,40}\b)?(?:company|employer|organization|school|university|college|dates?|years?|city|state|job title|title|role|degree|name|location|number|x+)\b[^\]\n]{0,40}\](?!\()/i;

// ─── Normalization ───

const DEGREE_PHRASES: Array<[RegExp, string]> = [
  [/\bassociate(?:'s)? (?:degree )?(?:of|in) applied science\b/gi, 'AAS'],
  [/\bassociate(?:'s)? (?:degree )?(?:of|in) applied business\b/gi, 'AAB'],
  [/\bassociate(?:'s)? (?:degree )?(?:of|in) science\b/gi, 'AS'],
  [/\bassociate(?:'s)? (?:degree )?(?:of|in) arts\b/gi, 'AA'],
  [/\bbachelor(?:'s)? (?:degree )?(?:of|in) science in nursing\b/gi, 'BSN'],
  [/\bbachelor(?:'s)? (?:degree )?(?:of|in) business administration\b/gi, 'BBA'],
  [/\bbachelor(?:'s)? (?:degree )?(?:of|in) science\b/gi, 'BS'],
  [/\bbachelor(?:'s)? (?:degree )?(?:of|in) arts\b/gi, 'BA'],
  [/\bmaster(?:'s)? (?:degree )?(?:of|in) business administration\b/gi, 'MBA'],
  [/\bmaster(?:'s)? (?:degree )?(?:of|in) science\b/gi, 'MS'],
  [/\bmaster(?:'s)? (?:degree )?(?:of|in) arts\b/gi, 'MA'],
];
const WORD_VARIANTS: Record<string, string> = {
  sr: 'senior', jr: 'junior', mgr: 'manager', asst: 'assistant', assoc: 'associate',
  coord: 'coordinator', supv: 'supervisor', dept: 'department', mfg: 'manufacturing',
};

function canonicalText(text: string): string {
  let out = text.replace(/[’‘]/g, "'");
  // A.A.S. → AAS, B.S. → BS.
  out = out.replace(/\b((?:[A-Za-z]\.){2,})(?![A-Za-z])/g, (match) => match.replace(/\./g, ''));
  out = out.replace(/\bPh\.D\.?/g, 'PhD').replace(/\bM\.Ed\.?/g, 'MEd');
  for (const [pattern, abbreviation] of DEGREE_PHRASES) out = out.replace(pattern, abbreviation);
  return out;
}

function words(text: string): string[] {
  return canonicalText(text)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word) => WORD_VARIANTS[word] ?? word);
}

// ─── Contact values ───

/** Slack-style auto-links: keep the visible label only. */
const AUTO_LINK = /<(?:tel|mailto|https?):[^|>]*\|([^>]*)>/gi;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const URL_LIKE = /\b(?:https?:\/\/)?(?:www\.)?(?:[a-z0-9-]+\.)+(?:com|org|net|io|edu|gov|us|me|co|dev|app|info|biz|test)\b(?:\/[^\s)|>,;]*)?/gi;
/** US-style phone numbers: optional +1/1, optional parentheses, space/dot/dash separators, or bare 10-11 digits. */
const PHONE = /(?:\btel:)?(?<![\d$])(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g;

function phoneKey(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

function urlKey(raw: string): string {
  return raw.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/.]+$/, '');
}

interface ContactValues { phones: string[]; emails: string[]; urls: string[]; rest: string }

/**
 * Pull phone numbers, emails and URLs out of text so they are compared as
 * whole normalized units and their digits never reach the other checks.
 */
function extractContacts(text: string): ContactValues {
  const phones: string[] = [];
  const emails: string[] = [];
  const urls: string[] = [];
  const rest = text
    .replace(AUTO_LINK, '$1')
    .replace(EMAIL, (match) => { emails.push(match.toLowerCase()); return ' '; })
    .replace(URL_LIKE, (match) => { urls.push(urlKey(match)); return ' '; })
    .replace(PHONE, (match) => { phones.push(phoneKey(match)); return ' '; });
  return { phones, emails, urls, rest };
}

// ─── Dates ───

const YEAR = /\b(?:19[5-9]\d|20\d{2})\b/g;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_YEAR = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?,?\s+((?:19|20)\d{2})\b/gi;
const NUMERIC_MONTH_YEAR = /\b(0?[1-9]|1[0-2])[/-]((?:19|20)\d{2})\b/g;
const ISO_YEAR_MONTH = /\b((?:19|20)\d{2})-(0[1-9]|1[0-2])\b/g;

function monthYears(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(MONTH_YEAR)) found.push(`${match[1].toLowerCase()} ${match[2]}`);
  for (const match of text.matchAll(NUMERIC_MONTH_YEAR)) found.push(`${MONTHS[Number(match[1]) - 1]} ${match[2]}`);
  for (const match of text.matchAll(ISO_YEAR_MONTH)) found.push(`${MONTHS[Number(match[2]) - 1]} ${match[1]}`);
  return found;
}

function isYearSupported(year: string, rawSource: string): boolean {
  if (new RegExp(String.raw`\b${year}\b`).test(rawSource)) return true;
  // "2019-23" in the source supports "2019–2023" in the draft.
  return new RegExp(String.raw`\b(?:19|20)\d{2}\s*[-–—]\s*'?${year.slice(2)}\b`).test(rawSource);
}

// ─── Money, percentages, headcounts ───

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20,
};
const MULTIPLIER: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, b: 1e9, billion: 1e9 };
const ANY_NUMBER = /(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s*(k|m|b|thousand|million|billion)\b)?/gi;
const MONEY = /\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s*(k|m|b|thousand|million|billion)\b)?/gi;
const PERCENT = /(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(?:%|percent\b)/gi;
const HEADCOUNT = new RegExp(
  String.raw`\b(\d{1,3}(?:,\d{3})*|${Object.keys(NUMBER_WORDS).join('|')})\+?\s+(?:[a-z-]+\s+){0,2}?`
  + String.raw`(?:staff|employees|people|associates|workers|team members|direct reports|reports|drivers|technicians|crew members|volunteers|agents|nurses|students|clients|customers|patients)\b`,
  'gi',
);

function toValue(raw: string, multiplier?: string): number {
  const base = raw.toLowerCase() in NUMBER_WORDS ? NUMBER_WORDS[raw.toLowerCase()] : Number(raw.replace(/,/g, ''));
  return base * (multiplier ? MULTIPLIER[multiplier.toLowerCase()] : 1);
}

/** Every value the source states, lenient on purpose: a number anywhere in history supports it. */
function sourceNumbers(text: string): Set<number> {
  const values = new Set<number>();
  for (const match of text.matchAll(ANY_NUMBER)) {
    values.add(toValue(match[1], match[2]));
    values.add(toValue(match[1]));
  }
  for (const word of text.toLowerCase().match(/[a-z]+/g) ?? []) {
    if (word in NUMBER_WORDS) values.add(NUMBER_WORDS[word]);
  }
  return values;
}

function claimedNumbers(text: string): number[] {
  return [
    ...[...text.matchAll(MONEY)].map((match) => toValue(match[1], match[2])),
    ...[...text.matchAll(PERCENT)].map((match) => toValue(match[1])),
    ...[...text.matchAll(HEADCOUNT)].map((match) => toValue(match[1])),
  ];
}

// ─── Degrees and credentials ───

/** Uppercase abbreviations match case-sensitively so "as"/"ma" in prose never count. */
const CREDENTIAL_ABBREVIATIONS =
  /(?<![A-Za-z0-9])(AAS|AAB|AA|AS|BSN|BBA|BS|BA|MBA|MSN|MS|MA|MEd|PhD|GED|HSED|HiSET|CDL|OSHA|PMP|CNA|LPN|RN|EMT|CPR|CCNA|CISSP|ASE|NCCER|AWS|CompTIA|ServSafe|A\+|Security\+|Network\+)(?![A-Za-z0-9+])/g;
const CREDENTIAL_WORDS: Array<[RegExp, string]> = [
  [/\bassociate(?:'s)?\s+(?:degree|of|in)\b/i, 'associate'],
  [/\bbachelor(?:'s)?\b/i, 'bachelor'],
  [/\bmaster(?:'s)?\s+(?:degree|of|in)\b/i, 'master'],
  [/\bdoctor(?:ate|al)\b/i, 'doctorate'],
  [/\bdiploma\b/i, 'diploma'],
  [/\bhigh school\b/i, 'high school'],
  [/\bcertifi(?:ed|cation|cations|cate|cates)\b/i, 'cert'],
  [/\blicen(?:se|sed|sure)\b/i, 'license'],
];
/** A generic credential word is supported by a specific credential of that kind. */
const CREDENTIAL_FAMILIES: Record<string, string[]> = {
  associate: ['aas', 'aab', 'aa', 'as'],
  bachelor: ['bs', 'ba', 'bsn', 'bba'],
  master: ['ms', 'ma', 'mba', 'msn', 'med'],
  doctorate: ['phd'],
  diploma: ['ged', 'hsed', 'hiset', 'high school'],
  'high school': ['diploma', 'ged', 'hsed', 'hiset'],
  license: ['cdl', 'rn', 'lpn'],
  cert: ['osha', 'cdl', 'pmp', 'cna', 'cpr', 'ccna', 'cissp', 'ase', 'nccer', 'aws', 'comptia', 'servsafe', 'a+', 'security+', 'network+', 'emt'],
};

function credentialKeys(text: string): string[] {
  const canonical = canonicalText(text);
  const keys = [...canonical.matchAll(CREDENTIAL_ABBREVIATIONS)].map((match) => match[1].toLowerCase());
  for (const [pattern, key] of CREDENTIAL_WORDS) if (pattern.test(canonical)) keys.push(key);
  return keys;
}

function isCredentialSupported(key: string, supported: Set<string>): boolean {
  return supported.has(key) || (CREDENTIAL_FAMILIES[key] ?? []).some((member) => supported.has(member));
}

const CERT_WORD = /\b(?:certified|certification|certificate|licensed|license)\b/gi;
const QUALIFIER_STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'with', 'in', 'of', 'for', 'at', 'to', 'as', 'is', 'was', 'on', 'by',
  'holds', 'hold', 'held', 'earned', 'completed', 'received', 'obtained', 'current', 'currently', 'valid',
  'active', 'certified', 'certification', 'certificate', 'licensed', 'license', 'including', 'plus',
  'pursuing', 'program', 'training',
]);

/** The words of X in "Certified X", "X certification", "X certified", "X license" (at most three). */
function credentialQualifiers(text: string): string[][] {
  const qualifiers: string[][] = [];
  const canonical = canonicalText(text);
  for (const match of canonical.matchAll(CERT_WORD)) {
    const index = match.index ?? 0;
    const after = canonical.slice(index + match[0].length).split(/[.,;:()|—–\n]/)[0];
    const before = canonical.slice(0, index).split(/[.,;:()|—–\n]/).pop() ?? '';
    const forward: string[] = [];
    for (const token of words(after)) {
      if (QUALIFIER_STOP.has(token) || /^\d+$/.test(token) || forward.length === 3) break;
      forward.push(token);
    }
    const backward: string[] = [];
    for (const token of words(before).reverse()) {
      if (QUALIFIER_STOP.has(token) || backward.length === 3) break;
      backward.unshift(token);
    }
    if (forward.length) qualifiers.push(forward);
    if (backward.length) qualifiers.push(backward);
  }
  return qualifiers;
}

// ─── Names (employers, schools, entry-line parts) by token set ───

/** Words ignored when comparing names: generic organization words, sentence words, credentials. */
const IGNORED_NAME_WORDS = new Set([
  'community', 'state', 'technical', 'junior', 'national', 'international', 'global', 'american',
  'united', 'general', 'city', 'county', 'regional', 'public', 'high', 'middle', 'elementary',
  'career', 'vocational', 'university', 'college', 'institute', 'academy', 'school', 'hospital',
  'inc', 'llc', 'llp', 'ltd', 'corp', 'corporation', 'company', 'co', 'group',
  'attended', 'studied', 'graduated', 'graduate', 'worked', 'working', 'employed', 'joined',
  'enrolled', 'completed', 'earned', 'served', 'volunteered', 'interned', 'currently', 'previously',
  'formerly', 'former', 'current', 'present', 'now', 'ongoing', 'expected', 'remote', 'hybrid',
  'onsite', 'site', 'full', 'part', 'time', 'the', 'a', 'an', 'and', 'or', 'of', 'at', 'in', 'on',
  'for', 'from', 'with', 'by', 'to', 'as', 's', 'degree', 'diploma', 'certificate', 'certification',
  'certified', 'license', 'licensed', 'associate', 'bachelor', 'master', 'program', 'coursework',
  'aas', 'aab', 'aa', 'as', 'bsn', 'bba', 'bs', 'ba', 'mba', 'msn', 'ms', 'ma', 'med', 'phd', 'ged',
  'hsed', 'hiset',
]);
const SCHOOL_KIND = new Set(['university', 'college', 'institute', 'academy', 'school', 'hospital']);

function nameTokens(text: string): string[] {
  return words(text).filter((token) => !IGNORED_NAME_WORDS.has(token) && !/^\d+$/.test(token));
}

/**
 * Each history line together with its neighbours: PDF extraction can split
 * "Warehouse Lead" and "Riverbend Logistics" onto adjacent lines.
 */
function historyWindows(history: string): Array<Set<string>> {
  const lines = history.replace(/\r\n?/g, '\n').split('\n').map(words);
  return lines.map((_, index) => new Set(lines.slice(Math.max(0, index - 1), index + 2).flat()));
}

/**
 * A name is supported when all its specific words occur near each other in
 * the history, in any order. A school-kind word in the draft ("College") must
 * occur there too, so "Riverbend Community College" cannot borrow "Riverbend"
 * from an employer. A name with no specific word ("State University", "High
 * School") is not treated as a named claim here.
 */
function isNameSupported(span: string, windows: Array<Set<string>>): boolean {
  const tokens = nameTokens(span);
  if (!tokens.length) return true;
  const kinds = words(span).filter((token) => SCHOOL_KIND.has(token));
  return windows.some((window) => tokens.every((token) => window.has(token)) && kinds.every((kind) => window.has(kind)));
}

const ORG_SUFFIX = String.raw`(?:University|College|Institute|Academy|School|Inc\.?|LLC|LLP|Ltd\.?|Corp\.?|Corporation|Company|Hospital)`;
const NAME_WORD = String.raw`(?:[A-Z][\w&'’.-]*|&)`;
// Not followed by another capitalized word: "School Bus Driver" is a job, not a school.
const ORG_TRAILING = new RegExp(String.raw`(?:${NAME_WORD}\s+){1,6}${ORG_SUFFIX}(?![\w])(?!\s+[A-Z])`, 'g');
const ORG_LEADING = new RegExp(String.raw`\b(?:University|College|Institute|Academy|School)\s+of\s+(?:${NAME_WORD}\s*){1,4}`, 'g');
const NAME_RUN = String.raw`(${NAME_WORD}(?:\s+(?:${NAME_WORD}|of|and|the)){0,5})`;
/** Role nouns that make "<role> at X" an employment claim ("Manager at Amazon"). */
const ROLE_NOUN_WORDS = String.raw`(?:manager|lead|supervisor|director|coordinator|specialist|technician|driver|operator|analyst|engineer|assistant|associate|clerk|representative|agent|officer|administrator|intern|nurse|cashier|worker|president|owner|consultant|developer|teacher|instructor|foreman|mechanic|electrician|handler|picker|packer|trainer|advisor|counselor|designer|accountant|receptionist|server|cook|chef)`;
/** Case-insensitive first letter only, so the capitalized-name pattern stays case-sensitive. */
const anyCaseFirst = (pattern: string) => pattern.replace(/\b([a-z])/g, (letter) => `[${letter}${letter.toUpperCase()}]`);
const ROLE_NOUN = anyCaseFirst(ROLE_NOUN_WORDS);
/** "worked at X", "employed by X", "graduated from X", "attended X", "joined X", "<role> at X". */
const ORG_AFTER_TRIGGER = new RegExp(
  String.raw`(?:\b${anyCaseFirst('(?:worked|interned|volunteered|studied|employed)')}\s+(?:at|by|for|with)|\b${anyCaseFirst('graduated')}\s+from|\b${anyCaseFirst('attended')}|\b${anyCaseFirst('joined')}|(?<=\b${ROLE_NOUN}s?\s)at)\s+${NAME_RUN}`,
  'g',
);

type Section = 'experience' | 'education' | 'certifications' | 'other';

function headingSection(text: string): Section {
  if (/\b(?:certifications?|licen[cs]es?|credentials)\b/i.test(text)) return 'certifications';
  if (/\b(?:experience|employment|work history)\b/i.test(text)) return 'experience';
  if (/\b(?:education|training|academic)\b/i.test(text)) return 'education';
  return 'other';
}

function asHeading(line: string): string | null {
  const markdown = line.match(/^#{1,6}\s+(.+)$/);
  if (markdown) return markdown[1].replace(/\*\*/g, '').trim();
  if (/^(?:\*\*)?(?:(?:professional|work|employment|relevant)\s+)?(?:experience|employment history|work history|education(?: and training)?|training|certifications?|licen[cs]es?(?: (?:and|&) certifications)?|credentials)\s*:?(?:\*\*)?:?$/i.test(line)) {
    return line.replace(/[*:]/g, '').trim();
  }
  return null;
}

const ENTRY_SEPARATOR = /\s+[—–|·]\s+|\s+-\s+|\s+at\s+|[—–|·,;()]/;
const MAX_ENTRY_LINE_WORDS = 16;
const MAX_ENTRY_PART_NAME_WORDS = 6;

/**
 * A short heading-like line in Experience, Education or Certifications that
 * names a role, employer, school or credential ("Title — Org, dates").
 * Prose bullets are skipped: their wording is not checked.
 */
function isEntryLine(line: string, section: Section, isBullet: boolean, bold: boolean): boolean {
  if (section === 'other' || line.split(/\s+/).length > MAX_ENTRY_LINE_WORDS || /[.!?]\s+\S/.test(line)) return false;
  const hasYear = new RegExp(YEAR.source).test(line);
  const strongSeparator = /\s[—–|·]\s|\s+at\s+/.test(line);
  if (section === 'experience') {
    if (isBullet) return hasYear && strongSeparator;
    return bold || hasYear || strongSeparator;
  }
  return bold || hasYear || strongSeparator || line.includes(',');
}

function entryParts(line: string): string[] {
  const withoutDates = canonicalText(line)
    .replace(MONTH_YEAR, ' ')
    .replace(NUMERIC_MONTH_YEAR, ' ')
    .replace(/\b(?:19|20)\d{2}\b(?:\s*[-–—]\s*'?\d{2,4}\b)?/g, ' ');
  return withoutDates
    .split(ENTRY_SEPARATOR)
    .map((part) => part.replace(/[*_`#]/g, ' ').trim())
    .filter((part) => /[A-Za-z]/.test(part) && nameTokens(part).length <= MAX_ENTRY_PART_NAME_WORDS);
}

// ─── Goals ───

/** Wording that states a goal rather than a fact. */
const GOAL_PHRASING =
  /\b(?:seeking|interested in|aspir(?:ing|es?)|goals?\b|plan(?:s|ning)? to|hop(?:e|es|ing) to|pursuing a career|career (?:in|as)|target(?:ing)? (?:role|position|career))/i;
/** Wording that states enrollment, progress or an earned result: a fact that needs history. */
const STATUS_PHRASING =
  /\b(?:enrolled|enrollment|currently (?:pursuing|completing|training|studying|attending)|in progress|completing|completed|earned|holds?|certified|licensed|graduated|graduate of)\b/i;

/**
 * Narrow, fail-closed factuality post-check. Checked against the member's
 * history (goals such as the target program count only on goal-phrased lines):
 * - filler for a section or field with no data, and template placeholders;
 * - phone numbers, emails and URLs, as normalized units;
 * - years, and month-and-year pairs;
 * - dollar amounts, percentages and headcounts ("25 staff"), by value;
 * - degree and credential tokens, and the qualifier X of "Certified X" / "X certification";
 * - employer and school names after "worked at", "graduated from", "Title at", ...
 *   or ending in Inc., College, University, ...;
 * - the title, employer and school parts of short entry lines in Experience,
 *   Education and Certifications.
 * Names are compared as token sets near each other in the history. Anything
 * else, notably prose claims, is not checked; the prompt is the only guard.
 */
export function findUnsupportedResumeClaims(
  sources: ResumeClaimSources | string,
  generated: string,
): UnsupportedResumeClaim[] {
  const { history, goals = '' } = typeof sources === 'string' ? { history: sources } : sources;
  const issues = new Set<UnsupportedResumeClaim>();
  const historyContacts = extractContacts(history);
  const historyPhones = new Set(historyContacts.phones);
  const historyEmails = new Set(historyContacts.emails);
  const historyNumbers = sourceNumbers(canonicalText(history));
  const goalNumbers = sourceNumbers(canonicalText(goals));
  const historyMonths = new Set(monthYears(history));
  const historyCredentials = new Set(credentialKeys(history));
  const goalCredentials = new Set(credentialKeys(goals));
  const historyWords = ` ${words(history).join(' ')} `;
  const goalWords = ` ${words(goals).join(' ')} `;
  const windows = historyWindows(history);
  const goalWindows = historyWindows(goals);
  const qualifierSupported = (tokens: string[], source: string) => {
    if (source.includes(` ${tokens.join(' ')} `)) return true;
    // "Certified Forklift Operator Trainer": the first/last two words suffice.
    return tokens.length > 2
      && (source.includes(` ${tokens.slice(0, 2).join(' ')} `) || source.includes(` ${tokens.slice(-2).join(' ')} `));
  };

  if (PLACEHOLDER.test(generated)) issues.add('placeholder');

  let section: Section = 'other';
  for (const rawLine of generated.replace(/\r\n?/g, '\n').split('\n')) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    const heading = asHeading(trimmed);
    if (heading !== null) {
      if ((Object.keys(MISSING_SECTION_CLAIMS) as ResumeSection[]).some((s) => hasMissingSectionClaim(trimmed, s))) {
        issues.add('missing_section_filler');
      }
      section = headingSection(heading);
      continue;
    }

    const isBullet = /^(?:[-*•]|\d+[.)])\s+/.test(trimmed);
    const bold = /^\*\*[^*]+\*\*/.test(trimmed.replace(/^[-*•]\s+/, ''));
    const line = trimmed.replace(/^(?:[-*•]|\d+[.)])\s+/, '').replace(/\*\*/g, '').trim();

    const afterLabel = line.replace(/^[A-Za-z][A-Za-z /&]{0,30}\s*(?::|—|–|\s-)\s*/, '');
    if (FILLER_LINE.test(afterLabel)
      || (Object.keys(MISSING_SECTION_CLAIMS) as ResumeSection[]).some((s) => hasMissingSectionClaim(line, s))) {
      issues.add('missing_section_filler');
    }

    // Markdown link targets are not claims; contact values are compared as units.
    const contacts = extractContacts(line.replace(/\]\([^)]*\)/g, ']'));
    for (const phone of contacts.phones) if (!historyPhones.has(phone)) issues.add('unsupported_contact');
    for (const email of contacts.emails) if (!historyEmails.has(email)) issues.add('unsupported_contact');
    for (const url of contacts.urls) {
      if (!historyContacts.urls.some((known) => known === url || known.startsWith(`${url}/`) || url.startsWith(`${known}/`))) {
        issues.add('unsupported_contact');
      }
    }
    const claim = contacts.rest;
    const isGoalLine = GOAL_PHRASING.test(claim) && !STATUS_PHRASING.test(claim);
    const goalAllows = (supportedByGoals: boolean) => isGoalLine && supportedByGoals;

    for (const year of claim.match(YEAR) ?? []) {
      if (!isYearSupported(year, history) && !goalAllows(isYearSupported(year, goals))) issues.add('unsupported_date');
    }
    for (const monthYear of monthYears(claim)) {
      if (!historyMonths.has(monthYear)) issues.add('unsupported_date');
    }

    for (const value of claimedNumbers(canonicalText(claim))) {
      if (!historyNumbers.has(value) && !goalAllows(goalNumbers.has(value))) issues.add('unsupported_number');
    }

    for (const key of credentialKeys(claim)) {
      if (!isCredentialSupported(key, historyCredentials) && !goalAllows(isCredentialSupported(key, goalCredentials))) {
        issues.add('unsupported_credential');
      }
    }
    for (const qualifier of credentialQualifiers(claim)) {
      if (!qualifierSupported(qualifier, historyWords) && !goalAllows(qualifierSupported(qualifier, goalWords))) {
        issues.add('unsupported_credential');
      }
    }

    const orgCandidates = [
      ...[...claim.matchAll(ORG_AFTER_TRIGGER)].map((match) => match[1]),
      ...claim.split(/\s[—–|·-]\s|[,:;()]/).flatMap((segment) => [
        ...(segment.match(ORG_TRAILING) ?? []),
        ...(segment.match(ORG_LEADING) ?? []),
      ]),
    ];
    for (const candidate of orgCandidates) {
      if (!isNameSupported(candidate, windows) && !goalAllows(isNameSupported(candidate, goalWindows))) {
        issues.add('unsupported_organization');
      }
    }

    if (isEntryLine(claim, section, isBullet, bold)) {
      for (const part of entryParts(claim)) {
        if (!isNameSupported(part, windows)) issues.add('unsupported_entry_detail');
      }
    }
  }

  return [...issues];
}
