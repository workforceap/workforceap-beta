import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BLOCKER_CODES,
  DESIGNATED_SIGNER_READINESS,
  DESIGNATED_SIGNER_STEPS,
  DRAFT_FIELDS,
  ERROR_CODES,
  GATE_CODES,
  GATE_NAMES,
  J5_READINESS_KEYS,
  J6_READINESS_KEYS,
  type Blocker,
  type CaseSummaryDto,
  type DesignatedSignerStep,
  type DraftPatch,
  type J5DraftInput,
  type J6ReadinessKey,
  type ReadinessKey,
  type TwoStageBillingReadiness,
} from './dto';
import type { CaseProgress } from './stateMachine';

// ---- compile-time checks (tsc --noEmit fails if these drift) ---------------

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
function assertType<T extends true>(): T | undefined {
  return undefined;
}

/**
 * Mirror of #2706 `ReadinessKey`, copied verbatim from
 * app/admin/members/[id]/billing/TwoStageBillingWorkbench.tsx:5-18 at
 * 2717102c7a116ff9cd3fade3fa3d13cecc6e67ea (`TwoStageBillingReadiness` is :21).
 * #2706 is a separate unmerged branch, so this test cannot import it: the pin
 * proves dto.ts equals that snapshot, not the live #2706 file. When #2706
 * lands, replace this copy with an import of its type (or have #2706 import
 * `ReadinessKey` from dto.ts) and re-check against the merged head.
 */
type Workbench2706ReadinessKey =
  | 'studentApprovedAndReady'
  | 'counselorRequestedQuote'
  | 'boardConfirmed'
  | 'counselorContactVerified'
  | 'studentEmailVerified'
  | 'programAndClassDatesConfirmed'
  | 'priorQuoteVerified'
  | 'voucherReferenceAndReceivedDateVerified'
  | 'originalVoucherHashVerified'
  | 'michaelReceivingSignatureAttested'
  | 'voucherTermsVerified'
  | 'classStarted'
  | 'financeContactVerified';

assertType<Equal<ReadinessKey, Workbench2706ReadinessKey>>();
assertType<Equal<TwoStageBillingReadiness, Partial<Record<Workbench2706ReadinessKey, boolean>>>>();
assertType<Equal<CaseSummaryDto['readiness'], TwoStageBillingReadiness>>();
// The summary re-exports M1's progress type rather than redefining it.
assertType<Equal<CaseSummaryDto['progress'], CaseProgress>>();
assertType<Equal<keyof CaseSummaryDto['gates'], (typeof GATE_NAMES)[number]>>();
// What waits on the designated signer is typed from the same step list and J6 readiness keys.
assertType<Equal<CaseSummaryDto['waitingOnDesignatedSigner'][number]['step'], DesignatedSignerStep>>();
assertType<Equal<keyof CaseSummaryDto['readinessWaitingOn'], keyof typeof DESIGNATED_SIGNER_READINESS>>();
assertType<Equal<Extract<keyof typeof DESIGNATED_SIGNER_READINESS, J6ReadinessKey>, keyof typeof DESIGNATED_SIGNER_READINESS>>();
assertType<Equal<Blocker['waitingOn'], 'designated_signer' | undefined>>();
// A partial draft may omit any field, including nested ones.
const emptyPatch: DraftPatch<'j5'> = {};
const nestedPatch: DraftPatch<'j6'> = { counselor: { phone: '(555) 010-0201' }, boardInvoiceArtifactId: null };
const fullJ5: J5DraftInput = { boardName: 'B', student: { name: 'S', email: 's@example.test' }, counselor: { name: 'C', email: 'c@example.test', phone: '1' } };
const fullAsPatch: DraftPatch<'j5'> = fullJ5;

describe('two-stage DTO module', () => {
  it('exports only constant string lists and string maps at runtime (types erase to nothing)', async () => {
    const mod: Record<string, unknown> = await import('./dto');
    for (const [name, value] of Object.entries(mod)) {
      const strings = Array.isArray(value) ? value : value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype ? Object.values(value) : null;
      assert.ok(strings !== null && strings.every((v) => typeof v === 'string'), `${name} is not a string list or string map`);
    }
  });

  it('designated-signer readiness keys are J6 readiness keys, each mapped to a designated-signer step', () => {
    for (const [key, step] of Object.entries(DESIGNATED_SIGNER_READINESS)) {
      assert.ok((J6_READINESS_KEYS as readonly string[]).includes(key), key);
      assert.ok((DESIGNATED_SIGNER_STEPS as readonly string[]).includes(step), step);
    }
    assert.equal(DESIGNATED_SIGNER_READINESS.michaelReceivingSignatureAttested, 'voucher_receipt_signature');
    // The file hash is staff-verifiable (server sha256 of the upload); it never waits on the signer.
    assert.ok(!('originalVoucherHashVerified' in DESIGNATED_SIGNER_READINESS));
  });

  it('readiness keys equal #2706 and split into the two stage cards', () => {
    const all = new Set<string>([...J5_READINESS_KEYS, ...J6_READINESS_KEYS]);
    assert.equal(all.size, 13);
    assert.equal(new Set(J5_READINESS_KEYS).size, J5_READINESS_KEYS.length);
    assert.equal(new Set(J6_READINESS_KEYS).size, J6_READINESS_KEYS.length);
    assert.ok(J6_READINESS_KEYS.includes('michaelReceivingSignatureAttested'));
  });

  it('code lists have no duplicates and gates are blockers and errors', () => {
    for (const list of [BLOCKER_CODES, ERROR_CODES, GATE_CODES, DRAFT_FIELDS]) assert.equal(new Set<string>(list).size, list.length);
    for (const gate of GATE_CODES) {
      assert.ok((BLOCKER_CODES as readonly string[]).includes(gate), gate);
      assert.ok((ERROR_CODES as readonly string[]).includes(gate), gate);
    }
    assert.ok(emptyPatch && nestedPatch && fullAsPatch);
  });
});
