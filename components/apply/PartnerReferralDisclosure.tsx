'use client';

import { useEffect, useState } from 'react';
import { readPersistedPartnerRef } from '@/lib/apply/applyReferralCapture';
import { normalizePartnerRef } from '@/lib/partner/sponsoredEnrollment';
import type { PartnerReferralDisclosure as Disclosure } from '@/lib/apply/partnerReferralDisclosureCore';
import styles from './PartnerReferralDisclosure.module.css';

/** Message templates with a `{partner}` placeholder, resolved on the server. */
export type PartnerDisclosureCopy = {
  label: string;
  restricted: string;
  full: string;
};

function partnerDisclosureText(copy: PartnerDisclosureCopy, disclosure: Disclosure): string {
  const template = disclosure.tier === 'restricted' ? copy.restricted : copy.full;
  return template.split('{partner}').join(disclosure.partnerName);
}

/**
 * "You were referred by {partner}. {partner} will be able to see …" — shown
 * wherever a valid partner ref is in play before signup.
 *
 * `initial` is resolved on the server from the page's ref (query or cookie).
 * The browser submits the ref it persisted (`readPersistedPartnerRef`), so
 * when that differs, the disclosure is re-resolved by the server
 * (`/api/apply/partner-disclosure`) — the partner name is never taken from
 * the client. Nothing renders for an unknown or inactive ref.
 *
 * `onShownRefChange` reports the ref actually disclosed so signup can record
 * the acknowledgement (`partnerDisclosureRef`).
 */
export default function PartnerReferralDisclosure({
  initial,
  copy,
  programSlug,
  reconcileWithPersistedRef = true,
  onShownRefChange,
  id,
}: {
  initial: Disclosure | null;
  copy: PartnerDisclosureCopy;
  programSlug?: string;
  /** Off on the /join landing page, whose ref is the page itself. */
  reconcileWithPersistedRef?: boolean;
  onShownRefChange?: (ref: string | null) => void;
  id?: string;
}) {
  const [disclosure, setDisclosure] = useState<Disclosure | null>(initial);

  useEffect(() => {
    if (!reconcileWithPersistedRef) return;
    // PartnerRefCapture persists ?ref= in an effect of its own; read after it.
    const persisted = normalizePartnerRef(readPersistedPartnerRef());
    if (!persisted || persisted === initial?.ref) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ ref: persisted });
    if (programSlug) params.set('program', programSlug);
    fetch(`/api/apply/partner-disclosure?${params.toString()}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { disclosure: null }))
      .then((body: { disclosure?: Disclosure | null }) => setDisclosure(body.disclosure ?? null))
      .catch(() => {
        if (!controller.signal.aborted) setDisclosure(null);
      });
    return () => controller.abort();
  }, [initial?.ref, programSlug, reconcileWithPersistedRef]);

  useEffect(() => {
    onShownRefChange?.(disclosure?.ref ?? null);
  }, [disclosure?.ref, onShownRefChange]);

  if (!disclosure) return null;
  return (
    <div className={styles.disclosure} role="note" id={id} data-partner-disclosure={disclosure.tier}>
      <span className={styles.label}>{copy.label}</span>
      <p className={styles.body}>{partnerDisclosureText(copy, disclosure)}</p>
    </div>
  );
}
