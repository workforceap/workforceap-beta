// @vitest-environment node
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { copyMarketingBuild } = require('../../scripts/vercel-build.cjs') as { copyMarketingBuild(root: string): void };

describe('public CMS blog build ownership', () => {
  it('removes old and accidentally emitted blog HTML while preserving marketing pages and blog image assets', () => {
    const root = mkdtempSync(join(tmpdir(), 'wap-blog-routing-'));
    const put = (path: string, content = 'fixture') => { const full = join(root, path); mkdirSync(dirname(full), { recursive: true }); writeFileSync(full, content); };
    try {
      put('marketing/dist/about/index.html', 'about');
      put('marketing/dist/blog/index.html', 'stale listing');
      put('marketing/dist/blog/old-post/index.html', 'stale post');
      put('marketing/dist/images/blog/photo.jpg', 'image');
      put('public/es/blog/old-post/index.html');
      put('public/blog.html');
      put('public/fr/blog.html');
      put('public/keep.txt', 'keep');
      copyMarketingBuild(root);
      for (const path of ['public/blog', 'public/blog.html', 'public/es/blog', 'public/fr/blog.html']) expect(existsSync(join(root, path))).toBe(false);
      expect(readFileSync(join(root, 'public/about/index.html'), 'utf8')).toBe('about');
      expect(readFileSync(join(root, 'public/images/blog/photo.jpg'), 'utf8')).toBe('image');
      expect(readFileSync(join(root, 'public/keep.txt'), 'utf8')).toBe('keep');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
