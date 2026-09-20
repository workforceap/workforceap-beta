// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * WAP-157: one focus-ring recipe across sidebar, header, tabs, hero and
 * public controls.
 *
 * The recipe is the kit ring (`.wa-kit-focus`): a transparent 2px outline,
 * 2px offset, and a box-shadow drawn from `--wa-focus-ring` or
 * `--wa-focus-ring-on-dark` (defined once in css/main.css). Forced-colors
 * mode swaps in a system `Highlight` outline. Any `:focus` / `:focus-visible`
 * rule in css/ that draws its own outline colour, width or shadow is a second
 * recipe and fails here. Rules that only recolour text or a border (no
 * outline / box-shadow) are fine — the global ring still applies to them.
 */

const CSS_DIR = path.resolve(__dirname, '../../css');

type Block = { file: string; line: number; selector: string; declarations: Map<string, string>; forcedColors: boolean };

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

function focusBlocks(file: string): Block[] {
  const source = stripComments(readFileSync(path.join(CSS_DIR, file), 'utf8'));
  const blocks: Block[] = [];
  const stack: { selector: string; start: number }[] = [];
  let selectorStart = 0;
  let depth = 0;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') {
      stack.push({ selector: source.slice(selectorStart, i).trim(), start: i });
      depth += 1;
      selectorStart = i + 1;
    } else if (ch === '}') {
      const block = stack.pop()!;
      depth -= 1;
      const body = source.slice(block.start + 1, i);
      selectorStart = i + 1;
      if (block.selector.startsWith('@') || body.includes('{')) continue;
      if (!/:focus(?!-within)/.test(block.selector)) continue;
      const declarations = new Map<string, string>();
      for (const decl of body.split(';')) {
        const colon = decl.indexOf(':');
        if (colon < 0) continue;
        declarations.set(decl.slice(0, colon).trim().toLowerCase(), decl.slice(colon + 1).trim().replace(/\s+/g, ' '));
      }
      const forcedColors = stack.some((parent) => /forced-colors:\s*active/.test(parent.selector));
      blocks.push({
        file,
        line: source.slice(0, block.start).split('\n').length,
        selector: block.selector.replace(/\s+/g, ' '),
        declarations,
        forcedColors,
      });
    } else if (ch === ';' && depth === 0) {
      selectorStart = i + 1;
    }
  }
  return blocks;
}

const RING_SHADOWS = new Set(['var(--wa-focus-ring)', 'var(--wa-focus-ring-on-dark)']);

function violation(block: Block): string | null {
  const outline = block.declarations.get('outline');
  const shadow = block.declarations.get('box-shadow');
  if (block.forcedColors) {
    if (outline && !/^2px solid Highlight( !important)?$/.test(outline)) return `forced-colors outline "${outline}"`;
    if (shadow && !/^none( !important)?$/.test(shadow)) return `forced-colors box-shadow "${shadow}"`;
    return null;
  }
  if (outline !== undefined && outline !== '2px solid transparent') return `outline "${outline}"`;
  if (shadow !== undefined && !RING_SHADOWS.has(shadow)) return `box-shadow "${shadow}"`;
  if (outline !== undefined && shadow === undefined) return 'transparent outline without a ring shadow';
  if (shadow !== undefined && outline === undefined && !/\+\s*\.wa-kit-toggle-track$|:has\(/.test(block.selector)) {
    return 'ring shadow without the transparent outline (forced-colors fallback)';
  }
  const offset = block.declarations.get('outline-offset');
  if (outline !== undefined && offset !== undefined && offset !== '2px') return `outline-offset "${offset}"`;
  return null;
}

describe('focus ring recipe', () => {
  const files = readdirSync(CSS_DIR).filter((f) => f.endsWith('.css'));

  it('defines the ring tokens once, in the global stylesheet', () => {
    const main = stripComments(readFileSync(path.join(CSS_DIR, 'main.css'), 'utf8'));
    expect(main).toMatch(/--wa-focus-ring:\s*0 0 0 2px var\(--wa-surface, var\(--color-white\)\), 0 0 0 4px var\(--wa-accent, var\(--color-accent\)\);/);
    expect(main).toMatch(/--wa-focus-ring-on-dark:\s*0 0 0 2px var\(--wa-sidebar-bg, #161616\), 0 0 0 4px var\(--wa-on-hero, #ffffff\);/);
    const definitions = files.flatMap((f) => (stripComments(readFileSync(path.join(CSS_DIR, f), 'utf8')).match(/--wa-focus-ring(-on-dark)?\s*:/g) ?? []).map(() => f));
    expect(definitions).toEqual(['main.css', 'main.css']);
  });

  it('draws every :focus / :focus-visible ring with the kit recipe', () => {
    const offenders: string[] = [];
    let ringRules = 0;
    for (const file of files) {
      for (const block of focusBlocks(file)) {
        const problem = violation(block);
        if (problem) offenders.push(`${file}:${block.line} ${block.selector} — ${problem}`);
        if (block.declarations.has('box-shadow') || block.declarations.has('outline')) ringRules += 1;
      }
    }
    expect(offenders).toEqual([]);
    // Sidebar, header, tabs, hero CTAs, inputs and public controls all pass through here.
    expect(ringRules).toBeGreaterThan(30);
  });

  it('keeps sidebar, header, tab, hero and public controls on the shared recipe', () => {
    const shell = stripComments(readFileSync(path.join(CSS_DIR, 'portal-main-extracted.css'), 'utf8'));
    const main = stripComments(readFileSync(path.join(CSS_DIR, 'main.css'), 'utf8'));
    const publicA11y = stripComments(readFileSync(path.join(CSS_DIR, 'marketing-a11y.css'), 'utf8'));
    const portalA11y = stripComments(readFileSync(path.join(CSS_DIR, 'portal-a11y.css'), 'utf8'));
    expect(shell).toMatch(/\.workspace-sidebar-link:focus-visible[\s\S]{0,400}?box-shadow: var\(--wa-focus-ring-on-dark\)/);
    expect(shell).toMatch(/\.workspace-tab:focus-visible[\s\S]{0,400}?box-shadow: var\(--wa-focus-ring\)/);
    expect(shell).toMatch(/\.workspace-shell-brand:focus-visible[\s\S]{0,400}?box-shadow: var\(--wa-focus-ring\)/);
    expect(main).toMatch(/\.btn-primary:focus-visible \{[\s\S]{0,200}?box-shadow: var\(--wa-focus-ring\)/);
    expect(main).toMatch(/\.btn-secondary--on-dark:focus-visible[\s\S]{0,300}?box-shadow: var\(--wa-focus-ring-on-dark\)/);
    expect(publicA11y).toMatch(/box-shadow: var\(--wa-focus-ring\)/);
    expect(portalA11y).toMatch(/box-shadow: var\(--wa-focus-ring\)/);
    // The old competing global recipes are gone.
    expect(main).not.toMatch(/outline: 2px solid var\(--color-gold\)/);
    expect(main).not.toMatch(/\*:focus-visible \{\s*outline: 2px solid var\(--color-accent\)/);
    expect(publicA11y).not.toMatch(/#2563eb/);
  });
});
