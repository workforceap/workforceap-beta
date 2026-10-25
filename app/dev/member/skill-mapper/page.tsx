import { notFound } from 'next/navigation';
import SkillMapperClient from '@/components/portal/tools/SkillMapperClient';
import { SkillMapperKit } from '@/components/portal/kit/pages/member/SkillMapperKit';
import type { SavedSkillMapperRun } from '@/lib/member/skillMapperRun';

export const dynamic = 'force-dynamic';
const axes = ['Analytics', 'Engineering', 'Design', 'Strategy', 'Service', 'Research'];
const run: SavedSkillMapperRun = {
  id: 'synthetic-review-lookup', occupationTitle: 'Computer User Support Specialists', occupationCode: '15-1232.00',
  radarAxes: axes.map((axis, index) => ({ axis, value: 80 - index * 6 })),
  skills: [{ name: 'Troubleshooting', score: 86 }, { name: 'Active Listening', score: 78 }, { name: 'Critical Thinking', score: 72 }],
  createdAt: '2026-10-21T12:00:00.000Z', demo: true,
};

export default function SkillMapperProofPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return (
    <SkillMapperKit backHref="/dev/member/toolkit">
      <SkillMapperClient preview initialRun={run} initialMemberProfile={axes.map((axis, index) => ({ axis, value: 0.3 + index * 0.04 }))} />
    </SkillMapperKit>
  );
}
