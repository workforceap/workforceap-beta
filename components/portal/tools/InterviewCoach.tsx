'use client';

import { useState, useEffect, useRef, type CSSProperties } from 'react';
import type { Conversation } from '@elevenlabs/client';
import { AlertTriangle, Calendar, ChevronDown, ChevronUp, Mic } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';
import {
  appendVoiceTranscriptTurn,
  buildInterviewQaFromVoiceTurns,
  extractVoiceTranscriptTurn,
  type VoiceTranscriptTurn,
} from '@/lib/interview/voiceTranscript';
import { FormField } from '@/components/portal/kit';
import ToolFollowThrough from './ToolFollowThrough';

type TranscriptEntry = { question: string; answer: string };
type Phase = 'setup' | 'voice' | 'interview' | 'feedback';

interface InterviewSession {
  id: string;
  createdAt: string;
  role: string;
  interviewType: string;
  feedback: string;
  questions: string[];
  answers: string[];
  sessionId: string;
  transcriptTurns?: VoiceTranscriptTurn[];
}

const INTERVIEW_TYPES = ['Behavioral', 'Technical', 'General'] as const;
const MAX_QUESTIONS = 5;

const START_FAILED = 'Could not start the interview. Please try again.';
const NEXT_QUESTION_FAILED = 'Could not load the next question. Your answer is still here \u2014 please try again.';
const FEEDBACK_FAILED = 'Could not generate feedback. Please try again.';

/** Server rejections arrive as JSON `{ error }`; anything else falls back to `fallback`. */
function serverErrorText(data: unknown, fallback: string): string {
  const error = (data as { error?: unknown } | null)?.error;
  return typeof error === 'string' && error.trim() ? error : fallback;
}

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
  color: 'var(--wa-on-accent-control)',
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

const PREVIEW_QUESTIONS = [
  'Tell me about yourself and your interest in this role.',
  'Walk me through a time you diagnosed a production issue.',
  'How do you prioritize tickets when the queue is full?',
  'Describe a runbook you wrote and who used it.',
  'What would you do in your first 30 days in this role?',
];

const PREVIEW_FEEDBACK =
  'You answered in complete sentences and named the role. Next pass: add a specific metric and who you handed off to.';

function previewQuestionFor(role: string, index: number) {
  if (index === 0 && role.trim()) {
    return `Tell me about yourself and your interest in the ${role.trim()} role.`;
  }
  return PREVIEW_QUESTIONS[Math.min(index, PREVIEW_QUESTIONS.length - 1)];
}

