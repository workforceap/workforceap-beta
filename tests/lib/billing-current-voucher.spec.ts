// @vitest-environment node
/**
 * currentVoucher() treats a later data-entry attestation as a current-voucher
 * event. Attesting a superseded file would therefore rewind the case onto the
 * older PDF; the data-entry route must refuse that write.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/tenant/withTenantScope', () => ({ withTenantScope: vi.fn() }));

import type { BillingArtifact, BillingAttestation } from '@prisma/client';
import { currentVoucher } from '@/lib/billing/twoStage/api/caseData';

function voucher(over: Pick<BillingArtifact, 'id' | 'createdAt'> & Partial<BillingArtifact>): BillingArtifact {
  return {
    organizationId: 'org',
    caseId: 'case',
    kind: 'board_signed_voucher',
    source: 'uploaded',
    fileName: `${over.id}.pdf`,
    mimeType: 'application/pdf',
    byteLength: 10,
    sha256: over.id.padEnd(64, '0'),
    storageBucket: 'billing-finance',
    storageKey: over.id,
    stageRecordId: null,
    stage: null,
    stageVersion: null,
    renderedContentSha256: null,
    createdBySubjectId: 'admin',
    ...over,
  } as BillingArtifact;
}

function dataEntry(over: Pick<BillingAttestation, 'id' | 'artifactId' | 'attestedAt'>): BillingAttestation {
  return {
    organizationId: 'org',
    caseId: 'case',
    kind: 'voucher_board_signed',
    statement: 's',
    evidenceReference: 'e',
    classStartDate: null,
    classEndDate: null,
    voucherReference: 'PO-OLD',
    authorizedAmountCents: 750000,
    authorizedStartDate: null,
    authorizedEndDate: null,
    receivedOn: null,
    receivingSignaturePresent: true,
    externalReference: null,
    externalQuoteDate: null,
    quotedProgramSlug: null,
    quotedClassName: null,
    authorizedProgramSlug: null,
    authorizedClassName: null,
    studentReadyConfirmed: null,
    counselorRequestedBy: null,
    counselorRequestedOn: null,
    counselorRequestReference: null,
    attestedBySubjectId: 'signer',
    ...over,
  } as BillingAttestation;
}

describe('currentVoucher', () => {
  it('selects the newest upload until a later data-entry attestation names an older file', () => {
    const v1 = voucher({ id: 'v1', createdAt: new Date('2026-09-29T15:00:00Z') });
    const v2 = voucher({ id: 'v2', createdAt: new Date('2026-09-30T15:00:00Z') });
    expect(currentVoucher({ artifacts: [v1, v2], attestations: [] })?.artifact.id).toBe('v2');

    const rewind = dataEntry({
      id: 'att-old',
      artifactId: 'v1',
      attestedAt: new Date('2026-09-30T16:00:00Z'),
    });
    expect(currentVoucher({ artifacts: [v1, v2], attestations: [rewind] })?.artifact.id).toBe('v1');
  });
});
