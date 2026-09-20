import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');

/**
 * WAP-114 — one public CTA class.
 * Every primary submit / primary link on the public routes is `.btn.btn-primary`
 * and every secondary is `.btn.btn-secondary` (css/main.css). Page skins may
 * recolor those classes inside their scope; nothing may redraw the geometry
 * with a page-level primary class or an inline style object.
 */
const PUBLIC_TREES = [
  'app/(auth)',
  'app/(decision-journey)',
  'app/apply',
  'app/careers',
  'app/employer',
  'app/employers',
  'app/enroll',
  'app/mentor',
  'app/partner-signup',
  'app/wioa-qualification',
  'components/apply',
  'components/forms',
  'components/marketing',
];

const RETIRED_PRIMARY_CLASSES = [
  'mdx-btn--primary',
  'mdx-btn--solid',
  'mdx-btn--ghost',
  'btn--primary',
  'btn--ghost',
  'btn--sm',
  'btn btn-outline',
];

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.tsx$/.test(entry) && !/\.(test|spec)\.tsx$/.test(entry)) acc.push(full);
  }
  return acc;
}

const sources = PUBLIC_TREES.flatMap((rel) => walk(path.join(root, rel)));

describe('public CTAs share one primary / secondary class (WAP-114)', () => {
  it('scans the public route inventory', () => {
    expect(sources.length).toBeGreaterThan(40);
  });

  it.each(sources.map((file) => [path.relative(root, file), file]))('%s uses no retired CTA variant', (_rel, file) => {
    const source = readFileSync(file, 'utf8');
    for (const retired of RETIRED_PRIMARY_CLASSES) {
      expect(source, `${_rel} still draws a CTA with "${retired}"`).not.toContain(retired);
    }
    // No inline primary-button style objects on the auth forms.
    expect(source).not.toMatch(/primaryBtn/);
  });

  it('every type="submit" on a public form carries btn btn-primary (or the preset that emits it)', () => {
    for (const file of sources) {
      const source = readFileSync(file, 'utf8');
      const submits = source.match(/<button[^>]*type="submit"[\s\S]*?>/g) ?? [];
      for (const submit of submits) {
        const rel = path.relative(root, file);
        const ok = /className="[^"]*\bbtn btn-primary\b/.test(submit)
          || /className=\{`btn btn-primary\b/.test(submit)
          // lib/ui/buttonClasses presets all emit `btn btn-primary` for the primary variant.
          || /ButtonPresets\.\w*[pP]rimary\w*\(|buttonPresets\.\w*[pP]rimary\w*\(|primaryButtonClasses\(/.test(submit);
        expect(ok, `${rel}: ${submit.replace(/\s+/g, ' ').slice(0, 160)}`).toBe(true);
      }
    }
  });

  it('keeps one geometry for .btn and the depth hero chip, with skins only recoloring', () => {
    const main = readFileSync(path.join(root, 'css/main.css'), 'utf8');
    const depth = readFileSync(path.join(root, 'css/marketing-depth.css'), 'utf8');
    const btn = main.match(/\n\.btn \{([^}]+)\}/)?.[1] ?? '';
    expect(btn).toMatch(/padding:\s*0\.8125rem 1\.75rem/);
    expect(btn).toMatch(/border-radius:\s*var\(--radius-md\)/);
    expect(btn).toMatch(/min-height:\s*var\(--btn-min-height\)/);
    const mdxBtn = depth.match(/\.mdx-btn\{([^}]+)\}/)?.[1] ?? '';
    expect(mdxBtn).toMatch(/padding:\.8125rem 1\.75rem/);
    expect(mdxBtn).toMatch(/border-radius:var\(--radius-md\)/);
    expect(mdxBtn).toMatch(/min-height:var\(--btn-min-height,44px\)/);
    expect(depth).not.toMatch(/\.mdx-btn--primary\{/);
    // The skin recolors the shared class; it never sets padding / radius / min-height.
    const skin = depth.match(/\.mdx \.btn-primary\{([^}]+)\}/)?.[1] ?? '';
    expect(skin).toContain('background');
    expect(skin).not.toMatch(/padding|border-radius|min-height/);
  });
});
