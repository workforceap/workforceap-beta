/** Locked public wording: describe funding and qualifying no-cost access. */
export function enrollPageCopyIsStakeSafe(text: string): boolean {
  return !/\bfree\b/i.test(text);
}

export function resolveEnrollmentCopy(args: {
  name: string;
  termLabel: string;
  headline?: string | null;
  blurb?: string | null;
}) {
  const costSentence = `Career training and certifications offered at no cost to ${args.name} students for ${args.termLabel}`
    + ` — sponsored through the WorkforceAP–${args.name.replace(/ High School$/i, '')} partnership.`;
  const headline = args.headline?.trim();
  const blurb = args.blurb?.trim();
  return {
    headline: headline && enrollPageCopyIsStakeSafe(headline)
      ? headline : `${args.name.replace(/ High School$/i, '')} students: launch your career with an industry certification`,
    blurb: blurb && enrollPageCopyIsStakeSafe(blurb) ? blurb : costSentence,
    costSentence,
  };
}
