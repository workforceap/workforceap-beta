import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { DesignSurface, PageOpener } from '@/components/portal/kit';
import styles from '@/components/portal/tools/SkillMapperClient.module.css';

/** Compact Mapper chrome; result panels own occupation/profile source explanations. */
export function SkillMapperKit({ children, backHref = '/dashboard/ai-tools' }: {
  children: ReactNode;
  backHref?: string;
}) {
  return (
    <DesignSurface surface="warm">
      <div className={styles.pageShell}>
        <PageOpener
          className={styles.pageOpener}
          title="Skill Mapper"
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
