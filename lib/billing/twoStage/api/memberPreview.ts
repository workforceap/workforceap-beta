import 'server-only';

import { prisma } from '@/lib/db/prisma';
import { resolveAssignedCounselorContact } from '@/lib/billing/packetAccess';
import { canonicalizeProgramSlug, programSlugsEquivalent } from '@/lib/content/programSlug';
import { resolveActiveDashboardProgram } from '@/lib/member/resolveActiveDashboardProgram';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { AUTHORIZED_SIGNER, type BillingStage } from '../constants';
import type { J5Content, J6Content } from '../content';
import { classEndDate, isIsoDate } from '../dates';
import { renderBillingDocumentPreviewPdf, type BillingDocumentPreviewFacts } from '../documentPdf';
import { resolveProgramTerms } from '../hours';
import { WAP_BILLING_LETTERHEAD } from '../letterhead';
import type { TwoStageContext } from './access';
import { parseDraftPatch } from './draft';
import { envGates } from './gates';
import { apiError, NO_STORE_HEADERS, PDF_FRAME_HEADERS } from './http';
import { readLetterheadLogo } from './logo';

const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;
const date = (value: Date | string | null | undefined): string | null => {
  const raw = value instanceof Date ? value.toISOString().slice(0, 10) : value;
  return raw && isIsoDate(raw) ? raw : null;
};

