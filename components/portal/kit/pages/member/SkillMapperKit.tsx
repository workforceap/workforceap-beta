import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Radar } from 'lucide-react';
import { DesignSurface, PageOpener } from '@/components/portal/kit';
import styles from '@/components/portal/tools/SkillMapperClient.module.css';

/** Shared Mapper composition for the signed-in workspace and its synthetic proof. */
export function SkillMapperKit({ children, backHref = '/dashboard/ai-tools' }: {
  children: ReactNode;
  backHref?: string;
}) {
  return (
    <DesignSurface surface="warm">
      <div className={styles.pageShell}>
        <PageOpener
          className={styles.pageOpener}
          kicker="AI Career Tools"
          icon={<Radar size={20} aria-hidden="true" />}
          title="Skill Mapper"
          lede="Explore an occupation’s requirements and compare them with your estimated skill profile."
          action={
            <Link href={backHref} className="wa-page-action wa-kit-focus">
              <ArrowLeft size={14} aria-hidden="true" />
              Back to AI Career Tools
            </Link>
          }
        />
        {children}
      </div>
    </DesignSurface>
  );
}
