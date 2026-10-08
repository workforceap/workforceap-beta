import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getUser } from '@/lib/auth/server';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { resolveAdminPageTenant } from '@/lib/tenant/adminPageScope';
import {
  renderJ5QuoteVoucherRequestDraftPdf,
  renderJ6InvoiceVoucherCoverLetterDraftPdf,
} from '@/lib/billing/twoStage/documentPdf';
import { json, NO_STORE_HEADERS, unexpectedErrorResponse } from '@/lib/billing/twoStage/api/http';
import { WAP_LOGO_PUBLIC_PATH } from '@/lib/billing/twoStage/letterhead';
import { getMockBillingDocumentFacts } from '@/lib/billing/twoStage/mockPreview';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Authenticated, static mock only. Never reads a member or real billing case. */
async function _GET(_request: Request, { params }: { params: Promise<{ stage: string }> }): Promise<Response> {
  try {
    const user = await getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const scope = await resolveAdminPageTenant(user.id);
    if (!scope.ok) return json({ error: 'Forbidden' }, 403);

    const { stage } = await params;
    if (stage !== 'j5' && stage !== 'j6') return json({ error: 'Unknown mock billing stage' }, 404);

    const logoPng = new Uint8Array(await readFile(join(process.cwd(), WAP_LOGO_PUBLIC_PATH)));
    const facts = getMockBillingDocumentFacts(stage, logoPng);
    const pdf = facts.stage === 'j5'
      ? await renderJ5QuoteVoucherRequestDraftPdf(facts)
      : await renderJ6InvoiceVoucherCoverLetterDraftPdf(facts);
    return new Response(new Uint8Array(pdf), {
      headers: {
        ...NO_STORE_HEADERS,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="mock-${stage}-unsigned.pdf"`,
      },
    });
  } catch (error) {
    return unexpectedErrorResponse('mock preview GET', error, null);
  }
}

export const GET = withApiGuc(_GET);
