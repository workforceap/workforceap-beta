import { prisma } from '@/lib/db/prisma';
import { validateTokenizedLink } from '@/lib/tokenizedLink';
import PublicEligibilityForm, { type PublicEligibilityPrefill } from './PublicEligibilityForm';

export const dynamic = 'force-dynamic';

type EligibilityFormMeta = {
  version?: number;
  updatedAt?: string;
  ageGroup?: string | null;
  county?: string | null;
};

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
          border: '1px solid var(--outline-variant)',
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
 * PUBLIC (no auth gate) tokenized eligibility-questionnaire landing.
 *
 * Validates the single-use token server-side. Invalid tokens render a clean,
 * reason-specific message — no stack traces, no member data. Valid tokens
 * render the client form, pre-filled from the bound member (if any). Reading
 * the member's profile is the ONLY data access, and it is scoped strictly to
 * the token's own subjectUserId — no cross-member reads.
 */
export default async function PublicQuestionnairePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const validation = await validateTokenizedLink(token, 'eligibility_questionnaire');

  if (!validation.ok) {
    if (validation.reason === 'expired') {
      return (
        <MessageCard
          title="This link has expired"
          body="For your security, this questionnaire link is no longer active. Please contact your WorkforceAP advisor for a new link."
        />
      );
    }
    if (validation.reason === 'consumed') {
      return (
        <MessageCard
          title="This link has already been used"
          body="This questionnaire was already submitted. If you need to make a change, please contact your WorkforceAP advisor."
        />
      );
    }
    // not_found / wrong_type — do not reveal which.
    return (
      <MessageCard
        title="This link isn’t valid"
        body="We couldn’t find this questionnaire link. Please double-check the link in your email, or contact your WorkforceAP advisor for a new one."
      />
    );
  }

  const { link } = validation;

  let prefill: PublicEligibilityPrefill = {
    firstName: '',
    lastName: '',
    phone: '',
    email: link.email ?? '',
    ageGroup: '',
    city: '',
    state: '',
    zip: '',
    county: '',
    primaryBarriers: [],
  };

  // Pre-fill ONLY from the token's own bound member. Mirrors how
  // /api/member/eligibility reads city/state/zip + barrierTypes from Profile
  // and ageGroup/county from User.wioaQualificationJson.eligibilityForm.
  if (link.subjectUserId) {
    const dbUser = await prisma.user.findUnique({
      where: { id: link.subjectUserId },
      select: {
        fullName: true,
        email: true,
        phone: true,
        wioaQualificationJson: true,
        profile: { select: { city: true, state: true, zip: true, barrierTypes: true } },
      },
    });
    if (dbUser) {
      const snapshot = (dbUser.wioaQualificationJson ?? null) as Record<string, unknown> | null;
      const meta =
        snapshot && typeof snapshot.eligibilityForm === 'object' && snapshot.eligibilityForm !== null
          ? (snapshot.eligibilityForm as EligibilityFormMeta)
          : null;
      const [firstName, ...rest] = (dbUser.fullName ?? '').trim().split(/\s+/);
      prefill = {
        firstName: firstName ?? '',
        lastName: rest.join(' '),
        phone: dbUser.phone ?? '',
        email: dbUser.email ?? link.email ?? '',
        ageGroup: meta?.ageGroup ?? '',
        city: dbUser.profile?.city ?? '',
        state: dbUser.profile?.state ?? '',
        zip: dbUser.profile?.zip ?? '',
        county: meta?.county ?? '',
        primaryBarriers: dbUser.profile?.barrierTypes ?? [],
      };
    }
  }

  return (
    <main style={PAGE_WRAP}>
      <h1 style={{ fontSize: '1.6rem', margin: '0 0 0.5rem' }}>Eligibility questionnaire</h1>
      <p style={{ margin: '0 0 1.5rem', color: 'var(--color-on-surface-variant, #555)', lineHeight: 1.6 }}>
        Please complete the short form below so we can confirm your eligibility for WorkforceAP
        programs. This link can only be used once.
      </p>
      <PublicEligibilityForm token={token} prefill={prefill} />
    </main>
  );
}
