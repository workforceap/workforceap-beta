import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { withActiveMemberAIWrite } from '@/lib/ai/activeMemberWrite';
import { readJsonObjectBody } from '@/lib/api/readJsonBody';
import { prisma } from '@/lib/db/prisma';
import { assertPublicHttpUrl, UnsafeUrlError } from '@/lib/http/safeOutboundFetch';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { buildLinkedInEnrichmentInputSummary, findRecentLinkedInEnrichment } from './_linkedinEnrich';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';

export const POST = withApiGuc(async (req: NextRequest) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await readJsonObjectBody<{ linkedinUrl?: string }>(req);
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Strict URL validation: must be https, must be on a linkedin.com host
    // (or subdomain), no IP literals, no private addresses. The previous
    // `includes('linkedin.com')` check let `https://attacker.com/?x=linkedin.com`
    // through, and the value also gets persisted to Profile.profileLinkedin.
    const linkedinUrlRaw = body.linkedinUrl?.trim() ?? '';
    let linkedinUrl: string;
    try {
      const parsed = assertPublicHttpUrl(linkedinUrlRaw, {
        httpsOnly: true,
        allowHosts: ['linkedin.com'],
      });
      // Re-serialize to a canonical form (strips userinfo, etc.).
      linkedinUrl = parsed.toString();
    } catch (err) {
      if (err instanceof UnsafeUrlError) {
        return NextResponse.json({ error: 'Provide a valid LinkedIn profile URL' }, { status: 400 });
      }
      throw err;
    }
  
    // Save URL to profile regardless
    await withActiveMemberAIWrite(user.id, (tx) => tx.profile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, profileLinkedin: linkedinUrl },
      update: { profileLinkedin: linkedinUrl },
    }));
  
    // Proxycurl path — set PROXYCURL_API_KEY in Vercel secrets
    const proxycurlKey = process.env.PROXYCURL_API_KEY;
    if (proxycurlKey) {
      try {
        const recentResult = await prisma.$transaction((tx) =>
          findRecentLinkedInEnrichment(tx, user.id, linkedinUrl)
        );
        if (recentResult) {
          let skillCount = 0;
          try {
            const output = JSON.parse(recentResult.output) as { skills?: unknown[] };
            skillCount = output.skills?.length ?? 0;
          } catch {
            skillCount = 0;
          }

          auditLog({ actorUserId: user.id, action: 'member.linkedinEnrich.cached', targetType: 'LinkedInEnrichment', targetId: user.id }).catch(() => {});
          logAuditEvent({ user: { id: user.id, role: 'member' }, verb: 'update', object: { type: 'LinkedInEnrichment', id: user.id }, result: { success: true } }).catch(() => {});
          return NextResponse.json({
            success: true,
            source: 'cached',
            skillCount,
            message: 'Recent LinkedIn skills already saved. Your Skill Mapper profile will update on next view.',
          });
        }

        const res = await fetch(
          `https://nubela.co/proxycurl/api/v2/linkedin?url=${encodeURIComponent(linkedinUrl)}&skills=include&education=include`,
          { headers: { Authorization: `Bearer ${proxycurlKey}` }, next: { revalidate: 0 } }
        );
        if (!res.ok) throw new Error(`Proxycurl ${res.status}`);
  
        const profile = await res.json() as {
          skills?: Array<{ name: string }>;
          headline?: string;
          experiences?: Array<{ title: string; company: string; description?: string }>;
          education?: Array<{ degree_name?: string; field_of_study?: string }>;
          certifications?: Array<{ name: string }>;
        };
  
        // Extract skill text for our keyword extraction engine
        const skillText = [
          ...(profile.skills ?? []).map(s => s.name),
          profile.headline ?? '',
          ...(profile.experiences ?? []).map(e => `${e.title} ${e.company} ${e.description ?? ''}`),
          ...(profile.education ?? []).map(e => `${e.degree_name ?? ''} ${e.field_of_study ?? ''}`),
          ...(profile.certifications ?? []).map(c => c.name),
        ].join(' ');
  
        // Save as a skill_assessment result so /api/member/skill-profile picks it up
        await withActiveMemberAIWrite(user.id, (tx) => tx.aIToolResult.create({
          data: {
            userId: user.id,
            toolType: 'skill_assessment',
            inputSummary: buildLinkedInEnrichmentInputSummary(linkedinUrl),
            output: JSON.stringify({
              source: 'linkedin_enrichment',
              linkedinUrl,
              skillText,
              skills: profile.skills ?? [],
              headline: profile.headline,
              extractedAt: new Date().toISOString(),
            }),
          },
        }));
  
        auditLog({ actorUserId: user.id, action: 'member.linkedinEnrich.proxycurl', targetType: 'LinkedInEnrichment', targetId: user.id }).catch(() => {});
        logAuditEvent({ user: { id: user.id, role: 'member' }, verb: 'update', object: { type: 'LinkedInEnrichment', id: user.id }, result: { success: true } }).catch(() => {});
        return NextResponse.json({
          success: true,
          source: 'proxycurl',
          skillCount: profile.skills?.length ?? 0,
          message: 'LinkedIn skills saved. Your Skill Mapper profile will update on next view.',
        });
      } catch (e) {
        console.error('[linkedin-enrich] Proxycurl failed', e);
        return NextResponse.json({ error: 'Enrichment failed — check Proxycurl API key', source: 'proxycurl' }, { status: 502 });
      }
    }
  
    // No Proxycurl key — LinkedIn URL saved, enrichment skipped
    auditLog({ actorUserId: user.id, action: 'member.linkedinEnrich.manualUrl', targetType: 'LinkedInEnrichment', targetId: user.id }).catch(() => {});
    logAuditEvent({ user: { id: user.id, role: 'member' }, verb: 'update', object: { type: 'LinkedInEnrichment', id: user.id }, result: { success: true } }).catch(() => {});
    return NextResponse.json({
      success: true,
      source: 'manual_only',
      note: 'LinkedIn URL saved to your profile. To enable automatic skill extraction, add PROXYCURL_API_KEY to environment secrets.',
    });
  } catch (error) {
    console.error('/member/linkedin-enrich:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
