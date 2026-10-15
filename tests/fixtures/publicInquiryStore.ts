import { vi } from 'vitest';
import type { PublicInquiry } from '@prisma/client';

/** Stateful fake models receipt uniqueness and compare-and-set status transitions. */
export function publicInquiryStore() {
  const rows = new Map<string, PublicInquiry>();
  const upsert = vi.fn(async (args: { create: Omit<PublicInquiry, 'id' | 'createdAt' | 'updatedAt' | 'notificationStatus' | 'notificationAttempts' | 'notificationAttemptedAt'>; where: { organizationId: string } }) => {
    const key = `${args.create.organizationId}/${args.create.submissionKey}`;
    if (!rows.has(key)) rows.set(key, {
      ...args.create, id: `inquiry-${rows.size + 1}`, createdAt: new Date('2026-10-15T12:00:00Z'), updatedAt: new Date('2026-10-15T12:00:00Z'),
      notificationStatus: 'pending', notificationAttempts: 0, notificationAttemptedAt: null,
    });
    return { ...rows.get(key)! };
  });
  const updateMany = vi.fn(async (args: { where: { id: string; organizationId: string; notificationStatus?: { not: string } }; data: Record<string, unknown> }) => {
    let count = 0;
    for (const row of rows.values()) {
      if (row.id !== args.where.id || row.organizationId !== args.where.organizationId || row.notificationStatus === args.where.notificationStatus?.not) continue;
      for (const [key, value] of Object.entries(args.data)) {
        if (key === 'notificationAttempts') row.notificationAttempts += (value as { increment: number }).increment;
        else Object.assign(row, { [key]: value });
      }
      count++;
    }
    return { count };
  });
  return { rows, upsert, updateMany };
}
