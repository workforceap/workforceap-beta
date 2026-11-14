// @vitest-environment node
/**
 * The J6 prior quote is selected from the case snapshot (#2901): a signed or
 * sent system J5 counts (the quote may be delivered by hand). A draft, voided
 * or superseded J5 does not, and must not hide an issued version or an
 * attested external quote.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/tenant/withTenantScope', () => ({ withTenantScope: vi.fn() }));

import type { BillingAttestation } from '@prisma/client';
import { priorQuote, type RecordWithRelations } from '@/lib/billing/twoStage/api/caseData';
import type { J5Content } from '@/lib/billing/twoStage/content';

const CONTENT = { training: { classStartDate: '2026-09-30' } } as unknown as J5Content;

function j5(over: Partial<RecordWithRelations> & Pick<RecordWithRelations, 'id' | 'status' | 'version'>): RecordWithRelations {
  return {
    stage: 'j5',
    content: CONTENT,
    contentSha256: 'a'.repeat(64),
    ...over,
  } as RecordWithRelations;
}

function external(over: Partial<BillingAttestation> = {}): BillingAttestation {
  return {
    id: 'att-ext',
    kind: 'external_j5_reference',
    statement: 'manual quote',
    evidenceReference: 'email',
    classStartDate: null,
    classEndDate: null,
    artifactId: null,
    voucherReference: null,
    authorizedAmountCents: null,
    authorizedStartDate: null,
    authorizedEndDate: null,
    receivedOn: null,
    receivingSignaturePresent: null,
    externalReference: 'MANUAL-Q-17',
    externalQuoteDate: new Date('2026-08-01T00:00:00.000Z'),
    quotedProgramSlug: 'it-support-professional-certificate-ibm',
    quotedClassName: 'IT Support Professional Certificate (IBM)',
    authorizedProgramSlug: null,
    authorizedClassName: null,
    studentReadyConfirmed: null,
    counselorRequestedBy: null,
    counselorRequestedOn: null,
    counselorRequestReference: null,
    attestedBySubjectId: 'staff',
    attestedAt: new Date('2026-08-02T12:00:00.000Z'),
    ...over,
  } as BillingAttestation;
}

describe('priorQuote from the case snapshot', () => {
  it('treats a signed J5 the same as a sent J5, and ignores drafts, voids and superseded rows', () => {
    expect(priorQuote({ records: [], attestations: [] })).toBeNull();
    expect(priorQuote({ records: [j5({ id: 'j5-draft', status: 'draft', version: 1 })], attestations: [] })).toBeNull();
    expect(priorQuote({ records: [j5({ id: 'j5-void', status: 'voided', version: 1 })], attestations: [] })).toBeNull();
    expect(priorQuote({ records: [j5({ id: 'j5-old', status: 'superseded', version: 1 })], attestations: [] })).toBeNull();

    const signed = priorQuote({ records: [j5({ id: 'j5-signed', status: 'signed', version: 1 })], attestations: [] });
    expect(signed).toMatchObject({ source: 'system', j5: { recordId: 'j5-signed', status: 'signed' } });

    const sent = priorQuote({ records: [j5({ id: 'j5-sent', status: 'sent', version: 1 })], attestations: [] });
    expect(sent).toMatchObject({ source: 'system', j5: { recordId: 'j5-sent', status: 'sent' } });
  });

  it('keeps the issued system J5 over an external quote, even when a newer draft exists', () => {
    const issued = priorQuote({
      records: [
        j5({ id: 'j5-v2-draft', status: 'draft', version: 2 }),
        j5({ id: 'j5-v1-sent', status: 'sent', version: 1 }),
      ],
      attestations: [external()],
    });
    expect(issued).toMatchObject({ source: 'system', j5: { recordId: 'j5-v1-sent', status: 'sent' } });

    const signedNewest = priorQuote({
      records: [
        j5({ id: 'j5-v2-signed', status: 'signed', version: 2 }),
        j5({ id: 'j5-v1-sent', status: 'sent', version: 1 }),
      ],
      attestations: [external()],
    });
    expect(signedNewest).toMatchObject({ source: 'system', j5: { recordId: 'j5-v2-signed', status: 'signed' } });
  });

  it('falls back to the newest attested external quote only when no signed or sent J5 exists', () => {
    const quote = priorQuote({
      records: [j5({ id: 'j5-draft', status: 'draft', version: 1 })],
      attestations: [
        external({ id: 'att-old', attestedAt: new Date('2026-07-01T00:00:00.000Z') }),
        external({ id: 'att-new', attestedAt: new Date('2026-08-15T00:00:00.000Z'), externalReference: 'MANUAL-Q-22' }),
      ],
    });
    expect(quote).toMatchObject({
      source: 'external',
      attestation: { id: 'att-new', externalReference: 'MANUAL-Q-22' },
    });
  });
});
