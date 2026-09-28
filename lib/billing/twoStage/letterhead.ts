/**
 * WAP billing letterhead for the two-stage documents, from the blank WAP DOCX
 * as described by Mike Brown (2026-09-27): gold-globe/red-arrow logo, the
 * three header lines, and a footer with the billing phone and the
 * Pflugerville address. Replaces the old renderer's magenta band for these
 * documents only.
 *
 * One place for the footer. It is deliberately a code constant, not an env
 * override, so it can only change through review, and each signed document
 * freezes the values it was signed with. The footer facts are exactly those on
 * the blank WAP letterhead, confirmed by Mike Brown (2026-09-28):
 * www.WorkforceAP.org, the display phone (512) 825-2896 (with the space, as
 * printed; Mike Brown 2026-09-28) and 207 Settlers Valley Suite C,
 * Pflugerville, TX 78660. The database checks a
 * signed document's frozen footer against the same values
 * (public.billing_letterhead_footer()).
 */
export const WAP_LOGO_PUBLIC_PATH = 'public/images/wap_logo.png';

export type BillingLetterhead = {
  readonly headerLines: readonly [string, string, string];
  readonly footer: { readonly website: string; readonly phone: string; readonly address: string; readonly addressLines: readonly string[] };
  readonly logoPath: string;
};

export const WAP_BILLING_LETTERHEAD: BillingLetterhead = Object.freeze({
  headerLines: Object.freeze(['Workforce Advancement Project', 'Empowering People. Advancing Futures', 'www.WorkforceAP.org']) as readonly [
    string,
    string,
    string,
  ],
  footer: Object.freeze({
    website: 'www.WorkforceAP.org',
    phone: '(512) 825-2896',
    address: '207 Settlers Valley Suite C, Pflugerville, TX 78660',
    /** The same address on two printed lines (joined with ', ' it is exactly `address`). */
    addressLines: Object.freeze(['207 Settlers Valley Suite C', 'Pflugerville, TX 78660']),
  }),
  logoPath: WAP_LOGO_PUBLIC_PATH,
});

/** No open letterhead confirmations remain (kept for compatibility). */
export const LETTERHEAD_PENDING_CONFIRMATION = Object.freeze({});

/**
 * Retired gate (kept for compatibility): the footer facts are confirmed, so
 * the letterhead no longer blocks external sends. Sign and send stay closed on
 * the remaining gates: the designated signer principal, the approved signature
 * representation, the voucher receipt-signature attestation, and the
 * release/acceptance gates.
 */
export const LETTERHEAD_UNCONFIRMED_ERROR = 'The billing letterhead footer is not confirmed yet, so no J5/J6 can be sent outside WorkforceAP.';

/** @deprecated Always ok: the letterhead footer is confirmed. */
export function letterheadConfirmedForExternalSend(_env: Record<string, string | undefined> = process.env): { ok: true } | { ok: false; error: string } {
  return { ok: true };
}
