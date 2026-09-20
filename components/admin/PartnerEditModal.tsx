'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import PartnerSchoolEnrollmentFields, {
  type SchoolEnrollmentValues,
} from '@/components/admin/PartnerSchoolEnrollmentFields';

export type PartnerForEdit = {
  id: string;
  name: string;
  slug?: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  active: boolean;
  notes: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  partnerType?: string;
  referralCode?: string | null;
  sponsoredEnrollment?: boolean;
  sponsorshipFundingSource?: string | null;
  sponsorshipTermLabel?: string | null;
  enrollmentPageEnabled?: boolean;
  enrollmentHeadline?: string | null;
  enrollmentBlurb?: string | null;
  schoolDistrict?: string | null;
  programCatalog?: { programSlug: string }[];
  subgroups?: { id: string; name: string }[];
};

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

type SubgroupOpt = { id: string; name: string; type: string; partnerId: string | null };

type Props = {
  partner: PartnerForEdit;
  subgroups: SubgroupOpt[];
  programs?: { slug: string; title: string }[];
  onClose: () => void;
};

export default function PartnerEditModal({ partner, subgroups, programs = [], onClose }: Props) {
  const router = useRouter();
  const [name, setName] = useState(partner.name);
  const [contactName, setContactName] = useState(partner.contactName ?? '');
  const [contactEmail, setContactEmail] = useState(partner.contactEmail ?? '');
  const [contactPhone, setContactPhone] = useState(partner.contactPhone ?? '');
  const [active, setActive] = useState(partner.active);
  const [notes, setNotes] = useState(partner.notes ?? '');
  const [logoUrl, setLogoUrl] = useState(partner.logoUrl ?? '');
  const [brandColor, setBrandColor] = useState(partner.brandColor ?? '');
  const [subgroupIds, setSubgroupIds] = useState<string[]>(() =>
    subgroups.filter((s) => s.type === 'partner' && s.partnerId === partner.id).map((s) => s.id)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [school, setSchool] = useState<SchoolEnrollmentValues>({
    partnerType: partner.partnerType ?? 'community',
    referralCode: partner.referralCode ?? '',
    sponsoredEnrollment: partner.sponsoredEnrollment ?? false,
    sponsorshipFundingSource: partner.sponsorshipFundingSource ?? 'PARTNER_ORG',
    sponsorshipTermLabel: partner.sponsorshipTermLabel ?? '2026',
    enrollmentPageEnabled: partner.enrollmentPageEnabled ?? false,
    enrollmentHeadline: partner.enrollmentHeadline ?? '',
    enrollmentBlurb: partner.enrollmentBlurb ?? '',
    schoolDistrict: partner.schoolDistrict ?? '',
    programSlugs: partner.programCatalog?.map((r) => r.programSlug) ?? [],
  });
  const trapRef = useFocusTrap(true, onClose);

  useEffect(() => {
    const ids = subgroups.filter((s) => s.type === 'partner' && s.partnerId === partner.id).map((s) => s.id);
    setSubgroupIds(ids);
  }, [partner.id, subgroups]);

  const partnerSubgroups = subgroups.filter((s) => s.type === 'partner');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedColor = brandColor.trim();
    if (trimmedColor && !HEX_COLOR_RE.test(trimmedColor)) {
      setError('Brand color must be a 6-digit hex (e.g. #1E3A8A)');
      return;
    }
    if (school.enrollmentPageEnabled && school.programSlugs.length === 0) {
      setError('Pick at least one program before publishing the enrollment page');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/partners/${partner.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          contactName: contactName.trim() || null,
          contactEmail: contactEmail.trim() || null,
          contactPhone: contactPhone.trim() || null,
          active,
          notes: notes.trim() || null,
          logoUrl: logoUrl.trim() || null,
          brandColor: trimmedColor || null,
          subgroupIds,
          partnerType: school.partnerType,
          referralCode: school.referralCode.trim() || undefined,
          sponsoredEnrollment: school.sponsoredEnrollment,
          sponsorshipFundingSource: school.sponsoredEnrollment ? school.sponsorshipFundingSource : null,
          sponsorshipTermLabel: school.sponsorshipTermLabel.trim() || null,
          enrollmentPageEnabled: school.enrollmentPageEnabled,
          enrollmentHeadline: school.enrollmentHeadline.trim() || null,
          enrollmentBlurb: school.enrollmentBlurb.trim() || null,
          schoolDistrict: school.schoolDistrict.trim() || null,
          programSlugs: school.programSlugs,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Failed to save');
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError('Request failed');
    } finally {
      setSaving(false);
    }
  }

  function toggleSubgroup(id: string) {
    setSubgroupIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  return (
    <div className="partner-modal-overlay" onClick={onClose} role="presentation" tabIndex={-1}>
      <div
        ref={trapRef as React.RefObject<HTMLDivElement>}
        className="partner-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="partner-edit-title"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 id="partner-edit-title" style={{ margin: 0, fontSize: '1.25rem' }}>
            Edit Partner
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', padding: '0.25rem', cursor: 'pointer', color: 'var(--color-on-surface-variant)' }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div
              style={{
                padding: '0.75rem',
                marginBottom: '1rem',
                background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
                borderRadius: '6px',
                color: 'var(--color-accent)',
                fontSize: '0.9rem',
              }}
            >
              {error}
            </div>
          )}

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="partnereditmodal-organization-name-field" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500, fontSize: '0.9rem' }}>
              Organization Name *
            </label>
            <input id="partnereditmodal-organization-name-field"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--outline-variant)', borderRadius: '6px' }}
              disabled={saving}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="partnereditmodal-contact-name-field" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500, fontSize: '0.9rem' }}>
              Contact Name
            </label>
            <input id="partnereditmodal-contact-name-field"
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--outline-variant)', borderRadius: '6px' }}
              disabled={saving}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="partnereditmodal-contact-email-field" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500, fontSize: '0.9rem' }}>
              Contact Email
            </label>
            <input id="partnereditmodal-contact-email-field"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--outline-variant)', borderRadius: '6px' }}
              disabled={saving}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="partnereditmodal-phone-field" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500, fontSize: '0.9rem' }}>
              Phone
            </label>
            <input id="partnereditmodal-phone-field"
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--outline-variant)', borderRadius: '6px' }}
              disabled={saving}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="partnereditmodal-logo-url-field" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500, fontSize: '0.9rem' }}>
              Logo URL
            </label>
            <input id="partnereditmodal-logo-url-field"
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://example.org/logo.svg"
              style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--outline-variant)', borderRadius: '6px' }}
              disabled={saving}
            />
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginTop: '0.25rem' }}>
              Shown in the partner portal header. Falls back to WorkforceAP branding if blank.
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="partnereditmodal-brand-color-field" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500, fontSize: '0.9rem' }}>
              Brand color
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input id="partnereditmodal-brand-color-field"
                type="color"
                value={HEX_COLOR_RE.test(brandColor.trim()) ? brandColor.trim() : '#1E3A8A'}
                onChange={(e) => setBrandColor(e.target.value)}
                disabled={saving}
                aria-label="Brand color picker"
                style={{ width: 44, height: 36, padding: 0, border: '1px solid var(--outline-variant)', borderRadius: '6px', background: 'transparent', cursor: 'pointer' }}
              />
              <input
                type="text"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                placeholder="#1E3A8A"
                pattern="#[0-9A-Fa-f]{6}"
                style={{ flex: 1, padding: '0.5rem 0.75rem', border: '1px solid var(--outline-variant)', borderRadius: '6px', fontFamily: 'monospace' }}
                disabled={saving}
              />
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginTop: '0.25rem' }}>
              6-digit hex (e.g. #1E3A8A). Used as the partner-scoped accent in the portal header.
            </div>
          </div>

          {partnerSubgroups.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500, fontSize: '0.9rem' }}>
                Subgroup assignment
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 140, overflowY: 'auto', padding: '0.5rem', border: '1px solid var(--outline-variant)', borderRadius: '6px' }}>
                {partnerSubgroups.map((s) => (
                  <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                    <input
                      type="checkbox"
                      checked={subgroupIds.includes(s.id)}
                      onChange={() => toggleSubgroup(s.id)}
                      disabled={saving}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 500, fontSize: '0.9rem' }}>
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                disabled={saving}
              />
              Active (partner can access portal)
            </label>
          </div>

          <PartnerSchoolEnrollmentFields
            values={school}
            onChange={setSchool}
            programs={programs}
            slug={partner.slug}
            disabled={saving}
          />

          <div style={{ marginBottom: '1.25rem' }}>
            <label htmlFor="partnereditmodal-internal-notes-field" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500, fontSize: '0.9rem' }}>
              Internal Notes
            </label>
            <textarea id="partnereditmodal-internal-notes-field"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Admin-only notes about this partner"
              style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--outline-variant)', borderRadius: '6px', resize: 'vertical' }}
              disabled={saving}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{ padding: '0.5rem 1rem', background: 'var(--surface-container)', border: '1px solid var(--outline-variant)', borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{ padding: '0.5rem 1.25rem', background: 'var(--color-accent)', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
