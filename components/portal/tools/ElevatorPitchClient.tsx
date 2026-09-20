'use client';

import { useState, useRef, useEffect, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import {
  Copy,
  Check,
  Video,
  CircleStop,
  RotateCcw,
  CheckCircle2,
} from 'lucide-react';
import { PortalInlineSpinner } from '@/components/portal/PortalInlineSpinner';
import { useDraftAutosave } from '@/hooks/useDraftAutosave';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import {
  MEMBER_REQUEST_FAILURE,
  MEMBER_REQUEST_TIMEOUT_MS,
  describeMemberRequestException,
  readMemberRequestFailure,
} from '@/lib/portal/memberRequestFailure';
import { FormField, StatusTag } from '@/components/portal/kit';
import AiToolLanguageSelector, { type AiToolLanguage } from './AiToolLanguageSelector';
import ToolFollowThrough from './ToolFollowThrough';
import AiToolError from './AiToolError';

type Step = 'form' | 'pitch' | 'rehearse';

const KIT_BTN =
  'wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none';

const kitBtnSolid: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  minHeight: 44,
  padding: '10px 16px',
  background: 'var(--wa-accent)',
  color: 'var(--wa-on-accent)',
  border: '1px solid var(--wa-accent)',
  fontWeight: 600,
  fontSize: 'var(--wa-type-body)',
  borderRadius: 999,
  cursor: 'pointer',
};

const kitBtnOutline: CSSProperties = {
  ...kitBtnSolid,
  background: 'transparent',
  color: 'var(--wa-accent)',
  border: '1px solid var(--wa-border)',
};

const FIELD_CONTROL: CSSProperties = {
  marginTop: 4,
  width: '100%',
  fontSize: 'var(--wa-type-body)',
  border: '1px solid var(--wa-border)',
  borderRadius: 'var(--wa-radius-sm)',
  padding: '10px 12px',
  outline: 'none',
  background: 'var(--wa-surface)',
  color: 'var(--wa-text)',
  fontFamily: 'inherit',
  minHeight: 44,
  boxSizing: 'border-box',
};

const FIELDS = [
  { id: 'ep-name', key: 'name' as const, label: 'Full name', placeholder: 'Jordan Reyes', required: true },
  { id: 'ep-role', key: 'role' as const, label: 'Target role', placeholder: 'Cloud Support Associate', required: true },
  { id: 'ep-strengths', key: 'strengths' as const, label: 'Strengths', placeholder: 'Ticket triage, runbooks' },
  { id: 'ep-certs', key: 'certs' as const, label: 'Certifications', placeholder: 'CompTIA A+, Google IT Support' },
  { id: 'ep-industry', key: 'industry' as const, label: 'Industry', placeholder: 'Hybrid cloud support' },
];

