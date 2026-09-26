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
