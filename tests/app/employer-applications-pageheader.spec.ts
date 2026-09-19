import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('employer applications EmployerPageOpener contract', () => {
  it('list page mounts one EmployerPageOpener outside mobile/desktop splits (jobs pattern)', () => {
    const source = read('app/(portal)/employer/applications/page.tsx');
    expect(source.match(/<EmployerPageOpener[\s>]/g)?.length ?? 0).toBe(1);
    expect(source).toContain('PortalPageFrame');
    expect(source).toContain('applicantsMetaTitle');
    // Bodies stay split; header must not live inside either wrapper.
    const mobileIdx = source.indexOf('wa-block md:wa-hidden');
    const desktopIdx = source.indexOf('wa-hidden md:wa-block');
    const headerIdx = source.indexOf('<EmployerPageOpener');
    expect(headerIdx).toBeGreaterThan(-1);
    expect(headerIdx).toBeLessThan(mobileIdx);
    expect(headerIdx).toBeLessThan(desktopIdx);
  });

  it('detail page uses EmployerPageOpener instead of a raw h1', () => {
    const source = read('app/(portal)/employer/applications/[id]/page.tsx');
    expect(source.match(/<EmployerPageOpener[\s>]/g)?.length ?? 0).toBe(1);
    expect(source).not.toMatch(/<h1[\s>]/);
    expect(source).toContain('backToApplicants');
    expect(source).toContain('applyingForJob');
  });
});
