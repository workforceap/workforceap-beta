/**
 * WS5 eligibility datasheet columns + CHS exclusion for campaign recipients.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ELIGIBILITY_DATASHEET_COLUMNS,
  eligibilityDatasheetCells,
  hasEligibilityScreeningFields,
} from '@/lib/apply/eligibilityScreeningFields';
import {
  ELIGIBILITY_EXPORT_BASE_COLUMNS,
  buildEligibilityCampaignWhere,
  buildEligibilityExportCsvRows,
} from '@/lib/admin/eligibilityDatasheet';
import {
  CHS_PARTNER_REFERRAL_CODE,
  CHS_PARTNER_SLUG,
  excludeChsPartnerReferralsWhere,
  isChsPartnerRef,
} from '@/lib/partners/chsPartner';
import { dataToCsv } from '@/lib/csv/export';

test('eligibility datasheet columns include WS4 screening fields', () => {
  assert.ok(ELIGIBILITY_DATASHEET_COLUMNS.includes('Receiving Unemployment'));
  assert.ok(ELIGIBILITY_DATASHEET_COLUMNS.includes('Exhausted Unemployment'));
  assert.ok(ELIGIBILITY_DATASHEET_COLUMNS.includes('Layoff Company'));
  assert.ok(ELIGIBILITY_DATASHEET_COLUMNS.includes('SNAP/WIC'));
  assert.ok(ELIGIBILITY_DATASHEET_COLUMNS.includes('Heard About Us'));
  assert.ok(ELIGIBILITY_DATASHEET_COLUMNS.includes('Partner/Ambassador Referral'));
  // WAP-53: benefit detail and the help request are separate columns from the yes/no.
  assert.ok(ELIGIBILITY_DATASHEET_COLUMNS.includes('Public Assistance Programs'));
  assert.ok(ELIGIBILITY_DATASHEET_COLUMNS.includes('Wants Help Applying'));
});

test('eligibilityDatasheetCells distinguish self-report, programs and help requested (WAP-53)', () => {
  const cells = eligibilityDatasheetCells({ snapWic: 'yes', publicAssistancePrograms: ['snap', 'tanf'], publicAssistanceHelpRequested: 'yes' });
  const col = (name: string) => cells[ELIGIBILITY_DATASHEET_COLUMNS.indexOf(name as never)];
  assert.equal(col('SNAP/WIC'), 'yes');
  assert.equal(col('Public Assistance Programs'), 'TANF, SNAP / food stamps');
  assert.equal(col('Wants Help Applying'), 'yes');
  // Pre-WAP-53 rows have neither follow-up and export as blanks, not errors.
  const legacy = eligibilityDatasheetCells({ snapWic: 'yes' });
  assert.equal(legacy.length, ELIGIBILITY_DATASHEET_COLUMNS.length);
  assert.equal(legacy[ELIGIBILITY_DATASHEET_COLUMNS.indexOf('Public Assistance Programs')], '');
  assert.equal(legacy[ELIGIBILITY_DATASHEET_COLUMNS.indexOf('Wants Help Applying')], '');
});

test('eligibilityDatasheetCells align with column order', () => {
  const cells = eligibilityDatasheetCells({
    receivingUnemployment: 'yes',
    exhaustedUnemployment: 'no',
    layoffCompany: 'Acme',
    snapWic: 'yes',
    hearAbout: 'Friend',
    hearAboutOther: null,
    partnerAmbassadorReferral: 'Code-1',
    q1: 'yes',
    q2: 'yes',
    q3: 'yes',
    qualifies: true,
    yesCount: 3,
  });
  assert.equal(cells.length, ELIGIBILITY_DATASHEET_COLUMNS.length);
  assert.equal(cells[0], 'yes');
  assert.equal(cells[2], 'Acme');
  assert.equal(cells[3], 'yes');
  assert.equal(cells[6], 'Code-1');
  assert.equal(cells[10], 'yes');
  assert.equal(cells[11], '3');
});

test('eligibility export CSV header includes screening columns', () => {
  const rows = buildEligibilityExportCsvRows([
    {
      id: 'u1',
      fullName: 'Alex',
      email: 'alex@example.com',
      phone: '5125550100',
      createdAt: new Date('2026-05-01T00:00:00Z'),
      partnerName: 'Goodwill',
      screening: {
        receivingUnemployment: 'yes',
        exhaustedUnemployment: 'no',
        layoffCompany: 'Acme',
        snapWic: 'yes',
        hearAbout: 'Partner or community ambassador',
        partnerAmbassadorReferral: 'Jane',
        q1: 'yes',
        q2: 'yes',
        q3: 'yes',
        qualifies: true,
        yesCount: 3,
        createdAt: new Date('2026-05-02T00:00:00Z'),
      },
    },
  ]);
  const csv = dataToCsv(
    ELIGIBILITY_EXPORT_BASE_COLUMNS.map((header, i) => ({
      key: `c${i}`,
      header,
      accessor: (r: unknown) => (r as (string | number)[])[i],
    })),
    rows,
  );
  const header = csv.trim().split('\r\n')[0];
  assert.match(header, /Receiving Unemployment/);
  assert.match(header, /SNAP\/WIC/);
  assert.match(header, /Partner\/Ambassador Referral/);
  assert.ok(csv.includes('Acme'));
  assert.ok(csv.includes('alex@example.com'));
});

test('hasEligibilityScreeningFields detects WS4 answers', () => {
  assert.equal(hasEligibilityScreeningFields({ snapWic: 'yes' }), true);
  assert.equal(hasEligibilityScreeningFields({}), false);
});

test('isChsPartnerRef matches slug and referral code', () => {
  assert.equal(isChsPartnerRef(CHS_PARTNER_SLUG), true);
  assert.equal(isChsPartnerRef(CHS_PARTNER_REFERRAL_CODE), true);
  assert.equal(isChsPartnerRef('goodwill'), false);
  assert.equal(isChsPartnerRef(null), false);
});

test('excludeChsPartnerReferralsWhere excludes concordia slug and chs2026 code', () => {
  const frag = excludeChsPartnerReferralsWhere();
  const or = frag.partnerReferrals.none.partner.OR;
  assert.deepEqual(or, [
    { slug: CHS_PARTNER_SLUG },
    { referralCode: CHS_PARTNER_REFERRAL_CODE },
  ]);
});

test('buildEligibilityCampaignWhere excludes CHS and optionally missing screening', () => {
  const where = buildEligibilityCampaignWhere({ missingScreeningOnly: true });
  assert.ok(Array.isArray(where.AND));
  const and = where.AND as object[];
  const serialized = JSON.stringify(and);
  assert.ok(serialized.includes(CHS_PARTNER_SLUG));
  assert.ok(serialized.includes(CHS_PARTNER_REFERRAL_CODE));
  assert.ok(serialized.includes('applyEligibilityScreenings'));
  assert.ok(serialized.includes('"none"'));
});

test('buildEligibilityCampaignWhere can include already-screened members', () => {
  const where = buildEligibilityCampaignWhere({ missingScreeningOnly: false });
  const serialized = JSON.stringify(where);
  assert.ok(!serialized.includes('"applyEligibilityScreenings":{"none"'));
  assert.ok(serialized.includes(CHS_PARTNER_SLUG));
});
