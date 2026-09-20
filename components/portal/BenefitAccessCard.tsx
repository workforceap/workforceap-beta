'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trackLicenseRequest } from '@/lib/analytics/events';

const ASSESSMENT_REDIRECT_KEY = 'assessment_intended_destination';

type BenefitStatus = 'not_requested' | 'pending' | 'active';

type BenefitAccessCardProps = {
  benefitId: string;
  name: string;
  status: BenefitStatus;
  description?: string;
  /** For Coursera: must complete assessment before access. If false, redirects to /dashboard/assessment */
  assessmentCompleted?: boolean;
};

/** WAP-105: benefit status reads through the kit's two documented tones (ok / warn) plus muted. */
const STATUS_TONE_CLASS: Record<BenefitStatus, string> = {
  not_requested: 'wa-kit-tag wa-kit-tag--muted',
  pending: 'wa-kit-tag wa-kit-tag--warn',
  active: 'wa-kit-tag wa-kit-tag--ok',
};

const STATUS_LABELS: Record<BenefitStatus, string> = {
  not_requested: 'Not requested',
  pending: 'Pending',
  active: 'Active',
};

export default function BenefitAccessCard({ benefitId, name, status: initialStatus, description, assessmentCompleted = true }: BenefitAccessCardProps) {
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const isActive = status === 'active';
  const isPending = status === 'pending';
  const isCoursera = benefitId === 'coursera';
  const needsAssessment = isCoursera && assessmentCompleted === false;

  const redirectToAssessment = (intendedDestination: string) => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(ASSESSMENT_REDIRECT_KEY, intendedDestination);
      router.push('/dashboard/assessment');
    }
  };

  const handleRequest = async () => {
    if (isActive || isPending) return;
    if (needsAssessment) {
      redirectToAssessment('/dashboard');
      return;
    }
    setLoading(true);
    setError('');
    trackLicenseRequest(name);

    try {
      const res = await fetch('/api/member/benefits/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ benefit: benefitId }),
      });
      const data = await res.json();

      if (res.ok) {
        setStatus(data.status === 'active' ? 'active' : 'pending');
      } else {
        setError(data.error ?? 'Request failed');
      }
    } catch {
      setError('Request failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPlatform = () => {
    // Route Coursera opens through our launch API so we land the member in
    // their org-scoped Coursera For Business program (resolved server-side
    // from B4B / discovered catalog) rather than the generic public catalog.
    const courseraTarget = '/api/member/coursera/launch';
    if (needsAssessment) {
      redirectToAssessment(isCoursera ? courseraTarget : 'https://coursera.org');
      return;
    }
    if (benefitId === 'linkedin_premium') {
      window.open('https://linkedin.com', '_blank', 'noopener,noreferrer');
      return;
    }
    if (isCoursera) {
      window.open(courseraTarget, '_blank', 'noopener,noreferrer');
      return;
    }
    window.open('https://coursera.org', '_blank', 'noopener,noreferrer');
  };

  if (isActive) {
    return (
      <div className="benefit-card">
        <div className="benefit-card-header">
          <h3 className="benefit-card-title">{name}</h3>
          <span className={STATUS_TONE_CLASS.active}>{STATUS_LABELS.active}</span>
        </div>
        {description && <p className="benefit-card-desc">{description}</p>}
        <button
          type="button"
          className="btn btn-primary benefit-card-cta"
          onClick={handleOpenPlatform}
        >
          Open Platform
        </button>
      </div>
    );
  }

  return (
    <div className="benefit-card">
      <div className="benefit-card-header">
        <h3 className="benefit-card-title">{name}</h3>
        <span className={STATUS_TONE_CLASS[status]}>{STATUS_LABELS[status]}</span>
      </div>
      {description && <p className="benefit-card-desc">{description}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button
        type="button"
        className="btn btn-outline benefit-card-cta"
        onClick={handleRequest}
        disabled={loading || isPending}
      >
        {loading ? 'Requesting...' : isPending ? 'Pending' : 'Request Access'}
      </button>
    </div>
  );
}
