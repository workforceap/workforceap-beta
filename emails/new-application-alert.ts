/**
 * New application admin alert email body HTML.
 */

import { escapeHtml } from '@/lib/email/escapeHtml';
import { applicationReportHtml, type ApplicationReport } from '@/lib/apply/applicationReport';

export function newApplicationAlertHtml(params: {
  applicantName: string;
  applicantEmail: string;
  applicantPhone?: string;
  programInterest: string;
  applicationId: string;
  applicationNotes?: string;
  applicationReport?: ApplicationReport;
}): string {
  const {
    applicantName,
    applicantEmail,
    applicantPhone,
    programInterest,
    applicationId,
    applicationNotes,
  } = params;
  if (params.applicationReport) {
    return applicationReportHtml(params.applicationReport) +
      (applicationNotes?.trim() ? `<p><strong>Staff routing notes:</strong> ${escapeHtml(applicationNotes).replace(/\n/g, '<br>')}</p>` : '') +
      `<p><strong>Application ID:</strong> ${escapeHtml(applicationId)}</p>`;
  }
  const phoneLine = applicantPhone?.trim()
    ? `<p><strong>Phone:</strong> ${escapeHtml(applicantPhone.trim())}</p>`
    : '';
  const detailsBlock = applicationNotes?.trim()
    ? `<p><strong>Application details:</strong></p>
    <p>${escapeHtml(applicationNotes.trim()).replace(/\n/g, '<br>')}</p>`
    : '';
  return `
    <p>A new application has been submitted.</p>
    <p><strong>Applicant:</strong> ${escapeHtml(applicantName)}</p>
    <p><strong>Email:</strong> ${escapeHtml(applicantEmail)}</p>
    ${phoneLine}
    <p><strong>Program interest:</strong> ${escapeHtml(programInterest)}</p>
    ${detailsBlock}
    <p><strong>Application ID:</strong> ${escapeHtml(applicationId)}</p>
    <p>Please review the application in the admin panel.</p>
  `.trim();
}
