import type { Metadata } from 'next';
import { buildPageMetadataAsync } from '@/app/seo';
import MentorApplyForm from './MentorApplyForm';
import { getUser } from '@/lib/auth/server';
import LocalizedLink from '@/components/LocalizedLink';
import styles from './mentor-apply.module.css';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'Mentor Application',
    description:
      'Apply to mentor with WorkforceAP. Help members build careers in technology, healthcare, manufacturing, and more.',
    path: '/mentor/apply',
  });
}

export default async function MentorApplyPage() {
  const user = await getUser();
  return (
    <div className="mdx">
      <section className="mdx-stage">
        <span className="mdx-pill">Become a Mentor</span>
        <h1>
          Mentor with <span className="mdx-grad-accent">WorkforceAP</span>
        </h1>
        <p>
          Help members build careers in technology, healthcare, manufacturing, and more.
        </p>
      </section>
      {user ? <MentorApplyForm /> : (
        <section className={styles.wrap} aria-labelledby="mentor-account-heading">
          <div className={`mdx-card ${styles.form}`}>
            <h2 id="mentor-account-heading">Sign in to apply as a mentor</h2>
            <p>Your application is linked to your WorkforceAP account. Sign in or create an account before filling it out.</p>
            <LocalizedLink href="/login?redirectTo=%2Fmentor%2Fapply" className="btn btn-primary">Sign in</LocalizedLink>
            <LocalizedLink href="/signup?redirectTo=%2Fmentor%2Fapply" className="btn btn-secondary">Create an account</LocalizedLink>
          </div>
        </section>
      )}
    </div>
  );
}
