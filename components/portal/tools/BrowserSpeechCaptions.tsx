'use client';

import { useEffect, useRef, useState } from 'react';

/** Local types — Web Speech constructors are not always in TS `lib` for CI/Vercel. */
type WebSpeechRecognitionCtor = new () => WebSpeechRecognitionInstance;
type WebSpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: WebSpeechResultEvent) => void) | null;
  onerror: ((ev: WebSpeechErrorEvent) => void) | null;
  start: () => void;
  stop: () => void;
};
type WebSpeechResultEvent = {
  resultIndex: number;
  results: Array<{ isFinal: boolean; 0: { transcript: string } }>;
};
type WebSpeechErrorEvent = { error: string; message?: string };

type Props = {
  /** When false, recognition is stopped */
  active: boolean;
};

/**
 * Web Speech API live captions (Chrome/Edge/Safari). Complements ElevenLabs user transcript — local-only, no server.
 */
export default function BrowserSpeechCaptions({ active }: Props) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [interim, setInterim] = useState('');
  const [err, setErr] = useState('');
  const recRef = useRef<WebSpeechRecognitionInstance | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as unknown as {
      SpeechRecognition?: WebSpeechRecognitionCtor;
      webkitSpeechRecognition?: WebSpeechRecognitionCtor;
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    setSupported(!!SR);
    if (!SR) return;

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: WebSpeechResultEvent) => {
      let interimText = '';
      let finalChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalChunk += r[0].transcript;
        else interimText += r[0].transcript;
      }
      if (finalChunk.trim()) {
        setLines((prev) => [...prev.slice(-20), finalChunk.trim()]);
        setInterim('');
      } else {
        setInterim(interimText);
      }
    };
    recognition.onerror = (e: WebSpeechErrorEvent) => {
      if (e.error === 'not-allowed') setErr('Microphone denied for captions. Allow access and try again.');
      else if (e.error !== 'aborted' && e.error !== 'no-speech') setErr(e.message || e.error);
    };

    recRef.current = recognition;
    return () => {
      try {
        recognition.stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

  useEffect(() => {
    const r = recRef.current;
    if (!r || supported === false) return;
    if (active) {
      setErr('');
      try {
        r.start();
      } catch {
        /* already started */
      }
    } else {
      try {
        r.stop();
      } catch {
        /* ignore */
      }
    }
  }, [active, supported]);

  if (supported === false) {
    return (
      <p style={{ fontSize: '0.82rem', color: 'var(--color-on-surface-variant)' }}>
        Live captions need a browser with Web Speech API (e.g. Chrome desktop).
      </p>
    );
  }

  if (supported === null) return null;

  return (
    <div
      style={{
        borderRadius: 10,
        border: '1px solid var(--outline-variant)',
        background: 'var(--surface-container-highest)',
        padding: '0.75rem 1rem',
        minHeight: 72,
      }}
    >
      <div style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)', marginBottom: '0.35rem' }}>
        Browser live captions (Web Speech API)
      </div>
      {err && (
        <p style={{ fontSize: '0.82rem', color: '#b91c1c', margin: '0 0 0.5rem' }} role="alert">
          {err}
        </p>
      )}
      <p style={{ fontSize: '0.88rem', lineHeight: 1.45, margin: 0, whiteSpace: 'pre-wrap' }}>
        {lines.join('\n')}
        {interim ? <span style={{ opacity: 0.65 }}>{interim}</span> : null}
        {!lines.length && !interim && active && <span style={{ color: 'var(--color-on-surface-variant)' }}>Listening…</span>}
      </p>
    </div>
  );
}
