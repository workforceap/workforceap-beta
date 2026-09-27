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

export type UnsupportedResumeClaim =
  | 'missing_section_filler'
  | 'placeholder'
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

/**
 * Filler a model writes instead of omitting a section with no source data, e.g.
 * "No certifications were provided." on its own line, or "Skills: Not provided".
 */
const FILLER_LINE =
  /^(?:(?:not|none)\s+(?:provided|specified|listed|available|given)|n\/a|none|tbd|no\s+(?:[a-z]+\s+){0,3}(?:(?:was|were|is|are|has been|have been)\s+)?(?:provided|specified|listed|included|available|given))\.?$/i;
const PLACEHOLDER = /\[(?:[^\]\n]{0,40}\b)?(?:company|employer|organization|school|university|college|dates?|years?|city|state|job title|title|role|degree|name|location|number|x+)\b[^\]\n]{0,40}\](?!\()/i;
const YEAR = /\b(?:19[5-9]\d|20\d{2})\b/g;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_YEAR = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?,?\s+((?:19|20)\d{2})\b/g;
const NUMERIC_MONTH_YEAR = /\b(0?[1-9]|1[0-2])\/((?:19|20)\d{2})\b/g;
const GOAL_PHRASING =
  /\b(?:pursuing|seeking|working towards?|enrolled in|currently training|training (?:for|towards?|in)|goal|aspiring|interested in|preparing for|plan(?:s|ning)? to|target(?:ing)?)\b/i;

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
};
const NUMBER = /(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s*(k|m|b|thousand|million|billion)\b)?/gi;
const MULTIPLIER: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, b: 1e9, billion: 1e9 };

