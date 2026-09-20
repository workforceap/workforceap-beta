'use client';

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

const FONT = 'ui-monospace, monospace';
const FONT_SIZE = '0.82rem';
const LINE_HEIGHT = 1.55;
const PAD = '0.75rem';
const MIN_HEIGHT_PX = 320;

const BASE_BORDER = '1px solid var(--outline-variant)';
const BASE_RADIUS = '0.5rem';

type InlineReplace = {
  original: string;
  suggested: string;
  context?: string;
  onAccept: () => void;
  onReject: () => void;
};

export type GoogleDocsStyleResumeEditorProps = {
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  placeholder?: string;
  ariaLabel: string;
  /** Inline replace suggestion — mirrors Google Docs “suggested edit” over matching text */
  inlineReplace?: InlineReplace | null;
};

/**
 * When `inlineReplace` is active and `original` appears in `value`, renders a
 * syntax-highlighter-style stack: colored suggestion mirror + transparent textarea + floating toolbar.
 * Otherwise renders a normal textarea.
 */
export default function GoogleDocsStyleResumeEditor({
  value,
  onChange,
  rows = 18,
  placeholder,
  ariaLabel,
  inlineReplace,
}: GoogleDocsStyleResumeEditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);

  const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number } | null>(null);

  const original = inlineReplace?.original?.trim() ?? '';
  const idx = original ? value.indexOf(original) : -1;
  const useOverlay = Boolean(inlineReplace && original && idx >= 0);

  const syncScroll = useCallback(() => {
    const ta = taRef.current;
    const mirror = mirrorRef.current;
    if (!ta || !mirror) return;
    mirror.scrollTop = ta.scrollTop;
    mirror.scrollLeft = ta.scrollLeft;
  }, []);

  useLayoutEffect(() => {
    if (!useOverlay || !shellRef.current || !anchorRef.current) {
      setToolbarPos(null);
      return;
    }
    const shell = shellRef.current;
    const anchor = anchorRef.current;
    const sr = shell.getBoundingClientRect();
    const ar = anchor.getBoundingClientRect();
    const pad = 8;
    let left = ar.left - sr.left;
    const toolbarW = 220;
    left = Math.max(pad, Math.min(left, sr.width - toolbarW - pad));
    const toolbarH = 44;
    let top = ar.bottom - sr.top + 6;
    if (top + toolbarH > shell.clientHeight - pad) {
      top = ar.top - sr.top - toolbarH - 6;
    }
    top = Math.max(pad, top);
    setToolbarPos({ top, left });
  }, [useOverlay, value, inlineReplace?.suggested, original]);

  const sharedBoxStyle: CSSProperties = {
    width: '100%',
    resize: 'vertical' as const,
    fontFamily: FONT,
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    padding: PAD,
    borderRadius: BASE_RADIUS,
    border: BASE_BORDER,
    boxSizing: 'border-box',
    minHeight: MIN_HEIGHT_PX,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  };

  if (!useOverlay) {
    return (
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        aria-label={ariaLabel}
        style={{
          ...sharedBoxStyle,
          background: 'var(--surface-container-low)',
          color: 'var(--color-on-surface)',
        }}
      />
    );
  }

  const ir = inlineReplace!;

  const before = value.slice(0, idx);
  const after = value.slice(idx + original.length);

  const delStyle: CSSProperties = {
    textDecoration: 'line-through',
    textDecorationThickness: 'from-font',
    background: 'color-mix(in srgb, var(--color-error) 22%, transparent)',
    borderRadius: 2,
    padding: '0 2px',
  };
  const insStyle: CSSProperties = {
    background: 'color-mix(in srgb, var(--color-green) 38%, transparent)',
    borderRadius: 2,
    padding: '0 2px',
    fontWeight: 600,
  };

  return (
    <div ref={shellRef} style={{ position: 'relative', width: '100%' }}>
      {/* Mirror layer — suggestion styling (non-interactive) */}
      <div
        ref={mirrorRef}
        aria-hidden
        style={{
          ...sharedBoxStyle,
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          overflow: 'auto',
          pointerEvents: 'none',
          margin: 0,
          background: 'var(--surface-container-low)',
          color: 'var(--color-on-surface)',
        }}
      >
        <span>{before}</span>
        <span ref={anchorRef} style={{ display: 'inline' }}>
          <span style={delStyle}>{original}</span>
          <span style={insStyle}>{ir.suggested}</span>
        </span>
        <span>{after}</span>
      </div>

      {/* Typing layer — text invisible; caret visible; highlights show through */}
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        spellCheck={false}
        rows={rows}
        aria-label={ariaLabel}
        aria-describedby={ir.context ? 'resume-coach-suggestion-hint' : undefined}
        style={{
          ...sharedBoxStyle,
          position: 'relative',
          zIndex: 1,
          overflow: 'auto',
          margin: 0,
          background: 'transparent',
          color: 'transparent',
          WebkitTextFillColor: 'transparent',
          caretColor: 'var(--color-on-surface)',
          resize: 'vertical',
        }}
      />

      {/* Floating toolbar — Google-docs-like accept/reject */}
      {toolbarPos ? (
        <div
          role="toolbar"
          aria-label="Suggested edit"
          style={{
            position: 'absolute',
            zIndex: 4,
            top: toolbarPos.top,
            left: toolbarPos.left,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.35rem 0.45rem',
            borderRadius: '0.5rem',
            border: '1px solid var(--outline-variant)',
            background: 'var(--surface-container-high)',
            boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
            pointerEvents: 'auto',
            maxWidth: 'min(100%, 260px)',
          }}
        >
          <button type="button" className="btn btn-primary btn-sm" onClick={ir.onAccept}>
            ✓ Accept
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={ir.onReject}>
            ✕ Reject
          </button>
        </div>
      ) : null}

      {ir.context ? (
        <p
          id="resume-coach-suggestion-hint"
          style={{
            margin: '0.5rem 0 0',
            fontSize: '0.8125rem',
            color: 'var(--color-on-surface-variant)',
            position: 'relative',
            zIndex: 2,
          }}
        >
          {ir.context}
        </p>
      ) : null}
    </div>
  );
}
