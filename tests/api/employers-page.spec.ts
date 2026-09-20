import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

describe('Employers Page — honest trust presentation', () => {
  // NOTE: the Next.js app/employers/page.tsx was deleted in the Astro
  // marketing migration (PR #2073) — /employers is now served by
  // marketing/src/pages/employers.astro. The old source-reading assertions
  // against that page were removed with it; the checks below cover the
  // pieces that still live in this repo's Next app.

  it('shows no employer pricing anywhere — pricing is future state (CEO decision 2026-07-02)', () => {
    // Employer pricing was removed from every surface: no dollar amounts may
    // appear on the employer-facing pages, and the orphaned
    // `marketing.employers` message namespace (which carried the old
    // $499/$999 tier copy with zero render call sites) must stay deleted so
    // stale pricing can't silently resurface through a translation file.
    const messagesPath = path.resolve(__dirname, '../../messages/en.json');
    const messages = JSON.parse(readFileSync(messagesPath, 'utf-8')) as {
      marketing?: { employers?: Record<string, string> };
    };
    expect(messages.marketing?.employers).toBeUndefined();

    const employerSurfaces = [
      '../../marketing/src/pages/employers.astro',
      '../../app/employers/signup/page.tsx',
      '../../app/(portal)/employer/billing/page.tsx',
      '../../components/employer/EmployerLoiForm.tsx',
    ];
    for (const rel of employerSurfaces) {
      const source = readFileSync(path.resolve(__dirname, rel), 'utf-8');
      // Known historical price points, and any "$N/mo"-style subscription copy.
      expect(source, `${rel} must not show a price`).not.toMatch(/\$\s?(499|999)\b/);
      expect(source, `${rel} must not show per-month pricing`).not.toMatch(/\$\s?[\d,]+\s?\/\s?mo/i);
    }
  });

  it('uses a forward icon on the hero CTA instead of a calendar booking cue', () => {
    const ctaPath = path.resolve(
      __dirname,
      '../../components/marketing/employers/EmployersHeroCtaExperiment.tsx',
    );
    const source = readFileSync(ctaPath, 'utf-8');

    // WAP-110: the hero CTA draws a Lucide arrow, not an icon-font ligature.
    expect(source).toContain('<ArrowRight');
    expect(source).not.toContain('material-symbols-outlined');
    expect(source).not.toMatch(/calendar_today|<Calendar/);
  });
});
