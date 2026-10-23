import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor } from '@/lib/auth/roles';
import PageHeader from '@/components/portal/PageHeader';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import InboxZeroClient from '@/components/portal/counselor/InboxZeroClient';
import { getInboxZeroQueue, type InboxZeroQueue } from '@/lib/counselor/inboxZero';
import { DesignSurface } from '@/components/portal/kit';


export default async function CounselorFollowupView({ embedded = false }: { embedded?: boolean } = {}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/counselor/inbox');

  const counselor = await isCounselor(user.id);
  const admin = await isAdmin(user.id);
  if (!counselor && !admin) redirect('/dashboard');

  const t = await getTranslations('counselor');

  // `null` means the queue failed to load. The page then shows only the
  // error card — never the "No assigned members need attention" empty state,
  // which would contradict it.
  let queue: InboxZeroQueue | null = null;
  try {
    queue = await getInboxZeroQueue(user.id, { isAdmin: admin });
  } catch (err) {
    console.error('[counselor/inbox] getInboxZeroQueue failed:', err);
  }

  return (
    <PortalPageFrame>
      {!embedded ? <PageHeader
        title={t('inboxZeroTitle')}
        subtitle={t('inboxZeroSubtitle')}
        breadcrumbs={[
          { label: t('counselorPortal'), href: '/counselor' },
          { label: t('inboxZero') },
        ]}
      /> : null}

      <section style={{ padding: embedded ? 0 : '0 clamp(1rem, 4vw, 1.5rem) 2rem' }}>
        <DesignSurface surface="dense">
          {queue === null ? (
            <div
              className="wa-kit-card"
              data-portal-error-state="counselor-inbox-queue-load"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                borderLeft: '4px solid var(--wa-accent)',
                marginBottom: '1rem',
              }}
            >
              <AlertTriangle size={18} aria-hidden style={{ color: 'var(--wa-accent)', flexShrink: 0, marginTop: 2 }} />
              <div>
                <p style={{ margin: 0, fontWeight: 700, color: 'var(--wa-text)' }}>
                  {t('inboxZeroLoadError')}
                </p>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--wa-muted)' }}>
                  {t('inboxZeroLoadErrorDesc')}
                </p>
              </div>
            </div>
          ) : (
            <InboxZeroClient initialQueue={queue} />
          )}
        </DesignSurface>
      </section>
    </PortalPageFrame>
  );
}
