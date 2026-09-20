import assert from 'node:assert/strict';
import test from 'node:test';
import { orderGroqModels } from './groq';

test('orderGroqModels: preferred ids that exist come first, in preference order', () => {
  const live = ['qwen/qwen3-32b', 'llama-3.3-70b-versatile', 'some/new-chat-model'];
  assert.deepEqual(orderGroqModels(live, ['llama-3.3-70b-versatile', 'qwen/qwen3-32b']), [
    'llama-3.3-70b-versatile',
    'qwen/qwen3-32b',
    'some/new-chat-model',
  ]);
});

test('orderGroqModels: a fully retired preferred list still yields the live chat models', () => {
  // The production outage: every hardcoded id 404'd. Discovery must not be
  // empty just because none of the preferences survive.
  const live = ['vendor/brand-new-70b', 'vendor/brand-new-8b'];
  assert.deepEqual(orderGroqModels(live, ['llama-3.1-8b-instant']), [
    'vendor/brand-new-70b',
    'vendor/brand-new-8b',
  ]);
});

test('orderGroqModels: never selects audio, safety or embedding models', () => {
  const live = [
    'whisper-large-v3',
    'playai-tts',
    'meta-llama/llama-guard-4-12b',
    'llama-prompt-guard-2-86m',
    'llama-3.3-70b-versatile',
  ];
  assert.deepEqual(orderGroqModels(live), ['llama-3.3-70b-versatile']);
});

test('orderGroqModels: empty live list yields empty (caller falls back to static list)', () => {
  assert.deepEqual(orderGroqModels([]), []);
});

// ---------------------------------------------------------------------------
// WAP-74: decommissioned model deny-list. The hourly Coursera auto-heal called
// a retired 8B id until Groq removed it; the next deprecation must fail CI.
// ---------------------------------------------------------------------------

import { RETIRED_GROQ_MODEL_IDS, isRetiredGroqModel } from './groqRetiredModels';
import { resolveGroqModelOverride } from './groq';

const RETIRED = [...RETIRED_GROQ_MODEL_IDS];

test('deny-list: names the three ids Groq decommissioned and nothing live', () => {
  assert.deepEqual(RETIRED.sort(), ['llama3-70b-8192', 'llama3-8b-8192', 'mixtral-8x7b-32768']);
  for (const id of RETIRED) assert.equal(isRetiredGroqModel(id), true);
  assert.equal(isRetiredGroqModel(' llama3-8b-8192 '), true);
  assert.equal(isRetiredGroqModel('llama-3.1-8b-instant'), false);
  assert.equal(isRetiredGroqModel(undefined), false);
});

test('deny-list: the configured preference chain contains no retired id', () => {
  // orderGroqModels with no live filter returns the static preference list itself.
  const preferred = orderGroqModels([
    'llama-3.3-70b-versatile',
    'meta-llama/llama-4-maverick-17b-128e-instruct',
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'moonshotai/kimi-k2-instruct',
    'qwen/qwen3-32b',
    'llama-3.1-8b-instant',
  ]);
  assert.ok(preferred.length > 0);
  for (const id of preferred) assert.equal(isRetiredGroqModel(id), false, `${id} is decommissioned`);
});

test('deny-list: orderGroqModels drops retired ids even when the live list or preferences name them', () => {
  const live = ['llama3-8b-8192', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'llama3-70b-8192'];
  assert.deepEqual(orderGroqModels(live, ['llama3-8b-8192', 'llama-3.1-8b-instant']), ['llama-3.1-8b-instant']);
  assert.deepEqual(orderGroqModels(RETIRED), []);
});

test('deny-list: a GROQ_MODEL override naming a retired id is ignored, a live one is kept', () => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(String(args[0])); };
  try {
    for (const id of RETIRED) assert.equal(resolveGroqModelOverride(id), undefined, id);
    assert.equal(resolveGroqModelOverride(' llama-3.1-8b-instant '), 'llama-3.1-8b-instant');
    assert.equal(resolveGroqModelOverride(''), undefined);
    assert.equal(resolveGroqModelOverride(undefined), undefined);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.length, RETIRED.length);
  assert.ok(warnings.every((w) => w.includes('decommissioned')));
});

// The static sweep of lib/, app/ and scripts/ for these ids runs in lint:
// scripts/lint/verify-no-retired-groq-models.mjs (a test may not read source).
