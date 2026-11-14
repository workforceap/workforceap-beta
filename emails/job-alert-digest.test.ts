import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { jobAlertDigestHtml } from './job-alert-digest';

describe('jobAlertDigestHtml', () => {
  it('escapes the greeting and every job field', () => {
    const html = jobAlertDigestHtml({
      firstName: '<em>Ada</em>',
      jobs: [
        {
          title: '<script>alert(1)</script>',
          company: 'Acme <b>Inc</b>',
          location: '"><img src=x>',
        },
      ],
    });

    assert.equal(html.includes('<em>Ada</em>'), false);
    assert.equal(html.includes('<script>alert(1)</script>'), false);
    assert.equal(html.includes('Acme <b>Inc</b>'), false);
    assert.equal(html.includes('"><img src=x>'), false);
    assert.match(html, /Hi &lt;em&gt;Ada&lt;\/em&gt;/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /Acme &lt;b&gt;Inc&lt;\/b&gt;/);
    assert.match(html, /&quot;&gt;&lt;img src=x&gt;/);
    assert.match(html, /1 new job matching your program/);
  });

  it('pluralizes and drops a missing location', () => {
    const html = jobAlertDigestHtml({
      firstName: 'Ada',
      jobs: [
        { title: 'Help desk', company: 'Acme', location: null },
        { title: 'Support lead', company: 'Globex', location: 'Austin' },
      ],
    });

    assert.match(html, /2 new jobs matching your program/);
    assert.match(html, /Help desk<\/strong> — Acme</);
    assert.match(html, /Support lead<\/strong> — Globex · Austin/);
  });
});
