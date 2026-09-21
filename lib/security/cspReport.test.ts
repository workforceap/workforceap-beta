import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CSP_DIRECTIVE_ALLOWLIST,
  CSP_REPORT_MAX_HOST_LENGTH,
  CSP_REPORT_MAX_PATH_LENGTH,
  CSP_VIOLATION_MAX_BUCKETS_PER_HOUR,
  collapseDynamicPathSegments,
  extractCspViolations,
  isValidBlockedHost,
  summarizeBlockedUri,
  summarizeDirective,
  summarizeDocumentUri,
} from './cspReport';

test('summarizeDirective keeps only allowlisted CSP directive names; garbage becomes "other"', () => {
  assert.equal(summarizeDirective('script-src-elem', undefined), 'script-src-elem');
  assert.equal(summarizeDirective(undefined, "script-src 'self' 'nonce-abc'"), 'script-src');
  assert.equal(summarizeDirective('  Frame-Ancestors ', undefined), 'frame-ancestors');
  assert.equal(summarizeDirective('<b>x</b>', undefined), 'other');
  assert.equal(summarizeDirective('z'.repeat(300), undefined), 'other');
  assert.equal(summarizeDirective('script-src-elem; drop table', undefined), 'other');
  assert.equal(summarizeDirective(undefined, undefined), 'unknown');
  assert.equal(summarizeDirective(42, null), 'unknown');
  for (const name of CSP_DIRECTIVE_ALLOWLIST) assert.equal(summarizeDirective(name, undefined), name);
  assert.equal(CSP_DIRECTIVE_ALLOWLIST.size, 27);
});

test('summarizeBlockedUri yields a keyword, an extension scheme, a shape-checked host, "unknown" or "invalid"', () => {
  assert.equal(summarizeBlockedUri('https://cdn.example.com:8443/x.js?token=1'), 'cdn.example.com:8443');
  assert.equal(summarizeBlockedUri('http://127.0.0.1:3000/'), '127.0.0.1:3000');
  assert.equal(summarizeBlockedUri('http://[::1]:3134/sw.js'), '[::1]:3134');
  assert.equal(summarizeBlockedUri('https://WWW.Example.ORG./'), 'www.example.org.');
  assert.equal(summarizeBlockedUri('chrome-extension://abcdefghijklmnop/inject.js'), 'chrome-extension');
  assert.equal(summarizeBlockedUri('moz-extension'), 'moz-extension');
  assert.equal(summarizeBlockedUri('inline'), 'inline');
  assert.equal(summarizeBlockedUri('wasm-eval'), 'wasm-eval');
  assert.equal(summarizeBlockedUri(undefined), 'unknown');
  assert.equal(summarizeBlockedUri(''), 'unknown');
  // Free text never survives.
  assert.equal(summarizeBlockedUri('foo://<img src=x onerror=alert(1)>'), 'invalid');
  assert.equal(summarizeBlockedUri('javascript:alert(1)'), 'invalid');
  assert.equal(summarizeBlockedUri('not a url at all'), 'invalid');
  assert.equal(summarizeBlockedUri('gopher://x'), 'invalid');
  assert.equal(summarizeBlockedUri('foo://valid-host.example/'), 'invalid');
  assert.equal(summarizeBlockedUri('wss://realtime.example.org/socket'), 'realtime.example.org');
  assert.equal(summarizeBlockedUri(`https://${'a'.repeat(260)}.example/`), 'invalid');
  assert.equal(summarizeBlockedUri('https://-bad-.example/'), 'invalid');
});

test('isValidBlockedHost accepts RFC 1123 hostnames and IP literals up to 253 characters', () => {
  assert.equal(CSP_REPORT_MAX_HOST_LENGTH, 253);
  assert.ok(isValidBlockedHost('www.googletagmanager.com'));
  assert.ok(isValidBlockedHost('a.b'));
  assert.ok(isValidBlockedHost('localhost:3134'));
  assert.ok(isValidBlockedHost('[2001:db8::1]'));
  assert.ok(isValidBlockedHost(`${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`)); // 253
  assert.equal(isValidBlockedHost(`${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(62)}`), false); // 254
  assert.equal(isValidBlockedHost(''), false);
  assert.equal(isValidBlockedHost('a'.repeat(64)), false);
  assert.equal(isValidBlockedHost('ex ample.com'), false);
  assert.equal(isValidBlockedHost('example.com:999999'), false);
  assert.equal(isValidBlockedHost('exa_mple.com'), false);
  assert.equal(isValidBlockedHost('<img>'), false);
});

test('document paths collapse any segment carrying an email and are hard-capped without an ellipsis', () => {
  assert.equal(collapseDynamicPathSegments('/members/jane@example.com/profile'), '/members/:id/profile');
  assert.equal(collapseDynamicPathSegments('/members/jane%40example.com/profile'), '/members/:id/profile');
  assert.equal(collapseDynamicPathSegments('/members/jane%40example.com'), '/members/:id');
  assert.equal(summarizeDocumentUri('https://www.workforceap.org/members/jane@example.com/profile'), '/members/:id/profile');
  // Existing rules untouched.
  assert.equal(collapseDynamicPathSegments('/en/programs/google-it-support-professional-certificate'), '/en/programs/google-it-support-professional-certificate');
  assert.equal(collapseDynamicPathSegments('/admin/coursera/learners/unmatched/jane%40example.com'), '/admin/coursera/learners/unmatched/:id');
  assert.equal(collapseDynamicPathSegments('/q/kx7-abc'), '/q/:id');
  assert.equal(collapseDynamicPathSegments('/jobs/48213'), '/jobs/:id');

  assert.equal(CSP_REPORT_MAX_PATH_LENGTH, 200);
  const long = summarizeDocumentUri(`https://www.workforceap.org/${'segment-'.repeat(40)}end`);
  assert.equal(long.length, 200);
  assert.equal(long.includes('…'), false);
  assert.equal(long, `/${'segment-'.repeat(40)}end`.slice(0, 200));
  assert.equal(summarizeDocumentUri(`https://www.workforceap.org/${'x'.repeat(199)}`).length, 200);
});

test('extractCspViolations applies the allowlists end to end', () => {
  const [row] = extractCspViolations('application/csp-report', {
    'csp-report': {
      'document-uri': 'https://www.workforceap.org/members/jane@example.com/profile?x=1',
      'effective-directive': '<b>x</b>',
      'blocked-uri': 'foo://<img src=x onerror=alert(1)>',
      disposition: 'report',
    },
  });
  assert.deepEqual(row, { blockedHost: 'invalid', directive: 'other', documentPath: '/members/:id/profile', disposition: 'report' });
  assert.equal(CSP_VIOLATION_MAX_BUCKETS_PER_HOUR, 2000);
});
