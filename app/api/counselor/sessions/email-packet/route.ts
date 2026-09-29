import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { getSubjectOrganizationId } from "@/lib/tenant/organization";
import { brandedEmailLayout } from '@/lib/email/template';
import { sanitizeEmailSubjectLine } from '@/lib/email/escapeHtml';
import { getResend } from '@/lib/email';
import { sendBrandedEmailOrThrowOnSkip } from '@/lib/email/send';
import { SESSION_PACKET_PORTAL_PATH, sessionPacketHtml, type SessionPacketSection } from '@/emails/session-packet';
import { resolveActOnBehalf } from '@/lib/auth/actAsSubject';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { withApiGuc } from '@/lib/db/withRequestGuc';

/**
 * Track A - Tenant Isolation Hardening (Sprint A.2 batch 5).
 * See `docs/PROGRAM-ENTERPRISE-GRADE.md` and `docs/TENANT-ISOLATION.md`.
 *
 * Member existence + email lookup goes through `withTenantScope` so an
 * Org A counselor cannot resolve an Org B member's email by guessing
 * the UUID. `MemberEvent`, `AIToolResult`, `ReadinessChecklist`, and
 * `Profile` all inherit tenancy via FK to `User` - they stay on the raw
 * client; the membership gate above keeps cross-tenant writes/reads
 * impossible.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.workforceap.org';

function getFrom(): string {
  return process.env.EMAIL_FROM || 'WorkforceAP <hello@workforceap.org>';
}

const bodySchema = z.object({
  memberId: z.string().uuid(),
  sessionId: z.string().uuid(),
});

// PDF Generation Helpers
const ACCENT = rgb(173 / 255, 44 / 255, 77 / 255); // #ad2c4d
const DARK_TEXT = rgb(0.13, 0.13, 0.13);
const MUTED = rgb(0.52, 0.52, 0.52);
const RULE = rgb(0.87, 0.87, 0.87);

const HEADER_H = 56;
const FOOTER_H = 20;
const MARGIN = 50;
const PAGE_W = 612;
const PAGE_H = 792;

async function generatePdfBuffer(title: string, text: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let logo: Awaited<ReturnType<typeof PDFDocument.prototype.embedPng>> | null = null;
  try {
    const logoPath = join(process.cwd(), 'public', 'images', 'wap_logo.png');
    const logoBytes = await readFile(logoPath);
    logo = await pdfDoc.embedPng(logoBytes);
  } catch { /* skip */ }

  const drawHeader = (page: ReturnType<PDFDocument['getPage']>) => {
    page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: HEADER_H, color: ACCENT });
    if (logo) {
      const logoNative = logo.scale(1);
      const logoH = HEADER_H - 14;
      const logoW = (logoNative.width / logoNative.height) * logoH;
      page.drawImage(logo, { x: MARGIN - 4, y: PAGE_H - HEADER_H + (HEADER_H - logoH) / 2, width: logoW, height: logoH });
      const urlText = 'workforceap.org';
      const urlW = font.widthOfTextAtSize(urlText, 8);
      page.drawText(urlText, { x: PAGE_W - MARGIN - urlW + MARGIN - 4, y: PAGE_H - HEADER_H / 2 - 4, font, size: 8, color: rgb(1, 0.88, 0.9) });
    } else {
      const cx = 26;
      const cy = PAGE_H - HEADER_H / 2;
      page.drawCircle({ x: cx, y: cy, size: 14, color: rgb(1, 1, 1) });
      page.drawText('WorkforceAP', { x: 48, y: cy + 5, font: boldFont, size: 13, color: rgb(1, 1, 1) });
    }
  };

  const drawFooter = (page: ReturnType<PDFDocument['getPage']>, pageNum: number, pageCount: number) => {
    page.drawLine({ start: { x: MARGIN, y: FOOTER_H + 8 }, end: { x: PAGE_W - MARGIN, y: FOOTER_H + 8 }, thickness: 0.5, color: RULE });
    const txt = `Workforce Advancement Project · workforceap.org · Page ${pageNum} of ${pageCount}`;
    page.drawText(txt, { x: MARGIN, y: FOOTER_H - 2, font, size: 7, color: MUTED });
  };

  const BODY_TOP = PAGE_H - HEADER_H - 16;
  const BODY_BOTTOM = FOOTER_H + 16;
  const maxWidth = PAGE_W - MARGIN * 2;
  const bodyFontSize = 10;
  const lineHeight = bodyFontSize * 1.5;

  const wrapText = (txt: string, f: typeof font, size: number, max: number): string[] => {
    const lines: string[] = [];
    for (const paragraph of txt.split('\n')) {
      if (!paragraph.trim()) { lines.push(''); continue; }
      const words = paragraph.split(' ');
      let cur = '';
      for (const word of words) {
        const test = cur ? `${cur} ${word}` : word;
        if (f.widthOfTextAtSize(test, size) > max && cur) { lines.push(cur); cur = word; }
        else cur = test;
      }
      if (cur) lines.push(cur);
    }
    return lines;
  };

  const bodyLines = wrapText(text.replace(/\*\*/g, ''), font, bodyFontSize, maxWidth);

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  drawHeader(page);
  let y = BODY_TOP;

  const cleanTitle = title.replace(/\*\*/g, '');
  page.drawText(cleanTitle, { x: MARGIN, y, font: boldFont, size: 15, color: ACCENT });
  y -= 22;

  const genDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const meta = `Generated by Workforce Advancement Project · ${genDate}`;
  page.drawText(meta, { x: MARGIN, y, font, size: 8, color: MUTED });
  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: RULE });
  y -= 14;

  for (const line of bodyLines) {
    if (y < BODY_BOTTOM) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      drawHeader(page);
      y = BODY_TOP;
    }
    if (!line.trim()) { y -= lineHeight * 0.6; continue; }

    const isH1 = /^#\s/.test(line);
    const isH2 = /^#{2,3}\s/.test(line);
    const clean = line.replace(/^#{1,3}\s+/, '');

    if (isH1 || isH2) {
      y -= 4;
      page.drawText(clean, { x: MARGIN, y, font: boldFont, size: isH1 ? 12 : 10.5, color: ACCENT });
      y -= (isH1 ? 18 : 16);
    } else {
      page.drawText(clean, { x: MARGIN, y, font, size: bodyFontSize, color: DARK_TEXT });
      y -= lineHeight;
    }
  }

  const count = pdfDoc.getPageCount();
  for (let i = 0; i < count; i++) {
    drawFooter(pdfDoc.getPage(i), i + 1, count);
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}export const POST = withApiGuc(async (request: Request) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'Validation failed' },
        { status: 400 }
      );
    }
    const { memberId, sessionId } = parsed.data;

    const onBehalf = await resolveActOnBehalf(user.id, memberId);
    if (!onBehalf.ok) {
      return NextResponse.json({ error: onBehalf.error }, { status: onBehalf.status });
    }
    if (!onBehalf.isOnBehalf) {
      return NextResponse.json(
        { error: 'Email packet endpoint is for counselor/admin sessions only' },
        { status: 400 }
      );
    }

    const orgId = await getSubjectOrganizationId(memberId);
    const member = await withTenantScope(orgId, (db) =>
      db.user.findFirst({
        where: { id: memberId, deletedAt: null },
        select: { id: true, fullName: true, email: true },
      }),
    );
    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    const events = await prisma.$transaction((tx) => tx.memberEvent.findMany({
      where: {
        userId: memberId,
        sessionId,
        eventName: 'ai_tool_run_completed',
        entityType: 'ai_tool_result',
        entityId: { not: null },
      },
      orderBy: { createdAt: 'asc' },
      select: { entityId: true, createdAt: true },
      take: 100,
    }));

    if (events.length === 0) {
      return NextResponse.json(
        { error: 'No tools were run in this session yet - nothing to email.' },
        { status: 400 }
      );
    }

    const resultIds = events.map((e) => e.entityId).filter((id): id is string => !!id);
    const results = await prisma.$transaction((tx) => tx.aIToolResult.findMany({
      where: { id: { in: resultIds }, userId: memberId },
      select: { id: true, toolType: true, inputSummary: true, output: true, createdAt: true },
      take: 100,
    }));

    const orderedResults = events
      .map((e) => results.find((r) => r.id === e.entityId))
      .filter((r): r is typeof results[number] => !!r);

    const attachments: { filename: string; content: Buffer }[] = [];
    const sections: SessionPacketSection[] = [];

    // Update profile variables
    let profileBioAppends: string[] = [];

    // Collect readiness upserts to batch in a single transaction (eliminates N+1).
    const readinessUpserts: ReturnType<typeof prisma.readinessChecklist.upsert>[] = [];

    for (const r of orderedResults) {
      let title = r.toolType.replace(/_/g, ' ');
      let contextLine = r.inputSummary || null;
      let bodyText = r.output;
      let asList: SessionPacketSection['asList'] | undefined;
      let pdfTextContent = r.output;

      if (r.toolType === 'resume_rewriter') {
        title = 'Polished Resume';
        contextLine = r.inputSummary ? `Tailored to: ${r.inputSummary}` : null;
        readinessUpserts.push(
          prisma.readinessChecklist.upsert({
            where: { userId_itemKey: { userId: memberId, itemKey: 'resume' } },
            create: { userId: memberId, section: 2, itemKey: 'resume', completed: true, completedAt: new Date(), completedBy: user.id },
            update: { completed: true, completedAt: new Date(), completedBy: user.id },
          }),
        );
      } else if (r.toolType === 'cover_letter') {
        title = 'Tailored Cover Letter';
        contextLine = r.inputSummary ? `For: ${r.inputSummary}` : null;
        readinessUpserts.push(
          prisma.readinessChecklist.upsert({
            where: { userId_itemKey: { userId: memberId, itemKey: 'cover_letter' } },
            create: { userId: memberId, section: 3, itemKey: 'cover_letter', completed: true, completedAt: new Date(), completedBy: user.id },
            update: { completed: true, completedAt: new Date(), completedBy: user.id },
          }),
        );
      } else if (r.toolType === 'interview_practice') {
        title = 'Interview Practice Questions';
        contextLine = r.inputSummary ? `For: ${r.inputSummary}` : null;
        try {
          const parsedQs = JSON.parse(r.output) as Array<{ question: string; type?: string; tip?: string; exampleAnswer?: string; }>;
          bodyText = '';
          asList = { items: parsedQs.map((q) => ({ heading: q.question, tip: q.tip, exampleAnswer: q.exampleAnswer })) };
          pdfTextContent = parsedQs.map((q, i) => `${i + 1}. ${q.question}\nTip: ${q.tip || ''}\nSample: ${q.exampleAnswer || ''}`).join('\n\n');
        } catch { /* keep raw */ }

        readinessUpserts.push(
          prisma.readinessChecklist.upsert({
            where: { userId_itemKey: { userId: memberId, itemKey: 'interview_prep' } },
            create: { userId: memberId, section: 4, itemKey: 'interview_prep', completed: true, completedAt: new Date(), completedBy: user.id },
            update: { completed: true, completedAt: new Date(), completedBy: user.id },
          }),
        );
      } else if (r.toolType === 'career_counselor' && r.inputSummary.includes('elevator')) {
        title = 'Elevator Pitch';
        readinessUpserts.push(
          prisma.readinessChecklist.upsert({
            where: { userId_itemKey: { userId: memberId, itemKey: 'elevator_pitch' } },
            create: { userId: memberId, section: 2, itemKey: 'elevator_pitch', completed: true, completedAt: new Date(), completedBy: user.id, valueText: r.output },
            update: { completed: true, completedAt: new Date(), completedBy: user.id, valueText: r.output },
          }),
        );
        profileBioAppends.push(r.output);
      } else if (r.toolType === 'linkedin_headline') {
        title = 'LinkedIn Headline Options';
        contextLine = r.inputSummary ? `Role: ${r.inputSummary}` : null;
        try {
          const headlines = JSON.parse(r.output) as string[];
          if (Array.isArray(headlines)) {
            bodyText = headlines.map((h, i) => `${i + 1}. ${h}`).join('\n\n');
            asList = { items: headlines.map((h, i) => ({ heading: `Option ${i + 1}`, exampleAnswer: h })) };
            pdfTextContent = bodyText;
          }
        } catch { /* keep raw */ }
      } else if (r.toolType === 'linkedin_about') {
        title = 'LinkedIn About Section';
        contextLine = r.inputSummary ? `Role: ${r.inputSummary}` : null;
      } else if (r.toolType === 'job_match_scorer') {
        title = 'Job Match Analysis';
        contextLine = r.inputSummary ? `Matched against: ${r.inputSummary}` : null;
      } else if (r.toolType === 'salary_negotiation') {
        title = 'Salary Negotiation Script';
        contextLine = r.inputSummary ? `Role: ${r.inputSummary}` : null;
      } else if (r.toolType === 'resume_analysis') {
        title = 'Resume Strength Analysis';
      } else if (r.toolType === 'gap_analyzer') {
        title = 'Employment Gap Analysis';
      }

      sections.push({ title, contextLine, body: bodyText, asList });

      // Generate individual PDF attachment
      const pdfBuf = await generatePdfBuffer(title, `${contextLine ? contextLine + '\n\n' : ''}${pdfTextContent}`);
      const safeFilename = title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-') + '.pdf';
      attachments.push({ filename: safeFilename, content: pdfBuf });
    }

    // Batch all readiness upserts in one transaction (eliminates N+1).
    if (readinessUpserts.length > 0) {
      await prisma.$transaction(readinessUpserts);
    }

    // Update profile if we gathered info (e.g. elevator pitch to bio)
    if (profileBioAppends.length > 0) {
      const existingProfile = await prisma.$transaction((tx) => tx.profile.findUnique({ where: { userId: memberId } }));
      const newBio = [existingProfile?.profileBio, ...profileBioAppends].filter(Boolean).join('\n\n');
      await prisma.$transaction((tx) => tx.profile.upsert({
        where: { userId: memberId },
        create: { userId: memberId, profileBio: newBio },
        update: { profileBio: newBio },
      }));
    }

    const firstName = member.fullName?.trim().split(/\s+/)[0] ?? 'there';
    const sessionDate = orderedResults[0]?.createdAt
      ? orderedResults[0].createdAt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : new Date().toLocaleDateString();
    const counselorName = onBehalf.actorName ?? 'your WorkforceAP counselor';
    // The session's results live in the member's AI tool history, not on the
    // member home, so the link opens that list directly.
    const portalUrl = `${SITE_URL}${SESSION_PACKET_PORTAL_PATH}`;

    const subject = sanitizeEmailSubjectLine(`Your session packet from ${counselorName}`);
    const innerHtml = sessionPacketHtml({ firstName, counselorName, sessionDate, sections, portalUrl });
    const html = brandedEmailLayout({ title: subject, bodyHtml: innerHtml, ctaText: 'See what we built', ctaUrl: portalUrl });

    const resend = getResend();
    if (!resend) {
      console.warn('[session-packet] RESEND_API_KEY not set - packet not sent');
      return NextResponse.json({ ok: false, error: 'Email is not configured. Packet was not sent.' }, { status: 503 });
    }

    try {
      await sendBrandedEmailOrThrowOnSkip(resend, {
        from: getFrom(),
        to: member.email,
        subject,
        html,
        attachments,
      });
    } catch (err) {
      console.error('[session-packet] resend failed', err);
      return NextResponse.json({ ok: false, error: 'Email service error' }, { status: 502 });
    }

    return NextResponse.json({ ok: true, sectionCount: sections.length, to: member.email });
  } catch (error) {
    console.error('/counselor/sessions/email-packet:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
