'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Program } from '@/lib/content/programs';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { ProgramIcon } from '@/components/ProgramIcon';
import { formatPhone } from '@/lib/formatPhone';
import { ADMIN_REFERRAL_SOURCE_OPTIONS } from '@/lib/referralSources';
import {
  getResumeUploadFileError,
  RESUME_UPLOAD_ACCEPT,
  RESUME_UPLOAD_FORMAT_LABEL,
} from '@/lib/portal/memberResumeUpload';
import { getResumeExtractionWarning } from '@/lib/resume/extractionQuality';
import { User, BookOpen, FileText, CheckCircle, Handshake, Wallet } from 'lucide-react';

const FUNDING_SOURCE_OPTIONS = [
  { value: '', label: '— Not set —' },
  { value: 'GRANT', label: 'WIOA / Grant' },
  { value: 'EMPLOYER', label: 'Employer-Paid' },
  { value: 'PARTNER_ORG', label: 'Partner Organization Sponsored' },
  { value: 'SELF', label: 'Self-Pay' },
  { value: 'OTHER', label: 'Other' },
];
const EMPLOYMENT = ['Unemployed', 'Underemployed', 'Employed', 'Self-Employed'];
const VETERAN = ['Not a Veteran', 'Veteran', 'Disabled Veteran'];
const INCOME = ['Under $20K', '$20K–$40K', '$40K–$60K', 'Over $60K'];
const EDUCATION = ['Less than HS', 'HS Diploma or GED', 'Some College', "Associate's", "Bachelor's", 'Graduate'];
const REFERRAL = [...ADMIN_REFERRAL_SOURCE_OPTIONS];
const ETHNICITY = [
  'Hispanic/Latino', 'White', 'Black or African American', 'Asian',
  'American Indian or Alaska Native', 'Native Hawaiian or Pacific Islander', 'Two or More Races',
];

type FormData = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  dob: string;
  employmentStatus: string;
  veteranStatus: string;
  householdIncome: string;
  educationLevel: string;
  referralSource: string;
  notes: string;
  /** Eligibility answers start unanswered; an admin must choose Yes or No (audit 2026-09-20). */
  usCitizen: boolean | null;
  authorizedToWork: boolean | null;
  hasDisability: boolean;
  ethnicity: string;
  programSlug: string;
  programNotes: string;
  partnerId: string;
  subgroupId: string;
  fundingSource: string;
  fundingNotes: string;
  workspaceEmail: string;
};

const initialForm: FormData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address: '',
  dob: '',
  employmentStatus: '',
  veteranStatus: '',
  householdIncome: '',
  educationLevel: '',
  referralSource: '',
  notes: '',
  usCitizen: null,
  authorizedToWork: null,
  hasDisability: false,
  ethnicity: '',
  programSlug: '',
  programNotes: '',
  partnerId: '',
  subgroupId: '',
  fundingSource: '',
  fundingNotes: '',
  workspaceEmail: '',
};

type PartnerOption = { id: string; name: string };
type SubgroupOption = { id: string; name: string; type: string };
type Props = { programs: Program[]; partners: PartnerOption[]; subgroups: SubgroupOption[] };

