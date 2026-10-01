'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Check } from 'lucide-react';
import PortalVoiceSessionLazy from '@/components/portal/PortalVoiceSessionLazy';
import VoiceAgentSurface from '@/components/portal/VoiceAgentSurface';
import GoogleDocsStyleResumeEditor from '@/components/portal/GoogleDocsStyleResumeEditor';
import type { ResumeSuggestion, VoiceSessionPhase } from '@/components/portal/PortalVoiceSession';
import { extractResumeCoachSuggestionsFromText } from '@/lib/ai/resumeCoachHeuristic';
import { RESUME_COACH_DATA_USE_NOTICE } from '@/lib/ai/resumeCoachDataContract';
import { resumeCoachVoiceSurface } from '@/lib/portal/voice';
import {
  hasSubstantiveResumeText,
  sanitizeResumePlainText,
} from '@/lib/resume/extractionQuality';
import {
  PENDING_RESUME_DRAFT_KEY_PREFIX,
  parsePendingResumeDraft,
  serializePendingResumeDraft,
} from '@/lib/resume/pendingResumeDraft';

type LiveSuggestion = ResumeSuggestion & { id: string; source?: 'live' | 'post' };
function pendingResumeDraftKey(ownerToken: string): string {
  return `${PENDING_RESUME_DRAFT_KEY_PREFIX}${ownerToken}`;
}

function readPendingResumeDraft(ownerToken: string, resumeRevision: string) {
  try {
    const key = pendingResumeDraftKey(ownerToken);
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const draft = parsePendingResumeDraft(raw, ownerToken, resumeRevision);
    if (!draft) sessionStorage.removeItem(key);
    return draft;
  } catch {
    return null;
  }
}

function writePendingResumeDraft(
  text: string,
  resumeRevision: string | null,
  ownerToken: string | null,
): void {
  if (!resumeRevision || !ownerToken) return;
  try {
    sessionStorage.setItem(
      pendingResumeDraftKey(ownerToken),
      serializePendingResumeDraft({ text, resumeRevision, ownerToken }),
    );
  } catch {
    // Ephemeral recovery is best-effort; the explicit Save button remains available.
  }
}

function clearPendingResumeDraft(ownerToken: string | null): void {
  if (!ownerToken) return;
  try {
    sessionStorage.removeItem(pendingResumeDraftKey(ownerToken));
  } catch {
    // Ignore unavailable/disabled session storage.
  }
}

function CopyDraftButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }).catch(() => {});
      }}
      style={{
        fontSize: '0.8125rem',
        fontWeight: 600,
        color: copied ? 'var(--color-green)' : 'var(--color-on-surface-variant)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      <span
        aria-live="polite"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
      >
        {copied ? (
          <>
            <Check size={14} aria-hidden />
            Copied
          </>
        ) : (
          'Copy'
        )}
      </span>
    </button>
  );
}

function newSuggestionId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function suggestionDedupeKey(s: ResumeSuggestion): string {
  return `${(s.original ?? '').trim()}→${s.suggested.trim()}`;
}

function mergeHydratedResume(local: string, server: string): string {
  const p = local.trim();
  const t = server.trim();
  if (!t) return local;
  if (!p) return t;
  if (p === t) return local;
  if (p.includes(t)) return local;
  if (t.includes(p)) return t;
  return `${p}\n\n--- From your saved resume ---\n${t}`;
}

/**
 * Renders the draft with one pending swap highlighted: strikethrough original + proposed text (not applied until approved).
 */
