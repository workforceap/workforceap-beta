import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { certCelebrationV2Html } from './cert-celebration-v2';

describe('certCelebrationV2Html', () => {
  it('escapes the member name, cert, date, and testimonial fields', () => {
    const html = certCelebrationV2Html({
      firstName: '<img src=x onerror=alert(1)>',
      certName: '<script>steal()</script>',
      earnedDateLabel: '<b>yesterday</b>',
      pointsAwarded: 25,
      testimonial: {
        quote: 'Great "<script>x</script>" program',
        name: '<svg onload=alert(1)>',
        role: '"><img src=x>',
      },
    });

    assert.equal(html.includes('<img src=x onerror=alert(1)>'), false);
    assert.equal(html.includes('<script>steal()</script>'), false);
    assert.equal(html.includes('<b>yesterday</b>'), false);
    assert.equal(html.includes('<script>x</script>'), false);
    assert.equal(html.includes('<svg onload=alert(1)>'), false);
    assert.equal(html.includes('"><img src=x>'), false);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(html, /&lt;script&gt;steal\(\)&lt;\/script&gt;/);
    assert.match(html, /&lt;b&gt;yesterday&lt;\/b&gt;/);
    assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
    assert.match(html, /&lt;svg onload=alert\(1\)&gt;/);
    assert.match(html, /&quot;&gt;&lt;img src=x&gt;/);
  });

  it('omits the testimonial block when none is supplied', () => {
    const html = certCelebrationV2Html({
      firstName: 'Ada',
      certName: 'Cybersecurity',
      earnedDateLabel: 'October 31, 2026',
      pointsAwarded: 25,
    });

    assert.equal(html.includes('<blockquote'), false);
    assert.match(html, /Congratulations, Ada/);
    assert.match(html, /\+25 points/);
    assert.match(html, /Cybersecurity/);
  });

  it('does not invent a role comma when the quote has no role', () => {
    const html = certCelebrationV2Html({
      firstName: 'Ada',
      certName: 'Cybersecurity',
      earnedDateLabel: 'October 31, 2026',
      pointsAwarded: 25,
      testimonial: { quote: 'Worth it.', name: 'Jordan' },
    });

    assert.match(html, /— Jordan/);
    assert.equal(html.includes('— Jordan,'), false);
  });
});
