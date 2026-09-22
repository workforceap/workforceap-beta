import { escapeHtml } from '@/lib/email/escapeHtml';

export function employerWelcomeHtml(params: {
  companyName: string;
  contactName: string;
  loginUrl: string;
}): string {
  return `
<p>Hi ${escapeHtml(params.contactName)},</p>

<p>Welcome to <strong>WorkforceAP</strong> — your employer portal is ready.</p>

<p>Here&rsquo;s what you can do right now:</p>
<ul>
  <li><strong>Post jobs</strong> — add roles and submit them for review</li>
  <li><strong>Review applicants</strong> — see candidates matched to your openings</li>
  <li><strong>Track your pipeline</strong> — move candidates from submitted → reviewed → interviewed → hired</li>
</ul>

<p>Your job postings go through a quick review before going live. You&rsquo;ll see each posting&rsquo;s status in your employer dashboard.</p>

<p>If you have questions, reply to this email or call us at (512) 777-1808.</p>

<p>— The WorkforceAP Team</p>
  `.trim();
}