export default function AddMemberWizard({ programs, partners, subgroups }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(initialForm);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState('');
  const [enhancedResume, setEnhancedResume] = useState('');
  const [improvementSummary, setImprovementSummary] = useState<string[]>([]);
  const [resumeWarning, setResumeWarning] = useState('');
  const [contactSuggestions, setContactSuggestions] = useState<{
    name: string;
    email: string;
    phone: string;
  } | null>(null);
  const [loading, setLoading] = useState<'parse' | 'enhance' | 'create' | null>(null);
  const [error, setError] = useState('');
  const enhancementGenerationRef = useRef(0);

  const invalidateEnhancedResume = () => {
    enhancementGenerationRef.current += 1;
    setEnhancedResume('');
    setImprovementSummary([]);
    setLoading((current) => current === 'enhance' ? null : current);
  };

  const update = (k: keyof FormData, v: FormData[keyof FormData]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setError('');
  };

  const selectProgram = (programSlug: string) => {
    if (programSlug !== form.programSlug) invalidateEnhancedResume();
    update('programSlug', programSlug);
  };

  const downloadResumeOriginal = () => {
    if (!resumeFile) return;
    const url = URL.createObjectURL(resumeFile);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = resumeFile.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const downloadResumeEnhanced = () => {
    if (!enhancedResume) return;
    const blob = new Blob([enhancedResume], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = 'enhanced-resume.txt';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const handleFile = async (file: File) => {
    invalidateEnhancedResume();
    setResumeText('');
    setResumeWarning('');
    setContactSuggestions(null);

    const validationError = getResumeUploadFileError(file);
    if (validationError) {
      setResumeFile(null);
      setError(validationError);
      return;
    }

    setResumeFile(file);
    setError('');
    setLoading('parse');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/ai/extract-resume-text', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.text) {
        setResumeText(data.text);
        setResumeWarning(getResumeExtractionWarning(data.text) ?? '');
        try {
          const parseRes = await fetch('/api/admin/members/parse-resume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resume: data.text }),
          });
          const parseData = await parseRes.json().catch(() => ({}));
          if (parseRes.ok && parseData.extracted) {
            const ex = parseData.extracted as Record<string, unknown>;
            setContactSuggestions({
              name: typeof ex.extracted_name === 'string' ? ex.extracted_name : '',
              email: typeof ex.extracted_email === 'string' ? ex.extracted_email : '',
              phone: typeof ex.extracted_phone === 'string' ? ex.extracted_phone : '',
            });
          } else {
            setResumeWarning((current) => [
              current,
              'Resume attached. Contact suggestions were unavailable; review member details manually.',
            ].filter(Boolean).join(' '));
          }
        } catch {
          setResumeWarning((current) => [
            current,
            'Resume attached. Contact suggestions were unavailable; review member details manually.',
          ].filter(Boolean).join(' '));
        }
      } else {
        setResumeFile(null);
        setResumeText('');
        setEnhancedResume('');
        setImprovementSummary([]);
        setError(data.error ?? 'Could not extract text');
      }
    } catch {
      setResumeFile(null);
      setResumeText('');
      setEnhancedResume('');
      setImprovementSummary([]);
      setError('Upload failed');
    } finally {
      setLoading(null);
    }
  };

  const handleEnhance = async () => {
    if (!resumeText || !form.programSlug) return;
    const requestGeneration = enhancementGenerationRef.current + 1;
    enhancementGenerationRef.current = requestGeneration;
    const sourceResume = resumeText;
    const sourceProgramSlug = form.programSlug;

    setEnhancedResume('');
    setImprovementSummary([]);
    setLoading('enhance');
    setError('');
    try {
      const program = programs.find((p) => p.slug === sourceProgramSlug);
      const res = await fetch('/api/admin/members/enhance-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume: sourceResume, programTitle: program?.title ?? programDisplayTitle(sourceProgramSlug) }),
      });
      const data = await res.json().catch(() => ({}));
      if (requestGeneration !== enhancementGenerationRef.current) return;
      if (res.ok) {
        setEnhancedResume(data.enhancedResume ?? '');
        setImprovementSummary(data.improvementSummary ?? []);
      } else setError(data.error ?? 'Enhancement failed');
    } catch {
      if (requestGeneration === enhancementGenerationRef.current) setError('Enhancement failed');
    } finally {
      if (requestGeneration === enhancementGenerationRef.current) {
        setLoading((current) => current === 'enhance' ? null : current);
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await handleFile(file);
    } finally {
      e.target.value = '';
    }
  };

  const handleSubmit = async () => {
    setLoading('create');
    setError('');
    try {
      const payload = {
        ...form,
        usCitizen: form.usCitizen === true,
        authorizedToWork: form.authorizedToWork === true,
        hasDisability: form.hasDisability,
        partnerId: form.partnerId || undefined,
        subgroupId: form.subgroupId || undefined,
      };
      const res = await fetch('/api/admin/members/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to create member');
        setLoading(null);
        return;
      }
      const userId = typeof data.userId === 'string' ? data.userId : '';
      if (!userId) {
        setError('The member may have been created, but the server did not return their profile link. Search Members before trying again to avoid a duplicate account.');
        setLoading(null);
        return;
      }

      let resumeUploadError = '';
      if (userId && (resumeFile || enhancedResume)) {
        try {
          const fd = new FormData();
          if (resumeFile) fd.append('resumeOriginal', resumeFile);
          if (enhancedResume) fd.append('resumeEnhanced', enhancedResume);
          const uploadRes = await fetch(`/api/admin/members/${userId}/upload-resume`, { method: 'POST', body: fd });
          if (!uploadRes.ok) {
            const uploadData = await uploadRes.json().catch(() => ({}));
            resumeUploadError = typeof uploadData.error === 'string'
              ? uploadData.error
              : 'Resume upload failed.';
          }
        } catch {
          resumeUploadError = 'Resume upload failed because the server could not be reached.';
        }
      }

      let fundingSetupError = '';
      if (userId && (form.fundingSource || form.workspaceEmail)) {
        try {
          const fundingRes = await fetch(`/api/admin/members/${userId}/enrollment-funding`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fundingSource: form.fundingSource || null,
              fundingNotes: form.fundingNotes.trim() || null,
              workspaceEmail: form.workspaceEmail.trim() || null,
              workspaceEmailProvisioned: false,
            }),
          });
          if (!fundingRes.ok) fundingSetupError = 'Funding or workspace setup did not finish.';
        } catch {
          fundingSetupError = 'Funding or workspace setup did not finish because the server could not be reached.';
        }
      }
      const email = data.email ?? form.email;
      const welcomeEmailError = data.welcomeEmailSent === false
        ? 'Welcome email could not be confirmed. Send a password reset from this member record.'
        : '';
      const params = new URLSearchParams({
        toast: resumeUploadError || fundingSetupError || welcomeEmailError ? 'created-with-warnings' : 'created',
        email,
      });
      if (resumeUploadError) params.set('resumeError', resumeUploadError.slice(0, 300));
      if (fundingSetupError) params.set('setupError', fundingSetupError.slice(0, 300));
      if (welcomeEmailError) params.set('welcomeError', welcomeEmailError);
      router.push(`/admin/members/${userId}?${params.toString()}`);
      router.refresh();
    } catch {
      setError('Failed to create member');
    } finally {
      setLoading(null);
    }
  };

  const canProceedStep1 = form.firstName && form.email && form.employmentStatus && form.educationLevel &&
    form.usCitizen === true && form.authorizedToWork === true;
  const selectedProgram = programs.find((program) => program.slug === form.programSlug);
  const canProceedStep2 = Boolean(form.programSlug && !selectedProgram?.curriculumMigrationPending);
  const maxStep = 6;

  const stepLabels = [
    'Basic Info',
    'Program Selection',
    'Partner Referral',
    'Resume Upload',
    'Funding Source',
    'Review & Create',
  ];

  return (
    <div className="wizard-container">
      <div className="wizard-step-indicator">
        <span className="wizard-step-label">Step {step} of 6 — {stepLabels[step - 1]}</span>
        <div className="wizard-step-dots">
          {[1, 2, 3, 4, 5, 6].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStep(s)}
              className={`wizard-step-dot ${step === s ? 'active' : ''}`}
              aria-current={step === s ? 'step' : undefined}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="admin-error-banner" style={{ padding: '0.75rem', marginBottom: '1rem', borderRadius: '6px' }}>
          {error}
        </div>
      )}

      {/* Step 1: Basic Info */}
      {step === 1 && (
        <section className="wizard-step wizard-step-1">
          <h2 className="wizard-section-title"><User size={22} className="wizard-icon" /> Basic Info</h2>
          <div className="wizard-form-grid">
            <div className="wizard-field">
              <label htmlFor="wizard-firstName">First Name *</label>
              <input id="wizard-firstName" type="text" value={form.firstName} onChange={(e) => update('firstName', e.target.value)} required />
            </div>
            <div className="wizard-field">
              <label htmlFor="wizard-lastName">Last Name *</label>
              <input id="wizard-lastName" type="text" value={form.lastName} onChange={(e) => update('lastName', e.target.value)} />
            </div>
            <div className="wizard-field">
              <label htmlFor="wizard-email">Email *</label>
              <input id="wizard-email" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required />
            </div>
            <div className="wizard-field">
              <label htmlFor="wizard-phone">Phone *</label>
              <input id="wizard-phone" type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
            </div>
            <div className="wizard-field wizard-field-full">
              <label htmlFor="wizard-address">Address (optional)</label>
              <input id="wizard-address" type="text" value={form.address} onChange={(e) => update('address', e.target.value)} />
            </div>
            <div className="wizard-field">
              <label htmlFor="wizard-dob">Date of Birth (optional)</label>
              <input id="wizard-dob" type="date" value={form.dob} onChange={(e) => update('dob', e.target.value)} />
            </div>
            <div className="wizard-field">
              <label htmlFor="wizard-employmentStatus">Employment Status *</label>
              <select id="wizard-employmentStatus" value={form.employmentStatus} onChange={(e) => update('employmentStatus', e.target.value)} required>
                <option value="">Select…</option>
                {EMPLOYMENT.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="wizard-field">
              <label htmlFor="wizard-veteranStatus">Veteran Status</label>
              <select id="wizard-veteranStatus" value={form.veteranStatus} onChange={(e) => update('veteranStatus', e.target.value)}>
                <option value="">Select…</option>
                {VETERAN.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="wizard-field">
              <label htmlFor="addmemberwizard-household-income-field">Household Income</label>
              <select id="addmemberwizard-household-income-field" value={form.householdIncome} onChange={(e) => update('householdIncome', e.target.value)}>
                <option value="">Select…</option>
                {INCOME.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="wizard-field">
              <label htmlFor="addmemberwizard-education-level-field">Education Level *</label>
              <select id="addmemberwizard-education-level-field" value={form.educationLevel} onChange={(e) => update('educationLevel', e.target.value)} required>
                <option value="">Select…</option>
                {EDUCATION.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="wizard-field wizard-field-full">
              <label htmlFor="addmemberwizard-referral-source-field">Referral Source</label>
              <select id="addmemberwizard-referral-source-field" value={form.referralSource} onChange={(e) => update('referralSource', e.target.value)}>
                <option value="">Select…</option>
                {REFERRAL.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div className="wizard-wioa-card">
            <h3 className="wizard-wioa-title">Workforce Reporting</h3>
            <div className="wizard-wioa-toggles">
              <div className="wizard-toggle-row">
                <label>US Citizen or Permanent Resident? *</label>
                <div className="wizard-toggle">
                  <button type="button" aria-pressed={form.usCitizen === true} className={form.usCitizen === true ? 'active' : ''} onClick={() => update('usCitizen', true)}>Yes</button>
                  <button type="button" aria-pressed={form.usCitizen === false} className={form.usCitizen === false ? 'active' : ''} onClick={() => update('usCitizen', false)}>No</button>
                </div>
              </div>
              <div className="wizard-toggle-row">
                <label>Authorized to work in US? *</label>
                <div className="wizard-toggle">
                  <button type="button" aria-pressed={form.authorizedToWork === true} className={form.authorizedToWork === true ? 'active' : ''} onClick={() => update('authorizedToWork', true)}>Yes</button>
                  <button type="button" aria-pressed={form.authorizedToWork === false} className={form.authorizedToWork === false ? 'active' : ''} onClick={() => update('authorizedToWork', false)}>No</button>
                </div>
              </div>
              <div className="wizard-toggle-row">
                <label>Has a disability?</label>
                <div className="wizard-toggle">
                  <button type="button" className={form.hasDisability ? 'active' : ''} onClick={() => update('hasDisability', true)}>Yes</button>
                  <button type="button" className={!form.hasDisability ? 'active' : ''} onClick={() => update('hasDisability', false)}>No</button>
                </div>
              </div>
            </div>
            <div className="wizard-field">
              <label htmlFor="addmemberwizard-ethnicity-field">Ethnicity</label>
              <select id="addmemberwizard-ethnicity-field" value={form.ethnicity} onChange={(e) => update('ethnicity', e.target.value)}>
                <option value="">Select…</option>
                {ETHNICITY.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div className="wizard-field wizard-field-full wizard-counselor-notes">
            <label htmlFor="addmemberwizard-counselor-notes-field">Counselor Notes</label>
            <textarea id="addmemberwizard-counselor-notes-field" value={form.notes} onChange={(e) => update('notes', e.target.value)} rows={3} placeholder="Internal notes — not visible to the member" />
          </div>
          <div className="wizard-actions">
            <button type="button" className="btn btn-primary" onClick={() => setStep(2)} disabled={!canProceedStep1}>
              Continue to Step 2
            </button>
          </div>
        </section>
      )}

      {/* Step 2: Program Selection */}
      {step === 2 && (
        <section className="wizard-step wizard-step-2">
          <h2 className="wizard-section-title"><BookOpen size={22} className="wizard-icon" /> Program Selection</h2>
          <p className="wizard-desc">Select the program for this member.</p>
          <div className="wizard-program-grid">
            {programs.map((p) => (
              <button
                type="button"
                key={p.slug}
                onClick={() => selectProgram(p.slug)}
                disabled={p.curriculumMigrationPending}
                aria-describedby={p.curriculumMigrationPending ? `program-${p.slug}-status` : undefined}
                className={`wizard-program-card ${form.programSlug === p.slug ? 'selected' : ''} ${p.curriculumMigrationPending ? 'disabled' : ''}`}
                style={{ textAlign: 'left', width: '100%' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.25rem' }}><ProgramIcon program={p} size={24} /></div>
                <h3 style={{ fontSize: '1rem', marginBottom: '0.25rem' }}>{p.title}</h3>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>{p.duration}</div>
                {p.curriculumMigrationPending ? (
                  <p
                    id={`program-${p.slug}-status`}
                    style={{ margin: '0.65rem 0 0', fontSize: '0.8rem', color: 'var(--color-error)', fontWeight: 700 }}
                  >
                    Enrollment temporarily paused while the revised Coursera curriculum mapping is verified. Existing members keep access.
                  </p>
                ) : null}
              </button>
            ))}
          </div>
          <div className="wizard-field wizard-field-full">
            <label htmlFor="addmemberwizard-why-this-program-optional-counselor-note-field">Why this program? (optional, counselor note)</label>
            <textarea id="addmemberwizard-why-this-program-optional-counselor-note-field" value={form.programNotes} onChange={(e) => update('programNotes', e.target.value)} rows={2} />
          </div>
          <div className="wizard-actions wizard-actions-between">
            <button type="button" className="btn btn-outline" onClick={() => setStep(1)}>Back</button>
            <button type="button" className="btn btn-primary" onClick={() => setStep(3)} disabled={!canProceedStep2}>
              Continue to Step 3
            </button>
          </div>
        </section>
      )}

      {/* Step 3: Partner Referral (optional) */}
      {step === 3 && (
        <section className="wizard-step wizard-step-partner">
          <h2 className="wizard-section-title">
            <Handshake size={22} className="wizard-icon" /> Partner referral
          </h2>
          <p className="wizard-desc">
            Optional. Assign an active partner organization for referral tracking and automated milestone emails to their contact.
          </p>
          <div className="wizard-field wizard-field-full">
            <label htmlFor="addmemberwizard-partner-organization-field">Partner organization</label>
            <select id="addmemberwizard-partner-organization-field" value={form.partnerId} onChange={(e) => update('partnerId', e.target.value)}>
              <option value="">None</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="wizard-field wizard-field-full">
            <label htmlFor="addmemberwizard-subgroup-optional-field">Subgroup (optional)</label>
            <select id="addmemberwizard-subgroup-optional-field" value={form.subgroupId} onChange={(e) => update('subgroupId', e.target.value)}>
              <option value="">None</option>
              {subgroups.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.type})
                </option>
              ))}
            </select>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', marginTop: '0.25rem' }}>Assign to a subgroup for partner/manager/church visibility. Auto-assigned if partner is linked to a subgroup.</p>
          </div>
          <div className="wizard-actions wizard-actions-between">
            <button type="button" className="btn btn-outline" onClick={() => setStep(2)}>
              Back
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setStep(4)}>
              Continue to Step 4
            </button>
          </div>
        </section>
      )}

      {/* Step 4: Resume Upload */}
      {step === 4 && (
        <section className="wizard-step wizard-step-3">
          <h2 className="wizard-section-title"><FileText size={22} className="wizard-icon" /> Resume Upload + AI Enhancement</h2>
          <p className="wizard-desc">Optional. You can upload a resume later.</p>
          <div
            className={`counselor-resume-upload ${loading === 'parse' ? 'loading' : ''}`}
            aria-busy={loading === 'parse' || loading === 'enhance'}
            aria-disabled={loading !== null}
            onClick={() => {
              if (!loading) document.getElementById('wizard-resume-input')?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (loading) {
                e.dataTransfer.dropEffect = 'none';
                return;
              }
              e.currentTarget.classList.add('dragover');
            }}
            onDragLeave={(e) => e.currentTarget.classList.remove('dragover')}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove('dragover');
              if (loading) return;
              const file = e.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
          >
            <input id="wizard-resume-input" type="file" accept={RESUME_UPLOAD_ACCEPT} onChange={handleFileUpload} disabled={!!loading} style={{ display: 'none' }} />
            {loading === 'parse' ? <span>Parsing…</span> : resumeFile ? <span>{resumeFile.name}</span> : <span>Drag and drop {RESUME_UPLOAD_FORMAT_LABEL} here (max 5MB)<br />or click to browse</span>}
          </div>
          {resumeWarning && <p role="status" className="wizard-desc" style={{ marginTop: '0.5rem' }}>{resumeWarning}</p>}
          {contactSuggestions && (contactSuggestions.name || contactSuggestions.email || contactSuggestions.phone) && (
            <div className="wizard-improvement-summary" role="status">
              <strong>Review contact suggestions from the resume:</strong>
              <ul>
                {contactSuggestions.name && <li>Name: {contactSuggestions.name}</li>}
                {contactSuggestions.email && <li>Email: {contactSuggestions.email}</li>}
                {contactSuggestions.phone && <li>Phone: {contactSuggestions.phone}</li>}
              </ul>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  const parts = contactSuggestions.name.trim().split(/\s+/).filter(Boolean);
                  setForm((current) => ({
                    ...current,
                    firstName: parts[0] || current.firstName,
                    lastName: parts.slice(1).join(' ') || current.lastName,
                    email: contactSuggestions.email || current.email,
                    phone: contactSuggestions.phone || current.phone,
                  }));
                  setContactSuggestions(null);
                  setResumeWarning('Contact suggestions applied. Review Step 1 before creating the member.');
                }}
              >
                Apply reviewed suggestions
              </button>
            </div>
          )}
          {!resumeFile && (
            <button type="button" className="wizard-skip-link" onClick={() => setStep(5)}>
              Skip — you can upload a resume later
            </button>
          )}
          {resumeText && (
            <>
              <div className="counselor-resume-preview">
                <div className="counselor-resume-card">
                  <h3>Original Resume</h3>
                  <pre>{resumeText.slice(0, 1500)}{resumeText.length > 1500 ? '…' : ''}</pre>
                  {resumeFile && (
                    <button type="button" className="btn btn-outline btn-sm" onClick={downloadResumeOriginal}>
                      Download
                    </button>
                  )}
                </div>
                <div className="counselor-resume-card">
                  <h3>AI-Enhanced Resume</h3>
                  {enhancedResume ? (
                    <>
                      <pre>{enhancedResume.slice(0, 1500)}{enhancedResume.length > 1500 ? '…' : ''}</pre>
                      <button type="button" className="btn btn-outline btn-sm" onClick={downloadResumeEnhanced}>
                        Download
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-primary" onClick={handleEnhance} disabled={!!loading || !form.programSlug}>
                      {loading === 'enhance' ? 'Generating…' : 'Generate Enhanced Resume'}
                    </button>
                  )}
                </div>
              </div>
              {improvementSummary.length > 0 && (
                <div className="wizard-improvement-summary">
                  <strong>Improvements applied:</strong>
                  <ul>
                    {improvementSummary.map((s, i) => <li key={i}>{s.replace(/^[•\-]\s*/, '')}</li>)}
                  </ul>
                </div>
              )}
            </>
          )}
          <div className="wizard-actions wizard-actions-between">
            <button type="button" className="btn btn-outline" onClick={() => setStep(3)}>Back</button>
            <button type="button" className="btn btn-primary" onClick={() => setStep(5)}>
              Continue to Step 5
            </button>
          </div>
        </section>
      )}

      {/* Step 5: Funding Source */}
      {step === 5 && (
        <section className="wizard-step wizard-step-5">
          <h2 className="wizard-section-title"><Wallet size={22} className="wizard-icon" /> Funding Source</h2>
          <div className="wizard-form-grid">
            <div className="wizard-field">
              <label htmlFor="wizard-fundingSource">Funding Source</label>
              <select
                id="wizard-fundingSource"
                value={form.fundingSource}
                onChange={(e) => update('fundingSource', e.target.value)}
              >
                {FUNDING_SOURCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="wizard-field wizard-field-full">
              <label htmlFor="wizard-fundingNotes">Funding Notes</label>
              <textarea
                id="wizard-fundingNotes"
                value={form.fundingNotes}
                onChange={(e) => update('fundingNotes', e.target.value)}
                rows={3}
                placeholder="e.g. WIOA Title I, employer PO#1234, partner org name…"
              />
            </div>
            <div className="wizard-field">
              <label htmlFor="wizard-workspaceEmail">Workspace Email (optional)</label>
              <input
                id="wizard-workspaceEmail"
                type="email"
                value={form.workspaceEmail}
                onChange={(e) => update('workspaceEmail', e.target.value)}
                placeholder="member@workforceap.org"
              />
            </div>
          </div>
          <div className="wizard-actions wizard-actions-between">
            <button type="button" className="btn btn-outline" onClick={() => setStep(4)}>Back</button>
            <button type="button" className="btn btn-primary" onClick={() => setStep(6)}>
              Continue to Step 6
            </button>
          </div>
        </section>
      )}

      {/* Step 6: Review & Create */}
      {step === 6 && (
        <section className="wizard-step wizard-step-4">
          <h2 className="wizard-section-title"><CheckCircle size={22} className="wizard-icon" /> Review & Create</h2>
          <div className="wizard-summary-card">
            <p><strong>Personal:</strong> {form.firstName} {form.lastName}, {form.email}, {formatPhone(form.phone)}</p>
            <p><strong>WIOA:</strong> Citizen {form.usCitizen === null ? '—' : form.usCitizen ? 'Yes' : 'No'}, Authorized {form.authorizedToWork === null ? '—' : form.authorizedToWork ? 'Yes' : 'No'}, Disability {form.hasDisability ? 'Yes' : 'No'}, Ethnicity: {form.ethnicity || '—'}</p>
            <p><strong>Program:</strong> {programs.find((p) => p.slug === form.programSlug)?.title ?? programDisplayTitle(form.programSlug)}</p>
            <p>
              <strong>Partner referral:</strong>{' '}
              {form.partnerId ? partners.find((p) => p.id === form.partnerId)?.name ?? form.partnerId : 'None'}
            </p>
            <p>
              <strong>Subgroup:</strong>{' '}
              {form.subgroupId ? subgroups.find((s) => s.id === form.subgroupId)?.name ?? form.subgroupId : 'None'}
            </p>
            <p><strong>Resume:</strong> {resumeFile ? 'Original uploaded' : 'Not uploaded'}{enhancedResume ? ' + Enhanced' : ''}</p>
            {form.notes && <p><strong>Counselor notes:</strong> {form.notes}</p>}
            {form.fundingSource && (
              <p><strong>Funding:</strong> {FUNDING_SOURCE_OPTIONS.find((o) => o.value === form.fundingSource)?.label ?? form.fundingSource}{form.fundingNotes ? ` — ${form.fundingNotes}` : ''}</p>
            )}
            {form.workspaceEmail && <p><strong>Workspace email:</strong> {form.workspaceEmail}</p>}
          </div>
          <div className="wizard-actions wizard-actions-between">
            <button type="button" className="btn btn-outline" onClick={() => setStep(5)}>Back</button>
            <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={!!loading}>
              {loading === 'create' ? 'Creating…' : 'Create Member Account'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
