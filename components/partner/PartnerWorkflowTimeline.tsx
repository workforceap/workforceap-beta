import { formatPortalDateTime } from '@/lib/formatDate';
import { PARTNER_PLACEMENT_LABELS } from '@/lib/partner/partnerVisibleEvents';

type Ev = {
  id: string;
  createdAt: string;
  kind: string;
  headline: string;
  detail: string | null;
  actorName: string | null;
};

export default function PartnerWorkflowTimeline({ events }: { events: Ev[] }) {
  if (events.length === 0) {
    return (
      <section className="partner-workflow-timeline partner-panel" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Partner workflow activity</h2>
        <p style={{ color: 'var(--color-on-surface-variant)', margin: 0, fontSize: '0.9rem' }}>
          Outreach, owner changes, and milestones will show here.
        </p>
      </section>
    );
  }

  return (
    <section className="partner-workflow-timeline partner-panel" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
      <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Partner workflow activity</h2>
      <ul className="employer-workflow-timeline-list">
        {events.map((e) => (
          <li key={e.id} className="employer-workflow-timeline-item">
            <div className="employer-workflow-timeline-dot" aria-hidden />
            <div>
              <div className="employer-workflow-timeline-kind">{e.kind.replace(/_/g, ' ')}</div>
              <div className="employer-workflow-timeline-headline">
                {e.kind === 'placement_confirmation_submitted'
                  ? PARTNER_PLACEMENT_LABELS.pendingVerification
                  : e.headline}
              </div>
              {e.kind === 'placement_confirmation_submitted'
                ? <div className="employer-workflow-timeline-detail">WorkforceAP will verify the placement details.</div>
                : e.detail ? <div className="employer-workflow-timeline-detail">{e.detail}</div> : null}
              <div className="employer-workflow-timeline-meta">
                {e.actorName ? <span>{e.actorName} · </span> : null}
                {formatPortalDateTime(e.createdAt)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
