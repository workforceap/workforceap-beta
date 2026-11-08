import test from 'node:test';
import assert from 'node:assert/strict';
import { PROGRAMS } from '../../marketing/src/data/programs';
import {
  catalogProgramAction,
  detailProgramAction,
  publicProgramFundingCopy,
} from '../../marketing/src/data/programFunding';
import { getProgramEnrollmentSteps } from './programEnrollmentSteps';

const bySlug = (slug: string) => {
  const program = PROGRAMS.find((entry) => entry.slug === slug);
  assert.ok(program, slug);
  return program;
};

test('grant funding copy does not claim workforce-board approval', () => {
  const program = bySlug('digital-literacy-empowerment-class');
  assert.equal(program.fundingSource, 'Grant');
  const copy = publicProgramFundingCopy(program);
  assert.match(copy, /Grant or scholarship support/);
  assert.doesNotMatch(copy, /workforce board/i);
});

test('WIOA funding copy stays conditional on board approval', () => {
  const copy = publicProgramFundingCopy(bySlug('it-support-professional-certificate-ibm'));
  assert.match(copy, /local workforce board approves your training/);
  assert.match(copy, /if you qualify/);
});

test('catalog and detail actions agree for pending and selected programs', () => {
  const cpt = bySlug('certified-production-technician-cpt');
  const clt = bySlug('certified-logistics-technician-clt');
  const ibm = bySlug('it-support-professional-certificate-ibm');
  const literacy = bySlug('digital-literacy-empowerment-class');
  assert.equal(cpt.fundingSource, 'WIOA');
  assert.deepEqual(catalogProgramAction(cpt), {
    label: 'Ask about this program',
    href: '/programs/certified-production-technician-cpt',
    external: false,
  });
  assert.equal(detailProgramAction(clt).href, '/contact');
  assert.equal(catalogProgramAction(ibm).href, '/apply?program=it-support-professional-certificate-ibm');
  assert.equal(literacy.externalCourseUrl, undefined);
  assert.deepEqual(catalogProgramAction(literacy), {
    label: 'Get Started',
    href: '/apply?program=digital-literacy-empowerment-class',
    external: false,
  });
  assert.equal(detailProgramAction(ibm).href, '/apply?program=it-support-professional-certificate-ibm');
});

test('IBM public steps reuse the sourced optional CompTIA exam sentence', () => {
  const exam = getProgramEnrollmentSteps('it-support-professional-certificate-ibm').find((step) => step.id === 'exam');
  assert.ok(exam);
  assert.equal(exam.title, 'CompTIA exams (if pursuing)');
  assert.match(exam.description, /optional add-ons with separate fees/);
});

test('detail actions preserve the referral as query data', () => {
  assert.equal(
    detailProgramAction(bySlug('it-support-professional-certificate-ibm'), 'partner&other=1').href,
    '/apply?ref=partner%26other%3D1&program=it-support-professional-certificate-ibm',
  );
});
