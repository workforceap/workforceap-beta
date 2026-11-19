// @vitest-environment node
/**
 * Counselor at-risk alert HTML interpolates member name/email, risk copy,
 * factors, and portal URLs. Escape those fields so a hostile member record
 * cannot XSS the counselor inbox. javascript: hrefs currently pass through
 * escapeHtml — pin that rather than adding a URL allowlist in a coverage run.
 */
import { describe, expect, it } from 'vitest';
import {
  counselorAtRiskAlertHtml,
  counselorAtRiskBatchHtml,
} from '@/emails/counselor-at-risk-alert';

const XSS_NAME = '<img src=x onerror=alert(1)>';
const XSS_EMAIL = 'pat+"<script>steal()</script>"@example.test';
const XSS_LEVEL = '<b>CRITICAL</b>';
const XSS_FACTOR = '<svg onload=alert(1)>missed check-in';
const XSS_ACTION = 'Call "<script>x</script>" today';
const XSS_URL = 'https://example.test/profile?q="><img src=x>';
const JS_URL = 'javascript:alert(1)';

describe('counselorAtRiskAlertHtml', () => {
  it('escapes member name, email, level, factors, action, and query URLs', () => {
    const html = counselorAtRiskAlertHtml({
      memberName: XSS_NAME,
      memberEmail: XSS_EMAIL,
      score: 91.7,
      level: XSS_LEVEL,
      factors: [XSS_FACTOR],
      recommendedAction: XSS_ACTION,
      messageUrl: XSS_URL,
      profileUrl: XSS_URL,
      dashboardUrl: XSS_URL,
    });

    expect(html).not.toContain(XSS_NAME);
    expect(html).not.toContain('<script>steal()</script>');
    expect(html).not.toContain('<b>CRITICAL</b>');
    expect(html).not.toContain('<svg onload=alert(1)>');
    expect(html).not.toContain('<script>x</script>');
    expect(html).not.toContain('"><img src=x>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;script&gt;steal()&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;CRITICAL&lt;/b&gt;');
    expect(html).toContain('&lt;svg onload=alert(1)&gt;');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).toContain('score 91');
    expect(html).toContain('href="https://example.test/profile?q=&quot;&gt;&lt;img src=x&gt;"');
  });

  it('omits the factors list when none are flagged and keeps javascript: hrefs', () => {
    const html = counselorAtRiskAlertHtml({
      memberName: 'Ada',
      memberEmail: 'ada@example.test',
      score: -4,
      level: 'LOW',
      factors: [],
      recommendedAction: 'Check in',
      messageUrl: JS_URL,
      profileUrl: JS_URL,
      dashboardUrl: JS_URL,
    });

    expect(html).toContain('No specific factors flagged.');
    expect(html).toContain('score 0');
    expect(html).toContain(`href="${JS_URL}"`);
  });
});

describe('counselorAtRiskBatchHtml', () => {
  it('escapes counselor and member fields and uses singular grammar for one member', () => {
    const html = counselorAtRiskBatchHtml({
      counselorName: XSS_NAME,
      memberCount: 1,
      members: [
        {
          memberName: XSS_NAME,
          memberEmail: XSS_EMAIL,
          score: 80,
          level: XSS_LEVEL,
          factors: [XSS_FACTOR],
          recommendedAction: XSS_ACTION,
          profileUrl: XSS_URL,
        },
      ],
      dashboardUrl: XSS_URL,
    });

    expect(html).toContain('Hi &lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('1 member needs attention today');
    expect(html).toContain('the following member has been flagged');
    expect(html).not.toContain('<script>steal()</script>');
    expect(html).not.toContain('<svg onload=alert(1)>');
    expect(html).toContain('href="https://example.test/profile?q=&quot;&gt;&lt;img src=x&gt;"');
  });

  it('uses plural grammar when more than one member is flagged', () => {
    const html = counselorAtRiskBatchHtml({
      counselorName: 'Jordan',
      memberCount: 2,
      members: [
        {
          memberName: 'Ada',
          memberEmail: 'ada@example.test',
          score: 80,
          level: 'CRITICAL',
          factors: [],
          recommendedAction: 'Call',
          profileUrl: 'https://example.test/a',
        },
        {
          memberName: 'Pat',
          memberEmail: 'pat@example.test',
          score: 72,
          level: 'CRITICAL',
          factors: [],
          recommendedAction: 'Call',
          profileUrl: 'https://example.test/p',
        },
      ],
      dashboardUrl: 'https://example.test/dash',
    });

    expect(html).toContain('2 members need attention today');
    expect(html).toContain('the following members have been flagged');
    expect(html).toContain('No specific factors flagged.');
  });
});
