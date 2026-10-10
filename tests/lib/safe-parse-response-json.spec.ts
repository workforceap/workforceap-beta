import { describe, expect, it } from 'vitest';
import { safeParseResponseJson } from '@/lib/http/safeFetchJson';

function response(body: string, status = 200, contentType = 'application/json') {
  return new Response(body, { status, headers: { 'content-type': contentType } });
}

describe('safeParseResponseJson', () => {
  it('returns parseError on an empty body without throwing', async () => {
    const parsed = await safeParseResponseJson(response('   ', 200));
    expect(parsed).toEqual({
      ok: true,
      status: 200,
      data: null,
      parseError: true,
      rawSnippet: '',
    });
  });

  it('returns parseError on HTML error pages and keeps a short snippet', async () => {
    const html = '<!DOCTYPE html><html><body>Gateway Timeout</body></html>';
    const parsed = await safeParseResponseJson(response(html, 502, 'text/html'));
    expect(parsed.ok).toBe(false);
    expect(parsed.status).toBe(502);
    expect(parsed.data).toBeNull();
    expect(parsed.parseError).toBe(true);
    expect(parsed.rawSnippet).toContain('Gateway Timeout');
  });

  it('truncates long non-JSON bodies so callers do not keep the whole page', async () => {
    const long = `not-json-${'x'.repeat(400)}`;
    const parsed = await safeParseResponseJson(response(long, 500, 'text/plain'));
    expect(parsed.parseError).toBe(true);
    expect(parsed.rawSnippet.endsWith('…')).toBe(true);
    expect(parsed.rawSnippet.length).toBeLessThan(long.length);
    expect(parsed.rawSnippet.startsWith('not-json-')).toBe(true);
  });

  it('returns parsed JSON and preserves HTTP ok/status', async () => {
    const parsed = await safeParseResponseJson<{ error: string }>(
      response(JSON.stringify({ error: 'Member not found' }), 404),
    );
    expect(parsed).toEqual({
      ok: false,
      status: 404,
      data: { error: 'Member not found' },
      parseError: false,
      rawSnippet: '{"error":"Member not found"}',
    });
  });
});
