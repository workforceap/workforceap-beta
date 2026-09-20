import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');

/**
 * WAP-128: the partner overview renders one pill design. The kit path uses
 * StatusTag; the reachable `?ui=legacy` path must not fall back to the
 * legacy StatusBadge pill.
 */
describe('partner overview pill design', () => {
  it('uses the kit StatusTag on every reachable partner overview path', () => {
    const source = readFileSync(path.join(root, 'app/(portal)/partner/page.tsx'), 'utf8');
    expect(source).not.toMatch(/StatusBadge/);
    expect(source).toMatch(/<StatusTag tone=\{row\.stage === 'placed' \? 'ok' : 'alert'\}>/);
    expect(source).toMatch(/<StatusTag tone=\{p\.stage === 'placed' \? 'ok' : 'alert'\}>/);
  });
});
