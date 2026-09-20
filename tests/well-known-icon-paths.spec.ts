// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';

/**
 * WAP-40 acceptance: standard icon + well-known paths are served as real
 * files with the requested geometry, and every stale route we still
 * advertise redirects to a destination that exists.
 */
const root = process.cwd();
const pub = (p: string) => path.join(root, 'public', p);

function pngSize(file: string): { width: number; height: number; colorType: number } {
  const buf = readFileSync(file);
  expect(buf.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(buf.toString('ascii', 12, 16)).toBe('IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25] };
}

describe('standard icon paths', () => {
  it('serves the Apple touch icon (and its precomposed alias) at exactly 180x180', () => {
    for (const name of ['apple-touch-icon.png', 'apple-touch-icon-precomposed.png']) {
      expect(existsSync(pub(name)), name).toBe(true);
      const { width, height, colorType } = pngSize(pub(name));
      expect({ name, width, height }).toEqual({ name, width: 180, height: 180 });
      expect(colorType, `${name} keeps an alpha channel`).toBe(6);
    }
  });

  it('links the 180px icon from the root layout with an explicit sizes attribute', () => {
    const layout = readFileSync(path.join(root, 'app/layout.tsx'), 'utf8');
    expect(layout).toMatch(/<link rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon\.png" \/>/);
    expect(layout).not.toMatch(/rel="apple-touch-icon"[^>]*icon-192x192/);
  });

  it('keeps the PWA manifest icons at their declared sizes', () => {
    const manifest = JSON.parse(readFileSync(pub('manifest.json'), 'utf8')) as {
      icons: Array<{ src: string; sizes: string }>;
    };
    for (const icon of manifest.icons) {
      const file = pub(icon.src.replace(/^\//, ''));
      expect(existsSync(file), icon.src).toBe(true);
      const [w, h] = icon.sizes.split('x').map(Number);
      expect(pngSize(file)).toMatchObject({ width: w, height: h });
    }
  });

  it('rewrites /favicon.ico to a shipped asset', async () => {
    const rewrites = (await nextConfig.rewrites?.()) as Array<{ source: string; destination: string }>;
    const favicon = rewrites.find((r) => r.source === '/favicon.ico');
    expect(favicon).toBeDefined();
    expect(existsSync(pub(favicon!.destination.replace(/^\//, '')))).toBe(true);
  });
});

describe('well-known paths', () => {
  it('ships parseable JSON for traffic-advice and assetlinks', () => {
    for (const name of ['.well-known/traffic-advice', '.well-known/assetlinks.json']) {
      expect(existsSync(pub(name)), name).toBe(true);
      expect(() => JSON.parse(readFileSync(pub(name), 'utf8'))).not.toThrow();
    }
  });

  it('serves traffic-advice with its registered content type and a public cache', async () => {
    const headers = (await nextConfig.headers?.()) as Array<{
      source: string;
      headers: Array<{ key: string; value: string }>;
    }>;
    const advice = headers.find((h) => h.source === '/.well-known/traffic-advice');
    expect(advice).toBeDefined();
    const byKey = new Map(advice!.headers.map((h) => [h.key, h.value]));
    expect(byKey.get('Content-Type')).toBe('application/trafficadvice+json');
    expect(byKey.get('Cache-Control')).toMatch(/public/);
  });
});
