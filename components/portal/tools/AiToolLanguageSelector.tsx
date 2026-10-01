'use client';

import type { CSSProperties } from 'react';

export type AiToolLanguage = 'en' | 'es' | 'fr' | 'pt';

const OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'pt', label: 'Português' },
] as const;

const KIT_BTN =
  'wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none';

const kitBtnSolid: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
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

type AiToolLanguageSelectorProps = {
  value: AiToolLanguage;
  onChange: (language: AiToolLanguage) => void;
};

export default function AiToolLanguageSelector({ value, onChange }: AiToolLanguageSelectorProps) {
  return (
    <section aria-label="AI tool response language" style={{ marginBottom: 16 }}>
      <p className="wa-kit-field-label" style={{ marginBottom: 8 }}>
        Response language
      </p>
      <div
        role="group"
        aria-label="AI tool response language options"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
      >
        {OPTIONS.map((option) => {
          const selected = option.code === value;
          return (
            <button
              key={option.code}
              type="button"
              aria-pressed={selected}
              title={`Generate responses in ${option.label}`}
              onClick={() => onChange(option.code)}
              className={KIT_BTN}
              style={selected ? kitBtnSolid : kitBtnOutline}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
