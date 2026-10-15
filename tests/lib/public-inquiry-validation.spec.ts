import { describe, expect, it } from 'vitest';
import { parseContactInquiry } from '@/lib/publicInquiries/validation';
import { validateCareersLeadPayload } from '@/lib/validation/careersLead';

const contact = { first_name: ' Ada ', last_name: 'Lovelace', email: 'ada@example.net', topic: 'Programs', message: 'Please contact me.' };
describe('public inquiry input bounds', () => {
  it('normalizes contact fields and rejects invalid email, IDs and oversized data before capture', () => {
    expect(parseContactInquiry(contact)).toMatchObject({ firstName: 'Ada', kind: 'contact' });
    for (const overrides of [{ email: 'bad' }, { message: 'x'.repeat(10001) }, { first_name: 'x'.repeat(101) }, { submission_id: 'arbitrary' }, { phone: '1'.repeat(81) }]) {
      expect(parseContactInquiry({ ...contact, ...overrides })).toBeNull();
    }
  });
  it('requires actual sponsor names, organization and interest while allowing optional notes', () => {
    const sponsor = { first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.net', source: 'sponsorship', organization: 'Analytical Engines', interest: 'Bronze', seats: '5' };
    expect(parseContactInquiry(sponsor)).toMatchObject({ kind: 'sponsorship', seats: 5, organizationName: 'Analytical Engines', message: expect.any(String) });
    for (const overrides of [{ first_name: '' }, { last_name: '' }, { organization: '' }, { interest: '' }, { seats: '1.5' }, { seats: '100001' }]) expect(parseContactInquiry({ ...sponsor, ...overrides })).toBeNull();
  });
  it('preserves careers minimum message and enum rules while bounding every saved field', () => {
    const careers = { ...contact, message: 'I build production systems and want to help.', interest_area: 'engineering' };
    expect(validateCareersLeadPayload(careers)).toMatchObject({ ok: true, data: { interestArea: 'engineering' } });
    expect(validateCareersLeadPayload({ ...careers, message: 'short' })).toMatchObject({ ok: false, fieldErrors: { message: 'too_short' } });
    expect(validateCareersLeadPayload({ ...careers, role_title: 'x'.repeat(201) })).toMatchObject({ ok: false });
    expect(validateCareersLeadPayload({ ...careers, submission_id: 'wrong' })).toMatchObject({ ok: false });
    expect(validateCareersLeadPayload({ ...careers, interest_area: 'unexpected' })).toMatchObject({ ok: true, data: { interestArea: undefined } });
  });
});
