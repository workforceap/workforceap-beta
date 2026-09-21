'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocale, useTranslations } from 'next-intl';
import { useFocusTrap } from '@/components/portal/kit/hooks/useFocusTrap';
import { HELP_MAX_HISTORY_TURNS, HELP_MAX_QUESTION_CHARS, type HelpLink } from '@/lib/help/assistant';
import type { HelpAssistantInfo } from './useHelpAssistantAvailability';

interface PanelMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  links?: HelpLink[];
  /** Server could not reach a model; the text is the deterministic fallback. */
  degraded?: boolean;
}

interface ChatResponse {
  answer?: string;
  links?: HelpLink[];
  source?: 'model' | 'redirect' | 'fallback';
  error?: string;
}

/**
 * "Ask for help" drawer opened from the header Help menu (`help_assistant_v1`).
 * A short, grounded conversation with `POST /api/help/chat` about how to use the
 * viewer's own portal; the server resolves the persona, so this component only
 * carries the current pathname and locale. Read-only: no action the assistant
 * suggests is taken here, and every answer ends with links to real pages.
 *
 * Chrome on `--wa-*` tokens and kit classes; `role="dialog"` with a focus trap
 * and Escape to close, like the Help menu it opens from.
 *
 * Rendered through a portal onto `document.body`, not in place under the Help
 * menu: the menu lives inside `header.workspace-shell-header`, whose
 * `backdrop-filter` makes it the containing block for `position: fixed`
 * descendants, so an in-place panel resolved against the header (a few px
 * tall) and was clipped by `.workspace-shell-root { overflow: hidden }`. The
 * portal keeps the drawer fixed to the viewport below the header. The panel
 * only mounts after a click, so it never renders on the server; the
 * `document` guard is belt and braces for that.
 */
