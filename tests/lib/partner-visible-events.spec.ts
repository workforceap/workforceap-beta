import { describe, expect, it } from 'vitest';

import { LEGACY_EVENT_NAME_ALIASES, isEventName } from '@/lib/events/names';
import { PARTNER_MILESTONE_EVENT_NAMES } from '@/lib/partner/milestoneEvents';
import {
  PARTNER_VISIBLE_EVENTS,
  partnerEventLabel,
  partnerPlacementLabel,
  partnerVisibleEventNames,
} from '@/lib/partner/partnerVisibleEvents';

/**
 * Vision C3: a referring partner sees enrollment status, progress and
 * outcomes (privacy §3.3), never behavioural or staff events, and never the
 * free-form metadata an event writer attached.
 */
describe('partner-visible event allowlist', () => {
  it('only contains taxonomy event names', () => {
    for (const key of Object.keys(PARTNER_VISIBLE_EVENTS)) {
      expect(isEventName(key), key).toBe(true);
    }
  });

  it('labels exactly the milestone list the rail badge counts', () => {
    expect(Object.keys(PARTNER_VISIBLE_EVENTS).sort()).toEqual([...PARTNER_MILESTONE_EVENT_NAMES].sort());
  });

  it('labels an allowlisted event in plain language, not its raw name', () => {
    expect(partnerEventLabel('program_enrolled')).toBe('Enrolled in a program');
    expect(partnerEventLabel('training_access_activated')).toBe('Training access activated');
    expect(partnerEventLabel('course_completed')).toBe('Completed a course');
    expect(partnerEventLabel('program_completed')).toBe('Completed program training');
    for (const key of Object.keys(PARTNER_VISIBLE_EVENTS)) {
      const label = partnerEventLabel(key);
      expect(label, key).toBeTruthy();
      expect(label).not.toContain('_');
    }
  });

  it.each([
    'member_logged_in',
    'ai_tool_run_started',
    'feedback_submitted',
    'counselor_followup_needed',
    'counselor_nudge_sent',
    'application_denied',
    'first90_check_in_submitted',
    'inactive_nudge_sent',
    'account_deleted',
    'LOGIN',
    'constructor',
    '__proto__',
    '',
  ])('hides %s from partners', (name) => {
    expect(partnerEventLabel(name)).toBeNull();
  });

  it('uses record-backed certification and placement rows without duplicate event milestones', () => {
    for (const name of ['certification_earned', 'placement_recorded', 'placement_confirmation_submitted', 'PLACEMENT_CONFIRMATION_SUBMITTED']) {
      expect(partnerEventLabel(name)).toBeNull();
    }
  });

  it('queries every stored spelling of the allowlist and nothing else', () => {
    const names = partnerVisibleEventNames();
    for (const key of Object.keys(PARTNER_VISIBLE_EVENTS)) expect(names).toContain(key);
    for (const [alias, canonical] of Object.entries(LEGACY_EVENT_NAME_ALIASES)) {
      if (canonical in PARTNER_VISIBLE_EVENTS) expect(names).toContain(alias);
      else expect(names).not.toContain(alias);
    }
    for (const name of names) expect(partnerEventLabel(name), name).not.toBeNull();
    expect(names).not.toContain('member_logged_in');
    expect(names).not.toContain('certification_earned');
    expect(names).not.toContain('placement_recorded');
    expect(names).not.toContain('PLACEMENT_CONFIRMATION_SUBMITTED');
  });
});

/**
 * A placement reads as confirmed to a partner only once staff verified its
 * start date (the partner outcome packet's rule, #2570). A member
 * self-report is recorded with startDateVerified=false.
 */
describe('partner placement label', () => {
  const placement = { employerName: 'Acme', jobTitle: 'Help Desk Technician' };

  it('names the employer and job for a verified placement', () => {
    expect(partnerPlacementLabel({ ...placement, startDateVerified: true })).toBe(
      'Placed at Acme — Help Desk Technician',
    );
  });

  it.each([false, null])('shows a pending label with no employer or job when startDateVerified=%s', (startDateVerified) => {
    const label = partnerPlacementLabel({ ...placement, startDateVerified });
    expect(label).toBe('Placement reported, pending verification');
    expect(label).not.toContain('Acme');
    expect(label).not.toContain('Help Desk Technician');
  });
});
