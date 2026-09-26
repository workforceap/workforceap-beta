import { NextRequest, NextResponse } from 'next/server';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import { getUser } from '@/lib/auth/server';
import { getPartnerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import {
  countPartnerReferrals,
  loadPartnerReferralBundle,
  toPartnerMembersListRows,
} from '@/lib/partner/referralBundle';
import { buildPartnerOutcomePacket, partnerOutcomePacketCsv } from '@/lib/partner/outcomePacket';

import { withApiGuc } from '@/lib/db/withRequestGuc';
// Shared escaper (P02): quotes like before and also neutralizes a leading
// = + - @ TAB or CR, so a member-, employer- or partner-typed value is text,
// not a live formula, when the partner opens the file in Excel/Sheets.
import { csvEscape } from '@/lib/csv';

/**
 * A '#' branding line value, kept on one line and formula-safe. A CR/LF could
 * start an unescaped data row. A ',' (or ';', Excel's list separator in some
 * locales) starts a new cell, so a formula trigger after it gets the same
 * leading ' as csvEscape gives a data cell; other text is unchanged.
 */
function brandingValue(value: string): string {
  return value
    .replace(/[\r\n]+/g, ' ')
    .replace(/([,;])(?=[\s"]*[=+\-@\t])/g, "$1'");
}

export const GET = withApiGuc(async (request: NextRequest) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
    const ctx = await getPartnerForUser(user.id);
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  
    const preset = request.nextUrl.searchParams.get('preset');
  
    try {
    if (preset === 'packet') {
      // Outcome packet (V12): the same builder the /partner/exports summary
      // renders, plus the uncapped referral count so a capped load is disclosed.
      const [{ pipelineMembers: packetMembers }, totalReferrals] = await Promise.all([
        loadPartnerReferralBundle(ctx.partnerId, ctx.partner.organizationId),
        countPartnerReferrals(ctx.partnerId, ctx.partner.organizationId),
      ]);
      const packet = buildPartnerOutcomePacket({
        pipelineMembers: packetMembers,
        totalReferrals,
        partnerName: ctx.partner.name,
        generatedAt: new Date(),
      });
      const auditMeta = { preset: 'packet', rows: packet.loadedReferrals, totalReferrals: packet.totalReferrals };
      auditLog({ actorUserId: user.id, action: 'partner_referrals_export', targetType: 'Partner', targetId: ctx.partnerId, metadata: auditMeta }).catch(() => {});
      logAuditEvent({ user: { id: user.id, role: 'partner' }, verb: 'exported', object: { type: 'PartnerReferralExport', id: ctx.partnerId }, result: { success: true, extensions: auditMeta } }).catch(() => {});
      return new NextResponse(partnerOutcomePacketCsv(packet), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="workforceap-outcome-packet-${ctx.partner.slug}.csv"`,
          // Member names: never kept by a browser, proxy or CDN cache.
          'Cache-Control': 'no-store',
        },
      });
    }

    const { pipelineMembers } = await loadPartnerReferralBundle(ctx.partnerId, ctx.partner.organizationId);
    const rows = toPartnerMembersListRows(pipelineMembers);
  
    const emails = await prisma.$transaction((tx) => tx.user.findMany({
      where: {
        id: { in: pipelineMembers.map((p) => p.member.id) },
        organizationId: ctx.partner.organizationId,
      },
      select: { id: true, email: true },
    }));
    const emailById = new Map(emails.map((e) => [e.id, e.email]));
  
    const baseHeaders = [
      'Member name',
      'Email',
      'Stage',
      'Program',
      'Progress pct',
      'Story',
      'Referred date',
    ];
  
    const outcomesHeaders = [...baseHeaders, 'Placed employer', 'Job title', 'Placed date'];
    // WAP-171: privacy policy §3.3 — a referring partner sees enrollment
    // status, progress and outcomes. Ethnicity and veteran status are §1.2
    // eligibility/demographic data and are not exported to partners.
    const demographicsHeaders = [
      ...baseHeaders,
      'City',
      'State',
      'ZIP',
      'Employment status',
      'Education level',
      'Placed employer',
      'Job title',
      'Placed date',
      'Onboarding window end',
      'Retention decision',
    ];
  
    const headers =
      preset === 'outcomes' ? outcomesHeaders : preset === 'demographics' ? demographicsHeaders : baseHeaders;
  
    const lines = [
      headers.join(','),
      ...pipelineMembers.map((p, i) => {
        const r = rows[i];
        const pr = p.member.placementRecord;
        const base = [
          csvEscape(r.fullName),
          csvEscape(emailById.get(r.id) ?? ''),
          csvEscape(r.stageLabel),
          csvEscape(r.programTitle),
          String(r.progress),
          csvEscape(r.story),
          csvEscape(r.referredAtLabel),
        ];
        // Only staff-verified placements are reported as outcomes — an
        // employer-side "hired" status alone hasn't been confirmed yet.
        const verifiedPlacement = pr?.startDateVerified ? pr : null;
        if (preset === 'outcomes') {
          base.push(
            csvEscape(verifiedPlacement?.employerName ?? ''),
            csvEscape(verifiedPlacement?.jobTitle ?? ''),
            verifiedPlacement?.placedAt ? csvEscape(verifiedPlacement.placedAt.toISOString()) : ''
          );
        }
        if (preset === 'demographics') {
          const prof = p.member.profile;
          base.push(
            csvEscape(prof?.city ?? ''),
            csvEscape(prof?.state ?? ''),
            csvEscape(prof?.zip ?? ''),
            csvEscape(prof?.employmentStatus ?? ''),
            csvEscape(prof?.educationLevel ?? ''),
            csvEscape(verifiedPlacement?.employerName ?? ''),
            csvEscape(verifiedPlacement?.jobTitle ?? ''),
            verifiedPlacement?.placedAt ? csvEscape(verifiedPlacement.placedAt.toISOString()) : '',
            verifiedPlacement?.onboardingWindowEnd ? csvEscape(verifiedPlacement.onboardingWindowEnd.toISOString()) : '',
            csvEscape(verifiedPlacement?.retentionDecision ?? '')
          );
        }
        return base.join(',');
      }),
    ];
  
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const brandingLines = [
      `# Workforce Advancement Project — Partner ${
        preset === 'outcomes' ? 'Outcomes' : preset === 'demographics' ? 'Demographics' : 'Referrals'
      } Export`,
      `# Partner: ${brandingValue(ctx.partner.name)}`,
    ];
    if (ctx.partner.logoUrl) brandingLines.push(`# Logo: ${brandingValue(ctx.partner.logoUrl)}`);
    brandingLines.push(
      `# Generated: ${date}`,
      '# Powered by WorkforceAP — workforceap.org',
      '#',
    );
    const brandingHeader = brandingLines.join('\r\n');
    const csv = `${brandingHeader}\r\n${lines.join('\r\n')}`;
    const suffix = preset === 'outcomes' ? 'outcomes' : preset === 'demographics' ? 'demographics' : 'referrals';
  
    auditLog({ actorUserId: user.id, action: 'partner_referrals_export', targetType: 'Partner', targetId: ctx.partnerId, metadata: { preset: preset ?? 'referrals', rows: pipelineMembers.length } }).catch(() => {});
    logAuditEvent({ user: { id: user.id, role: 'partner' }, verb: 'exported', object: { type: 'PartnerReferralExport', id: ctx.partnerId }, result: { success: true, extensions: { preset: preset ?? 'referrals', rows: pipelineMembers.length } } }).catch(() => {});
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="workforceap-${suffix}-${ctx.partner.slug}.csv"`,
        // Member PII: never kept by a browser, proxy or CDN cache.
        'Cache-Control': 'no-store',
      },
    });
    } catch (err) {
      console.error('[partner/export/referrals] error:', err);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  } catch (error) {
    console.error('/partner/export/referrals:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
