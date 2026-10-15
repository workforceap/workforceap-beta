'use client';

import { PARTNER_TYPES } from '@/lib/partner/partnerType';
import { enrollmentPathForSlug } from '@/lib/enroll/enrollmentPath';

export type SchoolEnrollmentValues = {
  partnerType: string;
  referralCode: string;
  sponsoredEnrollment: boolean;
  sponsorshipFundingSource: string;
  sponsorshipTermLabel: string;
  enrollmentPageEnabled: boolean;
  enrollmentHeadline: string;
  enrollmentBlurb: string;
  schoolDistrict: string;
  programSlugs: string[];
};

type ProgramOpt = { slug: string; title: string };

const FUNDING = ['PARTNER_ORG', 'GRANT', 'EMPLOYER', 'SELF', 'OTHER'] as const;

export default function PartnerSchoolEnrollmentFields({
  values,
  onChange,
  programs,
  slug,
  disabled,
}: {
  values: SchoolEnrollmentValues;
  onChange: (next: SchoolEnrollmentValues) => void;
  programs: ProgramOpt[];
  slug?: string;
  disabled?: boolean;
}) {
  const set = <K extends keyof SchoolEnrollmentValues>(key: K, value: SchoolEnrollmentValues[K]) =>
    onChange({ ...values, [key]: value });

  const toggleProgram = (programSlug: string) => {
    const next = values.programSlugs.includes(programSlug)
      ? values.programSlugs.filter((s) => s !== programSlug)
      : [...values.programSlugs, programSlug];
    set('programSlugs', next);
  };

  const enrollPath = slug ? enrollmentPathForSlug(slug) : null;

  return (
    <fieldset
      className="admin-form-panel"
      style={{ borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem' }}
    >
      <legend style={{ fontWeight: 600, padding: '0 0.5rem', fontSize: '0.9rem' }}>
        School enrollment page
      </legend>
      <p style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', margin: '0 0 0.75rem' }}>
        Turn this on to publish <code>/enroll/&lt;school&gt;</code> and sponsor seats. School #2 is this form — no new code.
      </p>

      <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 500 }}>
        Partner type
        <select
          value={values.partnerType}
          onChange={(e) => set('partnerType', e.target.value)}
          disabled={disabled}
          style={{ display: 'block', width: '100%', maxWidth: 480, marginTop: 4, padding: '0.5rem 0.75rem' }}
        >
          {PARTNER_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </label>

      <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 500 }}>
        Referral code
        <input
          value={values.referralCode}
          onChange={(e) => set('referralCode', e.target.value.toLowerCase())}
          disabled={disabled}
          placeholder="chs2026"
          style={{ display: 'block', width: '100%', maxWidth: 480, marginTop: 4, padding: '0.5rem 0.75rem' }}
        />
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontWeight: 500 }}>
        <input
          type="checkbox"
          checked={values.sponsoredEnrollment}
          onChange={(e) => {
            const checked = e.target.checked;
            onChange({
              ...values,
              sponsoredEnrollment: checked,
              partnerType: checked && values.partnerType === 'community' ? 'high_school' : values.partnerType,
            });
          }}
          disabled={disabled}
        />
        Sponsored enrollment (auto-stamp funding at signup)
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontWeight: 500 }}>
        <input
          type="checkbox"
          checked={values.enrollmentPageEnabled}
          onChange={(e) => {
            const checked = e.target.checked;
            onChange({
              ...values,
              enrollmentPageEnabled: checked,
              partnerType: checked && values.partnerType === 'community' ? 'high_school' : values.partnerType,
            });
          }}
          disabled={disabled}
        />
        Publish enrollment page
      </label>

      {enrollPath && values.enrollmentPageEnabled ? (
        <p style={{ fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
          Student link: <a href={enrollPath}>{enrollPath}</a>
        </p>
      ) : null}

      <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 500 }}>
        Funding source
        <select
          value={values.sponsorshipFundingSource}
          onChange={(e) => set('sponsorshipFundingSource', e.target.value)}
          disabled={disabled}
          style={{ display: 'block', width: '100%', maxWidth: 480, marginTop: 4, padding: '0.5rem 0.75rem' }}
        >
          {FUNDING.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </label>

      <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 500 }}>
        Term label
        <input
          value={values.sponsorshipTermLabel}
          onChange={(e) => set('sponsorshipTermLabel', e.target.value)}
          disabled={disabled}
          placeholder="2026"
          style={{ display: 'block', width: '100%', maxWidth: 480, marginTop: 4, padding: '0.5rem 0.75rem' }}
        />
      </label>

      <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 500 }}>
        School district
        <input
          value={values.schoolDistrict}
          onChange={(e) => set('schoolDistrict', e.target.value)}
          disabled={disabled}
          style={{ display: 'block', width: '100%', maxWidth: 480, marginTop: 4, padding: '0.5rem 0.75rem' }}
        />
      </label>

      <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 500 }}>
        Enrollment headline
        <input
          value={values.enrollmentHeadline}
          onChange={(e) => set('enrollmentHeadline', e.target.value)}
          disabled={disabled}
          style={{ display: 'block', width: '100%', maxWidth: 480, marginTop: 4, padding: '0.5rem 0.75rem' }}
        />
      </label>
      <p>Describe qualifying access as “no cost to members” and explain the funding or sponsorship.</p>

      <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 500 }}>
        Enrollment blurb
        <textarea
          value={values.enrollmentBlurb}
          onChange={(e) => set('enrollmentBlurb', e.target.value)}
          disabled={disabled}
          rows={3}
          style={{ display: 'block', width: '100%', maxWidth: 480, marginTop: 4, padding: '0.5rem 0.75rem' }}
        />
      </label>

      <div>
        <div style={{ fontWeight: 500, marginBottom: 6 }}>Curated programs</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
          {programs.map((p) => (
            <label key={p.slug} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' }}>
              <input
                type="checkbox"
                checked={values.programSlugs.includes(p.slug)}
                onChange={() => toggleProgram(p.slug)}
                disabled={disabled}
              />
              {p.title}
            </label>
          ))}
        </div>
      </div>
    </fieldset>
  );
}
