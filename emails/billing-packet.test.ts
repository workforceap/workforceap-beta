import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { billingPacketCounselorHtml, billingPacketStudentHtml } from './billing-packet';

const hostile = '<script>alert(1)</script>';
const facts = {
  memberName: hostile,
  programTitle: 'IT <b>Support</b>',
  packetNumber: 'J5-"quoted"',
  totalLabel: '$1,200 & up',
  billToName: "O'Brien & <Partners>",
  invoiceDateLabel: '2026-11-04',
  signerName: 'Jane <Admin>',
  signerTitle: 'Director & "Chair"',
  classLines: ['Intro <script>steal()</script>', 'Network & Security'],
};

describe('billing packet HTML', () => {
  it('escapes participant and invoice fields in the student body', () => {
    const html = billingPacketStudentHtml({
      firstName: 'Ada <img src=x>',
      facts,
      documentsUrl: 'https://example.test/docs?q="1"&x=<y>',
    });
    assert.equal(html.includes('<script>'), false);
    assert.equal(html.includes('<img src=x>'), false);
    assert.ok(html.includes('Hi Ada &lt;img src=x&gt;,'));
    assert.ok(html.includes('IT &lt;b&gt;Support&lt;/b&gt;'));
    assert.ok(html.includes('O&#39;Brien &amp; &lt;Partners&gt;'));
    assert.ok(html.includes('Intro &lt;script&gt;steal()&lt;/script&gt;'));
    assert.ok(html.includes('href="https://example.test/docs?q=&quot;1&quot;&amp;x=&lt;y&gt;"'));
  });

  it('escapes counselor, student, and invoice fields in the staff body', () => {
    const html = billingPacketCounselorHtml({
      counselorFirstName: 'Pat <b>Lee</b>',
      facts,
      studentUrl: 'https://example.test/admin?id="<script>"',
      memberEmail: 'ada+"<script>"@example.test',
    });
    assert.equal(html.includes('<script>'), false);
    assert.ok(html.includes('Hi Pat &lt;b&gt;Lee&lt;/b&gt;,'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(html.includes('ada+&quot;&lt;script&gt;&quot;@example.test'));
    assert.ok(html.includes('href="https://example.test/admin?id=&quot;&lt;script&gt;&quot;"'));
  });
});
