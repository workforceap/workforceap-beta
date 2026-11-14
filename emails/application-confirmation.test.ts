/**
 * Applicant confirmation interpolates the first name and optional application
 * id into HTML. Those fields must not become markup.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applicationConfirmationHtml, memberWelcomeEmailHtml } from './application-confirmation';

describe('applicationConfirmationHtml escaping', () => {
  it('escapes a hostile first name and application id', () => {
    const html = applicationConfirmationHtml({
      firstName: '<script>alert(1)</script>',
      applicationId: '<img src=x onerror=alert(1)>',
    });
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('<img'));
    assert.ok(html.includes('Hi &lt;script&gt;alert(1)&lt;/script&gt;,'));
    assert.ok(html.includes('application id is <strong>&lt;img src=x onerror=alert(1)&gt;</strong>'));
  });

  it('omits the application-id sentence when no id is supplied', () => {
    const html = applicationConfirmationHtml({ firstName: 'Jordan' });
    assert.ok(!html.includes('application id is'));
    assert.ok(html.includes('Your application is on file.'));
  });
});

describe('memberWelcomeEmailHtml escaping', () => {
  it('escapes the first name in the greeting', () => {
    const html = memberWelcomeEmailHtml('Sam & Co <b>hi</b>');
    assert.ok(html.includes('Hi Sam &amp; Co &lt;b&gt;hi&lt;/b&gt;,'));
    assert.ok(!html.includes('<b>hi</b>'));
  });
});