export default function InterviewCoach({
  preview = false,
  initialRole = '',
  initialPhase = 'setup',
  initialQuestion,
  initialFeedback,
}: {
  /** Skip history fetch, mic, and session POSTs — /dev/member proofs. */
  preview?: boolean;
  initialRole?: string;
  initialPhase?: Phase;
  initialQuestion?: string;
  initialFeedback?: string;
}) {
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [role, setRole] = useState(initialRole);
  const [interviewType, setInterviewType] = useState('Behavioral');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'voice' | 'text'>('text');
  const [currentQuestion, setCurrentQuestion] = useState(
    initialQuestion ?? (initialPhase === 'interview' ? previewQuestionFor(initialRole, 0) : ''),
  );
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [feedback, setFeedback] = useState(
    initialFeedback ?? (initialPhase === 'feedback' ? PREVIEW_FEEDBACK : ''),
  );
  const [sessionId, setSessionId] = useState('');
  const [signedUrl, setSignedUrl] = useState('');
  const [wsStatus, setWsStatus] = useState<'idle' | 'connecting' | 'connected' | 'ended'>('idle');
  const [micDenied, setMicDenied] = useState(false);
  const [micStatus, setMicStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied'>('idle');
  const [voiceError, setVoiceError] = useState('');
  // Text-mode request failures (start, next question, feedback). Before this
  // slot existed those handlers had no `.ok` check and no catch: a dropped
  // connection escaped as an unhandled rejection while the button re-enabled
  // and the member read nothing.
  const [textError, setTextError] = useState('');
  const tCommon = useTranslations('common');
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const convRef = useRef<Conversation | null>(null);
  const intentionalCloseRef = useRef(false);
  const voiceTranscriptRef = useRef<VoiceTranscriptTurn[]>([]);

  useEffect(() => {
    return () => {
      if (convRef.current) convRef.current.endSession();
    };
  }, []);

  useEffect(() => {
    if (preview) return;
    setSessionsLoading(true);
    fetch('/api/interview/history?limit=5')
      .then((r) => r.json())
      .then((data: { sessions?: InterviewSession[] }) => {
        setSessions(data.sessions ?? []);
      })
      .catch(() => {})
      .finally(() => setSessionsLoading(false));
  }, [preview]);

  function refreshSessions() {
    if (preview) return;
    fetch('/api/interview/history?limit=5')
      .then((r) => r.json())
      .then((data: { sessions?: InterviewSession[] }) => {
        setSessions(data.sessions ?? []);
      })
      .catch(() => {});
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  async function startInterview() {
    if (!role.trim()) return;
    if (preview) {
      setCurrentQuestion(previewQuestionFor(role, 0));
      setMode('text');
      setPhase('interview');
      return;
    }
    setLoading(true);
    setTextError('');
    try {
      let micGranted = false;
      setMicStatus('requesting');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
        micGranted = true;
        setMicStatus('granted');
      } catch {
        setMicDenied(true);
        setMicStatus('denied');
      }

      const res = await fetch('/api/interview/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, interviewType: interviewType.toLowerCase(), forceText: !micGranted }),
      });
      const data = (await res.json()) as {
        mode: 'voice' | 'text';
        signedUrl?: string;
        dynamicVariables?: Record<string, string | number | boolean>;
        firstQuestion?: string;
        sessionId: string;
        error?: string;
      };
      if (!res.ok) {
        setTextError(serverErrorText(data, START_FAILED));
        return;
      }

      setMode(data.mode);
      setSessionId(data.sessionId);

      if (micGranted && data.mode === 'voice' && data.signedUrl) {
        setSignedUrl(data.signedUrl);
        voiceTranscriptRef.current = [];
        setPhase('voice');
        connectVoiceSession(data.signedUrl, data.dynamicVariables);
      } else {
        setCurrentQuestion(data.firstQuestion ?? previewQuestionFor(role, 0));
        setPhase('interview');
      }
    } catch (err) {
      setTextError(requestFailureMessage(err, { connection: tCommon('connectionError'), fallback: START_FAILED }, 'interview-coach-start'));
    } finally {
      setLoading(false);
    }
  }

  async function connectVoiceSession(url: string, dynamicVariables?: Record<string, string | number | boolean>) {
    setVoiceError('');
    setWsStatus('connecting');
    try {
      const { Conversation } = await import('@elevenlabs/client');
      const conv = await Conversation.startSession({
        signedUrl: url,
        ...(dynamicVariables ? { dynamicVariables } : {}),
        onConnect: () => setWsStatus('connected'),
        onDisconnect: (details) => {
          setWsStatus('ended');
          if (!intentionalCloseRef.current) {
            if (details?.reason === 'error') {
              setVoiceError(details.message || 'Connection lost');
            }
            getVoiceFeedback();
          }
          intentionalCloseRef.current = false;
        },
        onMessage: (event) => {
          voiceTranscriptRef.current = appendVoiceTranscriptTurn(
            voiceTranscriptRef.current,
            extractVoiceTranscriptTurn(event),
          );
        },
        onError: (msg) => {
          setWsStatus('ended');
          setVoiceError(String(msg) || 'Connection error');
        },
      });
      convRef.current = conv;
    } catch (e) {
      setWsStatus('ended');
      setVoiceError(String(e));
    }
  }

  async function getVoiceFeedback() {
    const turns = voiceTranscriptRef.current;
    const { questions, answers } = buildInterviewQaFromVoiceTurns(turns);

    if (answers.length === 0) {
      setFeedback(
        'No spoken answers were captured. Check the microphone and try again, or switch to text.',
      );
      setPhase('feedback');
      return;
    }

    setLoading(true);
    setPhase('feedback');
    try {
      const sid = sessionId || `fallback-${Date.now()}`;
      const res = await fetch('/api/interview/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sid,
          role,
          interviewType: interviewType.toLowerCase(),
          questions,
          answers,
          transcriptTurns: turns,
        }),
      });
      const data = (await res.json()) as { feedback?: string; error?: string };
      setFeedback(data.feedback ?? data.error ?? 'Unable to generate feedback.');
      refreshSessions();
    } catch {
      setFeedback('Unable to generate feedback. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function startTextFallback() {
    if (preview) {
      setCurrentQuestion(previewQuestionFor(role, 0));
      setPhase('interview');
      return;
    }
    setTextError('');
    try {
      const res = await fetch('/api/interview/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, interviewType: interviewType.toLowerCase(), forceText: true }),
      });
      const data = (await res.json()) as { firstQuestion?: string; sessionId?: string; error?: string };
      if (!res.ok) {
        setVoiceError(serverErrorText(data, START_FAILED));
        return;
      }
      if (data.sessionId) setSessionId(data.sessionId);
      setCurrentQuestion(data.firstQuestion ?? previewQuestionFor(role, 0));
      setPhase('interview');
    } catch (err) {
      // Still on the voice screen, so reuse its error slot (with its
      // "Switch to text" retry button).
      setVoiceError(requestFailureMessage(err, { connection: tCommon('connectionError'), fallback: START_FAILED }, 'interview-coach-text-fallback'));
    }
  }

  async function submitAnswer() {
    if (!currentAnswer.trim()) return;
    const newEntry: TranscriptEntry = { question: currentQuestion, answer: currentAnswer };
    const newTranscript = [...transcript, newEntry];
    setTranscript(newTranscript);
    setCurrentAnswer('');

    if (newTranscript.length >= MAX_QUESTIONS) {
      await getFeedback(newTranscript);
      return;
    }

    if (preview) {
      setCurrentQuestion(previewQuestionFor(role, newTranscript.length));
      return;
    }

    setLoading(true);
    setTextError('');
    try {
      const res = await fetch('/api/interview/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          interviewType: interviewType.toLowerCase(),
          transcript: newTranscript,
          nextQuestion: true,
        }),
      });
      const data = (await res.json()) as { firstQuestion?: string; error?: string };
      if (!res.ok || typeof data.firstQuestion !== 'string') {
        restoreAnswer(newEntry);
        setTextError(serverErrorText(data, NEXT_QUESTION_FAILED));
        return;
      }
      setCurrentQuestion(data.firstQuestion);
    } catch (err) {
      restoreAnswer(newEntry);
      setTextError(requestFailureMessage(err, { connection: tCommon('connectionError'), fallback: NEXT_QUESTION_FAILED }, 'interview-coach-next-question'));
    } finally {
      setLoading(false);
    }
  }

  /** Put an answer back in the box when the request that recorded it failed, so nothing typed is lost. */
  function restoreAnswer(entry: TranscriptEntry) {
    setTranscript((prev) => (prev.at(-1) === entry ? prev.slice(0, -1) : prev));
    setCurrentAnswer(entry.answer);
  }

  async function getFeedback(t: TranscriptEntry[]) {
    if (preview) {
      setFeedback(PREVIEW_FEEDBACK);
      setPhase('feedback');
      return;
    }
    setLoading(true);
    setTextError('');
    try {
      const sid = sessionId || `fallback-${Date.now()}`;
      const res = await fetch('/api/interview/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sid,
          role,
          interviewType: interviewType.toLowerCase(),
          questions: t.map((entry) => entry.question),
          answers: t.map((entry) => entry.answer),
        }),
      });
      const data = (await res.json()) as { feedback?: string; error?: string };
      if (!res.ok || typeof data.feedback !== 'string') {
        // Stay on the interview so the transcript is kept for a retry.
        setTextError(serverErrorText(data, FEEDBACK_FAILED));
        return;
      }
      setFeedback(data.feedback);
      setPhase('feedback');
      refreshSessions();
    } catch (err) {
      setTextError(requestFailureMessage(err, { connection: tCommon('connectionError'), fallback: FEEDBACK_FAILED }, 'interview-coach-feedback'));
    } finally {
      setLoading(false);
    }
  }

  function endVoiceSession() {
    if (convRef.current) convRef.current.endSession();
  }

  function reset() {
    intentionalCloseRef.current = true;
    setPhase('setup');
    setRole(preview ? initialRole : '');
    setInterviewType('Behavioral');
    setCurrentQuestion('');
    setCurrentAnswer('');
    setTranscript([]);
    setFeedback('');
    setSessionId('');
    setSignedUrl('');
    setWsStatus('idle');
    setMode('text');
    setTextError('');
    setVoiceError('');
    voiceTranscriptRef.current = [];
    if (convRef.current) convRef.current.endSession();
  }

  const textErrorAlert = textError ? (
    <p
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        margin: '0 0 12px',
        padding: 12,
        background: 'var(--wa-danger-soft)',
        color: 'var(--wa-text)',
        borderRadius: 'var(--wa-radius-sm)',
        fontSize: 'var(--wa-type-meta)',
        lineHeight: 1.45,
      }}
    >
      <AlertTriangle size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{textError}</span>
    </p>
  ) : null;

  const pastSessionsSection =
    !preview && (sessions.length > 0 || sessionsLoading) ? (
      <div style={{ marginTop: 32 }}>
        <h3 style={{ fontWeight: 700, fontSize: 16, color: 'var(--wa-text)', margin: '0 0 12px' }}>
          Past sessions
        </h3>
        {sessionsLoading ? (
          <p role="status" style={{ fontSize: 'var(--wa-type-body)', color: 'var(--wa-muted)', margin: 0 }}>
            Loading sessions…
          </p>
        ) : (
          <>
            {sessions.map((s) => {
              const isExpanded = expandedSession === s.id;
              return (
                <div
                  key={s.id}
                  style={{
                    border: '1px solid var(--wa-border)',
                    borderRadius: 'var(--wa-radius-sm)',
                    marginBottom: 8,
                    overflow: 'hidden',
                    background: 'var(--wa-surface-2)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedSession(isExpanded ? null : s.id)}
                    aria-expanded={isExpanded}
                    aria-controls={`interview-coach-session-${s.id}`}
                    className={KIT_BTN}
                    style={{
                      width: '100%',
                      minHeight: 44,
                      textAlign: 'left',
                      padding: '12px 16px',
                      background: 'var(--wa-surface-2)',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      borderRadius: 0,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          fontSize: 'var(--wa-type-meta)',
                          color: 'var(--wa-muted)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <Calendar size={14} aria-hidden="true" />
                        {formatDate(s.createdAt)}
                      </span>
                      {isExpanded ? (
                        <ChevronUp size={16} aria-hidden="true" color="var(--wa-muted)" />
                      ) : (
                        <ChevronDown size={16} aria-hidden="true" color="var(--wa-muted)" />
                      )}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 'var(--wa-type-body)', color: 'var(--wa-text)' }}>
                      {s.role} · {s.interviewType.charAt(0).toUpperCase() + s.interviewType.slice(1)}
                    </div>
                    {!isExpanded && s.feedback ? (
                      <div style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)' }}>
                        {s.feedback.slice(0, 100)}
                        {s.feedback.length > 100 ? '…' : ''}
                      </div>
                    ) : null}
                  </button>
                  {isExpanded ? (
                    <div
                      id={`interview-coach-session-${s.id}`}
                      style={{
                        padding: 16,
                        background: 'var(--wa-surface)',
                        borderTop: '1px solid var(--wa-border)',
                      }}
                    >
                      {s.feedback ? (
                        <div style={{ marginBottom: 16 }}>
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: 'var(--wa-type-meta)',
                              color: 'var(--wa-muted)',
                              marginBottom: 6,
                              letterSpacing: '0.04em',
                              textTransform: 'uppercase',
                            }}
                          >
                            Assessment
                          </div>
                          <div
                            style={{
                              fontSize: 'var(--wa-type-body)',
                              lineHeight: 1.6,
                              whiteSpace: 'pre-wrap',
                              color: 'var(--wa-text)',
                            }}
                          >
                            {s.feedback}
                          </div>
                        </div>
                      ) : null}
                      {s.questions.length > 0 ? (
                        <div style={{ marginBottom: 16 }}>
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: 'var(--wa-type-meta)',
                              color: 'var(--wa-muted)',
                              marginBottom: 8,
                              letterSpacing: '0.04em',
                              textTransform: 'uppercase',
                            }}
                          >
                            Q&A
                          </div>
                          {s.questions.map((q, i) => (
                            <div key={i} style={{ marginBottom: 12 }}>
                              <div style={{ fontSize: 'var(--wa-type-body)', fontWeight: 600, color: 'var(--wa-text)', marginBottom: 4 }}>
                                Q{i + 1}: {q}
                              </div>
                              {s.answers[i] ? (
                                <div
                                  style={{
                                    fontSize: 'var(--wa-type-body)',
                                    color: 'var(--wa-muted)',
                                    paddingLeft: 12,
                                    borderLeft: '2px solid var(--wa-border)',
                                  }}
                                >
                                  A{i + 1}: {s.answers[i]}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedSession(null);
                          reset();
                        }}
                        className={KIT_BTN}
                        style={kitBtnOutline}
                      >
                        Start new session
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {sessions.length >= 5 ? (
              <a
                href="/dashboard/ai-tools/history"
                className={KIT_BTN}
                style={{ ...kitBtnOutline, textDecoration: 'none', marginTop: 8 }}
              >
                View all past sessions
              </a>
            ) : null}
          </>
        )}
      </div>
    ) : null;

  if (phase === 'setup') {
    return (
      <div>
        <FormField label="Role you are interviewing for" id="interviewcoach-target-role-field">
          <input
            id="interviewcoach-target-role-field"
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Forklift operator, IT support specialist"
            style={FIELD_CONTROL}
          />
        </FormField>
        <p style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', margin: '4px 0 16px', lineHeight: 1.45 }}>
          The interviewer asks from this title.
        </p>
        <div style={{ marginBottom: 16 }}>
          <p className="wa-kit-field-label" style={{ marginBottom: 8 }}>
            Interview type
          </p>
          <div role="group" aria-label="Interview type" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {INTERVIEW_TYPES.map((t) => {
              const on = interviewType === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setInterviewType(t)}
                  aria-pressed={on}
                  className={KIT_BTN}
                  style={on ? kitBtnSolid : kitBtnOutline}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
        {textErrorAlert}
        <button
          type="button"
          onClick={startInterview}
          disabled={loading || !role.trim()}
          className={KIT_BTN}
          style={{
            ...kitBtnSolid,
            opacity: loading || !role.trim() ? 0.6 : 1,
            cursor: loading || !role.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Starting…' : 'Start interview'}
        </button>
        <p style={{ marginTop: 12, fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', lineHeight: 1.45 }}>
          Voice when the microphone is available. Text otherwise.
        </p>
        {pastSessionsSection}
      </div>
    );
  }

  if (phase === 'voice') {
    const statusCopy =
      wsStatus === 'connecting'
        ? 'Connecting…'
        : wsStatus === 'connected'
          ? 'Interview in progress — speak clearly'
          : 'Session ended';
    return (
      <div>
        <div
          style={{
            background: 'var(--wa-accent)',
            borderRadius: 'var(--wa-radius)',
            padding: 20,
            color: 'var(--wa-on-accent-control)',
            marginBottom: 16,
            textAlign: 'center',
          }}
        >
          <div
            aria-hidden="true"
            style={{
              width: 44,
              height: 44,
              borderRadius: 'var(--wa-radius-sm)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--wa-on-accent)',
              color: 'var(--wa-accent)',
              marginBottom: 12,
            }}
          >
            <Mic size={20} />
          </div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{statusCopy}</div>
          <div style={{ fontSize: 'var(--wa-type-body)', opacity: 0.85 }}>
            {interviewType} · {role}
          </div>
          {wsStatus === 'connecting' ? (
            <div style={{ marginTop: 12, fontSize: 'var(--wa-type-meta)', opacity: 0.8 }}>Allow microphone access when prompted.</div>
          ) : null}
          {voiceError ? (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                background: 'var(--wa-danger-soft)',
                color: 'var(--wa-text)',
                borderRadius: 'var(--wa-radius-sm)',
                fontSize: 'var(--wa-type-meta)',
                textAlign: 'left',
                wordBreak: 'break-word',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 8 }}>
                <AlertTriangle size={16} aria-hidden="true" />
                {voiceError}
              </span>
              <button
                type="button"
                onClick={() => {
                  setVoiceError('');
                  void startTextFallback();
                }}
                className={KIT_BTN}
                style={{ ...kitBtnOutline, marginTop: 8 }}
              >
                Switch to text
              </button>
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" onClick={endVoiceSession} className={KIT_BTN} style={kitBtnSolid}>
            End and get feedback
          </button>
          <button type="button" onClick={reset} className={KIT_BTN} style={kitBtnOutline}>
            Cancel
          </button>
        </div>
        <p style={{ marginTop: 16, fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', lineHeight: 1.45 }}>
          Voice is processed by ElevenLabs. Text fallback stays available.
        </p>
      </div>
    );
  }

  if (phase === 'interview') {
    return (
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 16,
            flexWrap: 'wrap',
          }}
        >
          <h2 style={{ fontWeight: 700, fontSize: 16, color: 'var(--wa-text)', margin: 0 }}>{role || 'Interview'}</h2>
          <span
            style={{
              fontSize: 'var(--wa-type-meta)',
              fontWeight: 600,
              color: 'var(--wa-muted)',
              background: 'var(--wa-surface-2)',
              border: '1px solid var(--wa-border)',
              borderRadius: 999,
              minHeight: 32,
              padding: '0 12px',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            {interviewType} · Question {Math.min(transcript.length + 1, MAX_QUESTIONS)} of {MAX_QUESTIONS}
          </span>
        </div>
        {transcript.map((entry, i) => (
          <div
            key={i}
            style={{
              marginBottom: 12,
              padding: 16,
              background: 'var(--wa-surface-2)',
              borderRadius: 'var(--wa-radius-sm)',
              border: '1px solid var(--wa-border)',
              borderLeft: '3px solid var(--wa-accent)',
            }}
          >
            <div style={{ fontSize: 'var(--wa-type-meta)', fontWeight: 700, color: 'var(--wa-muted)', marginBottom: 4 }}>Q{i + 1}</div>
            <div style={{ fontSize: 'var(--wa-type-body)', color: 'var(--wa-text)', marginBottom: 8 }}>{entry.question}</div>
            <div style={{ fontSize: 'var(--wa-type-body)', color: 'var(--wa-muted)' }}>{entry.answer}</div>
          </div>
        ))}
        <div
          style={{
            marginBottom: 16,
            padding: 16,
            background: 'var(--wa-accent)',
            borderRadius: 'var(--wa-radius-sm)',
          }}
        >
          <div
            style={{
              fontSize: 'var(--wa-type-meta)',
              fontWeight: 700,
              color: 'var(--wa-on-accent)',
              opacity: 0.85,
              marginBottom: 6,
            }}
          >
            Interviewer
          </div>
          <div style={{ fontSize: 'var(--wa-type-body)', fontWeight: 500, color: 'var(--wa-on-accent)', lineHeight: 1.5 }}>
            {loading ? '…' : currentQuestion}
          </div>
        </div>
        <textarea
          value={currentAnswer}
          onChange={(e) => setCurrentAnswer(e.target.value)}
          placeholder="Type your answer"
          rows={4}
          style={{ ...FIELD_CONTROL, minHeight: 88, resize: 'vertical', marginBottom: 12 }}
        />
        {textErrorAlert}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            onClick={() => void submitAnswer()}
            disabled={loading || !currentAnswer.trim()}
            className={KIT_BTN}
            style={{
              ...kitBtnSolid,
              opacity: loading || !currentAnswer.trim() ? 0.6 : 1,
              cursor: loading || !currentAnswer.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '…' : transcript.length + 1 >= MAX_QUESTIONS ? 'Get feedback' : 'Next question'}
          </button>
          <button
            type="button"
            onClick={() => void getFeedback(transcript)}
            disabled={loading || transcript.length === 0}
            className={KIT_BTN}
            style={{
              ...kitBtnOutline,
              opacity: loading || transcript.length === 0 ? 0.6 : 1,
              cursor: loading || transcript.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            End and get feedback
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          background: 'var(--wa-surface-2)',
          borderRadius: 'var(--wa-radius)',
          padding: 20,
          marginBottom: 16,
          border: '1px solid var(--wa-border)',
        }}
      >
        <h3 style={{ fontWeight: 700, fontSize: 16, margin: '0 0 12px', color: 'var(--wa-text)' }}>Feedback</h3>
        <div
          style={{
            whiteSpace: 'pre-wrap',
            fontSize: 'var(--wa-type-body)',
            lineHeight: 1.7,
            color: 'var(--wa-text)',
          }}
        >
          {feedback}
        </div>
      </div>
      <button type="button" onClick={reset} className={KIT_BTN} style={kitBtnSolid}>
        Practice again
      </button>
      {!preview ? <ToolFollowThrough toolType="interview_coach" output={feedback} /> : null}
      {pastSessionsSection}
    </div>
  );
}
