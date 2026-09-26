import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { loadPacketForViewer } from '@/lib/billing/packetAccess';
import { packetToDocumentInput } from '@/lib/billing/packetDocument';
import { packetDocumentFilename, parsePacketDownloadKind, renderPacketDocument } from '@/lib/billing/packetPdf';
import { SignedSnapshotCorruptError } from '@/lib/billing/packetSnapshot';
import { checkBillingProviderOrg } from '@/lib/billing/providerOrg';

/**
 * Render a packet document on demand: ?doc=j5 (invoice), ?doc=j6 (cover
 * letter), or ?doc=both (cover letter and invoice merged into one file).
 * Open to the org admin, the member's assigned counselor and the member, for
 * packets of the billing provider organization only.
 * Inline by default; ?download=1 forces a save dialog, and the merged packet
 * downloads by default since it exists to be saved or printed as a set.
 */
export const GET = withApiGuc(async (request: Request, { params }: { params: Promise<{ packetId: string }> }) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { packetId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(packetId)) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

    const url = new URL(request.url);
    const kind = parsePacketDownloadKind(url.searchParams.get('doc'));
    const downloadParam = url.searchParams.get('download');
    const download = downloadParam === '1' || (kind === 'both' && downloadParam !== '0');

    const loaded = await loadPacketForViewer(packetId, user.id);
    if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status });

    const { packet, member } = loaded.value;
    const orgCheck = checkBillingProviderOrg(packet.organizationId);
    if (!orgCheck.ok) return NextResponse.json({ error: orgCheck.error }, { status: orgCheck.status });
    let bytes: Uint8Array;
    try {
      // A signed snapshot renders only from itself; a corrupt one is refused, never re-rendered from live data.
      bytes = await renderPacketDocument(kind, await packetToDocumentInput(packet, member));
    } catch (err) {
      if (err instanceof SignedSnapshotCorruptError) return NextResponse.json({ error: err.message, code: 'snapshot_corrupt' }, { status: 409 });
      throw err;
    }
    const filename = packetDocumentFilename(kind, packet.packetNumber, member.fullName);
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('[billing-packets pdf]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
