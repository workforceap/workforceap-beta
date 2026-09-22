'use client';

import { useEffect, useRef } from 'react';

/**
 * Persist transient form state to localStorage so a tab refresh, accidental
 * navigation, or browser crash doesn't lose what the user typed.
 *
 * Per /plan-design-review interaction-state spec for AI tools: "Save partial
 * input on every keystroke (localStorage) so refresh doesn't lose work."
 *
 * Use:
 *   const [resume, setResume] = useState('');
 *   useDraftAutosave('ai-tool:resume-rewriter', resume, setResume);
 *
 * Loads the saved draft once on mount (only if the current value is empty),
 * then writes on every change. Pass `clear()` (returned from this hook) when
 * the form successfully submits so the next visit starts fresh.
 */
export function useDraftAutosave<T>(
  key: string,
  value: T,
  setValue: (next: T) => void,
  options?: {
    /** Skip writing if the value matches this predicate (e.g. empty string). Default: skip empty strings. */
    isEmpty?: (v: T) => boolean;
    /** Throttle writes (ms). Default 300. */
    debounceMs?: number;
  }
): { clear: () => void } {
  const isEmpty = options?.isEmpty ?? ((v) => typeof v === 'string' && v.trim() === '');
  const debounceMs = options?.debounceMs ?? 300;
  const setValueRef = useRef(setValue);
  setValueRef.current = setValue;
  // Callers usually pass `isEmpty` inline; read it through a ref so the
  // effects below do not re-run (and re-arm the debounce) on every render.
  const isEmptyRef = useRef(isEmpty);
  isEmptyRef.current = isEmpty;
  const loadedRef = useRef(false);

  // Load once on mount if current value is empty.
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    if (typeof window === 'undefined') return;
    if (!isEmptyRef.current(value)) return;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as T;
      if (!isEmptyRef.current(parsed)) setValueRef.current(parsed);
    } catch {
      // ignore parse / storage errors
    }
  }, [key, value]);

  // Write on change, debounced.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handle = window.setTimeout(() => {
      try {
        if (isEmptyRef.current(value)) {
          window.localStorage.removeItem(key);
        } else {
          window.localStorage.setItem(key, JSON.stringify(value));
        }
      } catch {
        // localStorage may be full or disabled (private browsing) — silent fallback
      }
    }, debounceMs);
    return () => window.clearTimeout(handle);
  }, [key, value, debounceMs]);

  return {
    clear: () => {
      if (typeof window === 'undefined') return;
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
    },
  };
}
