import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import RequestHelpButton from '@/components/portal/RequestHelpButton';
import MemberFeedbackButton from '@/components/portal/MemberFeedbackButton';
import {
  FEEDBACK_READERS_SENTENCE,
  helpRequestDescription,
  type HelpRequestAudience,
} from '@/lib/member/helpContactCopy';

export const NEED_A_PERSON_HEADING_ID = 'help-need-a-person';

/**
 * "Need a person?" on the default /dashboard/help page (WAP-188 Phase A): the
 * two member contact actions that used to render only on the legacy home
 * (`?ui=legacy`) — Request help and Share feedback — plus the Messages link.
 *
 * `audience` is the route's own recipient (lib/member/helpRequestRecipient.ts),
 * so the card names the counselor who will be emailed, says plainly when there
 * is no counselor and the team inbox gets it instead, and falls back to naming
 * both when the lookup failed (`null`). No reply time is promised anywhere.
 */
export default function NeedAPersonCard({ audience }: { audience: HelpRequestAudience | null }) {
  return (
    <section aria-labelledby={NEED_A_PERSON_HEADING_ID} className="wa-kit-card">
      <h2
        id={NEED_A_PERSON_HEADING_ID}
        style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--wa-text)', margin: 0 }}
      >
        Need a person?
      </h2>

      <div style={{ marginTop: '1rem' }}>
        <h3 style={{ fontSize: 'var(--wa-type-body)', fontWeight: 700, color: 'var(--wa-text)', margin: 0 }}>
          Ask someone to get in touch
        </h3>
        <p className="wa-kit-lede" style={{ margin: '0.25rem 0 0' }}>
          {helpRequestDescription(audience)}
        </p>
        <div className="wa-flex wa-flex-wrap wa-items-start wa-gap-3" style={{ marginTop: '0.75rem' }}>
          <RequestHelpButton audience={audience} tone="primary" />
          <Link
            href="/dashboard/messages"
            className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus hover:wa-opacity-90 wa-transition-opacity wa-duration-150 motion-reduce:wa-transition-none"
          >
            <MessageCircle size={18} aria-hidden="true" />
            Send a message
          </Link>
        </div>
      </div>

      <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--wa-border)' }}>
        <h3 style={{ fontSize: 'var(--wa-type-body)', fontWeight: 700, color: 'var(--wa-text)', margin: 0 }}>
          Tell us how it is going
        </h3>
        <p className="wa-kit-lede" style={{ margin: '0.25rem 0 0' }}>
          Rate your training, counselor support or this website. {FEEDBACK_READERS_SENTENCE} Feedback is not a
          message, so it does not ask anyone to contact you.
        </p>
        <div style={{ marginTop: '0.75rem' }}>
          <MemberFeedbackButton />
        </div>
      </div>
    </section>
  );
}
