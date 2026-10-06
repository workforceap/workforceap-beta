import { describe, expect, it } from 'vitest';

import { isJsonObject, readJsonObjectBody } from '@/lib/api/readJsonBody';

function jsonRequest(body: string): Request {
  return new Request('https://workforceap.org/api/member/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

describe('isJsonObject', () => {
  it('accepts a plain object and rejects every other JSON value', () => {
    expect(isJsonObject({ field: 1 })).toBe(true);
    expect(isJsonObject(null)).toBe(false);
    expect(isJsonObject([])).toBe(false);
    expect(isJsonObject('text')).toBe(false);
    expect(isJsonObject(42)).toBe(false);
    expect(isJsonObject(true)).toBe(false);
  });
});

describe('readJsonObjectBody', () => {
  it('returns a parsed object body', async () => {
    await expect(readJsonObjectBody(jsonRequest('{"topic":"resume"}'))).resolves.toEqual({
      topic: 'resume',
    });
  });

  it('returns null for JSON that is not an object so callers can answer 400', async () => {
    await expect(readJsonObjectBody(jsonRequest('null'))).resolves.toBeNull();
    await expect(readJsonObjectBody(jsonRequest('[]'))).resolves.toBeNull();
    await expect(readJsonObjectBody(jsonRequest('"text"'))).resolves.toBeNull();
    await expect(readJsonObjectBody(jsonRequest('42'))).resolves.toBeNull();
  });

  it('returns null for a body that is not JSON', async () => {
    await expect(readJsonObjectBody(jsonRequest('not-json'))).resolves.toBeNull();
  });
});
