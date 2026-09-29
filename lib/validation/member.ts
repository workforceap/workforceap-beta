import { z } from 'zod';
import { POSTAL_CODE_REGEX } from '@/lib/validation/postalCode';

export const PROGRAM_INTEREST_OPTIONS = [
  'Digital Literacy Empowerment Class (6 weeks, 30 hours total)',
  'AI Practitioner Professional Certificate (AWS)',
  'AI and Software Developer Professional Certificate (IBM)',
  'CompTIA A+ Professional Certificate (CompTIA A+)',
  'CompTIA Net+ Professional Certificate (CompTIA Net+)',
  'CompTIA Sec+ Professional Certificate (CompTIA Sec+)',
  'Cybersecurity and Networking Professional Certificate (Net+, Sec+)',
  'IT Support and Entry-level Cybersecurity Certificate (IBM)',
  'IT Automation with Python Professional Certificate (Google)',
  'IT Support Professional Certificate (IBM)',
  'AWS Cloud Technology Professional Certificate (AWS)',
  'Management Analyst & Business Intelligence Professional Certificate',
  'Database Administrator (DBA) Professional Certificate (IBM)',
  'Digital Marketing & E-Commerce Professional Certificate (Google)',
  'Project Management Professional Certificate (Microsoft)',
  'User Experience & Interface Design Professional Certificate',
  'Medical Billing, Coding, and Health Information Technician Certificate (MBCHIT)',
  'Certified Production Technician (CPT)',
  'Certified Logistics Technician (CLT)',
  'Core Construction',
  'Not sure — help me choose',
] as const;

const optionalTrimmedString = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }, schema.optional());

export const memberSignupSchema = z.object({
  fullName: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(120, 'Name must be less than 120 characters')
    .trim(),
  email: z.string().email('Please enter a valid email address').toLowerCase().trim(),
  phone: optionalTrimmedString(
    z
      .string()
      .min(10, 'Please enter a valid phone number')
      .max(20)
      .regex(/^[\d\s\-\(\)\+\.]+$/, 'Please enter a valid phone number')
  ),
  zip: optionalTrimmedString(
    z
      .string()
      .min(3, 'Please enter a valid ZIP or postal code')
      .max(10)
      .regex(POSTAL_CODE_REGEX, 'Please enter a valid ZIP or postal code (e.g. 78701 or SW1A 1AA)')
  ),
  programInterest: z.enum(PROGRAM_INTEREST_OPTIONS, {
    errorMap: () => ({ message: 'Please select a program interest' }),
  }),
  employmentStatus: z.string().optional(),
  veteranStatus: z.string().optional(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  consentTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must agree to the terms and privacy policy' }),
  }),
  consentCommunications: z.boolean().optional(),
  /** Partner referral code from apply link (?ref=), stored on Application */
  referralRef: z.string().max(100).optional().nullable(),
  /** Ref whose partner disclosure the form showed; recorded, never trusted. */
  partnerDisclosureRef: z.string().max(100).optional().nullable(),
  /** Marketing attribution captured at first ad-landing visit. Stored on
   * downstream MemberEvent metadata for paid-channel ROI analysis. */
  utmSource: z.string().max(200).optional().nullable(),
  utmMedium: z.string().max(200).optional().nullable(),
  utmCampaign: z.string().max(200).optional().nullable(),
  utmContent: z.string().max(200).optional().nullable(),
  utmTerm: z.string().max(200).optional().nullable(),
  referrer: z.string().max(500).optional().nullable(),
  /** Cloudflare Turnstile token, verified server-side when NEXT_PUBLIC_CAPTCHA_ENABLED=true. */
  turnstileToken: z.string().optional().nullable(),
});

export type MemberSignupInput = z.infer<typeof memberSignupSchema>;
