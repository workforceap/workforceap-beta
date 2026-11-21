/**
 * In-office session packets interpolate member/counselor names and the
 * generated resume/cover/interview text into HTML. Hostile names, section
 * bodies, and portal URLs must not become markup.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sessionPacketHtml } from './session-packet';

const HOSTILE = '<img src=x onerror=alert(1)>';

describe('sessionPacketHtml', () => {
  it('escapes names, dates, section copy, and the portal href', () => {
    const html = sessionPacketHtml({
      firstName: HOSTILE,
      counselorName: '<script>steal()</script>',
      sessionDate: '<b>yesterday</b>',
      portalUrl: 'https://evil.test/" onclick="alert(1)',
      sections: [
        {
          title: 'Polished <resume>',
          contextLine: 'Tailored to <Acme>',
          body: 'I built <script>x</script> systems.',
        },
        {
          title: 'Interview questions',
          body: '',
          asList: {
            items: [
              {
                heading: '<svg onload=alert(1)>',
                tip: 'Stay "<b>calm</b>"',
                exampleAnswer: '"><img src=x>',
              },
            ],
          },
        },
      ],
    });

    assert.equal(html.includes('<img src=x onerror=alert(1)>'), false);
    assert.equal(html.includes('<script>steal()</script>'), false);
    assert.equal(html.includes('<b>yesterday</b>'), false);
    assert.equal(html.includes('<script>x</script>'), false);
    assert.equal(html.includes('<svg onload=alert(1)>'), false);
    assert.equal(html.includes('"><img src=x>'), false);
    assert.equal(html.includes('href="https://evil.test/" onclick='), false);
    assert.match(html, /Hi &lt;img src=x onerror=alert\(1\)&gt;,/);
    assert.match(html, /&lt;script&gt;steal\(\)&lt;\/script&gt;/);
    assert.match(html, /&lt;b&gt;yesterday&lt;\/b&gt;/);
    assert.match(html, /Polished &lt;resume&gt;/);
    assert.match(html, /Tailored to &lt;Acme&gt;/);
    assert.match(html, /I built &lt;script&gt;x&lt;\/script&gt; systems\./);
    assert.match(html, /&lt;svg onload=alert\(1\)&gt;/);
    assert.match(html, /Stay &quot;&lt;b&gt;calm&lt;\/b&gt;&quot;/);
    assert.match(html, /&quot;&gt;&lt;img src=x&gt;/);
    assert.match(html, /href="https:\/\/evil\.test\/&quot; onclick=&quot;alert\(1\)"/);
  });

  it('omits a context line when none is supplied', () => {
    const html = sessionPacketHtml({
      firstName: 'Ada',
      counselorName: 'Jordan',
      sessionDate: 'November 21, 2026',
      portalUrl: 'https://www.workforceap.org/dashboard/ai-tools/history',
      sections: [{ title: 'Cover letter', body: 'Hello hiring team.' }],
    });
    assert.equal(html.includes('Tailored to'), false);
    assert.match(html, /Hi Ada,/);
    assert.match(html, /Hello hiring team\./);
  });
});
