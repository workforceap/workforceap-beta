/**
 * Legal identity of the training provider printed on the J5 invoice and J6
 * cover letter letterhead. Mirrors the official price list
 * (marketing/src/pages/programs/price-list.astro). Every value can be
 * overridden with a BILLING_* environment variable so a tenant or a moved
 * office never needs a code change.
 */
export type TrainingProviderIdentity = {
  legalName: string;
  shortName: string;
  addressLines: string[];
  phone: string;
  email: string;
  website: string;
  ein: string;
  entityLine: string;
};

/** Prefilled signer. The signature block and email reply-to use BILLING_PROVIDER_EMAIL (see ENV-VARIABLES.md). */
export type DefaultSigner = { name: string; title: string };

function env(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

export function getTrainingProviderIdentity(): TrainingProviderIdentity {
  const address = env('BILLING_PROVIDER_ADDRESS', '207 Settlers Valley Drive, Suite C | Pflugerville, TX 78660');
  return {
    legalName: env('BILLING_PROVIDER_LEGAL_NAME', 'Workforce Advancement Project'),
    shortName: env('BILLING_PROVIDER_SHORT_NAME', 'WorkforceAP'),
    addressLines: address.split('|').map((line) => line.trim()).filter(Boolean),
    phone: env('BILLING_PROVIDER_PHONE', '512-825-2896'),
    email: env('BILLING_PROVIDER_EMAIL', 'michael.brown@workforceap.org'),
    website: env('BILLING_PROVIDER_WEBSITE', 'www.workforceap.org'),
    ein: env('BILLING_PROVIDER_EIN', '41-2612389'),
    entityLine: env('BILLING_PROVIDER_ENTITY_LINE', '501(c)(3) nonprofit training provider'),
  };
}

export function getDefaultSigner(): DefaultSigner {
  return {
    name: env('BILLING_SIGNER_NAME', 'Michael A. Brown, PMP, ChE'),
    title: env('BILLING_SIGNER_TITLE', 'Executive Director'),
  };
}

/** Invoice-number prefix, e.g. WAP-2026-0007. */
export function getPacketNumberPrefix(): string {
  return env('BILLING_PACKET_PREFIX', 'WAP').replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'WAP';
}

/** Default "Bill to" when the org has not told us which board funds the seat. */
export function getDefaultBillTo(): { name: string; attention: string; address: string } {
  return {
    name: env('BILLING_DEFAULT_BILL_TO_NAME', 'Workforce Solutions Capital Area'),
    attention: env('BILLING_DEFAULT_BILL_TO_ATTENTION', 'Accounts Payable / Training Services'),
    address: env('BILLING_DEFAULT_BILL_TO_ADDRESS', ''),
  };
}
