import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildPipelineFunnel,
  PIPELINE_FUNNEL_STAGES,
  pipelineFunnelSubtitle,
  WIOA_SCREENED_CAPTION,
  WIOA_SCREENED_LABEL,
} from './pipelineFunnel';

const seeded = { started: 8, intake: 8, eligibility: 0, enrolled: 8, active: 7 };

describe('applications funnel order', () => {
  it('walks the stages an applicant passes in order and never lists eligibility as a bar', () => {
    const { bars } = buildPipelineFunnel(seeded);
    assert.deepEqual(bars.map((bar) => bar.label), ['Started application', 'Completed intake', 'Enrolled', 'Active']);
    assert.deepEqual(PIPELINE_FUNNEL_STAGES.map((stage) => stage.key), ['started', 'intake', 'enrolled', 'active']);
    assert.ok(bars.every((bar) => !/eligib/i.test(bar.label)));
    // Each stage is a subset of the one above it on this cohort.
    const values = bars.map((bar) => Number(String(bar.value).replace(/,/g, '')));
    for (let i = 1; i < values.length; i += 1) assert.ok(values[i] <= values[i - 1], bars[i].label);
    assert.deepEqual(bars.map((bar) => bar.pct), [100, 100, 100, 88]);
  });

  it('explains the WIOA screening count as a labelled tile beside the funnel', () => {
    const { kpis } = buildPipelineFunnel(seeded);
    const wioa = kpis.find((kpi) => kpi.label === WIOA_SCREENED_LABEL);
    assert.ok(wioa);
    assert.equal(wioa.value, '0');
    assert.equal(wioa.delta, WIOA_SCREENED_CAPTION);
    assert.equal(wioa.deltaTone, 'muted');
    assert.match(WIOA_SCREENED_CAPTION, /not a gate/);
    assert.deepEqual(kpis.map((kpi) => kpi.label), ['Started', 'Enrolled', 'Active', 'Started → Active', WIOA_SCREENED_LABEL]);
    assert.equal(kpis[3].value, '88%');
  });

  it('formats thousands and handles an empty window', () => {
    const big = buildPipelineFunnel({ started: 1204, intake: 968, eligibility: 400, enrolled: 724, active: 612 });
    assert.equal(big.bars[0].value, '1,204');
    assert.equal(big.hasAny, true);
    const empty = buildPipelineFunnel({ started: 0, intake: 0, eligibility: 0, enrolled: 0, active: 0 });
    assert.equal(empty.hasAny, false);
    assert.ok(empty.bars.every((bar) => bar.pct === 0));
    assert.match(pipelineFunnelSubtitle(90), /^last 90 days · .*each stage counts the ones who reached it$/);
  });
});
