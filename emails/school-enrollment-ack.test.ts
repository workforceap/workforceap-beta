/**
 * Smoke tests for school enrollment acknowledgment email templates.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { schoolEnrollmentParentAckHtml } from './school-enrollment-parent-ack';
import { schoolEnrollmentPartnerAckHtml } from './school-enrollment-partner-ack';

describe('schoolEnrollmentParentAckHtml', () => {
  it('includes student, school, program, and the manual enrollment step without a fixed timeline', () => {
    const html = schoolEnrollmentParentAckHtml({
      parentName: 'Alex Rader',
      studentName: 'Jamie Student',
      schoolName: 'Concordia High School',
      programInterest: 'IT Support Professional Certificate (IBM)',
    });
    assert.ok(html.includes('Alex Rader'));
    assert.ok(html.includes('Jamie Student'));
    assert.ok(html.includes('Concordia High School'));
    assert.ok(html.includes('IT Support Professional Certificate (IBM)'));
    assert.ok(!html.includes('24&ndash;48 hours'));
    assert.ok(html.includes('by hand and emails them when it&rsquo;s done'));
  });

  it('escapes HTML in names', () => {
    const html = schoolEnrollmentParentAckHtml({
      parentName: '<script>alert(1)</script>',
      studentName: 'Test <img>',
      schoolName: 'School & Co',
      programInterest: 'Program',
    });
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });
});

describe('schoolEnrollmentPartnerAckHtml', () => {
  it('includes student details and partner portal link', () => {
    const html = schoolEnrollmentPartnerAckHtml({
      partnerName: 'Concordia High School',
      studentName: 'Jamie Student',
      studentEmail: 'jamie@example.com',
      programInterest: 'IT Support Professional Certificate (IBM)',
      gradeLevel: '11',
      partnerPortalUrl: 'https://www.workforceap.org/partner',
    });
    assert.ok(html.includes('Concordia High School'));
    assert.ok(html.includes('jamie@example.com'));
    assert.ok(html.includes('Grade:'));
    assert.ok(html.includes('11'));
    assert.ok(!html.includes('24&ndash;48 hours'));
    assert.ok(html.includes('by hand and emails you when it&rsquo;s done'));
    assert.ok(html.includes('https://www.workforceap.org/partner'));
  });
});
