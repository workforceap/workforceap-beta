'use server';

import { prisma } from '@/lib/db/prisma';
import { getUser } from '@/lib/auth/server';
import { withUserGuc } from '@/lib/db/withRequestGuc';
import { revalidatePath } from 'next/cache';

export async function logExternalCertification(formData: FormData) {
  const user = await getUser();
  if (!user) throw new Error('Unauthorized');

  const certName = formData.get('certName') as string;
  const earnedAtStr = formData.get('earnedAt') as string;

  if (!certName || !earnedAtStr) {
    throw new Error('Missing required fields');
  }

  await withUserGuc(user, async () => {
    await prisma.userCertification.upsert({
      where: {
        userId_certName: {
          userId: user.id,
          certName,
        },
      },
      update: {
        earnedAt: new Date(earnedAtStr),
      },
      // WAP-20: self-reported → pending until staff review it.
      create: {
        userId: user.id,
        certName,
        earnedAt: new Date(earnedAtStr),
        status: 'pending',
        submittedAt: new Date(),
      },
    });
  });

  revalidatePath('/dashboard');
}
