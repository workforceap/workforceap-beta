import { prisma } from '@/lib/db/prisma';
import { validateTokenizedLink } from '@/lib/tokenizedLink';
import GuardianConsentForm, { type GuardianConsentPrefill } from './GuardianConsentForm';

export const dynamic = 'force-dynamic';

const PAGE_WRAP: React.CSSProperties = {
  maxWidth: 720,
  margin: '0 auto',
  padding: '2.5rem 1.25rem',
};

function MessageCard({ title, body }: { title: string; body: string }) {
  return (
    <main style={PAGE_WRAP}>
      <div
        style={{
          border: '1px solid var(--color-outline, #e2e2e2)',
          borderRadius: '0.75rem',
          padding: '2rem',
          textAlign: 'center',
          background: 'var(--surface-container-lowest)',
        }}
      >
        <h1 style={{ fontSize: '1.4rem', margin: '0 0 0.75rem' }}>{title}</h1>
        <p style={{ margin: 0, color: 'var(--color-on-surface-variant, #555)', lineHeight: 1.6 }}>
          {body}
        </p>
      </div>
    </main>
  );
}

/**
 * PUBLIC (no auth) tokenized guardian-consent landing.
 * Consent gates Coursera seat activation, never signup.
 */
export default async function GuardianConsentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const validation = await validateTokenizedLink(token, 'guardian_consent');

  if (!validation.ok) {
    if (validation.reason === 'expired') {
      return (
        <MessageCard
          title="This link has expired"
          body="For your security, this consent link is no longer active. Please contact the school or your WorkforceAP advisor for a new link."
        />
      );
    }
    if (validation.reason === 'consumed') {
      return (
        <MessageCard
          title="This link has already been used"
          body="Consent was already recorded with this link. If you need to make a change, please contact the school or your WorkforceAP advisor."
        />
      );
    }
    return (
      <MessageCard
        title="This link isn’t valid"
        body="We couldn’t find this consent link. Please double-check the link you received, or contact the school for a new one."
      />
    );
  }

  const { link } = validation;
  if (!link.subjectUserId) {
    return (
      <MessageCard
        title="This link isn’t valid"
        body="This consent link is missing a student record. Please contact the school for a new one."
      />
    );
  }

  const member = await prisma.user.findUnique({
    where: { id: link.subjectUserId },
    select: {
      fullName: true,
      profile: {
        select: {
          parentGuardianName: true,
          parentGuardianEmail: true,
          parentGuardianPhone: true,
        },
      },
    },
  });

  const studentFirstName = (member?.fullName ?? '').trim().split(/\s+/)[0] ?? '';
  const prefill: GuardianConsentPrefill = {
    studentFirstName,
    guardianName: member?.profile?.parentGuardianName ?? '',
    guardianEmail: member?.profile?.parentGuardianEmail ?? link.email ?? '',
    guardianPhone: member?.profile?.parentGuardianPhone ?? '',
  };

  return (
    <main style={PAGE_WRAP}>
      <h1 style={{ fontSize: '1.6rem', margin: '0 0 0.5rem' }}>Parent / guardian consent</h1>
      <p style={{ margin: '0 0 1.5rem', color: 'var(--color-on-surface-variant, #555)', lineHeight: 1.6 }}>
        {studentFirstName
          ? `${studentFirstName} applied for WorkforceAP career training through their school.`
          : 'A student applied for WorkforceAP career training through their school.'}{' '}
        Training is sponsored — families are never asked for payment information. This form records
        your consent so a training seat can be activated. The link can only be used once.
      </p>
      <GuardianConsentForm token={token} prefill={prefill} />
    </main>
  );
}
