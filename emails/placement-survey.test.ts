import test from 'node:test';
import assert from 'node:assert/strict';
import { placementSurveyEscalationHtml, placementSurveyHtml } from './placement-survey';

test('member survey HTML escapes the first name and program title', () => {
  const html = placementSurveyHtml({
    firstName: '<img src=x onerror=1>',
    programName: '<script>alert(1)</script>',
    wave: 'thirty_day',
  });
  assert.doesNotMatch(html, /<img /);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Hi &lt;img src=x onerror=1&gt;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /The survey takes about 3 minutes/);
});

test('unknown or omitted waves use the 30-day member copy', () => {
  const omitted = placementSurveyHtml({ firstName: 'Alex', programName: null, wave: 'thirty_day' });
  assert.match(omitted, /Hi Alex/);
  assert.match(omitted, /how things are going on the job since you finished your program/);
  assert.doesNotMatch(omitted, /<strong>/);
});

test('counselor escalation escapes names, titles, mailto, and survey hrefs', () => {
  const html = placementSurveyEscalationHtml({
    counselorName: '<b>Jordan</b>',
    memberName: '<img src=x onerror=1>',
    memberEmail: 'member+"<script>@example.com',
    employerName: 'Acme & Sons',
    jobTitle: '<svg onload=1>',
    daysSincePlacement: 14,
    surveyUrl: 'https://evil.test/" onclick="alert(1)',
    wave: 'sixty_day',
  });
  assert.doesNotMatch(html, /<b>Jordan<\/b>/);
  assert.doesNotMatch(html, /<img /);
  assert.doesNotMatch(html, /<svg /);
  assert.doesNotMatch(html, /onclick="alert/);
  assert.match(html, /Hi &lt;b&gt;Jordan&lt;\/b&gt;/);
  assert.match(html, /&lt;img src=x onerror=1&gt;/);
  assert.match(html, /Acme &amp; Sons/);
  assert.match(html, /&lt;svg onload=1&gt;/);
  assert.match(html, /60-day placement survey/);
  assert.match(html, /\(14 days since start\)/);
  assert.match(html, /href="https:\/\/evil\.test\/&quot; onclick=&quot;alert\(1\)"/);
  assert.match(html, /mailto:member\+&quot;&lt;script&gt;@example\.com/);
});

test('escalation omits the day count and defaults to the 30-day label', () => {
  const html = placementSurveyEscalationHtml({
    counselorName: 'Jordan',
    memberName: 'Ada',
    memberEmail: 'ada@example.com',
    employerName: 'Acme',
    jobTitle: 'Analyst',
    daysSincePlacement: null,
    surveyUrl: 'https://www.workforceap.org/survey/placement/token',
  });
  assert.doesNotMatch(html, /days since start/);
  assert.match(html, /30-day placement survey/);
  assert.match(html, /href="https:\/\/www\.workforceap\.org\/survey\/placement\/token"/);
});
