// @vitest-environment node
/**
 * Local checks of the DEMO acceptance fixture. These run the repository's real
 * extractor and factuality check in-process. They do NOT call a provider or a
 * deployment and are not evidence of an end-to-end pass; the DEMO lane itself
 * is tests/e2e/resume-demo-acceptance.spec.ts.
 */
import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { extractTextFromResumeBuffer } from '@/lib/resume/extractTextFromResumeBuffer';
import { findUnsupportedResumeClaims } from '@/lib/resume/validateGeneratedResume';
import {
  buildSyntheticResumePdf,
  classifyBuild,
  containsFact,
  initialAcceptanceReceipt,
  PAGE_TWO_FACTS,
  sessionUserIdFromCookies,
  singleBuildBudget,
  SYNTHETIC_RESUME_SOURCE_TEXT,
} from './fixtures/resumeDemoAcceptance';

const FAITHFUL_DRAFT = `# Rowan Tessaly-Brook

## Professional Summary
Maintenance planner who schedules preventive work and keeps technicians supplied.

## Experience
**Maintenance Planner** — Brightwater Turbine Services, June 2017 – August 2024
- Scheduled preventive maintenance for 38 wind turbines
- Built weekly parts kits for field technicians

**Stock Associate** — Kestrel Valley Grocers, 2014–2017
- Received and rotated perishable stock for the overnight crew

## Education
A.A.S. Wind Energy Technology — Harrowgate Technical College, 2016

## Certifications
- OSHA 30`;

describe('DEMO acceptance fixture (local only)', () => {
  it('extracts both pages, with the page-2 facts, and no PDF syntax', async () => {
    const text = await extractTextFromResumeBuffer(Buffer.from(await buildSyntheticResumePdf()), 'pdf');

    for (const fact of Object.values(PAGE_TWO_FACTS)) expect(containsFact(text, fact)).toBe(true);
    expect(text.indexOf('Kestrel Valley Grocers')).toBeLessThan(text.indexOf(PAGE_TWO_FACTS.employer));
    expect(text).not.toMatch(/%PDF|\bendobj\b|\bstream\b/);
  }, 30_000);

  it('the factuality check accepts a faithful draft and rejects an invented employer', () => {
    expect(findUnsupportedResumeClaims(SYNTHETIC_RESUME_SOURCE_TEXT, FAITHFUL_DRAFT)).toEqual([]);
    expect(findUnsupportedResumeClaims(
      SYNTHETIC_RESUME_SOURCE_TEXT,
      FAITHFUL_DRAFT.replace('Brightwater Turbine Services', 'Northwind Energy Partners'),
    )).toContain('unsupported_entry_detail');
  });

  it('classifies each Build outcome from the route status and message', () => {
    expect(classifyBuild(200, null)).toBe('success');
    expect(classifyBuild(503, 'Resume generation is temporarily unavailable. Your existing resume was kept.')).toBe('provider_unconfigured');
    expect(classifyBuild(422, 'The generated draft was not readable, so your existing resume was kept.')).toBe('provider_error_or_empty_output');
    expect(classifyBuild(422, 'The generated draft included details that are not in your resume or profile, so your existing resume was kept.')).toBe('guard_factuality_422');
    expect(classifyBuild(422, 'The generated draft did not preserve details from your source resume, so your existing resume was kept.')).toBe('guard_missing_section_422');
    expect(classifyBuild(422, 'We could not read enough text from your uploaded resume.')).toBe('source_unreadable_422');
    expect(classifyBuild(502, 'Resume generation failed.')).toBe('provider_threw');
    expect(classifyBuild(429, 'Resume generation limit reached.')).toBe('app_rate_limited');
    expect(classifyBuild(500, 'Internal server error')).toBe('other_failure');
    expect(classifyBuild(0, 'request failed or timed out')).toBe('request_failed');
  });

  it('[mock] allows exactly one Build request per dispatch, even after a failure', async () => {
    const budget = singleBuildBudget();
    let calls = 0;
    const failing = async () => { calls += 1; return { status: 429 }; };
    await expect(budget.run(failing)).resolves.toEqual({ status: 429 });
    await expect(budget.run(failing)).rejects.toThrow(/exactly one Build request/);
    expect(calls).toBe(1);
    expect(budget.used).toBe(true);
  });

  it('[mock] a receipt that never reaches Build records zero requests and makes no "spent" claim', () => {
    const receipt = initialAcceptanceReceipt('2026-09-27T00:00:00.000Z');
    expect(receipt.buildRequestsMade).toBe(0);
    expect(receipt.pass).toBe(false);
    expect(JSON.stringify(receipt)).not.toMatch(/\bspent\b/i);
    expect(receipt.groqQuota).toMatch(/may consume/);
  });

  it('reads the signed-in member ID from the Supabase session cookie, whole or chunked', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const token = (sub: string) => `h.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.s`;
    const session = JSON.stringify({ access_token: token(id), user: { id } });
    const encoded = `base64-${Buffer.from(session).toString('base64url')}`;
    const name = 'sb-esbdrgaonplpvzmtrdhw-auth-token';
    expect(sessionUserIdFromCookies([{ name, value: encoded }, { name: 'other', value: 'x' }])).toBe(id);
    const cut = Math.floor(encoded.length / 2);
    expect(sessionUserIdFromCookies([
      { name: `${name}.1`, value: encoded.slice(cut) },
      { name: `${name}.0`, value: encoded.slice(0, cut) },
    ])).toBe(id);
    expect(sessionUserIdFromCookies([{ name, value: encodeURIComponent(session) }])).toBe(id);
    // Fail closed: no session, two projects, a gap in the chunks, or an ID that disagrees with the token.
    expect(sessionUserIdFromCookies([])).toBeNull();
    expect(sessionUserIdFromCookies([{ name, value: encoded }, { name: 'sb-other-auth-token', value: encoded }])).toBeNull();
    expect(sessionUserIdFromCookies([{ name: `${name}.1`, value: encoded }])).toBeNull();
    const forged = JSON.stringify({ access_token: token('22222222-2222-4222-8222-222222222222'), user: { id } });
    expect(sessionUserIdFromCookies([{ name, value: `base64-${Buffer.from(forged).toString('base64url')}` }])).toBeNull();
    expect(sessionUserIdFromCookies([{ name, value: 'base64-!!!' }])).toBeNull();
  });
});
