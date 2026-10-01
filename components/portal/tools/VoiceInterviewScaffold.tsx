'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import ToolFollowThrough from './ToolFollowThrough';
import PortalVoiceSessionLazy from '@/components/portal/PortalVoiceSessionLazy';
import type { VoiceSessionPhase } from '@/components/portal/PortalVoiceSession';
import VoiceAgentSurface from '@/components/portal/VoiceAgentSurface';
import { mockInterviewVoiceSurface } from '@/lib/portal/voice';
import InterviewCoachingPanel from '@/components/portal/tools/InterviewCoachingPanel';
import MockInterviewVideoRecorder from '@/components/portal/tools/MockInterviewVideoRecorder';
import AiToolLanguageSelector, { type AiToolLanguage } from '@/components/portal/tools/AiToolLanguageSelector';
import { FormField } from '@/components/portal/kit';

const INTERVIEW_TYPES = ['Behavioral', 'Technical', 'General'] as const;
const EXPERIENCE_LEVELS = [
  { value: 'entry', label: 'Entry-level (0–2 years)' },
  { value: 'mid', label: 'Mid-level (3–7 years)' },
  { value: 'senior', label: 'Senior / Lead (8+ years)' },
] as const;

const selectStyle = {
  marginTop: 4,
  width: '100%',
  fontSize: 'var(--wa-type-body)',
  border: '1px solid var(--wa-border)',
  borderRadius: 'var(--wa-radius-sm)',
  padding: '10px 12px',
  outline: 'none',
  background: 'var(--wa-surface)',
  color: 'var(--wa-text)',
} as const;

const primaryPillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  minHeight: 44,
  width: '100%',
  padding: '10px 22px',
  background: 'var(--wa-accent)',
  color: 'var(--wa-on-accent-control)',
  fontWeight: 700,
  fontSize: 'var(--wa-type-body)',
  borderRadius: 999,
  border: 'none',
  cursor: 'pointer',
} as const;

const outlinePillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 44,
  padding: '10px 14px',
  background: 'transparent',
  color: 'var(--wa-text)',
  fontWeight: 600,
  fontSize: 'var(--wa-type-meta)',
  borderRadius: 999,
  border: '1px solid var(--wa-border)',
  cursor: 'pointer',
} as const;

/**
 * Dedicated voice mock-interview entry: role + style, ElevenLabs session, live coaching panel.
 * Optional WebRTC camera+audio recording (uploaded to private storage; short-lived download link).
 */
