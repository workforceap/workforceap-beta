/**
 * Parent/guardian acknowledgment after a high-school student completes apply signup.
 */

import { escapeHtml } from '@/lib/email/escapeHtml';

export function schoolEnrollmentParentAckHtml(params: {
  parentName?: string | null;
  studentName: string;
  schoolName: string;
  programInterest: string;
}): string {
  const greeting = params.parentName?.trim()
    ? `Hi ${escapeHtml(params.parentName.trim())},`
    : 'Hello,';
  return `
    <p>${greeting}</p>
    <p><strong>${escapeHtml(params.studentName)}</strong> just submitted a career training application through the ${escapeHtml(params.schoolName)} partnership with WorkforceAP.</p>
    <p><strong>Program interest:</strong> ${escapeHtml(params.programInterest)}</p>
    <p>Here is what happens next:</p>
    <ol>
      <li><strong>Application received</strong> &mdash; the student&rsquo;s application is on file with WorkforceAP</li>
      <li><strong>Program enrollment setup</strong> &mdash; our team enrolls the student into their chosen program by hand and emails them when it&rsquo;s done</li>
      <li><strong>Guardian consent</strong> &mdash; for students under 18, ${escapeHtml(params.schoolName)} collects a parent/guardian consent form before training is activated</li>
    </ol>
    <p>Questions? Call <a href="tel:+15127771808">(512) 777-1808</a> or email <a href="mailto:info@workforceap.org">info@workforceap.org</a>.</p>
  `.trim();
}