function ResumeDraftPendingPreview({
  resumeText,
  original,
  suggested,
  context,
}: {
  resumeText: string;
  original?: string | null;
  suggested: string;
  context?: string;
}) {
  if (!original?.trim()) {
    return (
      <div
        role="region"
        aria-label="Suggested addition for your draft"
        style={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontFamily: 'ui-monospace, monospace',
          fontSize: '0.82rem',
          lineHeight: 1.55,
          padding: '0.75rem',
          borderRadius: '0.5rem',
          border: '2px solid color-mix(in srgb, var(--color-blue) 45%, transparent)',
          background: 'var(--surface-container-low)',
          maxHeight: 'min(42vh, 340px)',
          overflow: 'auto',
          boxSizing: 'border-box',
        }}
      >
        <mark
          style={{
            background: 'color-mix(in srgb, var(--color-green) 35%, transparent)',
            color: 'var(--color-on-surface)',
            fontWeight: 600,
            padding: '0 2px',
          }}
        >
          {suggested}
        </mark>
        {context ? (
          <p style={{ margin: '0.75rem 0 0', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
            {context}
          </p>
        ) : null}
      </div>
    );
  }

  const idx = resumeText.indexOf(original);
  if (idx === -1) {
    return (
      <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-on-surface-variant)' }}>
        That phrase is no longer in your draft — edit the text below or dismiss this suggestion.
      </p>
    );
  }
  return (
    <div
      role="region"
      aria-label="Preview of suggested edit in your draft"
      style={{
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontFamily: 'ui-monospace, monospace',
        fontSize: '0.82rem',
        lineHeight: 1.55,
        padding: '0.75rem',
        borderRadius: '0.5rem',
        border: '2px solid color-mix(in srgb, var(--color-blue) 45%, transparent)',
        background: 'var(--surface-container-low)',
        maxHeight: 'min(42vh, 340px)',
        overflow: 'auto',
        boxSizing: 'border-box',
      }}
    >
      {resumeText.slice(0, idx)}
      <mark
        style={{
          background: 'color-mix(in srgb, var(--color-error) 22%, transparent)',
          textDecoration: 'line-through',
          color: 'var(--color-on-surface)',
          padding: '0 2px',
        }}
      >
        {original}
      </mark>
      <mark
        style={{
          background: 'color-mix(in srgb, var(--color-green) 35%, transparent)',
          color: 'var(--color-on-surface)',
          fontWeight: 600,
          padding: '0 2px',
        }}
      >
        {suggested}
      </mark>
      {resumeText.slice(idx + original.length)}
      {context ? (
        <p style={{ margin: '0.75rem 0 0', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
          {context}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Coordinates voice coach suggestions → live text editor.
 * Hydrates from extracted stored resume on mount.
 * Accept: in-place replace when `original` matches the editor text; otherwise appends a note block.
 * Layout: side-by-side on desktop (resume left, voice coach right), stacked on mobile.
 */
export default function ResumeCoachWorkspace() {
  const [resumeText, setResumeText] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [liveCoachSuggestions, setLiveCoachSuggestions] = useState<LiveSuggestion[]>([]);
  const [postSessionParsing, setPostSessionParsing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const agentSpeechBufRef = useRef('');
  const suggestionKeySeenRef = useRef<Set<string>>(new Set());
  const heuristicDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveSuggestionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptTurnsRef = useRef<Array<{ speaker: 'agent' | 'user'; text: string }>>([]);
  const liveSuggestionSeqRef = useRef(0);
  const lastLiveSuggestionSignatureRef = useRef('');
  const lastSavedTextRef = useRef<string | null>(null);
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveTextRef = useRef<string | null>(null);
  const saveInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const latestResumeTextRef = useRef('');
  const resumeRevisionRef = useRef<string | null>(null);
  const resumeDraftOwnerRef = useRef<string | null>(null);

  const drainSaveQueue = useCallback(async () => {
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    try {
      while (pendingSaveTextRef.current !== null) {
        const text = pendingSaveTextRef.current;
        pendingSaveTextRef.current = null;
        if (text === lastSavedTextRef.current) continue;
        if (mountedRef.current) setSaveStatus('saving');
        const requestBody = JSON.stringify({
          plainText: text,
          resumeRevision: resumeRevisionRef.current,
        });
        const response = await fetch('/api/member/resume/plain-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
          keepalive: new Blob([requestBody]).size < 60_000,
        });
        if (!response.ok) {
          if (mountedRef.current) setSaveStatus('error');
          // Do not overwrite an external session after a CAS conflict. A later
          // local edit or explicit retry will enqueue the latest text again.
          break;
        }
        const result = await response.json().catch(() => ({})) as { resumeRevision?: string };
        if (typeof result.resumeRevision === 'string') {
          resumeRevisionRef.current = result.resumeRevision;
        }
        lastSavedTextRef.current = text;
        if (latestResumeTextRef.current === text) {
          clearPendingResumeDraft(resumeDraftOwnerRef.current);
        } else {
          writePendingResumeDraft(
            latestResumeTextRef.current,
            resumeRevisionRef.current,
            resumeDraftOwnerRef.current,
          );
        }
        if (mountedRef.current) setSaveStatus('saved');
      }
    } catch {
      if (mountedRef.current) setSaveStatus('error');
    } finally {
      saveInFlightRef.current = false;
      if (pendingSaveTextRef.current !== null) void drainSaveQueue();
    }
  }, []);

  const queueLatestResumeSave = useCallback((rawText: string) => {
    const text = sanitizeResumePlainText(rawText);
    if (!hasSubstantiveResumeText(text)) {
      if (rawText.trim() && mountedRef.current) setSaveStatus('error');
      return;
    }
    if (text === lastSavedTextRef.current) return;
    pendingSaveTextRef.current = text;
    void drainSaveQueue();
  }, [drainSaveQueue]);

  // Hydrate editor from stored resume on mount
  useEffect(() => {
    let cancelled = false;
    fetch('/api/member/resume?includePlainText=1')
      .then((r) => r.json())
      .then((d: {
        resumePlainText?: string | null;
        resumeRevision?: string;
        resumeDraftOwnerToken?: string;
      }) => {
        if (cancelled) return;
        resumeRevisionRef.current = typeof d.resumeRevision === 'string' ? d.resumeRevision : null;
        resumeDraftOwnerRef.current = typeof d.resumeDraftOwnerToken === 'string'
          ? d.resumeDraftOwnerToken
          : null;
        const t = sanitizeResumePlainText(d.resumePlainText ?? '');
        const pendingDraft = resumeDraftOwnerRef.current && resumeRevisionRef.current
          ? readPendingResumeDraft(resumeDraftOwnerRef.current, resumeRevisionRef.current)
          : null;
        const recoveredText = pendingDraft?.text ?? '';
        if (recoveredText) {
          setResumeText(recoveredText);
          latestResumeTextRef.current = recoveredText;
          lastSavedTextRef.current = t;
        } else if (t) {
          setResumeText((prev) => {
            const merged = mergeHydratedResume(prev, t);
            lastSavedTextRef.current = merged;
            latestResumeTextRef.current = merged;
            return merged;
          });
        } else {
          lastSavedTextRef.current = '';
        }
        setHydrated(true);
      })
      .catch(() => {
        if (!cancelled) {
          lastSavedTextRef.current = '';
          setHydrated(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced, serialized latest-wins persist of plain text.
  useEffect(() => {
    if (!hydrated) return;
    latestResumeTextRef.current = resumeText;
    if (resumeText !== lastSavedTextRef.current && hasSubstantiveResumeText(resumeText)) {
      writePendingResumeDraft(
        resumeText,
        resumeRevisionRef.current,
        resumeDraftOwnerRef.current,
      );
    }
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(() => {
      saveDebounceRef.current = null;
      queueLatestResumeSave(resumeText);
    }, 1800);
    return () => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    };
  }, [resumeText, hydrated, queueLatestResumeSave]);

  useEffect(() => {
    const flush = () => {
      queueLatestResumeSave(latestResumeTextRef.current);
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', flushWhenHidden);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', flushWhenHidden);
      window.removeEventListener('pagehide', flush);
      mountedRef.current = false;
      flush();
    };
  }, [queueLatestResumeSave]);

  useEffect(() => {
    if (saveStatus !== 'saved') return;
    const t = setTimeout(() => setSaveStatus('idle'), 3200);
    return () => clearTimeout(t);
  }, [saveStatus]);

  // Pass live draft to the coach session as context
  const sessionPayload = useMemo(
    () => ({ liveResumeDraft: sanitizeResumePlainText(resumeText) }),
    [resumeText],
  );

  const handleAccept = useCallback((s: ResumeSuggestion) => {
    setResumeText((prev) => {
      const o = s.original?.trim();
      if (o && prev.includes(o)) {
        return prev.split(o).join(s.suggested);
      }
      const line = s.original
        ? `[Change] "${s.original}" → "${s.suggested}" (${s.context})`
        : `[Add] ${s.suggested} (${s.context})`;
      return prev.trim()
        ? `${prev}\n\n--- Coach suggestion (accepted) ---\n${line}`
        : `--- Coach suggestion (accepted) ---\n${line}`;
    });
  }, []);

  const activeInlineSuggestion = useMemo(() => {
    for (const s of liveCoachSuggestions) {
      const o = s.original?.trim();
      if (o && resumeText.includes(o)) return s;
    }
    const addOnly = liveCoachSuggestions.find((s) => !s.original?.trim());
    return addOnly ?? null;
  }, [liveCoachSuggestions, resumeText]);

  const queuedCardSuggestions = useMemo(
    () =>
      liveCoachSuggestions.filter((s) => !activeInlineSuggestion || s.id !== activeInlineSuggestion.id),
    [liveCoachSuggestions, activeInlineSuggestion]
  );

  const mergeSuggestions = useCallback(
    (items: ResumeSuggestion[], source: 'live' | 'post') => {
      if (items.length === 0) return;
      setLiveCoachSuggestions((prev) => {
        const out = [...prev];
        for (const s of items) {
          const key = suggestionDedupeKey(s);
          if (suggestionKeySeenRef.current.has(key)) continue;
          suggestionKeySeenRef.current.add(key);
          out.push({ ...s, id: newSuggestionId(), source });
        }
        return out;
      });
    },
    []
  );

  const flushAgentHeuristic = useCallback(() => {
    const text = agentSpeechBufRef.current;
    if (!text.trim()) return;
    const found = extractResumeCoachSuggestionsFromText(text);
    mergeSuggestions(found, 'live');
  }, [mergeSuggestions]);

  const requestLiveSuggestions = useCallback(() => {
    if (liveSuggestionDebounceRef.current) clearTimeout(liveSuggestionDebounceRef.current);
    liveSuggestionDebounceRef.current = setTimeout(() => {
      liveSuggestionDebounceRef.current = null;
      const transcript = transcriptTurnsRef.current.slice(-18);
      if (transcript.length === 0) return;
      const signature = transcript
        .map((turn) => `${turn.speaker}:${turn.text}`)
        .join('\n')
        .slice(-5000);
      if (!signature || signature === lastLiveSuggestionSignatureRef.current) return;
      lastLiveSuggestionSignatureRef.current = signature;
      const seq = ++liveSuggestionSeqRef.current;

      fetch('/api/member/resume-coach/live-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      })
        .then((res) => {
          if (!res.ok) throw new Error('live suggestions failed');
          return res.json() as Promise<{ suggestions?: ResumeSuggestion[] }>;
        })
        .then((data) => {
          if (seq !== liveSuggestionSeqRef.current) return;
          mergeSuggestions(data.suggestions ?? [], 'live');
        })
        .catch(() => {});
    }, 900);
  }, [mergeSuggestions]);

  const onTranscriptChunk = useCallback(
    (chunk: { speaker: 'agent' | 'user'; text: string }) => {
      transcriptTurnsRef.current = [...transcriptTurnsRef.current, chunk].slice(-30);
      if (chunk.speaker !== 'agent') return;
      agentSpeechBufRef.current = `${agentSpeechBufRef.current} ${chunk.text}`.trim().slice(-6000);
      if (heuristicDebounceRef.current) clearTimeout(heuristicDebounceRef.current);
      heuristicDebounceRef.current = setTimeout(() => {
        heuristicDebounceRef.current = null;
        flushAgentHeuristic();
      }, 500);
      requestLiveSuggestions();
    },
    [flushAgentHeuristic, requestLiveSuggestions]
  );

  const onVoicePhaseChange = useCallback((p: VoiceSessionPhase) => {
    if (p === 'connecting') {
      agentSpeechBufRef.current = '';
      transcriptTurnsRef.current = [];
      suggestionKeySeenRef.current.clear();
      lastLiveSuggestionSignatureRef.current = '';
      liveSuggestionSeqRef.current = 0;
      setLiveCoachSuggestions((prev) => prev.filter((x) => x.source === 'post'));
      if (heuristicDebounceRef.current) {
        clearTimeout(heuristicDebounceRef.current);
        heuristicDebounceRef.current = null;
      }
      if (liveSuggestionDebounceRef.current) {
        clearTimeout(liveSuggestionDebounceRef.current);
        liveSuggestionDebounceRef.current = null;
      }
    }
  }, []);

  const onPostSessionSuggestions = useCallback((list: ResumeSuggestion[]) => {
    mergeSuggestions(list, 'post');
  }, [mergeSuggestions]);

  const dismissSuggestion = useCallback((id: string) => {
    setLiveCoachSuggestions((prev) => prev.filter((x) => x.id !== id));
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        gap: '1.5rem',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        marginTop: '1.5rem',
      }}
    >
      {/* Top/Left panel: Voice coach */}
      <div style={{ flex: '1 1 300px', minWidth: 280 }}>
        <VoiceAgentSurface
          {...resumeCoachVoiceSurface}
          subtext="Voice feedback on bullets and framing. Your draft stays editable — suggested deletions and rewrites appear inline (like Google Docs) with Accept or Reject."
        >
          <PortalVoiceSessionLazy
            sessionEndpoint="/api/member/resume-coach/session"
            sessionPayload={sessionPayload}
            retryWithoutDynamicVariables={false}
            pushLiveResumeDraftContext
            suggestionsEndpoint="/api/member/resume-coach/parse-suggestions"
            delegatePostSessionSuggestions
            onPostSessionSuggestions={onPostSessionSuggestions}
            onPostSessionParsingChange={setPostSessionParsing}
            title="Talk through your resume"
            description="Practice your pitch, discuss experience bullets, or get advice on framing your background."
            dataUseNotice={RESUME_COACH_DATA_USE_NOTICE}
            speakingLabel="Coach is speaking…"
            listeningLabel="Listening — describe your background"
            onAcceptSuggestion={handleAccept}
            onTranscriptChunk={onTranscriptChunk}
            onPhaseChange={onVoicePhaseChange}
          />
        </VoiceAgentSurface>
      </div>

      {/* Bottom/Right panel: Live resume draft (context textarea) */}
      <div style={{ flex: '1 1 300px', minWidth: 280 }}>
        <div
          className="portal-card portal-card--flat"
          style={{ padding: '1.5rem', border: '1px solid var(--outline-variant)' }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: '0.5rem',
              marginBottom: '0.5rem',
            }}
          >
            <h4 style={{ fontSize: '0.95rem', margin: 0 }}>Live Resume Draft</h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {hydrated && resumeText.trim() && (
                <CopyDraftButton text={resumeText} />
              )}
              {hydrated && resumeText.trim() && (
                <button
                  type="button"
                  onClick={() => queueLatestResumeSave(resumeText)}
                  disabled={saveStatus === 'saving'}
                  style={{
                    border: 'none',
                    background: 'none',
                    padding: 0,
                    color: 'var(--wa-accent-text)',
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    cursor: saveStatus === 'saving' ? 'wait' : 'pointer',
                  }}
                >
                  Save now
                </button>
              )}
              {hydrated && saveStatus !== 'idle' ? (
              <span
                role={saveStatus === 'error' ? 'alert' : 'status'}
                aria-live="polite"
                style={{
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color:
                    saveStatus === 'error'
                      ? 'var(--color-error)'
                      : saveStatus === 'saving'
                        ? 'var(--color-on-surface-variant)'
                        : 'var(--color-on-surface-variant)',
                }}
              >
                {saveStatus === 'saving' && 'Saving…'}
                {saveStatus === 'saved' && 'Saved to profile'}
                {saveStatus === 'error' && 'Could not save — try again'}
              </span>
              ) : null}
            </div>
          </div>
          <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            {hydrated
              ? 'Edits sync to the coach during the call. Replace suggestions highlight inside your draft; additions show as cards you can apply.'
              : 'Loading your resume…'}
          </p>
          {postSessionParsing ? (
            <p
              style={{
                margin: '0 0 1rem',
                fontSize: '0.8125rem',
                color: 'var(--color-on-surface-variant)',
                fontStyle: 'italic',
              }}
            >
              Extracting suggestions from your session…
            </p>
          ) : null}

          {hydrated && activeInlineSuggestion && !activeInlineSuggestion.original?.trim() ? (
            <div style={{ marginBottom: '1rem' }}>
              <p
                style={{
                  margin: '0 0 0.5rem',
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--color-on-surface-variant)',
                }}
              >
                Suggested addition
              </p>
              <ResumeDraftPendingPreview
                resumeText={resumeText}
                original={activeInlineSuggestion.original}
                suggested={activeInlineSuggestion.suggested}
                context={activeInlineSuggestion.context}
              />
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                  marginTop: '0.75rem',
                  alignItems: 'center',
                }}
              >
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  aria-label="Apply suggested addition"
                  onClick={() => {
                    handleAccept(activeInlineSuggestion);
                    dismissSuggestion(activeInlineSuggestion.id);
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  <Check size={16} aria-hidden />
                  Apply
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  aria-label="Dismiss suggestion"
                  onClick={() => dismissSuggestion(activeInlineSuggestion.id)}
                >
                  ✕ Dismiss
                </button>
              </div>
            </div>
          ) : null}

          {hydrated && queuedCardSuggestions.length > 0 ? (
            <div
              style={{
                marginBottom: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--color-on-surface-variant)',
                }}
              >
                {activeInlineSuggestion
                  ? 'Other suggestions'
                  : postSessionParsing
                    ? 'Suggestions'
                    : 'Apply to draft'}
              </p>
              {queuedCardSuggestions.map((s) => (
                <div
                  key={s.id}
                  style={{
                    border: '1px solid var(--outline-variant)',
                    borderRadius: 10,
                    padding: '0.65rem 0.75rem',
                    background: 'var(--surface-container-low)',
                  }}
                >
                  {s.source === 'post' ? (
                    <p
                      style={{
                        margin: '0 0 0.4rem',
                        fontSize: '0.8125rem',
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: 'var(--color-on-surface-variant)',
                      }}
                    >
                      After session
                    </p>
                  ) : null}
                  {s.original ? (
                    <p
                      style={{
                        margin: '0 0 0.35rem',
                        fontSize: '0.8125rem',
                        color: 'var(--color-on-surface-variant)',
                      }}
                    >
                      <span style={{ textDecoration: 'line-through' }}>{s.original}</span>
                      {' → '}
                      <span style={{ fontWeight: 600, color: 'var(--color-on-surface)' }}>
                        {s.suggested}
                      </span>
                    </p>
                  ) : (
                    <p style={{ margin: '0 0 0.35rem', fontSize: '0.82rem' }}>{s.suggested}</p>
                  )}
                  <p style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                    {s.context}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      aria-label="Apply suggestion to draft"
                      onClick={() => {
                        handleAccept(s);
                        dismissSuggestion(s.id);
                      }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                    >
                      <Check size={16} aria-hidden />
                      Apply
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      aria-label="Dismiss suggestion"
                      onClick={() => dismissSuggestion(s.id)}
                    >
                      ✕ Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {hydrated ? (
            <GoogleDocsStyleResumeEditor
              value={resumeText}
              onChange={setResumeText}
              rows={18}
              placeholder="Your resume will appear here…"
              ariaLabel="Live resume draft"
              inlineReplace={
                activeInlineSuggestion?.original?.trim() &&
                resumeText.includes(activeInlineSuggestion.original.trim())
                  ? {
                      original: activeInlineSuggestion.original.trim(),
                      suggested: activeInlineSuggestion.suggested,
                      context: activeInlineSuggestion.context,
                      onAccept: () => {
                        handleAccept(activeInlineSuggestion);
                        dismissSuggestion(activeInlineSuggestion.id);
                      },
                      onReject: () => dismissSuggestion(activeInlineSuggestion.id),
                    }
                  : null
              }
            />
          ) : (
            <div
              style={{
                height: 200,
                background: 'var(--surface-container)',
                borderRadius: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-on-surface-variant)',
                fontSize: '0.875rem',
              }}
            >
              Loading…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
