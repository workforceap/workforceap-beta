import { NextResponse } from 'next/server';
import { AIToolType } from '@prisma/client';

import { ensureUserInDb } from '@/lib/auth/ensureUser';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { trackEvent } from '@/lib/events/track';
import { saveSkillAssessmentSchema } from '@/lib/validation/skillAssessment';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
export const POST = withApiGuc(async (request: Request) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
    const body = await request.json().catch(() => null);
    const parsed = saveSkillAssessmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'Validation failed' },
        { status: 400 }
      );
    }
  
    try {
      await ensureUserInDb(user);
  
      const result = await prisma.$transaction((tx) => tx.aIToolResult.create({
        data: {
          userId: user.id,
          toolType: AIToolType.skill_assessment,
          inputSummary: `${parsed.data.occupationTitle} (${parsed.data.occupationCode})`,
          output: JSON.stringify({
            occupationTitle: parsed.data.occupationTitle,
            occupationCode: parsed.data.occupationCode,
            radarAxes: parsed.data.radarAxes,
            skills: parsed.data.skills,
          }),
        },
      }));
  
      await trackEvent({
        userId: user.id,
        eventName: 'ai_tool_result_saved',
        entityType: 'ai_tool_result',
        entityId: result.id,
        metadata: {
          tool: 'skill_assessment',
          occupationTitle: parsed.data.occupationTitle,
          occupationCode: parsed.data.occupationCode,
        },
        sourcePage: '/dashboard/assessment',
      });
  
      auditLog({ actorUserId: user.id, action: 'member.skillAssessment.submit', targetType: 'SkillAssessment', targetId: result.id }).catch(() => {});
      logAuditEvent({ user: { id: user.id, role: 'member' }, verb: 'create', object: { type: 'SkillAssessment', id: result.id }, result: { success: true } }).catch(() => {});
      return NextResponse.json({
        ok: true,
        resultId: result.id,
        savedAt: result.createdAt.toISOString(),
      });
    } catch (error) {
      console.error('[POST /api/member/skill-assessment]', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
  } catch (error) {
    console.error('/member/skill-assessment:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
