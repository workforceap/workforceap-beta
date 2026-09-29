import { Clock3 } from 'lucide-react';
import { PARTNER_PLACEMENT_LABELS } from '@/lib/partner/partnerVisibleEvents';
import styles from './PartnerMemberDetail.module.css';

export type PartnerPlacementView =
  | {
      state: 'verified';
      /** Preformatted placed date. */
      placedOn: string;
      /** Present only for partners whose tier may see job details. */
      details: { employerName: string | null; jobTitle: string | null; salary: string } | null;
    }
  | { state: 'pending'; showJobDetails: boolean }
  | { state: 'none' };

/**
 * Placement block for the partner member detail page. Employer, role, and pay
 * render only for a verified placement and only when the caller passes
 * `details` (restricted partners never do); a reported placement shows the
 * pending-verification notice with no job fields at all.
 */
export default function PartnerPlacementCard({ placement }: { placement: PartnerPlacementView }) {
  if (placement.state === 'verified') {
    return (
      <div className={styles.verifiedPanel} data-placement="verified">
        <dl className={styles.placementGrid}>
          {placement.details ? (
            <>
              <div>
                <dt>Employer</dt>
                <dd>{placement.details.employerName ?? '—'}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{placement.details.jobTitle ?? '—'}</dd>
              </div>
            </>
          ) : null}
          <div>
            <dt>Placed</dt>
            <dd className={styles.money}>{placement.placedOn}</dd>
          </div>
          {placement.details ? (
            <div>
              <dt>Salary</dt>
              <dd className={styles.money}>{placement.details.salary}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    );
  }

  if (placement.state === 'pending') {
    return (
      <div className={styles.pendingPanel} data-placement="pending" role="status">
        <Clock3 size={20} aria-hidden />
        <div>
          <p className={styles.pendingTitle}>{PARTNER_PLACEMENT_LABELS.pendingVerification}</p>
          <p className={styles.pendingBody}>
            {placement.showJobDetails
              ? 'WorkforceAP staff have not verified this placement. Employer, role, and salary details will appear after verification.'
              : 'WorkforceAP staff have not verified this placement. The placement date will appear after verification.'}
          </p>
        </div>
      </div>
    );
  }

  return <p className={styles.empty}>Not placed yet.</p>;
}
