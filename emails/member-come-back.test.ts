import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { memberComeBackHtml, memberComeBackSubject } from './member-come-back';

describe('memberComeBackHtml', () => {
  it('escapes the greeting, counselor name, CTA label, and action URL', () => {
    const html = memberComeBackHtml({
      firstName: 'Ada <script>alert(1)</script>',
      counselorName: 'Pat <b>Lee</b>',
      nextBestActionUrl: 'https://example.test/next?q="1"&x=<y>',
      nextBestActionLabel: 'Open <img src=x>',
    });
    assert.equal(html.includes('<script>'), false);
    assert.equal(html.includes('<img src=x>'), false);
    assert.ok(html.includes('Hi Ada &lt;script&gt;alert(1)&lt;/script&gt;,'));
    assert.ok(html.includes('Pat &lt;b&gt;Lee&lt;/b&gt;'));
    assert.ok(html.includes('Open &lt;img src=x&gt;'));
    assert.ok(html.includes('href="https://example.test/next?q=&quot;1&quot;&amp;x=&lt;y&gt;"'));
  });

  it('keeps the subject as the counselor-name interpolation used by the send path', () => {
    assert.equal(memberComeBackSubject('Jordan Rivera'), 'Jordan Rivera has a question for you');
  });
});
