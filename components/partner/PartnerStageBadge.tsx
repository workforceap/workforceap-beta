import { CheckCircle2, Clock3 } from 'lucide-react';
import { PARTNER_STAGE_LABELS, type PartnerMemberStage } from '@/lib/partner/memberStage';
import styles from './PartnerMemberDetail.module.css';

/**
 * Partner journey stage pill: text label plus tint (never colour alone).
 * Awaiting verification adds a border and clock icon so it reads as its own
 * state, distinct from a verified placement.
 */
export default function PartnerStageBadge({ stage }: { stage: PartnerMemberStage }) {
  return (
    <span className={`${styles.badge} ${styles[stage]}`} data-stage={stage}>
      {stage === 'placed_verified' ? <CheckCircle2 size={14} aria-hidden /> : null}
      {stage === 'awaiting_verification' ? <Clock3 size={14} aria-hidden /> : null}
      {PARTNER_STAGE_LABELS[stage]}
    </span>
  );
}
