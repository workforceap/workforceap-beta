/**
 * Shared J5/J6 HTTP plumbing: CSRF origin, bounded body reads, JSON parse
 * refusals, and the side-effect bit that decides INTERNAL_ERROR vs
 * OUTCOME_UNCERTAIN. Route specs already cover the multipart voucher path;
 * these pin the helpers themselves, including the 64 KiB JSON limit and a
 * lying / missing Content-Length.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ApiError,
  MAX_JSON_BYTES,
  parseJsonField,
  readBodyBytes,
  readJsonBody,
  requireSameOriginMutation,
  SideEffects,
  unexpectedErrorResponse,
} from './http';

const ORIGIN = 'https://admin.workforceap.test';

function request(init: {
  url?: string;
  headers?: Record<string, string>;
  body?: BodyInit | ReadableStream<Uint8Array> | null;
}): Request {
  const body = init.body;
  return new Request(init.url ?? `${ORIGIN}/api/billing`, {
    method: 'POST',
    headers: init.headers,
    body: body ?? undefined,
    ...(body ? { duplex: 'half' } : {}),
  } as RequestInit);
}

function thrownSync(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  assert.fail('expected a throw');
}

async function thrown(fn: () => unknown | Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  assert.fail('expected a throw');
}

function asApiError(error: unknown): ApiError {
  assert.ok(error instanceof ApiError, `expected ApiError, got ${error}`);
  return error;
}

describe('requireSameOriginMutation', () => {
  it('refuses a missing, foreign, or cross-site Origin before any later work', () => {
    const cases: Array<Record<string, string>> = [
      {},
      { origin: 'https://evil.example' },
      { origin: ORIGIN, 'sec-fetch-site': 'cross-site' },
    ];
    for (const headers of cases) {
      const error = asApiError(thrownSync(() => requireSameOriginMutation(request({ headers }))));
      assert.equal(error.status, 403);
      assert.equal(error.body.code, 'ORIGIN_REJECTED');
    }
  });

  it('accepts a same-origin mutation without a cross-site fetch', () => {
    assert.doesNotThrow(() =>
      requireSameOriginMutation(request({ headers: { origin: ORIGIN, 'sec-fetch-site': 'same-origin' } })),
    );
  });
});

describe('readBodyBytes', () => {
  it('refuses an oversized Content-Length without pulling the stream', async () => {
    let pulled = false;
    const stream = new ReadableStream(
      {
        pull() {
          pulled = true;
        },
      },
      { highWaterMark: 0 },
    );
    const error = asApiError(
      await thrown(() =>
        readBodyBytes(
          request({
            headers: { 'content-length': String(MAX_JSON_BYTES + 1) },
            body: stream,
          }),
          MAX_JSON_BYTES,
        ),
      ),
    );
    assert.equal(error.status, 413);
    assert.equal(error.body.code, 'PAYLOAD_TOO_LARGE');
    assert.equal(pulled, false);
  });

  it('treats a non-numeric or negative Content-Length as missing and still stops at the byte limit', async () => {
    for (const length of ['nope', '-1', '1e999']) {
      const chunk = new Uint8Array(1024);
      let chunks = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          chunks += 1;
          controller.enqueue(chunk);
          if (chunks > 80) controller.close();
        },
      });
      const error = asApiError(
        await thrown(() =>
          readBodyBytes(request({ headers: { 'content-length': length }, body: stream }), MAX_JSON_BYTES),
        ),
      );
      assert.equal(error.status, 413);
      assert.equal(error.body.code, 'PAYLOAD_TOO_LARGE');
      assert.ok(chunks <= 65, `${length} kept reading after the 64 KiB cap (${chunks} chunks)`);
    }
  });

  it('returns the exact bytes when the body is within the limit', async () => {
    const bytes = await readBodyBytes(
      request({
        headers: { 'content-length': '4' },
        body: new Uint8Array([1, 2, 3, 4]),
      }),
      MAX_JSON_BYTES,
    );
    assert.deepEqual([...bytes], [1, 2, 3, 4]);
  });
});

describe('readJsonBody and parseJsonField', () => {
  it('refuses a non-JSON content type', async () => {
    const error = asApiError(
      await thrown(() => readJsonBody(request({ headers: { 'content-type': 'text/plain' }, body: '{}' }))),
    );
    assert.equal(error.status, 415);
    assert.equal(error.body.code, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('refuses malformed JSON after a bounded read', async () => {
    const error = asApiError(
      await thrown(() =>
        readJsonBody(request({ headers: { 'content-type': 'application/json' }, body: '{' })),
      ),
    );
    assert.equal(error.status, 400);
    assert.equal(error.body.code, 'INVALID_JSON');
  });

  it('parses a JSON object', async () => {
    const body = await readJsonBody(
      request({ headers: { 'content-type': 'application/json; charset=utf-8' }, body: '{"recordId":"r1"}' }),
    );
    assert.deepEqual(body, { recordId: 'r1' });
  });

  it('parseJsonField requires a present, parseable part', () => {
    const missing = asApiError(thrownSync(() => parseJsonField(new Map(), 'attestation')));
    assert.equal(missing.status, 422);
    assert.equal(missing.body.code, 'VALIDATION_FAILED');
    assert.equal(missing.body.field, 'attestation');

    const invalid = asApiError(thrownSync(() => parseJsonField(new Map([['attestation', '{']]), 'attestation')));
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.code, 'INVALID_JSON');

    assert.deepEqual(parseJsonField(new Map([['attestation', '{"ok":true}']]), 'attestation'), { ok: true });
  });
});

describe('unexpectedErrorResponse and SideEffects', () => {
  it('says nothing changed until a side effect is marked, then outcome uncertain', async () => {
    const log = console.error;
    console.error = () => undefined;
    try {
      const clean = unexpectedErrorResponse('sign POST', new Error('db down'), new SideEffects());
      assert.equal(clean.status, 500);
      assert.deepEqual(await clean.json(), {
        code: 'INTERNAL_ERROR',
        error: 'Something went wrong before anything was changed. Reload and try again.',
      });

      const marked = new SideEffects();
      marked.mark();
      const afterMark = unexpectedErrorResponse('send POST', new TypeError('socket closed'), marked);
      assert.equal(afterMark.status, 500);
      const markedBody = (await afterMark.json()) as { code: string; error: string };
      assert.equal(markedBody.code, 'OUTCOME_UNCERTAIN');
      assert.match(markedBody.error, /not known/u);

      const committed = new SideEffects();
      committed.committed();
      assert.equal(committed.any, true);
      assert.equal(committed.anyCommitted, true);
      const afterCommit = unexpectedErrorResponse('send POST', new Error('provider'), committed);
      assert.equal(((await afterCommit.json()) as { code: string }).code, 'OUTCOME_UNCERTAIN');
    } finally {
      console.error = log;
    }
  });
});
