'use client';

import { marketingButtonPresets } from '@/lib/marketing/buttonClasses';
import { useState } from 'react';
import { todayInPortalTimezone } from '@/lib/date/todayInPortalTimezone';
import LocalizedLink from '@/components/LocalizedLink';

type ParentalConsentData = {
  parentGuardianName: string;
  parentGuardianEmail: string;
  parentGuardianPhone: string;
  studentName: string;
  studentDob: string;
  schoolName?: string;
  schoolDistrict?: string;
  gradeLevel?: string;
  consentTerms: boolean;
  consentCommunications: boolean;
  ferpaConsent: boolean;
};

export default function ParentalConsentForm({
  onSubmit,
  studentName,
}: {
  onSubmit: (data: ParentalConsentData) => Promise<void>;
  studentName: string;
}) {
  const [formData, setFormData] = useState<ParentalConsentData>({
    parentGuardianName: '',
    parentGuardianEmail: '',
    parentGuardianPhone: '',
    studentName,
    studentDob: '',
    schoolName: '',
    schoolDistrict: '',
    gradeLevel: '',
    consentTerms: false,
    consentCommunications: false,
    ferpaConsent: false,
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.consentTerms) {
      setError('You must consent to the Terms of Service and Privacy Policy to proceed.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit consent');
    } finally {
      setSubmitting(false);
    }
  };

  const updateField = (field: keyof ParentalConsentData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="parental-consent-form" style={{ maxWidth: '600px' }}>
      <div className="consent-form-header" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          Parental Consent Required
        </h2>
        <p style={{ color: 'var(--color-on-surface-variant)', lineHeight: 1.6 }}>
          Because {studentName} is under 18 years of age, we require consent from a parent or legal guardian 
          to participate in WorkforceAP programs.
        </p>
      </div>

      {error ? (
        <div className="alert alert-error" role="alert" style={{ marginBottom: '1.5rem' }}>
          {error}
        </div>
      ) : null}

      <div className="form-section" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>
          Parent/Guardian Information
        </h3>

        <div className="form-group">
          <label htmlFor="parent-name">
            Parent/Guardian Full Name <span style={{ color: 'var(--wa-accent-text)' }}>*</span>
          </label>
          <input
            id="parent-name"
            type="text"
            className="form-control"
            value={formData.parentGuardianName}
            onChange={(e) => updateField('parentGuardianName', e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="parent-email">
            Parent/Guardian Email <span style={{ color: 'var(--wa-accent-text)' }}>*</span>
          </label>
          <input
            id="parent-email"
            type="email"
            className="form-control"
            value={formData.parentGuardianEmail}
            onChange={(e) => updateField('parentGuardianEmail', e.target.value)}
            required
            aria-describedby="parent-email-hint"
          />
          <small id="parent-email-hint" style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.85rem' }}>
            We&rsquo;ll send confirmation and program updates to this email
          </small>
        </div>

        <div className="form-group">
          <label htmlFor="parent-phone">
            Parent/Guardian Phone <span style={{ color: 'var(--wa-accent-text)' }}>*</span>
          </label>
          <input
            id="parent-phone"
            type="tel"
            className="form-control"
            value={formData.parentGuardianPhone}
            onChange={(e) => updateField('parentGuardianPhone', e.target.value)}
            required
          />
        </div>
      </div>

      <div className="form-section" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>
          Student Information
        </h3>

        <div className="form-group">
          <label htmlFor="student-dob">
            Student Date of Birth <span style={{ color: 'var(--wa-accent-text)' }}>*</span>
          </label>
          <input
            id="student-dob"
            type="date"
            className="form-control"
            value={formData.studentDob}
            onChange={(e) => updateField('studentDob', e.target.value)}
            required
            max={todayInPortalTimezone()}
          />
        </div>

        <div className="form-group">
          <label htmlFor="school-name">School Name (if applicable)</label>
          <input
            id="school-name"
            type="text"
            className="form-control"
            value={formData.schoolName}
            onChange={(e) => updateField('schoolName', e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="school-district">School District (if applicable)</label>
          <input
            id="school-district"
            type="text"
            className="form-control"
            value={formData.schoolDistrict}
            onChange={(e) => updateField('schoolDistrict', e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="grade-level">Grade Level (if applicable)</label>
          <select
            id="grade-level"
            className="form-control"
            value={formData.gradeLevel}
            onChange={(e) => updateField('gradeLevel', e.target.value)}
          >
            <option value="">Select grade level</option>
            <option value="9">9th Grade</option>
            <option value="10">10th Grade</option>
            <option value="11">11th Grade</option>
            <option value="12">12th Grade</option>
            <option value="ged">GED Program</option>
            <option value="graduate">Recent Graduate</option>
          </select>
        </div>
      </div>

      <div className="form-section" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>
          Required Consents
        </h3>

        <div className="form-group">
          <label className="consent-checkbox-label">
            <input
              type="checkbox"
              checked={formData.consentTerms}
              onChange={(e) => updateField('consentTerms', e.target.checked)}
              required
            />
            <span style={{ marginLeft: '0.5rem' }}>
              I am the parent or legal guardian of {studentName}, and I have read and agree to the{' '}
              <LocalizedLink href="/terms" target="_blank" style={{ color: 'var(--wa-accent-text)', textDecoration: 'underline' }}>
                Terms of Service
              </LocalizedLink>{' '}
              and{' '}
              <LocalizedLink href="/privacy" target="_blank" style={{ color: 'var(--wa-accent-text)', textDecoration: 'underline' }}>
                Privacy Policy
              </LocalizedLink>
              . I consent to my child&rsquo;s participation in WorkforceAP programs.{' '}
              <span style={{ color: 'var(--wa-accent-text)' }}>*</span>
            </span>
          </label>
        </div>

        <div className="form-group">
          <label className="consent-checkbox-label">
            <input
              type="checkbox"
              checked={formData.ferpaConsent}
              onChange={(e) => updateField('ferpaConsent', e.target.checked)}
            />
            <span style={{ marginLeft: '0.5rem' }}>
              I consent to WorkforceAP sharing my child&rsquo;s educational progress and training records 
              with authorized school officials (if applicable under FERPA).
            </span>
          </label>
        </div>

        <div className="form-group">
          <label className="consent-checkbox-label">
            <input
              type="checkbox"
              checked={formData.consentCommunications}
              onChange={(e) => updateField('consentCommunications', e.target.checked)}
            />
            <span style={{ marginLeft: '0.5rem' }}>
              I consent to receive program updates, career resources, and promotional communications 
              from WorkforceAP (optional).
            </span>
          </label>
        </div>
      </div>

      <div className="consent-form-notice" style={{ 
        padding: '1rem', 
        background: 'var(--surface-container-lowest)', 
        borderRadius: 'var(--radius-md)', 
        marginBottom: '1.5rem',
        border: '1px solid var(--outline-variant)'
      }}>
        <p style={{ fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--color-on-surface)' }}>
          <strong>Your Rights:</strong> You may withdraw consent, request access to your child&rsquo;s information, 
          or request deletion at any time by contacting us at{' '}
          <a href="mailto:info@workforceap.org" style={{ color: 'var(--wa-accent-text)' }}>
            info@workforceap.org
          </a>
          . Under COPPA and FERPA, you have the right to review any information we collect about your child.
        </p>
      </div>

      <button
        type="submit"
        className={marketingButtonPresets.formSubmitPrimary('btn-full-width')}
        disabled={submitting || !formData.consentTerms}
        aria-busy={submitting}
      >
        <span aria-live="polite">
          {submitting ? 'Submitting consent...' : 'Submit Parental Consent'}
        </span>
      </button>
    </form>
  );
}