export default function HelpAssistantPanel({
  info,
  onClose,
  onTakeTour,
}: {
  info: HelpAssistantInfo;
  onClose: () => void;
  /** Present when the Help menu has a tour to reopen; shown after a degraded answer. */
  onTakeTour?: () => void;
}) {
  const t = useTranslations('tours');
  const locale = useLocale();
  const pathname = usePathname();
  const titleId = useId();
  const inputId = useId();
  const [messages, setMessages] = useState<PanelMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(true, { onEscape: onClose });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, busy]);

  const ask = useCallback(
    async (raw: string) => {
      const question = raw.replace(/\s+/g, ' ').trim().slice(0, HELP_MAX_QUESTION_CHARS);
      if (!question || busy) return;
      setError(null);
      setBusy(true);
      const history = messages.slice(-HELP_MAX_HISTORY_TURNS).map((m) => ({ role: m.role, text: m.text }));
      const userMessage: PanelMessage = { id: `u-${Date.now()}`, role: 'user', text: question };
      setMessages((prev) => [...prev, userMessage]);
      setDraft('');
      try {
        const res = await fetch('/api/help/chat', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ question, pathname, history, language: locale }),
        });
        const data = (await res.json().catch(() => ({}))) as ChatResponse;
        if (!res.ok || !data.answer) {
          setError(res.status === 429 ? t('assistant.tooMany') : t('assistant.error'));
          // Keep the draft so a retry is one keystroke away.
          setDraft(question);
          setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
          return;
        }
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            text: data.answer as string,
            links: Array.isArray(data.links) ? data.links.slice(0, 4) : [],
            degraded: data.source === 'fallback',
          },
        ]);
      } catch {
        setError(t('assistant.error'));
        setDraft(question);
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
      } finally {
        setBusy(false);
      }
    },
    [busy, messages, pathname, locale, t],
  );

  const starters = info.starters.filter((key): key is 'whereAmI' | 'howToMessage' | 'whatCanIDo' =>
    key === 'whereAmI' || key === 'howToMessage' || key === 'whatCanIDo',
  );

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={trapRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="help-assistant-panel"
      style={{
        position: 'fixed',
        top: 'calc(var(--wa-header-height, 3.5rem) + 0.5rem)',
        right: '0.75rem',
        bottom: '0.75rem',
        width: 'min(24rem, calc(100vw - 1.5rem))',
        zIndex: 205,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 'var(--wa-radius-sm)',
        background: 'var(--wa-surface)',
        border: '1px solid var(--wa-border)',
        boxShadow: 'var(--wa-shadow-lg)',
        color: 'var(--wa-text)',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
          padding: 'var(--wa-pad-sm)',
          borderBottom: '1px solid var(--wa-border)',
          flexShrink: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2 id={titleId} style={{ margin: 0, fontSize: 'var(--wa-type-body)', fontWeight: 600 }}>
            {t('assistant.title')}
          </h2>
          <p className="wa-kit-lede" style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--wa-muted)' }}>
            {t(`assistant.scope.${info.persona}`)}
          </p>
        </div>
        <button
          type="button"
          className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus"
          onClick={onClose}
          aria-label={t('assistant.close')}
          data-testid="help-assistant-close"
        >
          ×
        </button>
      </header>

      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--wa-pad-sm)', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}
      >
        <p
          style={{
            margin: 0,
            padding: '10px 14px',
            borderRadius: 'var(--wa-radius-sm) var(--wa-radius-sm) var(--wa-radius-sm) 4px',
            background: 'var(--wa-bg)',
            border: '1px solid var(--wa-border)',
            fontSize: 'var(--wa-type-body)',
            lineHeight: 1.45,
          }}
        >
          {t('assistant.intro')}
        </p>
        {messages.length === 0 && starters.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }} data-testid="help-assistant-starters">
            {starters.map((key) => (
              <button
                key={key}
                type="button"
                className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus"
                style={{ fontSize: '0.8125rem' }}
                onClick={() => void ask(t(`assistant.starters.${key}`))}
                disabled={busy}
              >
                {t(`assistant.starters.${key}`)}
              </button>
            ))}
          </div>
        ) : null}
        {messages.map((m) => {
          const mine = m.role === 'user';
          return (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', gap: '0.375rem' }}>
              <p
                style={{
                  margin: 0,
                  maxWidth: '88%',
                  padding: '10px 14px',
                  whiteSpace: 'pre-wrap',
                  borderRadius: mine
                    ? 'var(--wa-radius-sm) var(--wa-radius-sm) 4px var(--wa-radius-sm)'
                    : 'var(--wa-radius-sm) var(--wa-radius-sm) var(--wa-radius-sm) 4px',
                  background: mine ? 'var(--wa-accent-soft)' : 'var(--wa-bg)',
                  border: mine ? 'none' : '1px solid var(--wa-border)',
                  fontSize: 'var(--wa-type-body)',
                  lineHeight: 1.45,
                }}
              >
                {m.text}
              </p>
              {!mine && m.links && m.links.length > 0 ? (
                <nav aria-label={t('assistant.links')} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', maxWidth: '88%' }}>
                  {m.links.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      prefetch={false}
                      className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus"
                      style={{ fontSize: '0.8125rem' }}
                      onClick={onClose}
                    >
                      {link.label}
                    </Link>
                  ))}
                  {m.degraded && onTakeTour ? (
                    <button type="button" className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus" style={{ fontSize: '0.8125rem' }} onClick={onTakeTour}>
                      {t('help.takeTour')}
                    </button>
                  ) : null}
                </nav>
              ) : null}
            </div>
          );
        })}
        {busy ? (
          <p className="wa-kit-lede" style={{ margin: 0, color: 'var(--wa-muted)', fontSize: '0.8125rem' }} data-testid="help-assistant-thinking">
            {t('assistant.thinking')}
          </p>
        ) : null}
        {error ? (
          <p role="alert" style={{ margin: 0, color: 'var(--wa-danger, var(--wa-text))', fontSize: '0.8125rem' }}>
            {error}
          </p>
        ) : null}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(draft);
        }}
        style={{ display: 'flex', gap: '0.5rem', padding: 'var(--wa-pad-sm)', borderTop: '1px solid var(--wa-border)', flexShrink: 0 }}
      >
        <label className="wa-sr-only" htmlFor={inputId}>
          {t('assistant.placeholder')}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          className="wa-kit-focus"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('assistant.placeholder')}
          maxLength={HELP_MAX_QUESTION_CHARS}
          autoComplete="off"
          disabled={busy}
          data-testid="help-assistant-input"
          style={{
            flex: 1,
            minWidth: 0,
            padding: 'var(--wa-pad-sm)',
            border: '1px solid var(--wa-border)',
            borderRadius: 'var(--wa-radius-sm)',
            background: 'var(--wa-bg)',
            color: 'var(--wa-text)',
            fontSize: 'var(--wa-type-body)',
          }}
        />
        <button type="submit" className="wa-kit-cta wa-kit-focus" disabled={busy || !draft.trim()} data-testid="help-assistant-send">
          {t('assistant.send')}
        </button>
      </form>
      <p className="wa-kit-lede" style={{ margin: 0, padding: '0 var(--wa-pad-sm) var(--wa-pad-sm)', color: 'var(--wa-muted)', fontSize: '0.8125rem' }}>
        {t('assistant.disclaimer')}
      </p>
    </div>,
    document.body,
  );
}
