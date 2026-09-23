/**
 * Tests for memberApplicationStatus helpers.
 * Covers stage derivation, label mapping, and public lookup.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMemberApplicationStatusView,
  applicationStatusForPublicLookup,
} from './memberApplicationStatus';

const baseMember = {
  enrolledProgram: null,
  enrolledAt: null,
  assessmentCompleted: false,
};

const baseApp = {
  programInterest: 'cybersecurity',
  submittedAt: new Date('2026-03-01T00:00:00Z'),
  createdAt: new Date('2026-03-01T00:00:00Z'),
};

describe('buildMemberApplicationStatusView', () => {
  it('returns null when app is null', () => {
    assert.equal(buildMemberApplicationStatusView(null, baseMember), null);
  });

  it('PENDING → stage applied', () => {
    const view = buildMemberApplicationStatusView({ ...baseApp, status: 'PENDING' }, baseMember);
    assert.ok(view);
    assert.equal(view.stage, 'applied');
    assert.equal(view.label, 'Applied');
    assert.equal(view.showResponseEstimate, true);
  });

  it('NEEDS_INFO → stage under_review', () => {
    const view = buildMemberApplicationStatusView({ ...baseApp, status: 'NEEDS_INFO' }, baseMember);
    assert.ok(view);
    assert.equal(view.stage, 'under_review');
    assert.equal(view.showResponseEstimate, true);
  });

  it('APPROVED + no program → stage accepted', () => {
    const view = buildMemberApplicationStatusView({ ...baseApp, status: 'APPROVED' }, baseMember);
    assert.ok(view);
    assert.equal(view.stage, 'accepted');
    assert.equal(view.showResponseEstimate, false);
  });

  it('APPROVED + enrolled program + no assessment → stage enrolled', () => {
    const view = buildMemberApplicationStatusView(
      { ...baseApp, status: 'APPROVED' },
      { ...baseMember, enrolledProgram: 'cybersecurity-google', enrolledAt: new Date() }
    );
    assert.ok(view);
    assert.equal(view.stage, 'enrolled');
    assert.equal(view.nextStepHref, '/dashboard/assessment');
  });

  it('APPROVED + enrolled + assessment complete → stage active', () => {
    const view = buildMemberApplicationStatusView(
      { ...baseApp, status: 'APPROVED' },
      { ...baseMember, enrolledProgram: 'cybersecurity-google', enrolledAt: new Date(), assessmentCompleted: true }
    );
    assert.ok(view);
    assert.equal(view.stage, 'active');
  });

  describe('active stage next step points at the page that owns it (WAP-197)', () => {
    const activeMember = { ...baseMember, enrolledProgram: 'cybersecurity-google', enrolledAt: new Date(), assessmentCompleted: true };
    const intake = { preScreeningDone: false, interviewEligible: false, interviewRequested: false, interviewCompleted: false };
    const build = (over: Partial<typeof intake>) =>
      buildMemberApplicationStatusView({ ...baseApp, status: 'APPROVED' }, activeMember, { ...intake, ...over });

    it('pre-screening not done -> the pre-screening form on the Skills check page', () => {
      const view = build({});
      assert.ok(view);
      assert.match(view.nextStep, /Complete your pre-screening/);
      assert.equal(view.nextStepHref, '/dashboard/assessment#pre-screening');
    });

    it('interview eligible -> the interview request on the Skills check page', () => {
      const view = build({ preScreeningDone: true, interviewEligible: true });
      assert.ok(view);
      assert.match(view.nextStep, /Request your interview/);
      assert.equal(view.nextStepHref, '/dashboard/assessment#interview');
    });

    it('no step links back to the member home it is shown on', () => {
      for (const over of [{}, { preScreeningDone: true }, { preScreeningDone: true, interviewEligible: true }, { interviewRequested: true }, { interviewCompleted: true }]) {
        const view = build(over);
        assert.ok(view);
        assert.notEqual(view.nextStepHref, '/dashboard');
      }
    });
  });

  it('DENIED → stage rejected', () => {
    const view = buildMemberApplicationStatusView({ ...baseApp, status: 'DENIED' }, baseMember);
    assert.ok(view);
    assert.equal(view.stage, 'rejected');
    assert.equal(view.label, 'Application closed');
  });

  it('falls back to createdAt when submittedAt is null', () => {
    const created = new Date('2026-02-15T00:00:00Z');
    const view = buildMemberApplicationStatusView(
      { ...baseApp, status: 'PENDING', submittedAt: null, createdAt: created },
      baseMember
    );
    assert.ok(view);
    assert.deepEqual(view.submittedAt, created);
  });

  it('includes programInterest in view', () => {
    const view = buildMemberApplicationStatusView({ ...baseApp, status: 'PENDING' }, baseMember);
    assert.equal(view?.programInterest, 'cybersecurity');
  });
});

describe('applicationStatusForPublicLookup', () => {
  it('PENDING → applied', () => assert.equal(applicationStatusForPublicLookup('PENDING'), 'applied'));
  it('NEEDS_INFO → under_review', () => assert.equal(applicationStatusForPublicLookup('NEEDS_INFO'), 'under_review'));
  it('APPROVED → accepted', () => assert.equal(applicationStatusForPublicLookup('APPROVED'), 'accepted'));
  it('DENIED → rejected', () => assert.equal(applicationStatusForPublicLookup('DENIED'), 'rejected'));
});
