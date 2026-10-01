'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { type KitBaseProps, type KitDataAttrs } from './base';

interface UniversalSearchProps extends KitBaseProps<HTMLDivElement>, KitDataAttrs {
  placeholder?: string;
  onSearch?: (q: string) => void;
  /** Show the ⌘K hint chip (desktop). */
  hint?: boolean;
}

/**
 * Universal search / command bar. The "finding is simple" surface.
 * Mockup: design-system header search.
 */
export function UniversalSearch({ placeholder = 'Find anything…', onSearch, hint = true, className, style, ref, ...rest }: UniversalSearchProps) {
  const [q, setQ] = useState('');
  return (
    <div ref={ref} className={className} style={{ position: 'relative', width: '100%', maxWidth: 520, ...style }} {...rest}>
      <Search size={15} aria-hidden="true" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--wa-muted)', pointerEvents: 'none' }} />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onSearch?.(q); }}
        placeholder={placeholder}
        aria-label="Universal search"
        className="wa-kit-focus"
        style={{
          width: '100%',
          border: '1px solid var(--wa-border)',
          background: 'var(--wa-bg)',
          borderRadius: 999,
          padding: '10px 14px 10px 38px',
          fontSize: 13,
          outline: 'none',
          color: 'var(--wa-text)',
          transition: 'border-color var(--wa-dur-base) var(--wa-ease), box-shadow var(--wa-dur-base) var(--wa-ease)',
        }}
      />
      {hint ? (
        <span className="wa-hidden md:wa-inline" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>
          <kbd className="wa-kit-search-hint" aria-hidden>⌘K</kbd>
        </span>
      ) : null}
    </div>
  );
}
