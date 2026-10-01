import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

describe('apply confirmation clarity', () => {
  const pageSource = readFileSync(
    path.resolve(__dirname, '../../app/apply/confirmation/page.tsx'),
    'utf-8',
  );
  const cssSource = readFileSync(
    path.resolve(__dirname, '../../app/apply/apply-funnel-depth.css'),
    'utf-8',
  );
  const ctaSource = readFileSync(
    path.resolve(__dirname, '../../components/apply/ApplyConfirmationCta.tsx'),
    'utf-8',
  );
  const shareSource = readFileSync(
    path.resolve(__dirname, '../../components/apply/ShareButtons.tsx'),
    'utf-8',
  );

  it('keeps a single primary next-step CTA zone (footer stays secondary)', () => {
    expect(pageSource).toContain('afd-confirm__recommend');
    expect(pageSource).toContain('afd-confirm__foot-actions');
    // WAP-114: footer links carry the shared secondary class; the single
    // primary lives in the recommend zone above it.
    expect(pageSource).toMatch(
      /afd-confirm__foot-actions[\s\S]*btn btn-secondary[\s\S]*confirmationCtaStatus/,
    );
    expect(pageSource).not.toMatch(
      /afd-confirm__foot-actions[\s\S]*btn-primary/,
    );
  });

  it('marks timeline progress with done + current steps', () => {
    expect(pageSource).toContain('afd-confirm__step--done');
    expect(pageSource).toContain('afd-confirm__step--current');
    expect(pageSource).toContain("aria-current={state === 'current' ? 'step' : undefined}");
    expect(pageSource).toContain('confirmationStepDoneLabel');
    expect(pageSource).toContain('confirmationStepCurrentLabel');
  });

  it('styles confirmation with --wa-* kit tokens instead of inline --color bags', () => {
    expect(cssSource).toContain('--wa-accent');
    expect(cssSource).toContain('--wa-text');
    expect(cssSource).toContain('.afd-confirm__recommend');
    expect(cssSource).toContain('.afd-confirm__share-btn');
    expect(cssSource).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    // The completed-step label is 13px uppercase on the white card: the base
    // success hue is 3.45:1 there, so it must read through the dark ramp.
    expect(cssSource).toMatch(
      /\.afd-confirm__step--done \.afd-confirm__step-state \{[^}]*color:\s*var\(--wa-success-dark\)/,
    );
    expect(pageSource).not.toContain('var(--color-accent)');
    expect(ctaSource).not.toContain('var(--color-accent)');
    expect(ctaSource).toContain('afd-confirm__recommend');
    expect(shareSource).toContain('afd-confirm__share-grid');
    expect(shareSource).not.toContain('var(--color-');
    expect(shareSource).not.toContain('var(--surface-container');
    expect(shareSource).not.toContain('var(--outline-variant)');
  });

  it('does not duplicate the primary destination in Also helpful for signed-in members', () => {
    expect(pageSource).toContain('confirmationAlsoHelpfulHeading');
    expect(pageSource).toContain('whatYouCanDoSignedIn');
    expect(pageSource).not.toMatch(
      /whatYouCanDoSignedIn = \[[\s\S]*confirmationDoDashboardLabel/,
    );
  });
});
