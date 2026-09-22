import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Sibling of tests/lib/focus-ring-recipe.spec.ts, which only scans css/. The
 * portal refine (2026-09-22) found sixteen focus rules in colocated CSS
 * modules and two inline <style> strings that drew their own ring (a 2–3px
 * accent outline, a soft tint shadow, a hex shadow pair). Those all read the
 * one recipe now (WAP-157):
 *
 *   outline: 2px solid transparent; outline-offset: <n>; box-shadow: var(--wa-focus-ring[-on-dark])
 *
 * A `:focus` / `:focus-visible` / `:focus-within` rule under components/portal
 * that sets a visible outline colour, a fixed-width outline other than the
 * transparent recipe line, or a hand-written box-shadow ring fails here.
 */

const root = path.resolve(__dirname, '../..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.module.css')) out.push(full);
  }
  return out;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

type Rule = { where: string; selector: string; body: string };

function focusRules(source: string, where: string): Rule[] {
  const rules: Rule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripComments(source)))) {
    const selector = m[1].trim().replace(/\s+/g, ' ');
    if (!/:focus/.test(selector)) continue;
    const line = source.slice(0, m.index).split('\n').length;
    rules.push({ where: `${where}:${line}`, selector, body: m[2] });
  }
  return rules;
}

function violation(rule: Rule): string | null {
  const decls = new Map<string, string>();
  for (const decl of rule.body.split(';')) {
    const colon = decl.indexOf(':');
    if (colon < 0) continue;
    decls.set(decl.slice(0, colon).trim().toLowerCase(), decl.slice(colon + 1).trim().replace(/\s+/g, ' '));
  }
  const outline = decls.get('outline');
  const shadow = decls.get('box-shadow');
  if (!outline && !shadow) return null; // inherits the global ring
  // Hiding the ring for programmatic (non-keyboard) focus is fine when the
  // selector says so explicitly; the :focus-visible recipe still applies.
  if (outline === 'none' && !shadow && /:focus:not\(:focus-visible\)/.test(rule.selector)) return null;
  if (outline && outline !== '2px solid transparent') return `outline "${outline}" draws its own ring`;
  if (shadow) {
    const recipe = /^var\(--wa-focus-ring(-on-dark)?\)$/.test(shadow);
    // Inset variant for full-width rows whose outer ring would be clipped by the list.
    const inset = /^inset 0 0 0 2px var\(--wa-surface\), inset 0 0 0 4px var\(--wa-accent\)$/.test(shadow);
    if (!recipe && !inset) return `box-shadow "${shadow}" is not the kit ring`;
    if (outline !== '2px solid transparent') return 'ring is missing the transparent outline (forced-colors fallback)';
  }
  return null;
}

const INLINE_STYLE_SOURCES = [
  'components/portal/PortalVoiceSession.tsx',
  'components/portal/kit/pages/VoiceStudioKit.tsx',
];

describe('portal focus rings outside css/ use the kit recipe', () => {
  const modules = walk(path.join(root, 'components/portal')).map((f) => path.relative(root, f));

  it('scans the colocated modules that used to draw their own rings', () => {
    for (const rel of [
      'components/portal/AssessmentForm.module.css',
      'components/portal/CoachChat.module.css',
      'components/portal/CounselorMessagesInboxClient.module.css',
      'components/portal/InterestProfilerClient.module.css',
      'components/portal/MemberLabWorkspace.module.css',
      'components/portal/WioaQualificationClient.module.css',
    ]) {
      expect(modules).toContain(rel);
    }
  });

  it('every :focus rule in components/portal/**/*.module.css is the recipe or inherits it', () => {
    const offenders: string[] = [];
    let ringRules = 0;
    for (const rel of modules) {
      for (const rule of focusRules(readFileSync(path.join(root, rel), 'utf8'), rel)) {
        const problem = violation(rule);
        if (problem) offenders.push(`${rule.where} ${rule.selector} — ${problem}`);
        if (/box-shadow/.test(rule.body)) ringRules += 1;
      }
    }
    expect(offenders).toEqual([]);
    // The sixteen module rules moved onto the recipe all declare the ring shadow.
    expect(ringRules).toBeGreaterThanOrEqual(16);
  });

  it.each(INLINE_STYLE_SOURCES)('%s inline <style> focus rules use the on-dark recipe', (rel) => {
    const source = readFileSync(path.join(root, rel), 'utf8');
    const rules = focusRules(source, rel);
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(violation(rule), `${rule.where} ${rule.selector}`).toBeNull();
      expect(rule.body).toContain('var(--wa-focus-ring-on-dark)');
    }
    expect(source).not.toMatch(/0 0 0 4px #ad2c4d/);
    expect(source).not.toMatch(/0 0 0 2px var\(--wa-sidebar-bg\), 0 0 0 4px var\(--wa-accent\)/);
  });
});
