/**
 * Single-use tokenized links (admin/partner → person). Scoped destinations:
 * interview prep tool or a pre-filled eligibility questionnaire. Security:
 * 64-char token, expiry, atomic single-use consume, optional type/subject binding.
 */
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/db/prisma';
import type { Prisma, TokenLinkType } from '@prisma/client';

const DEFAULT_TTL_DAYS = 14;

export function newTokenString(): string {
  return randomBytes(32).toString('hex');
}

export async function createTokenizedLink(params: {
  type: TokenLinkType;
  createdById: string;
  email?: string | null;
  subjectUserId?: string | null;
  orgId?: string | null;
  ttlDays?: number;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = newTokenString();
  const expiresAt = new Date(Date.now() + (params.ttlDays ?? DEFAULT_TTL_DAYS) * 86_400_000);
  await prisma.tokenizedLink.create({
    data: {
      token,
      type: params.type,
      email: params.email ?? null,
      subjectUserId: params.subjectUserId ?? null,
      orgId: params.orgId ?? null,
      createdById: params.createdById,
      expiresAt,
    },
  });
  return { token, expiresAt };
}

export type ValidatedTokenLink = {
  id: string;
  type: TokenLinkType;
  email: string | null;
  subjectUserId: string | null;
  orgId: string | null;
};

export type TokenValidation =
  | { ok: true; link: ValidatedTokenLink }
  | { ok: false; reason: 'not_found' | 'expired' | 'consumed' | 'wrong_type' };

export async function validateTokenizedLink(
  token: string | null | undefined,
  expectedType?: TokenLinkType,
): Promise<TokenValidation> {
  if (!token || token.length < 32) return { ok: false, reason: 'not_found' };
  const link = await prisma.tokenizedLink.findUnique({ where: { token } });
  if (!link) return { ok: false, reason: 'not_found' };
  if (expectedType && link.type !== expectedType) return { ok: false, reason: 'wrong_type' };
  if (link.consumedAt) return { ok: false, reason: 'consumed' };
  if (link.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'expired' };
  return {
    ok: true,
    link: { id: link.id, type: link.type, email: link.email, subjectUserId: link.subjectUserId, orgId: link.orgId },
  };
}

/** Atomic single-use consume. Returns true if THIS call consumed it (false if already consumed/missing). */
export async function consumeTokenizedLink(
  id: string,
  options?: { tx: Prisma.TransactionClient; expected: ValidatedTokenLink },
): Promise<boolean> {
  const now = new Date();
  const res = await (options?.tx ?? prisma).tokenizedLink.updateMany({
    where: {
      id, consumedAt: null,
      // Transactional questionnaire callers recheck the exact binding and
      // expiry when claiming; legacy callers retain their existing contract.
      ...(options ? {
        type: options.expected.type,
        email: options.expected.email,
        subjectUserId: options.expected.subjectUserId,
        orgId: options.expected.orgId,
        expiresAt: { gte: now },
      } : {}),
    },
    data: { consumedAt: now },
  });
  return res.count === 1;
}
