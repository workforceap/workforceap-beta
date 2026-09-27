/**
 * WAP billing letterhead for the two-stage documents, from the blank WAP DOCX
 * as described by Mike Brown (2026-09-27): gold-globe/red-arrow logo, the
 * three header lines, and a footer with the billing phone and the
 * Pflugerville address. Replaces the old renderer's magenta band for these
 * documents only.
 *
 * One configurable place for the footer contact. It is deliberately a code
 * constant, not an env override, so it can only change through review, and
 * each signed document freezes the values it was signed with.
 *
 * Pending Mike's confirmation:
 *  - phone: (512) 825-2896 per Mike and the DOCX; the public /contact page
 *    shows (512) 777-1808. Never switch to the website number silently.
 *  - address: taken from the repo (lib/billing/providerIdentity.ts default and
 *    marketing/src/pages/programs/price-list.astro), not guessed.
 */
export const WAP_LOGO_PUBLIC_PATH = 'public/images/wap_logo.png';

export type BillingLetterhead = {
  readonly headerLines: readonly [string, string, string];
  readonly footer: { readonly phone: string; readonly addressLines: readonly string[] };
  readonly logoPath: string;
};

export const WAP_BILLING_LETTERHEAD: BillingLetterhead = Object.freeze({
  headerLines: Object.freeze(['Workforce Advancement Project', 'Empowering People. Advancing Futures', 'www.WorkforceAP.org']) as readonly [
    string,
    string,
    string,
  ],
  footer: Object.freeze({
    phone: '(512) 825-2896',
    addressLines: Object.freeze(['207 Settlers Valley Drive, Suite C', 'Pflugerville, TX 78660']),
  }),
  logoPath: WAP_LOGO_PUBLIC_PATH,
});

/** Open confirmations, surfaced to reviewers and in docs/BILLING-PACKETS.md. */
export const LETTERHEAD_PENDING_CONFIRMATION = Object.freeze({
  phone: 'Billing footer phone (512) 825-2896 (DOCX) vs website (512) 777-1808: pending Mike Brown.',
  address: 'Footer address from providerIdentity.ts / price list; confirm it matches the WAP DOCX footer.',
});
