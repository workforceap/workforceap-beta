/**
 * Compile-time proof that every route handler returns exactly the shared DTO
 * from lib/billing/twoStage/dto.ts (tsc --noEmit fails on drift). Type-only
 * imports: nothing server-side loads at runtime.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type * as Documents from './documents';
import type * as Draft from './draft';
import type * as Evidence from './evidence';
import type * as Actions from './stageActions';
import type * as Dto from '../dto';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Returns<F extends (...args: never[]) => unknown> = Awaited<ReturnType<F>>;

type Checks = [
  Equal<Returns<typeof Documents.listCases>, Dto.ListCasesDto>,
  Equal<Returns<typeof Documents.openCase>, Dto.OpenCaseDto>,
  Equal<Returns<typeof Documents.caseSummary>, Dto.CaseSummaryDto>,
  Equal<Returns<typeof Documents.freeze>, Dto.FreezeDto>,
  Equal<Returns<typeof Documents.payment>, Dto.PaymentDto>,
  Equal<Returns<typeof Documents.paymentReceived>, Dto.PaymentDto>,
  Equal<Returns<typeof Draft.reviewDraft>, Dto.DraftReviewDto>,
  Equal<Returns<typeof Draft.saveDraft>['body'], Dto.DraftSaveDto>,
  Equal<Returns<typeof Evidence.attestJ5Readiness>, Dto.AttestationDto>,
  Equal<Returns<typeof Evidence.attestClassStarted>, Dto.ClassStartedDto>,
  Equal<Returns<typeof Evidence.attestExternalQuote>, Dto.ExternalQuoteDto>,
  Equal<Returns<typeof Evidence.uploadVoucher>, Dto.VoucherUploadDto>,
  Equal<Returns<typeof Evidence.attestVoucher>, Omit<Dto.VoucherUploadDto, 'reused'>>,
  Equal<Returns<typeof Evidence.uploadBoardInvoice>, Dto.BoardInvoiceUploadDto>,
  Equal<Returns<typeof Evidence.attestReceiptSignature>, Dto.VoucherReceiptAttestationDto>,
  Equal<Returns<typeof Evidence.receiptStatementFor>, Dto.VoucherReceiptStatementDto>,
  Equal<Returns<typeof Actions.signStage>, Dto.SignDto>,
  Equal<Returns<typeof Actions.sendStage>, Dto.SendDto>,
  Equal<Returns<typeof Actions.reconcile>, Dto.ReconcileDto>,
  Equal<Returns<typeof Actions.closeVersion>, Dto.CloseDto>,
  Equal<Returns<typeof Actions.cancelPartialSend>, Dto.CancelSendDto>,
];
const allTrue: Checks = [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true];

describe('two-stage route DTO binding', () => {
  it('every route handler returns exactly its shared DTO (checked by tsc)', () => {
    assert.equal(allTrue.length, 21);
  });
});
