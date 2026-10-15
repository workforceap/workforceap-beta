import Link from 'next/link';
import { Banner } from '@astryxdesign/core/Banner';
import styles from './AssessmentRetakeNotice.module.css';

export default function AssessmentRetakeNotice({ showLink = true }: { showLink?: boolean }) {
  return <Banner className={showLink ? styles.withAction : undefined} status="info" title="Your final preassessment attempt is ready"
    description="Your counselor or administrator has asked you to retake the preassessment. This is attempt 2 of 2. Your previous result stays saved."
    endContent={showLink ? <Link href="/dashboard/assessment" className="wa-kit-cta wa-kit-focus">Start final attempt</Link> : undefined}
  />;
}
