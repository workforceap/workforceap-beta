/**
 * Member-stuck nudge interpolates the first name, counselor name, and a
 * calendar CTA. Hostile names must not become markup. A javascript:
 * calendar URL must not become an href — the helper only accepts https.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { memberStuckHtml } from './member-stuck';

describe('memberStuckHtml', () => {
  it('escapes the first name and counselor name on a booking CTA', () => {
    const html = memberStuckHtml({
      firstName: 'Ada <script>alert(1)</script>',
      counselorName: 'Pat <b>Lee</b>',
      calendarUrl: 'https://cal.example.test/pat?q="1"&x=<y>',
    });
    assert.equal(html.includes('<script>'), false);
    assert.equal(html.includes('<b>Lee</b>'), false);
    assert.ok(html.includes('Hi Ada &lt;script&gt;alert(1)&lt;/script&gt;,'));
    assert.ok(html.includes('Book 15 minutes with Pat &lt;b&gt;Lee&lt;/b&gt;.'));
    assert.ok(html.includes('href="https://cal.example.test/pat?q=%221%22&amp;x=%3Cy%3E"'));
  });

  it('rejects a javascript calendar URL and uses the member inbox instead', () => {
    const previousBooking = process.env.COUNSELOR_BOOKING_URL;
    const previousSite = process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.COUNSELOR_BOOKING_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    try {
      const html = memberStuckHtml({
        firstName: 'Ada',
        counselorName: 'Pat',
        calendarUrl: 'javascript:alert(1)',
      });
      assert.equal(html.includes('javascript:'), false);
      assert.ok(html.includes('href="https://www.workforceap.org/dashboard/messages"'));
      assert.ok(html.includes('Send Pat a message to arrange a time to talk.'));
    } finally {
      if (previousBooking === undefined) delete process.env.COUNSELOR_BOOKING_URL;
      else process.env.COUNSELOR_BOOKING_URL = previousBooking;
      if (previousSite === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = previousSite;
    }
  });
});
