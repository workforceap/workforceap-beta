/**
 * Billing packet student/counselor HTML interpolates names, invoice numbers,
 * class lines and portal URLs. Those strings must stay escaped so a hostile
 * member or counselor field cannot become inbox markup.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { billingPacketCounselorHtml, billingPacketStudentHtml, type BillingPacketEmailFacts } from './billing-packet';

const facts = (over: Partial<BillingPacketEmailFacts> = {}): BillingPacketEmailFacts => ({
  memberName: 'Jordan Example',
  programTitle: 'Google Data Analytics',
  packetNumber: 'WAP-I-2026-0001',
  totalLabel: '$7,500.00',
  billToName: 'Workforce Solutions Capital Area',
  invoiceDateLabel: 'October 20, 2026',
  signerName: 'Michael A. Brown',
  signerTitle: 'Executive Director',
  classLines: ['Foundations: Data, Data, Everywhere — 20 hours'],
  ...over,
});

describe('billingPacketStudentHtml', () => {
  it('escapes a hostile first name, program title, bill-to name and class line', () => {
    const html = billingPacketStudentHtml({
      firstName: '<script>alert(1)</script>',
      facts: facts({
        programTitle: '<img src=x onerror=alert(1)>',
        billToName: 'Board "Partner"',
        classLines: ['<a href="javascript:alert(1)">class</a>'],
      }),
      documentsUrl: 'https://workforceap.org/dashboard/documents">click',
    });
    assert.equal(html.includes('<script>'), false);
    assert.equal(html.includes('<img'), false);
    assert.equal(html.includes('<a href="javascript:'), false);
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(html.includes('Board &quot;Partner&quot;'));
    assert.ok(html.includes('&lt;a href=&quot;javascript:alert(1)&quot;&gt;class&lt;/a&gt;'));
    assert.ok(html.includes('https://workforceap.org/dashboard/documents&quot;&gt;click'));
  });

  it('keeps the no-cost-to-you copy and the packet number', () => {
    const html = billingPacketStudentHtml({
      firstName: 'Jordan',
      facts: facts(),
      documentsUrl: 'https://workforceap.org/dashboard/documents',
    });
    assert.ok(html.includes('There is no cost to you.'));
    assert.ok(html.includes('WAP-I-2026-0001'));
    assert.ok(html.includes('Jordan'));
  });
});

describe('billingPacketCounselorHtml', () => {
  it('escapes counselor name, member name, member email and student URL', () => {
    const html = billingPacketCounselorHtml({
      counselorFirstName: '<b>Casey</b>',
      facts: facts({ memberName: 'Jordan <script>x</script>' }),
      studentUrl: 'https://workforceap.org/admin/members/1" onclick=alert(1)',
      memberEmail: 'jordan+"<script>@example.test',
    });
    assert.equal(html.includes('<b>Casey</b>'), false);
    assert.equal(html.includes('<script>'), false);
    assert.ok(html.includes('&lt;b&gt;Casey&lt;/b&gt;'));
    assert.ok(html.includes('Jordan &lt;script&gt;x&lt;/script&gt;'));
    assert.ok(html.includes('jordan+&quot;&lt;script&gt;@example.test'));
    assert.ok(html.includes('https://workforceap.org/admin/members/1&quot; onclick=alert(1)'));
  });
});
