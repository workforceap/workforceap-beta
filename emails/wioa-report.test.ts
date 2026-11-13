import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { wioaReportHtml } from './wioa-report';

describe('wioaReportHtml', () => {
  it('escapes the period label and program slug', () => {
    const html = wioaReportHtml({
      periodLabel: 'October <script>alert(1)</script>',
      totalActiveMembers: 12,
      totalCompleters: 3,
      totalPlacements: 2,
      overallAvgWage: 18.9,
      programs: [{ programSlug: 'it-<img src=x>', activeMembers: 4, completers: 1, placements: 1, avgWage: 20 }],
    });
    assert.equal(html.includes('<script>'), false);
    assert.equal(html.includes('<img src=x>'), false);
    assert.ok(html.includes('October &lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(html.includes('it-&lt;img src=x&gt;'));
    assert.ok(html.includes('$18'));
  });

  it('renders a dash for missing wages and floors negative counts', () => {
    const html = wioaReportHtml({
      periodLabel: 'November 2026',
      totalActiveMembers: -3,
      totalCompleters: Number.NaN,
      totalPlacements: 0,
      overallAvgWage: null,
      programs: [],
    });
    assert.ok(html.includes('No program data for this period.'));
    assert.match(html, />0</);
    assert.ok(html.includes('—'));
  });
});
