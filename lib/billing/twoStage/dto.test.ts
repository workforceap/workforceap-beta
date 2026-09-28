import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BLOCKER_CODES,
  DRAFT_FIELDS,
  ERROR_CODES,
  GATE_CODES,
  GATE_NAMES,
  J5_READINESS_KEYS,
  J6_READINESS_KEYS,
  type CaseSummaryDto,
  type DraftPatch,
  type J5DraftInput,
  type ReadinessKey,
  type TwoStageBillingReadiness,
} from './dto';
import type { CaseProgress } from './stateMachine';

// ---- compile-time checks (tsc --noEmit fails if these drift) ---------------

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
function assertType<T extends true>(): T | undefined {
  return undefined;
}

/** #2706 (2717102c) TwoStageBillingWorkbench ReadinessKey, copied verbatim. */
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
// A partial draft may omit any field, including nested ones.
const emptyPatch: DraftPatch<'j5'> = {};
const nestedPatch: DraftPatch<'j6'> = { counselor: { phone: '(555) 010-0201' }, boardInvoiceArtifactId: null };
const fullJ5: J5DraftInput = { boardName: 'B', student: { name: 'S', email: 's@example.test' }, counselor: { name: 'C', email: 'c@example.test', phone: '1' } };
const fullAsPatch: DraftPatch<'j5'> = fullJ5;

describe('two-stage DTO module', () => {
  it('exports only frozen-shape constant lists at runtime (types erase to nothing)', async () => {
    const mod: Record<string, unknown> = await import('./dto');
    for (const [name, value] of Object.entries(mod)) {
      assert.ok(Array.isArray(value) && value.every((v) => typeof v === 'string'), `${name} is not a string list`);
    }
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
