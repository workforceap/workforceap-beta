import type { ReactNode } from 'react';
import LegacyGlyph from '@/components/icons/LegacyGlyph';
import { marketingButtonPresets } from '@/lib/marketing/buttonClasses';

interface ProcessStepProps {
  step: string;
  icon?: string;
  title: ReactNode;
  description: ReactNode;
  centered?: boolean;
}

export function ProcessStep({ step, icon, title, description, centered = false }: ProcessStepProps) {
  return (
    <div style={{ textAlign: centered ? 'center' : 'left', padding: '0 1rem', position: 'relative', zIndex: 1 }}>
      <div
        className={marketingButtonPresets.stepNumPill(
          `marketing-process-step__badge${centered ? ' marketing-process-step__badge--centered' : ' marketing-process-step__badge--left'}`,
        )}
      >
        {step}
      </div>
      {icon && (
        <LegacyGlyph
          name={icon}
          size={32}
          className="marketing-process-step__icon"
          style={{ marginBottom: '0.75rem', display: 'block', marginInline: centered ? 'auto' : undefined }}
        />
      )}
      <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--color-on-surface)' }}>
        {title}
      </h3>
      <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.6 }}>
        {description}
      </p>
    </div>
  );
}