/** Faithful spelling variants: case, dotted abbreviations, common short forms. */
const DEGREE_PHRASES: Array<[RegExp, string]> = [
  [/\bassociate(?:'s)? of applied science\b/gi, 'AAS'],
  [/\bassociate(?:'s)? of applied business\b/gi, 'AAB'],
  [/\bassociate(?:'s)? of science\b/gi, 'AS'],
  [/\bassociate(?:'s)? of arts\b/gi, 'AA'],
  [/\bbachelor(?:'s)? of science in nursing\b/gi, 'BSN'],
  [/\bbachelor(?:'s)? of business administration\b/gi, 'BBA'],
  [/\bbachelor(?:'s)? of science\b/gi, 'BS'],
  [/\bbachelor(?:'s)? of arts\b/gi, 'BA'],
  [/\bmaster(?:'s)? of business administration\b/gi, 'MBA'],
  [/\bmaster(?:'s)? of science\b/gi, 'MS'],
  [/\bmaster(?:'s)? of arts\b/gi, 'MA'],
];
const WORD_VARIANTS: Record<string, string> = {
  sr: 'senior', jr: 'junior', mgr: 'manager', asst: 'assistant', assoc: 'associate',
  coord: 'coordinator', supv: 'supervisor', dept: 'department',
};

function canonicalText(text: string): string {
  let out = text.replace(/[’‘]/g, "'");
  // A.A.S. → AAS, B.S. → BS, Ph.D. → PhD.
  out = out.replace(/\b((?:[A-Za-z]\.){2,})(?![A-Za-z])/g, (match) => match.replace(/\./g, ''));
  out = out.replace(/\bPh\.D\.?/g, 'PhD').replace(/\bM\.Ed\.?/g, 'MEd');
  for (const [pattern, abbreviation] of DEGREE_PHRASES) out = out.replace(pattern, abbreviation);
  return out;
}

function comparable(text: string): string {
  const words = canonicalText(text)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word) => WORD_VARIANTS[word] ?? word);
  return ` ${words.join(' ')} `;
}

function numberValues(text: string, includeWords: boolean): number[] {
  const values: number[] = [];
  for (const match of text.matchAll(NUMBER)) {
    const raw = Number(match[1].replace(/,/g, ''));
    if (!Number.isFinite(raw)) continue;
    const multiplier = match[2] ? MULTIPLIER[match[2].toLowerCase()] : 1;
    values.push(raw * multiplier);
    if (includeWords && multiplier !== 1) values.push(raw);
  }
  if (includeWords) {
    for (const word of text.toLowerCase().match(/[a-z]+/g) ?? []) {
      if (word in NUMBER_WORDS) values.push(NUMBER_WORDS[word]);
    }
  }
  return values;
}

function monthYears(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(MONTH_YEAR)) found.push(`${match[1].toLowerCase()} ${match[2]}`);
  for (const match of text.matchAll(NUMERIC_MONTH_YEAR)) found.push(`${MONTHS[Number(match[1]) - 1]} ${match[2]}`);
  return found;
}

/** Credential tokens. Uppercase abbreviations are matched case-sensitively so "as"/"ma" in prose never count. */
const CREDENTIAL_ABBREVIATIONS =
  /(?<![A-Za-z0-9])(AAS|AAB|AA|AS|BSN|BBA|BS|BA|MBA|MSN|MS|MA|MEd|PhD|GED|HSED|HiSET|CDL|OSHA|PMP|CNA|LPN|RN|EMT|CPR|CCNA|CISSP|ASE|NCCER|AWS|CompTIA|ServSafe|A\+|Security\+|Network\+)(?![A-Za-z0-9+])/g;
const CREDENTIAL_WORDS: Array<[RegExp, string]> = [
  [/\bassociate(?:'s)?\s+(?:degree|of)\b/gi, 'associate'],
  [/\bbachelor(?:'s)?\b/gi, 'bachelor'],
  [/\bmaster(?:'s)?\s+(?:degree|of)\b/gi, 'master'],
  [/\bdoctor(?:ate|al)\b/gi, 'doctorate'],
  [/\bdiploma\b/gi, 'diploma'],
  [/\bcertifi(?:ed|cation|cations|cate|cates)\b/gi, 'cert'],
  [/\blicen(?:se|sed|sure)\b/gi, 'license'],
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
  cert: [
    'osha', 'cdl', 'pmp', 'cna', 'cpr', 'ccna', 'cissp', 'ase', 'nccer', 'aws', 'comptia',
    'servsafe', 'a+', 'security+', 'network+', 'emt', 'lpn', 'rn',
  ],
};

function credentialKeys(text: string): string[] {
  const canonical = canonicalText(text);
  const keys = [...canonical.matchAll(CREDENTIAL_ABBREVIATIONS)].map((match) => match[1].toLowerCase());
  for (const [pattern, key] of CREDENTIAL_WORDS) {
    if (pattern.test(canonical)) keys.push(key);
    pattern.lastIndex = 0;
  }
  if (/\bhigh school\b/i.test(canonical)) keys.push('high school');
  return keys;
}

/** Descriptors that on their own do not name a specific organization. */
const GENERIC_ORG_WORDS = new Set([
  'community', 'state', 'technical', 'junior', 'national', 'international', 'global', 'american',
  'united', 'general', 'city', 'county', 'regional', 'public', 'high', 'middle', 'elementary',
  'career', 'vocational', 'the', 'and', 'of', 'university', 'college', 'institute', 'academy',
  'school', 'inc', 'llc', 'llp', 'ltd', 'corp', 'corporation', 'company', 'co', 'hospital',
]);
/** Leading words that belong to the sentence, not to the organization's name. */
const LEADING_NON_NAME_WORDS = new Set([
  'attended', 'studied', 'graduated', 'graduate', 'worked', 'working', 'employed', 'joined',
  'enrolled', 'completed', 'earned', 'served', 'volunteered', 'interned', 'currently',
  'previously', 'formerly', 'former', 'current', 'alumnus', 'alumna', 'student', 'at', 'from',
  'with', 'for', 'in', 'of', 'the', 'a', 'an', 'and', 'by', 'to', 'as',
]);
const CORPORATE_SUFFIX = /^(?:inc|llc|llp|ltd|corp|corporation|company|co)$/;
const ORG_SUFFIX = String.raw`(?:University|College|Institute|Academy|School|Inc\.?|LLC|LLP|Ltd\.?|Corp\.?|Corporation|Company|Hospital)`;
const NAME_WORD = String.raw`(?:[A-Z][\w&'’.-]*|&)`;
// Not followed by another capitalized word: "School Bus Driver" is a job, not a school.
const ORG_TRAILING = new RegExp(String.raw`(?:${NAME_WORD}\s+){1,6}${ORG_SUFFIX}(?![\w])(?!\s+[A-Z])`, 'g');
const ORG_LEADING = new RegExp(String.raw`\b(?:University|College|Institute|Academy|School)\s+of\s+(?:${NAME_WORD}\s*){1,4}`, 'g');
/** "Manager at Amazon", "Employed by Harborview", "Graduated from Northgate". */
const ORG_AFTER_PREPOSITION = new RegExp(
  String.raw`\b(?:at|employed by|worked for|graduated from|studied at|attended|joined)\s+(${NAME_WORD}(?:\s+(?:${NAME_WORD}|of|and|the))*)`,
  'g',
);

function words(text: string): string[] {
  return comparable(text).trim().split(' ').filter(Boolean);
}

function isSpecific(tokens: string[]): boolean {
  return tokens.some((token) => !GENERIC_ORG_WORDS.has(token));
}

function containsPhrase(source: string, tokens: string[]): boolean {
  return tokens.length > 0 && source.includes(` ${tokens.join(' ')} `);
}

/**
 * Is a named organization in the source? Sentence words in front of the name
 * ("Attended", "Worked at") are dropped. A job title in front of the name may
 * be dropped only when that title is itself in the source and what remains is
 * still a specific name, so "Riverbend Community College" cannot borrow
 * "Community College" from another school. A span with no specific word at all
 * ("High School", "State University") is not a named organization and is
 * accepted unless it is present in neither form.
 */
function isOrganizationSupported(span: string, source: string): boolean {
  let tokens = words(span);
  while (tokens.length && LEADING_NON_NAME_WORDS.has(tokens[0])) tokens = tokens.slice(1);
  while (tokens.length && (tokens[tokens.length - 1] === 'and' || tokens[tokens.length - 1] === 'of' || tokens[tokens.length - 1] === 'the')) {
    tokens = tokens.slice(0, -1);
  }
  if (!tokens.length || !isSpecific(tokens)) return true;
  const withoutSuffix = (list: string[]) => (list.length > 1 && CORPORATE_SUFFIX.test(list[list.length - 1]) ? list.slice(0, -1) : list);
  for (let start = 0; start < tokens.length; start += 1) {
    const tail = tokens.slice(start);
    const prefix = tokens.slice(0, start);
    if (start > 0 && !(containsPhrase(source, prefix) && isSpecific(withoutSuffix(tail)))) continue;
    if (containsPhrase(source, tail) || containsPhrase(source, withoutSuffix(tail))) return true;
  }
  return false;
}

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
  const bold = line.match(/^\*\*([^*]{1,40})\*\*:?$/);
  if (bold && headingSection(bold[1]) !== 'other') return bold[1];
  if (line.length <= 40 && /^[A-Za-z &/]+:?$/.test(line) && headingSection(line) !== 'other'
    && /^(?:(?:professional|work|employment|relevant)\s+)?(?:experience|employment history|work history|education(?: and training)?|training|certifications?|licen[cs]es?(?: (?:and|&) certifications)?|credentials)\s*:?$/i.test(line)) {
    return line;
  }
  return null;
}

const ENTRY_SEPARATOR = /\s+[—–|·]\s+|\s+-\s+|\s+at\s+|[—–|·,;()]/;
const DATE_WORDS = /\b(?:present|current|now|ongoing|expected|to)\b/gi;
const HARMLESS_ENTRY_PARTS = new Set(['remote', 'hybrid', 'on site', 'onsite', 'full time', 'part time', 'and']);

function isEntryLine(line: string, section: Section, isBullet: boolean, bold: boolean): boolean {
  if (section === 'other') return false;
  const hasYear = YEAR.test(line);
  YEAR.lastIndex = 0;
  const strongSeparator = /\s[—–|·]\s|\s+at\s+/.test(line);
  if (section === 'experience') {
    if (isBullet) return hasYear && (strongSeparator || line.includes(','));
    return bold || hasYear || strongSeparator;
  }
  return bold || hasYear || strongSeparator || line.includes(',');
}

function entryParts(line: string): string[] {
  return line
    .split(ENTRY_SEPARATOR)
    .map((part) => part
      .replace(MONTH_YEAR, ' ')
      .replace(NUMERIC_MONTH_YEAR, ' ')
      .replace(/\b(?:19|20)\d{2}\b(?:\s*[-–—]\s*'?\d{2,4}\b)?/g, ' ')
      .replace(DATE_WORDS, ' ')
      .replace(/[*_`#]/g, ' ')
      .replace(/^[\s.:–—-]+|[\s.:–—-]+$/g, '')
      .trim())
    .filter((part) => part && /[A-Za-z]/.test(part));
}

function isEntryPartSupported(part: string, source: string): boolean {
  let tokens = words(part);
  while (tokens.length && LEADING_NON_NAME_WORDS.has(tokens[0])) tokens = tokens.slice(1);
  if (!tokens.length) return true;
  const joined = tokens.join(' ');
  if (HARMLESS_ENTRY_PARTS.has(joined) || tokens.every((token) => CORPORATE_SUFFIX.test(token))) return true;
  if (containsPhrase(source, tokens)) return true;
  if (tokens.length > 1 && CORPORATE_SUFFIX.test(tokens[tokens.length - 1]) && containsPhrase(source, tokens.slice(0, -1))) return true;
  // A lone generic phrase ("High School") is not a named claim.
  return !isSpecific(tokens);
}

function isYearSupported(year: string, rawSource: string, source: string): boolean {
  if (source.includes(` ${year} `)) return true;
  // "2019-23" in the source supports "2019–2023" in the draft.
  return new RegExp(String.raw`\b(?:19|20)\d{2}\s*[-–—]\s*'?${year.slice(2)}\b`).test(rawSource);
}

function isCredentialSupported(key: string, supported: Set<string>): boolean {
  if (supported.has(key)) return true;
  return (CREDENTIAL_FAMILIES[key] ?? []).some((member) => supported.has(member));
}

/**
 * Deterministic factuality post-check for AI resume drafts.
 *
 * Checked against the member's history (extracted resume text plus profile
 * fields; goals such as the target program never count as earned history):
 * - filler written for a section or field with no data, and template placeholders;
 * - every year, month-and-year, and number (thousands separators, "$", "%" and
 *   "percent" normalized; spelled-out one to twenty accepted from the source);
 * - degree and credential tokens (A.A.S., B.S., MBA, GED, CDL, OSHA, CompTIA, AWS,
 *   "certified", "license", ...), with faithful spellings accepted;
 * - named organizations: after "at", "employed by", "graduated from", ... and
 *   names ending in Inc., LLC, College, University, ...;
 * - in Experience, Education and Certifications entry lines ("Title — Org, dates",
 *   "Title at Org", "Org | Title", "Degree, School, year"), every title,
 *   organization and location part.
 *
 * It cannot judge prose claims such as "exceeded targets" or a bullet that
 * describes duties the source never mentions; the prompt is the only guard
 * for those. Returns the kinds of problem found; empty means none detected.
 */
export function findUnsupportedResumeClaims(
  sources: ResumeClaimSources | string,
  generated: string,
): UnsupportedResumeClaim[] {
  const { history, goals = '' } = typeof sources === 'string' ? { history: sources } : sources;
  const issues = new Set<UnsupportedResumeClaim>();
  const historyText = comparable(history);
  const goalsText = comparable(goals);
  const historyNumbers = new Set(numberValues(canonicalText(history), true));
  const goalNumbers = new Set(numberValues(canonicalText(goals), true));
  const historyMonths = new Set(monthYears(history));
  const historyCredentials = new Set(credentialKeys(history));
  const goalCredentials = new Set(credentialKeys(goals));

  if (PLACEHOLDER.test(generated)) issues.add('placeholder');

  let section: Section = 'other';
  for (const rawLine of generated.replace(/\r\n?/g, '\n').split('\n')) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    const heading = asHeading(trimmed);
    if (heading !== null) {
      // "## Experience — No employment history was provided." is filler, not only a heading.
      if ((Object.keys(MISSING_SECTION_CLAIMS) as ResumeSection[]).some((s) => hasMissingSectionClaim(trimmed, s))) {
        issues.add('missing_section_filler');
      }
      section = headingSection(heading);
      continue;
    }

    const isBullet = /^(?:[-*•]|\d+[.)])\s+/.test(trimmed);
    const bold = /^\*\*[^*]+\*\*/.test(trimmed.replace(/^(?:[-*•])\s+/, ''));
    const line = trimmed.replace(/^(?:[-*•]|\d+[.)])\s+/, '').replace(/\*\*/g, '').trim();
    // Markdown link targets are not claims.
    const claimText = line.replace(/\]\([^)]*\)/g, ']');
    const isGoalLine = GOAL_PHRASING.test(claimText);
    const goalAllows = (supportedByGoals: boolean) => isGoalLine && supportedByGoals;

    const afterLabel = line.replace(/^[A-Za-z][A-Za-z /&]{0,30}\s*(?::|—|–|\s-)\s*/, '');
    if (FILLER_LINE.test(afterLabel)
      || (Object.keys(MISSING_SECTION_CLAIMS) as ResumeSection[]).some((s) => hasMissingSectionClaim(line, s))) {
      issues.add('missing_section_filler');
    }

    for (const year of claimText.match(YEAR) ?? []) {
      if (!isYearSupported(year, history, historyText) && !goalAllows(goalsText.includes(` ${year} `))) {
        issues.add('unsupported_date');
      }
    }
    for (const monthYear of monthYears(claimText)) {
      if (!historyMonths.has(monthYear)) issues.add('unsupported_date');
    }

    const withoutDates = canonicalText(claimText)
      .replace(MONTH_YEAR, ' ')
      .replace(NUMERIC_MONTH_YEAR, ' ')
      .replace(/\b(?:19[5-9]\d|20\d{2})\b/g, ' ');
    for (const value of numberValues(withoutDates, false)) {
      if (!historyNumbers.has(value) && !goalAllows(goalNumbers.has(value))) issues.add('unsupported_number');
    }

    for (const key of credentialKeys(claimText)) {
      if (!isCredentialSupported(key, historyCredentials)
        && !goalAllows(isCredentialSupported(key, goalCredentials))) {
        issues.add('unsupported_credential');
      }
    }

    const orgCandidates = [
      ...[...claimText.matchAll(ORG_AFTER_PREPOSITION)].map((match) => match[1]),
      ...claimText.split(/\s[—–|·-]\s|[,:;()]/).flatMap((segment) => [
        ...(segment.match(ORG_TRAILING) ?? []),
        ...(segment.match(ORG_LEADING) ?? []),
      ]),
    ];
    for (const candidate of orgCandidates) {
      if (!isOrganizationSupported(candidate, historyText) && !goalAllows(isOrganizationSupported(candidate, goalsText))) {
        issues.add('unsupported_organization');
      }
    }

    if (isEntryLine(claimText, section, isBullet, bold)) {
      for (const part of entryParts(claimText)) {
        if (!isEntryPartSupported(part, historyText)) issues.add('unsupported_entry_detail');
      }
    }
  }

  return [...issues];
}