export default function ElevatorPitchClient({
  initialData,
  userId,
  preview = false,
  previewStep = 'form',
  previewPitch,
}: {
  initialData?: { name: string; targetRole: string; strengths: string; certifications: string; industry: string } | null;
  /** Signed-in member (or member being set up). Scopes the local draft so one client's answers never bleed into another's form. */
  userId?: string;
  preview?: boolean;
  previewStep?: Step;
  previewPitch?: string;
} = {}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(previewStep);
  const [name, setName] = useState(initialData?.name ?? '');
  const [targetRole, setTargetRole] = useState(initialData?.targetRole ?? '');
  const [strengths, setStrengths] = useState(initialData?.strengths ?? '');
  const [certifications, setCertifications] = useState(initialData?.certifications ?? '');
  const [industry, setIndustry] = useState(initialData?.industry ?? '');
  const [language, setLanguage] = useState<AiToolLanguage>('en');
  const setters = {
    name: setName,
    role: setTargetRole,
    strengths: setStrengths,
    certs: setCertifications,
    industry: setIndustry,
  };
  const values = { name, role: targetRole, strengths, certs: certifications, industry };

  // Drafts are keyed per member. The old shared key meant a counselor/admin
  // opening the tool for a NEW client saw the previous client's name, role and
  // strengths already filled in.
  const draftScope = `ai-tool:elevator-pitch:${userId ?? 'anon'}`;
  const nameDraft = useDraftAutosave(`${draftScope}:name`, name, setName);
  const roleDraft = useDraftAutosave(`${draftScope}:targetRole`, targetRole, setTargetRole);
  const strengthsDraft = useDraftAutosave(`${draftScope}:strengths`, strengths, setStrengths);
  const certsDraft = useDraftAutosave(`${draftScope}:certifications`, certifications, setCertifications);
  const industryDraft = useDraftAutosave(`${draftScope}:industry`, industry, setIndustry);
  // Staff often set up several clients under one login, so the per-user key
  // alone is not enough: drop the stored draft once a pitch is written, and
  // wipe both state and storage when starting a new client.
  const clearDrafts = () =>
    [nameDraft, roleDraft, strengthsDraft, certsDraft, industryDraft].forEach((d) => d.clear());
  const resetForm = () => {
    clearDrafts();
    setName('');
    setTargetRole('');
    setStrengths('');
    setCertifications('');
    setIndustry('');
  };

  // One-time cleanup of the legacy unscoped keys so stale data cannot resurface.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      for (const k of ['name', 'targetRole', 'strengths', 'certifications', 'industry']) {
        window.localStorage.removeItem(`ai-tool:elevator-pitch:${k}`);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const [pitch, setPitch] = useState(previewPitch ?? '');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<{ sent: boolean; error?: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  const [recording, setRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !targetRole.trim()) return;
    if (preview) {
      if (previewPitch) setPitch(previewPitch);
      setStep('pitch');
      return;
    }
    setGenerating(true);
    setGenError(null);
    setEmailStatus(null);
    try {
      // Timed out, non-JSON and 5xx answers all end in a visible error with the
      // button re-enabled — never an indefinite "Writing…" (member audit 7c).
      const res = await fetchWithTimeout(
        '/api/ai/elevator-pitch',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name, targetRole, strengths, certifications, industry, language }),
        },
        MEMBER_REQUEST_TIMEOUT_MS,
      );
      if (!res.ok) {
        setGenError(await readMemberRequestFailure(res));
        return;
      }
      const data = (await res.json().catch(() => null)) as
        | { pitch?: string; emailSent?: boolean; emailError?: string }
        | null;
      if (!data?.pitch) {
        setGenError(MEMBER_REQUEST_FAILURE.generic);
        return;
      }
      setPitch(data.pitch);
      setEmailStatus({ sent: data.emailSent === true, error: data.emailError ?? null });
      setStep('pitch');
      // Keep the answers in memory for "Edit answers", but stop the saved
      // draft from pre-filling the form for the next client.
      clearDrafts();
      // "Previous pitches" is server-rendered — refresh so the new pitch shows up
      // without a manual reload (members read a stale list as "my pitch was deleted").
      router.refresh();
    } catch (err) {
      setGenError(describeMemberRequestException(err));
    } finally {
      setGenerating(false);
    }
  };

  const startRehearsal = async () => {
    if (preview) {
      setStep('rehearse');
      setRecording(false);
      setCountdown(0);
      return;
    }
    setRecordingError(null);
    setPlaybackUrl(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      chunksRef.current = [];
      const mr = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus' });
      mediaRef.current = mr;
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        setPlaybackUrl(url);
        stream.getTracks().forEach((t) => t.stop());
        if (playbackRef.current) playbackRef.current.src = url;
      };
      setCountdown(3);
      setStep('rehearse');
      let c = 3;
      countdownRef.current = setInterval(() => {
        c--;
        setCountdown(c);
        if (c <= 0) {
          clearInterval(countdownRef.current!);
          setRecording(true);
          mr.start(100);
        }
      }, 1000);
    } catch (err) {
      setRecordingError(err instanceof Error ? err.message : 'Camera/mic not available. Allow access and try again.');
    }
  };

  const stopRecording = () => {
    if (mediaRef.current?.state === 'recording') mediaRef.current.stop();
    setRecording(false);
  };

  const resetRehearsal = () => {
    setPlaybackUrl(null);
    setRecording(false);
    setCountdown(0);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pitch);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  if (step === 'form') {
    return (
      <form onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <AiToolLanguageSelector value={language} onChange={setLanguage} />
        {FIELDS.map(({ id, key, label, placeholder, required }) => (
          <FormField key={id} id={id} label={label}>
            <input
              id={id}
              type="text"
              value={values[key]}
              onChange={(e) => setters[key](e.target.value)}
              placeholder={placeholder}
              required={required}
              style={FIELD_CONTROL}
            />
          </FormField>
        ))}
        {genError ? <AiToolError error={genError} /> : null}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="submit"
            disabled={generating || !name.trim() || !targetRole.trim()}
            aria-busy={generating}
            className={KIT_BTN}
            style={{
              ...kitBtnSolid,
              opacity: generating || !name.trim() || !targetRole.trim() ? 0.6 : 1,
              cursor: generating || !name.trim() || !targetRole.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {generating ? (
              <>
                <PortalInlineSpinner size={18} />
                Writing…
              </>
            ) : (
              'Write pitch'
            )}
          </button>
          <button
            type="button"
            onClick={resetForm}
            disabled={generating}
            className={KIT_BTN}
            style={{ ...kitBtnOutline, opacity: generating ? 0.6 : 1 }}
          >
            Clear form
          </button>
        </div>
      </form>
    );
  }

  if (step === 'pitch') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <p className="wa-kit-field-label" style={{ marginBottom: 8 }}>
            Pitch
          </p>
          <p style={{ fontSize: 16, lineHeight: 1.65, color: 'var(--wa-text)', margin: 0 }}>
            {pitch}
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => void handleCopy()} className={KIT_BTN} style={kitBtnOutline}>
              <span aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy'}
              </span>
            </button>
            <button type="button" onClick={() => setStep('form')} className={KIT_BTN} style={kitBtnOutline}>
              Edit answers
            </button>
          </div>
          {!preview && emailStatus?.sent ? (
            <div style={{ marginTop: 12 }}>
              <StatusTag tone="ok">Emailed</StatusTag>
            </div>
          ) : null}
          {!preview && emailStatus && !emailStatus.sent ? (
            <p style={{ margin: '12px 0 0', fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)' }}>
              Email did not send{emailStatus.error ? `: ${emailStatus.error}` : '.'} Copy the pitch.
            </p>
          ) : null}
        </div>

        <div>
          <p style={{ fontSize: 'var(--wa-type-body)', fontWeight: 700, color: 'var(--wa-text)', margin: '0 0 4px' }}>Rehearse</p>
          <p style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', margin: '0 0 12px', lineHeight: 1.45 }}>
            Camera and mic. Read the pitch out loud.
          </p>
          <button type="button" onClick={() => void startRehearsal()} className={KIT_BTN} style={kitBtnSolid}>
            <Video size={16} aria-hidden="true" />
            Start rehearsal
          </button>
          {recordingError ? <p style={{ color: 'var(--wa-danger)', fontSize: 'var(--wa-type-body)', margin: '8px 0 0' }}>{recordingError}</p> : null}
        </div>
        {!preview ? <ToolFollowThrough toolType="elevator_pitch" output={pitch} /> : null}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          padding: 16,
          background: 'var(--wa-surface-2)',
          borderRadius: 'var(--wa-radius-sm)',
          border: '1px solid var(--wa-border)',
        }}
      >
        <p className="wa-kit-field-label" style={{ marginBottom: 8 }}>
          Read this
        </p>
        <p style={{ fontSize: 16, lineHeight: 1.65, color: 'var(--wa-text)', margin: 0, fontWeight: 600 }}>
          {pitch}
        </p>
      </div>

      <div
        style={{
          position: 'relative',
          borderRadius: 'var(--wa-radius-sm)',
          overflow: 'hidden',
          background: 'var(--wa-sidebar-bg)',
          aspectRatio: '16/9',
          maxHeight: 320,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {preview ? (
          <p style={{ margin: 0, fontSize: 'var(--wa-type-body)', color: 'var(--wa-sidebar-muted)', padding: 16, textAlign: 'center' }}>
            Camera and mic run in a signed-in session.
          </p>
        ) : (
          <video ref={videoRef} muted autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        {countdown > 0 ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'color-mix(in srgb, var(--wa-sidebar-bg) 60%, transparent)',
            }}
          >
            <span style={{ fontSize: 64, fontWeight: 800, color: 'var(--wa-sidebar-text)', lineHeight: 1 }}>{countdown}</span>
          </div>
        ) : null}
        {recording ? (
          <div
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 12px',
              minHeight: 44,
              borderRadius: 999,
              background: 'var(--wa-accent)',
              color: 'var(--wa-on-accent)',
              fontSize: 'var(--wa-type-meta)',
              fontWeight: 700,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: 'var(--wa-on-accent)',
                display: 'block',
              }}
            />
            REC
          </div>
        ) : null}
      </div>

      {recording && !playbackUrl ? (
        <button type="button" onClick={stopRecording} className={KIT_BTN} style={{ ...kitBtnSolid, alignSelf: 'flex-start' }}>
          <CircleStop size={16} aria-hidden="true" />
          Stop
        </button>
      ) : null}

      {playbackUrl ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontWeight: 700, fontSize: 'var(--wa-type-body)', color: 'var(--wa-text)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} color="var(--wa-success)" aria-hidden="true" />
            Playback
          </p>
          <video
            ref={playbackRef}
            src={playbackUrl}
            controls
            playsInline
            style={{ width: '100%', borderRadius: 'var(--wa-radius-sm)', background: 'var(--wa-sidebar-bg)', maxHeight: 320, objectFit: 'cover' }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={resetRehearsal} className={KIT_BTN} style={kitBtnOutline}>
              <RotateCcw size={16} aria-hidden="true" /> Record again
            </button>
            <button type="button" onClick={() => setStep('pitch')} className={KIT_BTN} style={kitBtnOutline}>
              Edit pitch
            </button>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setStep('form');
                setPlaybackUrl(null);
              }}
              className={KIT_BTN}
              style={kitBtnOutline}
            >
              Start over
            </button>
          </div>
        </div>
      ) : null}

      {!recording && !playbackUrl && countdown === 0 ? (
        preview ? (
          <button type="button" onClick={() => setStep('pitch')} className={KIT_BTN} style={{ ...kitBtnOutline, alignSelf: 'flex-start' }}>
            Back to pitch
          </button>
        ) : (
          <button type="button" onClick={() => void startRehearsal()} className={KIT_BTN} style={{ ...kitBtnOutline, alignSelf: 'flex-start' }}>
            <RotateCcw size={16} aria-hidden="true" /> Try again
          </button>
        )
      ) : null}
    </div>
  );
}
