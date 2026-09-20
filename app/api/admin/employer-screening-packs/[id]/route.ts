import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';

const patchSchema = z.object({
  isActive: z.boolean().optional(),
  packTitle: z.string().min(1).max(200).optional(),
  employerLabel: z.string().min(1).max(200).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };async function _PATCH(request: Request, ctx: RouteContext) {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await ctx.params;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.$transaction((tx) => tx.employerScreeningPack.findUnique({ where: { id }, select: { id: true } }));
  if (!existing) return NextResponse.json({ error: 'Screening pack not found' }, { status: 404 });

  const pack = await prisma.$transaction((tx) => tx.employerScreeningPack.update({
    where: { id },
    data: parsed.data,
  }));
  void auditLog({
    actorUserId: user.id,
    action: 'admin_screening_pack_update',
    targetType: 'employer_screening_pack',
    targetId: id,
    metadata: { fields: Object.keys(parsed.data) },
  }).catch(() => {});
  return NextResponse.json({ pack });

  } catch (error) {
    console.error('/admin/employer-screening-packs/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const PATCH = withApiGuc(_PATCH);async function _DELETE(_request: Request, ctx: RouteContext) {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await ctx.params;
  const existing = await prisma.$transaction((tx) => tx.employerScreeningPack.findUnique({ where: { id }, select: { id: true } }));
  if (!existing) return NextResponse.json({ error: 'Screening pack not found' }, { status: 404 });
  await prisma.$transaction((tx) => tx.employerScreeningPack.delete({ where: { id } }));
  void auditLog({
    actorUserId: user.id,
    action: 'admin_screening_pack_delete',
    targetType: 'employer_screening_pack',
    targetId: id,
    metadata: {},
  }).catch(() => {});
  return NextResponse.json({ ok: true });

  } catch (error) {
    console.error('/admin/employer-screening-packs/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const DELETE = withApiGuc(_DELETE);

