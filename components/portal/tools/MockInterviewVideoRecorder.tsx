'use client';

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { uploadMockInterviewVideo } from '@/lib/portal/mockInterviewVideoUpload';
import type { VoiceSessionPhase } from '@/components/portal/PortalVoiceSession';

import ToolFollowThrough from './ToolFollowThrough';

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return undefined;
}

const MIN_RECORDING_MS = 2000;

type Props = {
  wantRecording: boolean;
  phase: VoiceSessionPhase;
  role: string;
  interviewType: string;
  /** Prefer stream acquired during voice Start (user gesture); same ref as `PortalVoiceSession` `videoStreamRef`. */
  externalStreamRef?: MutableRefObject<MediaStream | null>;
  onUploadComplete?: (info: { playbackUrl: string | null }) => void;
  onError?: (message: string) => void;
};

export default function MockInterviewVideoRecorder({
  wantRecording,
  phase,
  role,
  interviewType,
  externalStreamRef,
  onUploadComplete,
  onError,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const mimeRef = useRef('');
  const prevPhaseRef = useRef<VoiceSessionPhase | null>(null);
  const uploadGenRef = useRef(0);
  const startAttemptRef = useRef(0);
  const startInFlightRef = useRef(false);
  const onUploadCompleteRef = useRef(onUploadComplete);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onUploadCompleteRef.current = onUploadComplete;
    onErrorRef.current = onError;
  });

  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [uploadHint, setUploadHint] = useState('');

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => {
    const videoEl = videoRef.current;
    return () => {
      uploadGenRef.current += 1;
      startAttemptRef.current += 1;
      try {
        recorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      recorderRef.current = null;
      startInFlightRef.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoEl) videoEl.srcObject = null;
      chunksRef.current = [];
    };
  }, []);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;

    if (!wantRecording) {
      if (phase === 'pre') {
        uploadGenRef.current += 1;
        try {
          recorderRef.current?.stop();
        } catch {
          /* ignore */
        }
        recorderRef.current = null;
        cleanupStream();
        chunksRef.current = [];
      }
      return;
    }

    if (phase === 'active' && prev !== 'active') {
      void (async () => {
        const startAttempt = ++startAttemptRef.current;
        setUploadStatus('idle');
        setUploadHint('');
        chunksRef.current = [];
        mimeRef.current = pickMimeType() || '';
        try {
          if (startInFlightRef.current || (recorderRef.current && recorderRef.current.state !== 'inactive')) {
            return;
          }
          startInFlightRef.current = true;

          let stream: MediaStream;
          const pre = externalStreamRef?.current;
          if (pre && pre.getVideoTracks().length > 0) {
            stream = pre;
          } else {
            try {
              stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: true,
              });
            } catch {
              try {
                stream = await navigator.mediaDevices.getUserMedia({
                  video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
                  audio: false,
                });
                setUploadHint(
                  'Recording video only — your voice is still captured by the interview session.'
                );
              } catch {
                stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
              }
            }
          }

          if (startAttempt !== startAttemptRef.current || phase !== 'active') {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }

          streamRef.current = stream;
          if (externalStreamRef && stream === pre) {
            externalStreamRef.current = null;
          }
          const el = videoRef.current;
          if (el) {
            el.srcObject = stream;
            await el.play().catch(() => {});
          }

          if (startAttempt !== startAttemptRef.current || phase !== 'active') {
            cleanupStream();
            return;
          }

          const mime = mimeRef.current;
          const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
          mimeRef.current = rec.mimeType || mime || 'video/webm';
          recorderRef.current = rec;
          rec.ondataavailable = (e) => {
            if (e.data.size > 0) chunksRef.current.push(e.data);
          };
          rec.onstart = () => {
            startInFlightRef.current = false;
          };
          rec.onstop = () => {
            startInFlightRef.current = false;
          };
          rec.onerror = () => {
            startInFlightRef.current = false;
          };
          startedAtRef.current = Date.now();
          if (rec.state === 'inactive') {
            try {
              rec.start(1000);
            } catch (err) {
              startInFlightRef.current = false;
              const message = err instanceof Error ? err.message : String(err);
              if (/state is 'recording'/i.test(message)) {
                return;
              }
              throw err;
            }
          } else {
            startInFlightRef.current = false;
          }
        } catch (e) {
          const raw = e instanceof Error ? e.message : String(e);
          const msg =
            /denied|not allowed|Permission/i.test(raw)
              ? 'Camera access was blocked or unavailable. The voice interview still works — allow camera in your browser settings to save a practice video, or turn off recording and try again.'
              : raw || 'Camera access failed';
          onErrorRef.current?.(msg);
          cleanupStream();
          startInFlightRef.current = false;
        }
      })();
    }

    if (phase === 'done' && prev === 'active') {
      void (async () => {
        const gen = ++uploadGenRef.current;
        const rec = recorderRef.current;
        recorderRef.current = null;
        startInFlightRef.current = false;
        cleanupStream();

        if (!rec) return;

        await new Promise<void>((resolve) => {
          rec.onstop = () => resolve();
          try {
            if (rec.state !== 'inactive') rec.stop();
            else resolve();
          } catch {
            resolve();
          }
        });

        if (gen !== uploadGenRef.current) return;

        const durationMs = Math.max(0, Date.now() - startedAtRef.current);
        const mimeType = mimeRef.current || rec.mimeType || 'video/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];

        if (durationMs < MIN_RECORDING_MS || blob.size < 8_000) {
          setUploadHint('Recording too short to save — try again for at least a few seconds.');
          setUploadStatus('idle');
          return;
        }

        setUploadStatus('uploading');
        setUploadHint('Uploading recording…');

        const result = await uploadMockInterviewVideo(blob, {
          durationMs,
          role,
          interviewType,
          mimeType,
        });

        if (gen !== uploadGenRef.current) return;

        if (!result.ok) {
          setUploadStatus('error');
          setUploadHint(result.error);
          onErrorRef.current?.(result.error);
          return;
        }

        setUploadStatus('done');
        setUploadHint('Recording saved securely. Download link is valid for about one hour.');
        onUploadCompleteRef.current?.({ playbackUrl: result.playbackUrl });
      })();
    }

    if (phase === 'pre' && prev !== 'pre') {
      uploadGenRef.current += 1;
      startAttemptRef.current += 1;
      try {
        recorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      recorderRef.current = null;
      startInFlightRef.current = false;
      cleanupStream();
      chunksRef.current = [];
    }
  }, [phase, wantRecording, role, interviewType, externalStreamRef]);

  if (!wantRecording) return null;

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div
        style={{
          position: 'relative',
          borderRadius: 12,
          overflow: 'hidden',
          background: '#111',
          aspectRatio: '16 / 9',
          maxHeight: 220,
        }}
      >
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        {phase === 'active' && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(0,0,0,0.6)',
              color: '#fff',
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: '0.8125rem',
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#ef4444',
                display: 'inline-block',
              }}
            />
            REC
          </div>
        )}
      </div>
      {uploadHint ? (
        <p
          role="status"
          style={{
            margin: '0.5rem 0 0',
            fontSize: '0.82rem',
            color: uploadStatus === 'error' ? '#b91c1c' : 'var(--color-on-surface-variant)',
          }}
        >
          {uploadHint}
        </p>
      ) : null}
      <ToolFollowThrough toolType="interview_practice" />
    </div>
  );
}
