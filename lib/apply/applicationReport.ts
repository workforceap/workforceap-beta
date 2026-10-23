import { z } from 'zod';
import { formatPhone } from '@/lib/formatPhone';
import { escapeHtml } from '@/lib/email/escapeHtml';
import type { EligibilityScreeningFields } from './eligibilityScreeningFields';
import { formatPublicAssistancePrograms } from './publicAssistance';
import { PRIMARY_BARRIER_OPTIONS } from './primaryBarrierOptions';

/** Versioned, explicit applicant data only. Never pass a request body, profile,
 * staff notes or provider payload directly into this persisted snapshot. */
export const applicationReportSchema = z.object({
  version: z.literal(1),
  source: z.enum(['submission', 'recovered_record']),
  capturedAt: z.string().datetime(),
  submittedAt: z.string().datetime().nullable(),
  sections: z.array(z.object({
    title: z.string(),
    fields: z.array(z.object({ label: z.string(), value: z.string() })),
  })),
});
export type ApplicationReport = z.infer<typeof applicationReportSchema>;
type OptionalText = string | null | undefined;
export type ApplicationReportInput = {
  source?: ApplicationReport['source']; capturedAt: Date; submittedAt: Date | null;
  name: string; email: string; phone?: OptionalText; address?: OptionalText;
  city?: OptionalText; state?: OptionalText; zip?: OptionalText; county?: OptionalText;
  ageGroup?: OptionalText; programInterest: string; recommendedCareer?: OptionalText;
  barriers?: string[]; computerHelp?: boolean | null; smsOptIn?: boolean | null;
  referral?: OptionalText; screening?: EligibilityScreeningFields | null;
  school?: boolean; schoolName?: OptionalText; grade?: OptionalText;
  guardianName?: OptionalText; guardianEmail?: OptionalText; guardianPhone?: OptionalText;
  employmentStatus?: OptionalText; veteranStatus?: OptionalText;
  consentTerms?: boolean | null; consentCommunications?: boolean | null;
};
const missing = 'Not provided';
function answer(value: OptionalText | boolean): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const text = value?.trim();
  return text === 'yes' ? 'Yes' : text === 'no' ? 'No' : text || missing;
}
const field = (label: string, value: OptionalText | boolean) => ({ label, value: answer(value) });

export function buildApplicationReport(input: ApplicationReportInput): ApplicationReport {
  const screening = input.screening ?? {};
  const age: Record<string, string> = { under_18: 'Under 18', '18_24': '18–24', '25_50': '25–50', '50_plus': '50+' };
  const sections: ApplicationReport['sections'] = [
    { title: 'Applicant & contact', fields: [
      field('Name', input.name), field('Email', input.email),
      field('Phone', input.phone ? formatPhone(input.phone) : null),
      field('Address', [input.address, input.city, input.state, input.zip].filter(Boolean).join(', ')),
      field('County', input.county), field('Age group', age[input.ageGroup ?? ''] ?? input.ageGroup),
    ] },
    { title: 'Training & support', fields: [
      field('Program choices (ranked)', input.programInterest),
      field('Recommended career', input.recommendedCareer),
      field('Employment barriers', input.barriers?.map((value) => PRIMARY_BARRIER_OPTIONS.find((option) => option.value === value)?.label ?? value).join('; ')),
      field('Computer support follow-up', input.computerHelp),
      ...(input.employmentStatus ? [field('Employment status', input.employmentStatus)] : []),
      ...(input.veteranStatus ? [field('Veteran status', input.veteranStatus)] : []),
    ] },
  ];
  if (input.school) {
    sections.push({ title: 'School & guardian', fields: [
      field('School', input.schoolName), field('Grade', input.grade),
      field('Parent / guardian', input.guardianName), field('Guardian email', input.guardianEmail),
      field('Guardian phone', input.guardianPhone ? formatPhone(input.guardianPhone) : null),
    ] });
  } else {
    sections.push({ title: 'Eligibility screening (self-reported)', fields: [
      field('Unemployed / underemployed', screening.q1),
      field('Household income under $60,000', screening.q2), field('Authorized to work', screening.q3),
      field('Quick eligibility fit', screening.qualifies == null ? null : `${answer(screening.qualifies)}${screening.yesCount == null ? '' : ` (${screening.yesCount}/3)`}`),
      field('Receiving unemployment', screening.receivingUnemployment), field('Exhausted unemployment', screening.exhaustedUnemployment),
      field('Layoff / last employer', screening.layoffCompany), field('Receiving public assistance', screening.snapWic),
      field('Benefit programs', formatPublicAssistancePrograms(screening.publicAssistancePrograms)),
      field('Wants help applying for benefits', screening.publicAssistanceHelpRequested),
    ] });
    if (input.guardianName || input.schoolName) sections.push({ title: 'School & guardian', fields: [
      field('School', input.schoolName), field('Grade', input.grade), field('Parent / guardian', input.guardianName),
      field('Guardian email', input.guardianEmail), field('Guardian phone', input.guardianPhone ? formatPhone(input.guardianPhone) : null),
    ] });
  }
  sections.push({ title: 'Referral & communication', fields: [
    field('Referral', input.referral), field('Heard about us', screening.hearAbout),
    field('Referral details', screening.hearAboutOther), field('Partner / ambassador', screening.partnerAmbassadorReferral),
    field('SMS opt-in', input.smsOptIn),
    ...(input.consentTerms != null ? [field('Terms accepted', input.consentTerms)] : []),
    ...(input.consentCommunications != null ? [field('Communication consent', input.consentCommunications)] : []),
  ] });
  return { version: 1, source: input.source ?? 'submission', capturedAt: input.capturedAt.toISOString(), submittedAt: input.submittedAt?.toISOString() ?? null, sections };
}

export function applicationReportDate(date: string | null): string {
  return date ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date)) + ' Central' : 'Not recorded';
}

export function applicationReportHtml(report: ApplicationReport): string {
  return `<p>Print the attached application report for the applicant’s file. A saved copy is available on their profile.</p>
    <p><strong>Submitted:</strong> ${escapeHtml(applicationReportDate(report.submittedAt))}</p>` +
    report.sections.map((section) => `<h3 style="font-size:16px;margin:18px 0 6px">${escapeHtml(section.title)}</h3>
      <table role="presentation" style="width:100%;border-collapse:collapse">${section.fields.map(({ label, value }) =>
      `<tr><td style="padding:4px 8px 4px 0;vertical-align:top;width:42%"><strong>${escapeHtml(label)}</strong></td><td style="padding:4px 0;overflow-wrap:anywhere">${escapeHtml(value)}</td></tr>`).join('')}</table>`).join('') +
    '<p style="font-size:13px">Screening answers are self-reported and do not establish funding approval. Staff filing copy; handle as confidential applicant information.</p>';
}