export default function VoiceInterviewScaffold() {
  const [role, setRole] = useState('');
  const [experienceLevel, setExperienceLevel] = useState<'entry' | 'mid' | 'senior'>('entry');
  const [interviewType, setInterviewType] = useState<(typeof INTERVIEW_TYPES)[number]>('Behavioral');
  const [language, setLanguage] = useState<AiToolLanguage>('en');
  const [ready, setReady] = useState(false);
  const [lastUserText, setLastUserText] = useState('');
  const [voicePhase, setVoicePhase] = useState<VoiceSessionPhase>('pre');
  const [recordVideo, setRecordVideo] = useState(false);
  const [recordingConsent, setRecordingConsent] = useState(false);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [videoErr, setVideoErr] = useState('');
  const [cameraPriming, setCameraPriming] = useState(false);
  /** Fresh mount for each run so voice UI state resets reliably after “Change role / style”. */
  const [voiceSessionKey, setVoiceSessionKey] = useState(0);
  const [sessionId, setSessionId] = useState('');
  const videoStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!ready) {
      setVoicePhase('pre');
      setPlaybackUrl(null);
    } else {
      setVideoErr('');
    }
  }, [ready]);

  useEffect(() => {
    if (!ready) setVideoErr('');
  }, [recordVideo, recordingConsent, ready]);

  const onTranscriptChunk = useCallback((chunk: { speaker: 'agent' | 'user'; text: string }) => {
    if (chunk.speaker === 'user') setLastUserText(chunk.text);
  }, []);

  const wantRecording = recordVideo && recordingConsent;
  const canStart = role.trim().length > 0 && (!recordVideo || recordingConsent);
  const needsConsentForCamera = recordVideo && !recordingConsent && role.trim().length > 0;

  const enterVoiceSession = useCallback(() => {
    setVideoErr('');
    setCameraPriming(false);
    setVoiceSessionKey((k) => k + 1);
    setSessionId(`voice-interview-${Date.now()}`);
    setReady(true);
  }, []);

  return (
    <div>
      {!ready ? (
        <div className="wa-kit-card wa-space-y-4" style={{ marginBottom: '1.25rem' }}>
          <AiToolLanguageSelector value={language} onChange={setLanguage} />
          <FormField
            label="Target role"
            id="vi-role"
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g. IT Support Specialist"
            required
          />
          <FormField label="Experience level" id="vi-level">
            <select
              value={experienceLevel}
              onChange={(e) => setExperienceLevel(e.target.value as 'entry' | 'mid' | 'senior')}
              style={selectStyle}
            >
              {EXPERIENCE_LEVELS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Interview style" id="vi-type">
            <select
              value={interviewType}
              onChange={(e) => setInterviewType(e.target.value as (typeof INTERVIEW_TYPES)[number])}
              style={selectStyle}
            >
              {INTERVIEW_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </FormField>
          <div style={{ padding: '0.75rem 0 0', borderTop: '1px solid var(--wa-border)' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer', fontWeight: 600, color: 'var(--wa-text)' }}>
              <input
                type="checkbox"
                checked={recordVideo}
                onChange={(e) => {
                  setRecordVideo(e.target.checked);
                  if (!e.target.checked) setRecordingConsent(false);
                }}
                style={{ accentColor: 'var(--wa-accent)', marginTop: 3 }}
              />
              Record my camera during the session (your voice is captured by the interview session)
            </label>
            <p style={{ margin: '0.35rem 0 0 1.5rem', fontSize: '0.82rem', color: 'var(--wa-muted)', lineHeight: 1.45 }}>
              Saves a practice video to your secure WorkforceAP storage so you can review your delivery. Authorized staff may
              access recordings only to support your coaching (same retention practices as your resume file).
            </p>
            {recordVideo ? (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  marginTop: '0.75rem',
                  marginLeft: '0.1rem',
                }}
              >
                <input
                  type="checkbox"
                  checked={recordingConsent}
                  onChange={(e) => setRecordingConsent(e.target.checked)}
                  style={{ accentColor: 'var(--wa-accent)', marginTop: 3 }}
                />
                <span style={{ fontSize: '0.85rem', lineHeight: 1.45, color: 'var(--wa-text)' }}>
                  I understand the recording includes my voice and image, is stored encrypted, and is used for my career
                  development as described above.
                </span>
              </label>
            ) : null}
            {needsConsentForCamera ? (
              <p
                role="status"
                style={{
                  margin: '0.75rem 0 0',
                  fontSize: '0.82rem',
                  color: 'var(--wa-accent)',
                  fontWeight: 600,
                }}
              >
                Check the consent box above to continue with camera recording, or turn off “Record my camera” for voice
                only.
              </p>
            ) : null}
          </div>

          {videoErr && !ready ? (
            <div
              role="alert"
              style={{
                padding: '0.75rem 1rem',
                borderRadius: 'var(--wa-radius-sm)',
                background: 'var(--wa-danger-soft)',
                border: '1px solid var(--wa-danger)',
                fontSize: '0.88rem',
                lineHeight: 1.5,
                color: 'var(--wa-text)',
              }}
            >
              <p className="wa-flex wa-items-start" style={{ margin: '0 0 0.65rem', gap: 8 }}>
                <AlertTriangle size={16} aria-hidden="true" style={{ color: 'var(--wa-danger)', flexShrink: 0, marginTop: 2 }} />
                {videoErr}
              </p>
              <button
                type="button"
                className="wa-kit-focus"
                style={outlinePillStyle}
                onClick={() => {
                  videoStreamRef.current?.getTracks().forEach((t) => t.stop());
                  videoStreamRef.current = null;
                  setRecordVideo(false);
                  setRecordingConsent(false);
                  setVideoErr('');
                  enterVoiceSession();
                }}
              >
                Continue with voice only (no camera recording)
              </button>
            </div>
          ) : null}

          <button
            type="button"
            className="wa-kit-focus"
            style={{
              ...primaryPillStyle,
              opacity: !canStart || cameraPriming ? 0.6 : 1,
              cursor: !canStart || cameraPriming ? 'not-allowed' : 'pointer',
            }}
            disabled={!canStart || cameraPriming}
            onClick={() => {
              void (async () => {
                setVideoErr('');
                setCameraPriming(true);
                videoStreamRef.current?.getTracks().forEach((t) => t.stop());
                videoStreamRef.current = null;

                try {
                  if (wantRecording) {
                    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
                    const gum = md?.getUserMedia?.bind(md);
                    if (!gum) {
                      setVideoErr(
                        'Camera is not available in this browser or context (use HTTPS or turn off camera recording). You can continue with voice only below.'
                      );
                      return;
                    }
                    try {
                      const vs = await gum({
                        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
                        audio: false,
                      });
                      videoStreamRef.current = vs;
                    } catch {
                      try {
                        videoStreamRef.current = await gum({
                          video: true,
                          audio: false,
                        });
                      } catch {
                        setVideoErr(
                          'Camera access was blocked or unavailable. Allow camera for this site in your browser settings, or turn off “Record my camera” and try again—or continue with voice only below.'
                        );
                        return;
                      }
                    }
                  }

                  enterVoiceSession();
                } catch (e) {
                  console.error('[VoiceInterviewScaffold] start failed', e);
                  setVideoErr(
                    'Something went wrong starting the session. Try “Continue with voice only” below, or refresh the page.'
                  );
                } finally {
                  setCameraPriming(false);
                }
              })();
            }}
          >
            {cameraPriming && wantRecording ? 'Requesting camera…' : 'Continue to voice session'}
          </button>
        </div>
      ) : (
        <div className="voice-interview-layout">
          <div className="wa-kit-card">
            <p style={{ fontSize: '0.85rem', color: 'var(--wa-muted)', marginBottom: '1rem' }}>
              Mock interview for <strong>{role}</strong> ({interviewType}). Use a quiet space and allow <strong>microphone</strong> access to talk with the coach.
              {wantRecording ? (
                <>
                  {' '}
                  If you opted in below, your browser will ask for <strong>camera</strong> when the session starts so we
                  can save a practice video — you can still do a voice-only interview without recording.
                </>
              ) : null}
            </p>
            {wantRecording ? (
              <MockInterviewVideoRecorder
                wantRecording={wantRecording}
                phase={voicePhase}
                role={role.trim()}
                interviewType={interviewType}
                externalStreamRef={videoStreamRef}
                onUploadComplete={({ playbackUrl: u }) => setPlaybackUrl(u)}
                onError={(m) => setVideoErr(m)}
              />
            ) : null}
            {videoErr ? (
              <p style={{ color: 'var(--wa-danger)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{videoErr}</p>
            ) : null}
            <VoiceAgentSurface {...mockInterviewVoiceSurface}>
              <PortalVoiceSessionLazy
                key={voiceSessionKey}
                sessionEndpoint="/api/member/voice-interview/session"
                sessionPayload={{ role: role.trim(), interviewType, experienceLevel, language }}
                completionEndpoint="/api/member/voice-interview/transcript"
                completionPayload={{ sessionId, role: role.trim(), interviewType }}
                title="Voice mock interview"
                description="Answer out loud. The coach will listen and respond like a real interviewer."
                accent="#ad2c4d"
                accentDark="#8b1f38"
                speakingLabel="Interviewer is speaking…"
                listeningLabel="Your turn — take your time"
                liveTranscriptCoachLabel="Interviewer"
                onTranscriptChunk={onTranscriptChunk}
                onPhaseChange={setVoicePhase}
                acquireVideoForRecording={false}
                optionalCameraForRecording={false}
                videoStreamRef={videoStreamRef}
              />
            </VoiceAgentSurface>
            {playbackUrl ? (
              <p style={{ marginTop: '1rem', fontSize: '0.88rem' }}>
                <a
                  href={playbackUrl}
                  download="mock-interview-recording.webm"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontWeight: 700, color: 'var(--wa-accent)' }}
                >
                  Download your practice recording
                </a>{' '}
                <span style={{ color: 'var(--wa-muted)' }}>(link expires in about an hour)</span>
              </p>
            ) : null}
            <ToolFollowThrough toolType="voice_interview" />
            <button
              type="button"
              className="wa-kit-focus"
              style={{ ...outlinePillStyle, marginTop: '1rem' }}
              onClick={() => {
                videoStreamRef.current?.getTracks().forEach((t) => t.stop());
                videoStreamRef.current = null;
                setVoiceSessionKey((k) => k + 1);
                setReady(false);
                setLastUserText('');
                setPlaybackUrl(null);
                setVideoErr('');
                setVoicePhase('pre');
              }}
            >
              Change role / style
            </button>
          </div>
          <InterviewCoachingPanel targetRole={role} lastUserText={lastUserText} />
        </div>
      )}
    </div>
  );
}
