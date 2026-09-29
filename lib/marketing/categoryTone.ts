/**
 * Fill tone for a program category pill on the partner pages that share
 * `css/enroll-school.css` (`/join/<code>` and `/enroll/<school>`).
 *
 * The pill draws white text on a solid fill, so it is only readable when it
 * carries one of these tones (`.cat--c` crimson, `.cat--g` gold). Crimson is
 * the IT & Cybersecurity category colour; every other category uses gold,
 * matching the /enroll page since it launched.
 */
export type CategoryTone = 'c' | 'g';

export function categoryTone(color: string | null | undefined): CategoryTone {
  return /ad2c4d|crimson|c47/i.test(color ?? '') ? 'c' : 'g';
}
