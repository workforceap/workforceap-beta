'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PartnerSchoolEnrollmentFields, {
  type SchoolEnrollmentValues,
} from '@/components/admin/PartnerSchoolEnrollmentFields';

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const EMPTY_SCHOOL: SchoolEnrollmentValues = {
  partnerType: 'community',
  referralCode: '',
  sponsoredEnrollment: false,
  sponsorshipFundingSource: 'PARTNER_ORG',
  sponsorshipTermLabel: '2026',
  enrollmentPageEnabled: false,
  enrollmentHeadline: '',
  enrollmentBlurb: '',
  schoolDistrict: '',
  programSlugs: [],
};

export default function NewPartnerForm({ programs }: { programs: { slug: string; title: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [school, setSchool] = useState<SchoolEnrollmentValues>(EMPTY_SCHOOL);

  const handleNameChange = (v: string) => {
    setName(v);
    if (!slugEdited) setSlug(slugify(v));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (school.enrollmentPageEnabled && school.programSlugs.length === 0) {
      setError('Pick at least one program before publishing the enrollment page');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          contactName: contactName.trim() || null,
          contactEmail: contactEmail.trim() || null,
          contactPhone: contactPhone.trim() || null,
          active: true,
          partnerType: school.partnerType,
          referralCode: school.referralCode.trim() || undefined,
          sponsoredEnrollment: school.sponsoredEnrollment,
          sponsorshipFundingSource: school.sponsoredEnrollment ? school.sponsorshipFundingSource : undefined,
          sponsorshipTermLabel: school.sponsorshipTermLabel.trim() || null,
          enrollmentPageEnabled: school.enrollmentPageEnabled,
          enrollmentHeadline: school.enrollmentHeadline.trim() || null,
          enrollmentBlurb: school.enrollmentBlurb.trim() || null,
          schoolDistrict: school.schoolDistrict.trim() || null,
          programSlugs: school.programSlugs,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to create partner');
      router.push(`/admin/partners/${data.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setSaving(false);
    }
  };

  const inputStyle = {
    width: '100%',
    maxWidth: '480px',
    padding: '0.5rem 0.75rem',
    border: '1px solid var(--outline-variant)',
    borderRadius: '6px',
    fontSize: '1rem',
  } as const;
  const labelStyle = { display: 'block', marginBottom: '0.25rem', fontWeight: 500 } as const;

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: '560px' }}>
      {error && (
        <div className="admin-error-banner" style={{ padding: '0.75rem', marginBottom: '1rem', borderRadius: '6px' }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="newpartnerform-organization-name-field" style={labelStyle}>Organization Name *</label>
        <input id="newpartnerform-organization-name-field"
          type="text"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          required
          className="admin-form-input"
          style={inputStyle}
          placeholder="e.g. Concordia High School"
          disabled={saving}
        />
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <label htmlFor="newpartnerform-slug-url-identifier-field" style={labelStyle}>Slug (URL identifier) *</label>
        <input id="newpartnerform-slug-url-identifier-field"
          type="text"
          value={slug}
          onChange={(e) => { setSlug(e.target.value); setSlugEdited(true); }}
          required
          pattern="[a-z0-9\-]+"
          title="Lowercase letters, numbers, and hyphens only"
          className="admin-form-input"
          style={inputStyle}
          placeholder="e.g. workforce-solutions-austin"
          disabled={saving}
        />
        <small className="admin-form-hint" style={{ display: 'block', marginTop: '0.25rem' }}>
          Used in referral tracking. Lowercase, hyphens only.
        </small>
      </div>

      <fieldset
        className="admin-form-panel"
        style={{ borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem' }}
      >
        <legend style={{ fontWeight: 600, padding: '0 0.5rem', fontSize: '0.9rem' }}>Contact Info (optional)</legend>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
          <div>
            <label htmlFor="newpartnerform-contact-name-field" style={labelStyle}>Contact Name</label>
            <input id="newpartnerform-contact-name-field"
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="admin-form-input"
              style={inputStyle}
              placeholder="Jane Smith"
              disabled={saving}
            />
          </div>
          <div>
            <label htmlFor="newpartnerform-contact-email-field" style={labelStyle}>Contact Email</label>
            <input id="newpartnerform-contact-email-field"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="admin-form-input"
              style={inputStyle}
              placeholder="jane@org.org"
              disabled={saving}
            />
          </div>
          <div>
            <label htmlFor="newpartnerform-contact-phone-field" style={labelStyle}>Contact Phone</label>
            <input id="newpartnerform-contact-phone-field"
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="admin-form-input"
              style={inputStyle}
              placeholder="(512) 555-0100"
              disabled={saving}
            />
          </div>
        </div>
      </fieldset>

      <PartnerSchoolEnrollmentFields
        values={{ ...school, referralCode: school.referralCode || slug }}
        onChange={setSchool}
        programs={programs}
        slug={slug}
        disabled={saving}
      />

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button type="submit" disabled={saving} style={{ padding: '0.5rem 1.25rem', background: 'var(--color-accent)', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Creating...' : 'Create Partner'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          disabled={saving}
          className="admin-secondary-button"
          style={{ padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}