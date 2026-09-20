import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * WAP-118: `.mdx-stage::after` is a full-bleed decorative photo wash
 * (position:absolute; inset:0). Painted after the stage's children it sat
 * above them and swallowed pointer events, so with JS off the partner-signup
 * interstitial's fallback anchor "Continue to partner sign-up" could not be
 * clicked at any width. The wash must be pointer-transparent and the stage's
 * children must stack above it.
 */
const css = readFileSync(path.resolve(__dirname, '../../css/marketing-depth.css'), 'utf8');

describe('marketing depth stage keeps its links clickable', () => {
  const after = css.match(/\.mdx-stage::after\{[^}]*\}/)?.[0] ?? '';
  const children = css.match(/\.mdx-stage > \*\{[^}]*\}/)?.[0] ?? '';

  it('makes the decorative ::after wash pointer-transparent', () => {
    expect(after).toContain('position:absolute');
    expect(after).toContain('pointer-events:none');
  });

  it('stacks stage children above the wash', () => {
    expect(children).toContain('position:relative');
    expect(children).toMatch(/z-index:\s*1/);
  });
});
