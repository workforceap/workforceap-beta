'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import PasswordToggle from '@/components/forms/PasswordToggle';
import HearAboutSelect from '@/components/apply/HearAboutSelect';
import { hearAboutNeedsOther } from '@/lib/apply/eligibilityExtendedFields';
import './signup-depth.css';

const Turnstile = dynamic(() => import('@marsidev/react-turnstile').then((m) => m.Turnstile), { ssr: false });

const CAPTCHA_ENABLED = process.env.NEXT_PUBLIC_CAPTCHA_ENABLED === 'true';
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

export default function EmployerSignupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [industry, setIndustry] = useState('');
  const [companySize, setCompanySize] = useState('');
  const [hearAbout, setHearAbout] = useState('');
  const [hearAboutOther, setHearAboutOther] = useState('');
  const [consentTerms, setConsentTerms] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);

  function validatePassword(value: string): string[] {
    const errs: string[] = [];
    if (value.length < 8) errs.push('At least 8 characters');
    if (!/[A-Z]/.test(value)) errs.push('One uppercase letter');
    if (!/[a-z]/.test(value)) errs.push('One lowercase letter');
    if (!/[0-9]/.test(value)) errs.push('One number');
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess(false);

    const pwErrs = validatePassword(password);
    if (pwErrs.length > 0) {
      setPasswordErrors(pwErrs);
      return;
    }
    setPasswordErrors([]);

    if (!consentTerms) {
      setError('You must agree to the terms and privacy policy.');
      return;
    }

    if (CAPTCHA_ENABLED && TURNSTILE_SITE_KEY && !turnstileToken?.trim()) {
      setError('Please complete the security check before continuing.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/employer/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          contactName,
          email,
          phone,
          password,
          industry,
          companySize,
          hearAbout: hearAboutNeedsOther(hearAbout)
            ? [hearAbout, hearAboutOther.trim()].filter(Boolean).join(': ').slice(0, 200)
            : hearAbout,
          consentTerms,
          ...(CAPTCHA_ENABLED && turnstileToken ? { turnstileToken } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        setLoading(false);
        return;
      }
      if (data.redirectTo) {
        router.push(data.redirectTo);
        return;
      }
      setSuccessMessage(typeof data.message === 'string' ? data.message : '');
      setSuccess(true);
      setLoading(false);
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="mdx signup-depth wa-min-h-screen">
      {/* The shared marketing MainNav (root layout) is the only header here.
          WAP-109: the page used to paint a second logo + "For Employers" /
          "Log in" bar beneath it, which read as a doubled header. */}
      <div className="wa-max-w-2xl wa-mx-auto wa-px-4 wa-py-12">
        {success && !loading ? (
          <div className="mdx-card wa-p-8 wa-text-center">
            <div className="sd-success-ring wa-w-16 wa-h-16 wa-rounded-full wa-flex wa-items-center wa-justify-center wa-mx-auto wa-mb-4">
              <CheckCircle className="wa-w-8 wa-h-8" />
            </div>
            <h1 className="sd-title wa-text-2xl wa-font-bold wa-mb-2">Account Created</h1>
            <p className="sd-lede wa-mb-6">
              {successMessage ||
                'Account created. Please check your email to verify your account before logging in.'}
            </p>
            <Link
              href="/login"
              className="btn btn-primary"
            >
              Go to Log In
            </Link>
          </div>
        ) : (
          <>
            <section className="mdx-stage wa-text-center wa-mb-8 wa-p-8 sm:wa-p-10">
              <span className="mdx-pill">For Employers</span>
              <h1 className="wa-text-3xl wa-font-bold wa-mb-2 wa-mt-4">
                Create Your <span className="mdx-grad-accent">Employer</span> Account
              </h1>
              <p className="wa-mx-auto">
                Create a free employer account to access training-aligned candidates. Hiring tools and partnership options are discussed with our team.
              </p>
            </section>

            <form onSubmit={handleSubmit} className="mdx-card wa-p-8 wa-space-y-6">
              {error && (
                <div role="alert" className="sd-error wa-flex wa-items-start wa-gap-3 wa-p-4 wa-text-sm">
                  <AlertCircle className="wa-w-5 wa-h-5 wa-shrink-0 wa-mt-0.5" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              {/* Company Info */}
              <div className="wa-space-y-4">
                <h2 className="mdx-eyebrow">Company Information</h2>
                <div>
                  <label htmlFor="companyName" className="sd-label wa-block wa-text-sm wa-mb-1">
                    Company Name <span className="sd-req">*</span>
                  </label>
                  <input
                    id="companyName"
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="sd-field"
                    placeholder="Acme Corp"
                  />
                </div>
                <div className="wa-grid wa-grid-cols-1 sm:wa-grid-cols-2 wa-gap-4">
                  <div>
                    <label htmlFor="industry" className="sd-label wa-block wa-text-sm wa-mb-1">
                      Industry
                    </label>
                    <input
                      id="industry"
                      type="text"
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      className="sd-field"
                      placeholder="e.g. Healthcare, Tech"
                    />
                  </div>
                  <div>
                    <label htmlFor="companySize" className="sd-label wa-block wa-text-sm wa-mb-1">
                      Company Size
                    </label>
                    <select
                      id="companySize"
                      value={companySize}
                      onChange={(e) => setCompanySize(e.target.value)}
                      className="sd-field"
                    >
                      <option value="">Select size</option>
                      <option value="1-10">1-10 employees</option>
                      <option value="11-50">11-50 employees</option>
                      <option value="51-200">51-200 employees</option>
                      <option value="201-500">201-500 employees</option>
                      <option value="500+">500+ employees</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Contact Info */}
              <div className="wa-space-y-4">
                <h2 className="mdx-eyebrow">Contact Information</h2>
                <div>
                  <label htmlFor="contactName" className="sd-label wa-block wa-text-sm wa-mb-1">
                    Your Name <span className="sd-req">*</span>
                  </label>
                  <input
                    id="contactName"
                    type="text"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="sd-field"
                    placeholder="Jane Smith"
                  />
                </div>
                <div className="wa-grid wa-grid-cols-1 sm:wa-grid-cols-2 wa-gap-4">
                  <div>
                    <label htmlFor="email" className="sd-label wa-block wa-text-sm wa-mb-1">
                      Work Email <span className="sd-req">*</span>
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="sd-field"
                      placeholder="jane@company.com"
                    />
                  </div>
                  <div>
                    <label htmlFor="phone" className="sd-label wa-block wa-text-sm wa-mb-1">
                      Phone
                    </label>
                    <input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="sd-field"
                      placeholder="(512) 555-1234"
                    />
                  </div>
                </div>
              </div>

              {/* Password */}
              <div className="wa-space-y-4">
                <h2 className="mdx-eyebrow">Account Security</h2>
                <div>
                  <label htmlFor="password" className="sd-label wa-block wa-text-sm wa-mb-1">
                    Password <span className="sd-req">*</span>
                  </label>
                  <div className="wa-relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setPasswordErrors(validatePassword(e.target.value));
                      }}
                      className="sd-field wa-pr-12"
                      placeholder="Create a strong password"
                      aria-invalid={passwordErrors.length > 0}
                      aria-describedby={passwordErrors.length > 0 ? 'password-errors' : undefined}
                    />
                    <PasswordToggle
                      visible={showPassword}
                      onToggle={() => setShowPassword((v) => !v)}
                      showLabel="Show password"
                      hideLabel="Hide password"
                      controls="password"
                      className="sd-pw-toggle"
                    />
                  </div>
                  {passwordErrors.length > 0 && (
                    <ul id="password-errors" role="alert" className="wa-mt-2 wa-space-y-1">
                      {passwordErrors.map((err) => (
                        <li key={err} className="wa-text-xs wa-flex wa-items-center wa-gap-1" style={{ color: '#8c0f37' }}>
                          <span className="sd-pw-dot" />
                          {err}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* How they heard */}
              <div>
                <label htmlFor="hearAbout" className="sd-label wa-block wa-text-sm wa-mb-1">
                  How did you hear about WorkforceAP?
                </label>
                <HearAboutSelect
                  id="hearAbout"
                  value={hearAbout}
                  onChange={setHearAbout}
                  className="sd-field"
                />
                {hearAboutNeedsOther(hearAbout) ? (
                  <input
                    id="hearAboutOther"
                    type="text"
                    value={hearAboutOther}
                    onChange={(e) => setHearAboutOther(e.target.value)}
                    className="sd-field"
                    style={{ marginTop: 8 }}
                    placeholder="Please tell us how you heard about us"
                    maxLength={200}
                  />
                ) : null}
              </div>

              {/* Terms */}
              <div className="wa-flex wa-items-start wa-gap-3">
                <input
                  id="consentTerms"
                  type="checkbox"
                  checked={consentTerms}
                  onChange={(e) => setConsentTerms(e.target.checked)}
                  className="sd-checkbox wa-mt-1 wa-w-4 wa-h-4 wa-rounded"
                />
                <label htmlFor="consentTerms" className="wa-text-sm" style={{ color: '#6e6a66' }}>
                  I agree to the{' '}
                  <Link href="/terms" className="sd-inline-link">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link href="/privacy" className="sd-inline-link">
                    Privacy Policy
                  </Link>
                  .
                </label>
              </div>

              {CAPTCHA_ENABLED && TURNSTILE_SITE_KEY ? (
                <div className="wa-flex wa-justify-center">
                  <Turnstile
                    siteKey={TURNSTILE_SITE_KEY}
                    onSuccess={(t) => setTurnstileToken(t)}
                    onExpire={() => setTurnstileToken(null)}
                    onError={() => setTurnstileToken(null)}
                    options={{ theme: 'light', size: 'normal' }}
                  />
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading || (CAPTCHA_ENABLED && !!TURNSTILE_SITE_KEY && !turnstileToken)}
                className="btn btn-primary btn-full-width"
              >
                {loading ? (
                  <>
                    <Loader2 className="wa-w-5 wa-h-5 wa-animate-spin" />
                    Creating account...
                  </>
                ) : (
                  'Create Employer Account'
                )}
              </button>

              <p className="wa-text-center wa-text-sm" style={{ color: '#6e6a66' }}>
                Already have an account?{' '}
                <Link href="/login" className="sd-inline-link">
                  Log in
                </Link>
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
