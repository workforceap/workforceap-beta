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
  | 'unsupported_year'
  | 'unsupported_metric'
  | 'unsupported_organization';

/**
 * Filler a model writes instead of omitting a section with no source data, e.g.
 * "No certifications were provided." on its own line, or "Skills: Not provided".
 */
const FILLER_LINE =
  /^(?:(?:not|none)\s+(?:provided|specified|listed|available|given)|n\/a|none|tbd|no\s+(?:[a-z]+\s+){0,3}(?:(?:was|were|is|are|has been|have been)\s+)?(?:provided|specified|listed|included|available|given))\.?$/i;
const PLACEHOLDER = /\[(?:[^\]\n]{0,40}\b)?(?:company|employer|organization|school|university|college|dates?|years?|city|state|job title|title|role|degree|name|location|number|x+)\b[^\]\n]{0,40}\](?!\()/i;
const YEAR = /\b(?:19[5-9]\d|20\d{2})\b/g;
const METRIC = /(?:\$\s?\d[\d,]*(?:\.\d+)?\s*(?:[kmb]\b|million|billion|thousand)?|\b\d+(?:\.\d+)?\s?%)/gi;

/** Words that end a proper-noun organization name. */
const ORG_SUFFIX = String.raw`(?:University|College|Institute|Academy|School|Inc\.?|LLC|LLP|Ltd\.?|Corp\.?|Corporation|Company|Hospital)`;
const NAME_WORD = String.raw`(?:[A-Z][\w&'.-]*|&)`;
// Not followed by another capitalized word: "School Bus Driver" is a job, not a school.
const ORG_TRAILING = new RegExp(String.raw`(?:${NAME_WORD}\s+){1,6}${ORG_SUFFIX}(?![\w])(?!\s+[A-Z])`, 'g');
const ORG_LEADING = new RegExp(String.raw`\b(?:University|College|Institute|Academy|School)\s+of\s+(?:${NAME_WORD}\s*){1,4}`, 'g');
/** Descriptors that on their own do not name a specific organization. */
const GENERIC_ORG_WORDS = new Set([
  'community', 'state', 'technical', 'junior', 'national', 'international', 'global', 'american',
  'united', 'general', 'city', 'county', 'regional', 'public', 'high', 'middle', 'elementary',
  'career', 'vocational', 'the', 'and', '&', 'of', 'university', 'college', 'institute', 'academy',
  'school', 'inc', 'llc', 'llp', 'ltd', 'corp', 'corporation', 'company', 'hospital',
]);

function comparable(text: string): string {
  const unified = text
    .toLowerCase()
    .replace(/(\d)\s*(?:%|percent\b)/g, '$1%')
    .replace(/\$\s+(?=\d)/g, '$');
  return ` ${unified.replace(/[^a-z0-9%$]+/g, ' ').trim()} `;
}

function isSpecificName(words: string[]): boolean {
  return words.some((word) => !GENERIC_ORG_WORDS.has(word.toLowerCase().replace(/[^a-z&]/g, '')));
}

/**
 * A named organization is supported when the source contains it, allowing the
 * model to drop leading words that belong to a neighbouring job title
 * ("Warehouse Lead Riverbend Logistics Inc" → "Riverbend Logistics Inc"), but
 * never shrinking to a generic tail such as "Community College".
 */
function isOrganizationSupported(candidate: string, source: string): boolean {
  const words = candidate.trim().split(/\s+/);
  if (!isSpecificName(words)) return true;
  for (let start = 0; start < words.length; start += 1) {
    const tail = words.slice(start);
    if (!isSpecificName(tail)) break;
    if (source.includes(comparable(tail.join(' ')))) return true;
    // "Acme Logistics" in the source supports "Acme Logistics, Inc." in the draft.
    const core = tail.filter((word) => !new RegExp(`^${ORG_SUFFIX}$`).test(word));
    if (/^(?:Inc\.?|LLC|LLP|Ltd\.?|Corp\.?|Corporation|Company)$/.test(tail[tail.length - 1])
      && isSpecificName(core) && source.includes(comparable(core.join(' ')))) return true;
  }
  return false;
}

function isYearSupported(year: string, rawSource: string, source: string): boolean {
  if (source.includes(` ${year} `)) return true;
  // "2019-23" in the source supports "2019–2023" in the draft.
  return new RegExp(String.raw`\b(?:19|20)\d{2}\s*[-–—]\s*'?${year.slice(2)}\b`).test(rawSource);
}

/**
 * Deterministic factuality post-check for AI resume drafts.
 *
 * The prompt already forbids invented facts; this catches the drafts where the
 * model did it anyway. It lists why the draft is unsafe to save: filler written
 * for a section the source does not have, template placeholders, and years,
 * metrics or named employers/schools that do not appear in the source (the
 * extracted resume plus profile context). It cannot judge vague prose claims,
 * so the prompt remains the first line of defence for those.
 */
export function findUnsupportedResumeClaims(source: string, generated: string): UnsupportedResumeClaim[] {
  const issues = new Set<UnsupportedResumeClaim>();
  const normalizedSource = comparable(source);
  const lines = generated.replace(/\r\n?/g, '\n').split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim().replace(/^#{1,6}\s*/, '').replace(/^[-*•]\s+/, '').replace(/\*\*/g, '').trim();
    if (!line) continue;
    // "Skills: Not provided", "Education — None", "Phone: N/A".
    const afterLabel = line.replace(/^[A-Za-z][A-Za-z /&]{0,30}\s*(?::|—|–|\s-)\s*/, '');
    if (FILLER_LINE.test(afterLabel)
      || (Object.keys(MISSING_SECTION_CLAIMS) as ResumeSection[]).some((section) => hasMissingSectionClaim(line, section))) {
      issues.add('missing_section_filler');
    }
  }

  if (PLACEHOLDER.test(generated)) issues.add('placeholder');

  for (const year of generated.match(YEAR) ?? []) {
    if (!isYearSupported(year, source, normalizedSource)) {
      issues.add('unsupported_year');
      break;
    }
  }

  for (const metric of generated.match(METRIC) ?? []) {
    if (!normalizedSource.includes(comparable(metric))) {
      issues.add('unsupported_metric');
      break;
    }
  }

  for (const line of lines) {
    // Split on the separators models put between a title and an employer, so a
    // job title is not read as part of the organization's name.
    for (const segment of line.replace(/\*\*/g, '').split(/\s[—–|·-]\s|[,:;()]|\s+at\s+/)) {
      const candidates = [...(segment.match(ORG_TRAILING) ?? []), ...(segment.match(ORG_LEADING) ?? [])];
      if (candidates.some((candidate) => !isOrganizationSupported(candidate, normalizedSource))) {
        issues.add('unsupported_organization');
      }
    }
  }

  return [...issues];
}
