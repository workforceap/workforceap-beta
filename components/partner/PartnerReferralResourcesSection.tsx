'use client';

import PortalCard from '@/components/portal/ui/PortalCard';
import PartnerCopyTextButton from '@/components/partner/PartnerCopyTextButton';

export default function PartnerReferralResourcesSection({
  partnerName,
  referralApplyUrl,
}: {
  partnerName: string;
  referralApplyUrl: string;
}) {
  const emailBody = [
    `Hi,`,
    ``,
    `I'm reaching out from ${partnerName}. WorkforceAP connects people with career support and training pathways. Training eligibility, enrollment approval, and any required funding are confirmed by WorkforceAP.`,
    ``,
    `If you or someone you know could benefit, you can apply here (please use this link so we're credited as your referral partner):`,
    `${referralApplyUrl}`,
    ``,
    `Thank you,`,
    `${partnerName}`,
  ].join('\n');

  const socialCaption = [
    `${partnerName} is partnering with WorkforceAP to connect people with career support and training pathways. Apply via our link; WorkforceAP will confirm training eligibility and any required funding.`,
    referralApplyUrl,
  ].join('\n\n');

  return (
    <section aria-labelledby="partner-resources-heading" style={{ marginBottom: '2rem' }}>
      <h2 id="partner-resources-heading" className="portal-section-title" style={{ marginBottom: '1rem' }}>
        Resources
      </h2>
      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        <PortalCard title="Partner flyer" subtitle="Print or save as PDF for bulletin boards and events.">
          <a href="/partner-resources/partner-referral-flyer.html" className="btn btn-outline btn-sm">
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">
              download
            </span>
            Open flyer
          </a>
          <p style={{ margin: '0.75rem 0 0', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
            Open the file, then use Print → Save as PDF if you need a PDF file.
          </p>
        </PortalCard>

        <PortalCard title="Email template" subtitle="Outreach copy you can paste into your inbox.">
          <pre
            style={{
              margin: '0 0 0.75rem',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              background: 'var(--surface-container-low)',
              fontSize: '0.8125rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '11rem',
              overflow: 'auto',
            }}
          >
            {emailBody}
          </pre>
          <PartnerCopyTextButton text={emailBody} label="Copy email text" />
        </PortalCard>

        <PortalCard title="Social graphics" subtitle="Brand assets and suggested post copy.">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <a href="/images/logo.svg" className="btn btn-outline btn-sm" download>
              Logo (SVG)
            </a>
            <a href="/images/logo-tight.svg" className="btn btn-outline btn-sm" download>
              Logo tight (SVG)
            </a>
          </div>
          <pre
            style={{
              margin: '0 0 0.75rem',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              background: 'var(--surface-container-low)',
              fontSize: '0.8125rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '8rem',
              overflow: 'auto',
            }}
          >
            {socialCaption}
          </pre>
          <PartnerCopyTextButton text={socialCaption} label="Copy caption" />
        </PortalCard>
      </div>
    </section>
  );
}
