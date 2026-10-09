/**
 * Defensive checks for the SSRF guard used by LinkedIn enrich, ATS job-page
 * scraping, and employer job import. These assert that private, loopback and
 * metadata hosts are refused — they do not fetch anything.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicHttpUrl, UnsafeUrlError } from './safeOutboundFetch';

function refused(input: string, opts?: Parameters<typeof assertPublicHttpUrl>[1]) {
  assert.throws(() => assertPublicHttpUrl(input, opts), UnsafeUrlError);
}

test('public https URLs are accepted', () => {
  const parsed = assertPublicHttpUrl('https://www.linkedin.com/in/example');
  assert.equal(parsed.protocol, 'https:');
  assert.equal(parsed.hostname, 'www.linkedin.com');
});

test('http is allowed unless httpsOnly is set', () => {
  assert.equal(assertPublicHttpUrl('http://example.com/job').protocol, 'http:');
  refused('http://example.com/job', { httpsOnly: true });
});

test('non-http schemes are refused', () => {
  refused('file:///tmp/example');
  refused('data:text/plain,hi');
  refused('ftp://example.com/file');
  refused('not a url');
});

test('loopback, metadata and internal hostnames are refused', () => {
  refused('http://localhost/');
  refused('http://localhost:3000/admin');
  refused('http://metadata.google.internal/');
  refused('http://instance-data/latest/meta-data/');
  refused('http://printer.local/status');
  refused('http://app.internal/health');
});

test('private, loopback and link-local IPv4 literals are refused', () => {
  refused('http://127.0.0.1/');
  refused('http://10.0.0.8/secret');
  refused('http://192.168.1.1/');
  refused('http://172.16.0.1/');
  refused('http://169.254.169.254/latest/meta-data/');
  refused('http://0.0.0.0/');
  refused('http://100.64.0.1/');
});

test('IPv6 literals are refused', () => {
  refused('http://[::1]/');
  refused('http://[fe80::1]/');
});

test('a public IPv4 literal is allowed', () => {
  assert.equal(assertPublicHttpUrl('https://8.8.8.8/').hostname, '8.8.8.8');
});

test('allowHosts accepts the host and its subdomains only', () => {
  const opts = { allowHosts: ['example.com'] };
  assert.equal(assertPublicHttpUrl('https://example.com/a', opts).hostname, 'example.com');
  assert.equal(assertPublicHttpUrl('https://jobs.example.com/a', opts).hostname, 'jobs.example.com');
  refused('https://notexample.com/a', opts);
  refused('https://example.com.evil.test/a', opts);
});
