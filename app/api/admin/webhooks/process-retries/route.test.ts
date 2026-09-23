import test from 'node:test';
import assert from 'node:assert/strict';

import { processRetryEvent } from './_processRetries';

const baseEvent = {
  id: 'wh-1',
  source: 'learning-completion',
  eventType: 'learning.completion',
  eventId: 'evt-1',
  payloadSize: 128,
  processingTimeMs: null,
  status: 'retrying',
  httpStatusCode: 500,
  errorMessage: 'temporary failure',
  retryCount: 1,
  nextRetryAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

type Recorder = { updateCalls: any[]; retryCalls: any[]; claimCalls: any[] };

function recordingDeps(overrides: Record<string, unknown> = {}) {
  const rec: Recorder = { updateCalls: [], retryCalls: [], claimCalls: [] };
  const deps = {
    claim: async (event: unknown) => {
      rec.claimCalls.push(event);
      return true;
    },
    updateStatus: async (...args: any[]) => {
      rec.updateCalls.push(args);
    },
    markForRetry: async (...args: any[]) => {
      rec.retryCalls.push(args);
      return 'scheduled' as const;
    },
    ...overrides,
  };
  return { rec, deps: deps as any };
}

test('processRetryEvent marks success only after reprocessing succeeds', async () => {
  const { rec, deps } = recordingDeps({ reprocessWebhookEvent: async () => 'success' });

  const result = await processRetryEvent(baseEvent, deps);

  assert.deepEqual(result, { id: 'wh-1', source: 'learning-completion', result: 'success' });
  assert.equal(rec.claimCalls.length, 1);
  assert.equal(rec.updateCalls.length, 1);
  assert.equal(rec.updateCalls[0][0], 'wh-1');
  assert.equal(rec.updateCalls[0][1].status, 'success');
  assert.equal(rec.updateCalls[0][1].nextRetryAt, null);
  assert.equal(rec.retryCalls.length, 0);
});

test('processRetryEvent schedules another retry when reprocessing fails', async () => {
  const { rec, deps } = recordingDeps({
    reprocessWebhookEvent: async () => {
      throw new Error('downstream unavailable');
    },
  });

  const result = await processRetryEvent(baseEvent, deps);

  assert.deepEqual(result, { id: 'wh-1', source: 'learning-completion', result: 'failed' });
  assert.equal(rec.updateCalls.length, 0);
  assert.deepEqual(rec.retryCalls[0], ['wh-1', 1, 'downstream unavailable']);
});

test('processRetryEvent reports max retries exceeded when retry scheduling dead-letters', async () => {
  const { deps } = recordingDeps({
    reprocessWebhookEvent: async () => {
      throw new Error('still broken');
    },
    markForRetry: async () => 'max_retries_exceeded',
  });

  const result = await processRetryEvent({ ...baseEvent, retryCount: 4 }, deps);

  assert.deepEqual(result, {
    id: 'wh-1',
    source: 'learning-completion',
    result: 'max_retries_exceeded',
  });
});

test('processRetryEvent never reprocesses a row another run already claimed', async () => {
  let reprocessed = false;
  const { rec, deps } = recordingDeps({
    claim: async () => false,
    reprocessWebhookEvent: async () => {
      reprocessed = true;
      return 'success';
    },
  });

  const result = await processRetryEvent(baseEvent, deps);

  assert.deepEqual(result, { id: 'wh-1', source: 'learning-completion', result: 'claimed_elsewhere' });
  assert.equal(reprocessed, false);
  assert.equal(rec.updateCalls.length, 0);
  assert.equal(rec.retryCalls.length, 0);
});

test('processRetryEvent dead-letters a row it can never process, without consuming an attempt', async () => {
  const { rec, deps } = recordingDeps({ reprocessWebhookEvent: async () => ({ skipped: 'invalid_payload' }) });

  const result = await processRetryEvent(baseEvent, deps);

  assert.deepEqual(result, { id: 'wh-1', source: 'learning-completion', result: 'skipped' });
  assert.equal(rec.retryCalls.length, 0);
  assert.equal(rec.updateCalls.length, 1);
  assert.equal(rec.updateCalls[0][0], 'wh-1');
  assert.deepEqual(rec.updateCalls[0][1], {
    status: 'dead_letter',
    errorMessage: 'not_reprocessable: invalid_payload',
    nextRetryAt: null,
  });
});

test('processRetryEvent dead-letters an unsupported source and a row with no eventId', async () => {
  const unsupported = recordingDeps();
  const a = await processRetryEvent({ ...baseEvent, source: 'unknown-provider' }, unsupported.deps);
  assert.equal(a.result, 'skipped');
  assert.equal(unsupported.rec.updateCalls[0][1].status, 'dead_letter');
  assert.equal(unsupported.rec.updateCalls[0][1].errorMessage, 'not_reprocessable: unsupported_source');
  assert.equal(unsupported.rec.updateCalls[0][1].nextRetryAt, null);

  const noEventId = recordingDeps();
  const b = await processRetryEvent({ ...baseEvent, eventId: null }, noEventId.deps);
  assert.equal(b.result, 'skipped');
  assert.equal(noEventId.rec.updateCalls[0][1].errorMessage, 'not_reprocessable: no_event_id');
  assert.equal(noEventId.rec.updateCalls[0][1].nextRetryAt, null);
});