/** Reads available information only. No readiness, enrollment, voucher, or signature is required. */
export async function buildMemberPreview<P>(ctx: TwoStageContext<P>, stage: BillingStage, body: unknown = {}): Promise<BillingDocumentPreviewFacts> {
  const patch = parseDraftPatch(stage, body);
  const selection = body && typeof body === 'object' ? body as { caseId?: unknown; programSlug?: unknown } : {};
  const url = new URL(ctx.request.url);
  const requestedCase = text(url.searchParams.get('caseId')) ?? text(selection.caseId);
  const requestedProgram = text(url.searchParams.get('programSlug')) ?? text(selection.programSlug);
  const [profile, counselor, logo] = await Promise.all([
    withTenantScope(ctx.member.organizationId, (db) => db.user.findFirst({
      where: { id: ctx.member.id, organizationId: ctx.member.organizationId, deletedAt: null },
      select: { enrolledProgram: true, courseEnrollments: { where: { organizationId: ctx.member.organizationId }, select: { id: true, programSlug: true, isPrimary: true, enrolledAt: true }, orderBy: { enrolledAt: 'asc' } } },
    })),
    resolveAssignedCounselorContact(ctx.member.id),
    readLetterheadLogo(),
  ]);
  const enrolled = resolveActiveDashboardProgram({ enrollments: profile?.courseEnrollments ?? [], legacyEnrolledProgram: profile?.enrolledProgram ?? null }).primaryProgramSlug;
  let selectedProgram = requestedProgram ?? enrolled;
  let saved: J5Content | J6Content | null = null;
  let start: string | null = null;
  let end: string | null = null;
  let voucher: string | null = null;
  let sourceNote = requestedProgram && (!enrolled || !programSlugsEquivalent(requestedProgram, enrolled))
    ? 'Program selected for preview; enrollment is not confirmed.'
    : enrolled ? profile?.courseEnrollments?.length ? 'Available member and enrollment details; missing values are placeholders.' : 'Legacy program on member profile; no enrollment record is confirmed.' : 'Available member details; no program enrollment is recorded.';

  // When the billing schema is not enabled, basic member previews still work.
  // Never touch unavailable billing tables or use another member's selected case.
  if (envGates().migration.enabled) {
    const billingCase = await prisma.billingCase.findFirst({
      where: { organizationId: ctx.member.organizationId, memberId: ctx.member.id,
        ...(requestedCase ? { id: requestedCase } : selectedProgram ? { programSlug: canonicalizeProgramSlug(selectedProgram) } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    if (requestedCase && !billingCase) throw apiError(404, 'CASE_NOT_FOUND', 'This item was not found.');
    if (billingCase && requestedProgram && !programSlugsEquivalent(billingCase.programSlug, requestedProgram)) {
      throw apiError(422, 'VALIDATION_FAILED', 'Choose the program belonging to this billing case.');
    }
    if (billingCase) {
      selectedProgram = billingCase.programSlug;
      const [records, attestations] = await Promise.all([
        prisma.billingStageRecord.findMany({ where: { organizationId: ctx.member.organizationId, caseId: billingCase.id, status: { in: ['draft', 'signed', 'sent'] } }, orderBy: { version: 'desc' }, take: 20, select: { stage: true, content: true, status: true } }),
        prisma.billingAttestation.findMany({ where: { organizationId: ctx.member.organizationId, caseId: billingCase.id }, orderBy: { attestedAt: 'desc' }, take: 50 }),
      ]);
      const source = records.find((r) => r.stage === stage && ['draft', 'signed', 'sent'].includes(r.status))
        ?? records.find((r) => r.stage === 'j5' && ['draft', 'signed', 'sent'].includes(r.status));
      const content = source?.content as unknown as J5Content | J6Content | undefined;
      saved = content?.kind === 'j5_quote_voucher_request' || content?.kind === 'j6_invoice_cover_letter' ? content : null;
      const started = attestations.find((a) => a.kind === 'class_started');
      const ready = attestations.find((a) => a.kind === 'j5_readiness');
      const actualStart = stage === 'j6' ? date(started?.classStartDate) : null;
      if (stage === 'j6' && saved?.kind !== 'j6_invoice_cover_letter' && actualStart) {
        // A J5 quote contains planned dates. Once training has started, a new
        // J6 preview uses the actual evidence instead of that earlier estimate.
        start = actualStart;
        end = date(started?.classEndDate) ?? classEndDate(actualStart);
      } else {
        start = date(saved?.training?.classStartDate) ?? actualStart ?? date(ready?.classStartDate);
        end = date(saved?.training?.classEndDate) ?? (actualStart && start === actualStart ? date(started?.classEndDate) : null) ?? (start ? classEndDate(start) : null);
      }
      voucher = saved?.kind === 'j6_invoice_cover_letter' ? text(saved.voucher?.reference) : text(attestations.find((a) => a.kind === 'voucher_board_signed')?.voucherReference);
      sourceNote = saved ? 'Available saved billing details; current editor fields override this preview only.' : 'Available case details; missing values are placeholders.';
    }
  } else if (requestedCase) {
    // The id cannot be authorized without its table. The member-only preview
    // remains available by omitting the optional case selector.
    throw apiError(404, 'CASE_NOT_FOUND', 'This billing case is unavailable. Preview the member without selecting a case.');
  }
  const terms = resolveProgramTerms(selectedProgram);
  const choose = (typed: string | undefined, stored: unknown, fallback?: unknown) => typed !== undefined ? text(typed) : text(stored) ?? text(fallback);
  const letterhead = WAP_BILLING_LETTERHEAD;
  return {
    stage, preparedAt: ctx.now.toISOString(),
    student: { name: choose(patch.student?.name, saved?.student?.name, ctx.member.fullName), email: choose(patch.student?.email, saved?.student?.email, ctx.member.email) },
    counselor: { name: choose(patch.counselor?.name, saved?.counselor?.name, counselor?.fullName), email: choose(patch.counselor?.email, saved?.counselor?.email, counselor?.email), phone: choose(patch.counselor?.phone, saved?.counselor?.phone) },
    finance: { name: choose(patch.finance?.name, saved?.kind === 'j6_invoice_cover_letter' ? saved.finance?.name : null), email: choose(patch.finance?.email, saved?.kind === 'j6_invoice_cover_letter' ? saved.finance?.email : null) },
    boardName: choose(patch.boardName, saved?.boardName),
    className: text(saved?.training?.className) ?? (terms.ok ? terms.className : null),
    classHours: saved?.training?.contactHours ?? (terms.ok ? terms.hours : null),
    classStartDate: start, classEndDate: end, voucherReference: voucher, sourceNote,
    signer: AUTHORIZED_SIGNER,
    letterhead: { logoPng: logo.bytes, organizationName: letterhead.headerLines[0], website: letterhead.footer.website, businessPhone: letterhead.footer.phone, addressLine1: letterhead.footer.addressLines[0], addressLine2: letterhead.footer.addressLines[1] },
  };
}

export async function memberDocumentPreview<P>(ctx: TwoStageContext<P>, stage: BillingStage, body: unknown = {}): Promise<Response> {
  const bytes = await renderBillingDocumentPreviewPdf(await buildMemberPreview(ctx, stage, body));
  return new Response(new Blob([new Uint8Array(bytes)]), { status: 200, headers: {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `${new URL(ctx.request.url).searchParams.get('download') === '1' ? 'attachment' : 'inline'}; filename="${stage.toUpperCase()}-PREVIEW.pdf"`,
    'X-Billing-Document-Mode': 'preview',
    ...PDF_FRAME_HEADERS, ...NO_STORE_HEADERS,
  } });
}
