import { describe, expect, it } from 'vitest';

import { certCelebrationV2Html } from '@/emails/cert-celebration-v2';

const HOSTILE = '<img src=x onerror=alert(1)>';
const ESCAPED = '&lt;img src=x onerror=alert(1)&gt;';

describe('certCelebrationV2Html', () => {
  it('escapes name, cert, date and testimonial fields', () => {
    const html = certCelebrationV2Html({
      firstName: HOSTILE,
      certName: '<b>AWS</b>',
      earnedDateLabel: '<script>x</script>',
      pointsAwarded: 25,
      testimonial: {
        quote: HOSTILE,
        name: '<i>Sam</i>',
        role: '<img src=x>',
      },
    });
    expect(html).toContain(`Congratulations, ${ESCAPED}`);
    expect(html).toContain('&lt;b&gt;AWS&lt;/b&gt;');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).toContain(`"${ESCAPED}"`);
    expect(html).toContain('&lt;i&gt;Sam&lt;/i&gt;');
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).toContain('+25 points');
    expect(html).not.toContain(HOSTILE);
    expect(html).not.toContain('<b>AWS</b>');
    expect(html).not.toContain('<script>x</script>');
  });

  it('omits the testimonial block when none is provided', () => {
    const html = certCelebrationV2Html({
      firstName: 'Pat',
      certName: 'CompTIA A+',
      earnedDateLabel: 'Nov 18, 2026',
      pointsAwarded: 25,
    });
    expect(html).toContain('Congratulations, Pat — you earned');
    expect(html).not.toContain('<blockquote');
  });
});
