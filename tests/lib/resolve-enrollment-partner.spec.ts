import { beforeEach, describe, expect, it, vi } from 'vitest';

const findFirst = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db/prisma', () => ({
  prisma: { partner: { findFirst } },
}));

vi.mock('@/lib/content/programs', () => ({
  getProgramBySlug: vi.fn((slug: string) => {
    if (slug !== 'cybersecurity-professional-certificate-google') return undefined;
    return {
      slug,
      title: 'Cybersecurity',
      categoryLabel: 'IT & Cybersecurity',
      categoryColor: '#ad2c4d',
      icon: '🛡️',
      duration: '3-5 months',
      partner: 'Google',
      skills: ['Networking', 'Network security', 'Incident response', 'SIEM'],
    };
  }),
}));

import { prisma } from '@/lib/db/prisma';
import { resolveEnrollmentPartner } from '@/lib/enroll/resolveEnrollmentPartner';

const KNOWN_PROGRAM = 'cybersecurity-professional-certificate-google';

function partnerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'partner-1',
    name: 'Concordia High School',
    slug: 'concordia-high-school',
    referralCode: 'concordia-hs',
    enrollmentHeadline: 'Concordia students: launch your career with an industry certification',
    enrollmentBlurb: null,
    schoolDistrict: 'Demo ISD',
    sponsorshipTermLabel: '2026',
    programCatalog: [{ programSlug: KNOWN_PROGRAM, featured: true, note: 'Priority seat' }],
    ...overrides,
  };
}

describe('resolveEnrollmentPartner', () => {
  beforeEach(() => {
    findFirst.mockReset();
    findFirst.mockResolvedValue(partnerRow());
  });

  it('does not query when the URL segment is empty or malformed', async () => {
    expect(await resolveEnrollmentPartner('   ')).toBeNull();
    expect(await resolveEnrollmentPartner('Concordia High School')).toBeNull();
    expect(prisma.partner.findFirst).not.toHaveBeenCalled();
  });

  it('looks up an active enrollment page by the short URL key and the high-school slug', async () => {
    await resolveEnrollmentPartner('Concordia');
    expect(prisma.partner.findFirst).toHaveBeenCalledWith({
      where: {
        active: true,
        enrollmentPageEnabled: true,
        OR: [
          { slug: { in: ['concordia', 'concordia-high-school'] } },
          { referralCode: { in: ['concordia', 'concordia-high-school'] } },
        ],
      },
      select: expect.objectContaining({
        referralCode: true,
        programCatalog: expect.objectContaining({ orderBy: { displayOrder: 'asc' } }),
      }),
    });
  });

  it('does not invent a second high-school key when the URL already uses that suffix', async () => {
    await resolveEnrollmentPartner('concordia-high-school');
    const keys = ['concordia-high-school'];
    expect(prisma.partner.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [{ slug: { in: keys } }, { referralCode: { in: keys } }],
      }),
    }));
  });

  it('returns the partner referral and shortened enroll path when a known catalog row exists', async () => {
    const page = await resolveEnrollmentPartner('concordia');
    expect(page).toMatchObject({
      partnerId: 'partner-1',
      name: 'Concordia High School',
      slug: 'concordia-high-school',
      referralCode: 'concordia-hs',
      enrollmentPath: '/enroll/concordia',
      schoolDistrict: 'Demo ISD',
      termLabel: '2026',
      programs: [{
        slug: KNOWN_PROGRAM,
        title: 'Cybersecurity',
        featured: true,
        note: 'Priority seat',
        skills: ['Networking', 'Network security', 'Incident response'],
      }],
    });
  });

  it('resolves a partner that matches only by referral code', async () => {
    findFirst.mockResolvedValue(partnerRow({
      slug: 'chs-partner',
      referralCode: 'concordia',
    }));
    const page = await resolveEnrollmentPartner('concordia');
    expect(page).toMatchObject({
      slug: 'chs-partner',
      referralCode: 'concordia',
      enrollmentPath: '/enroll/chs-partner',
    });
  });

  it('returns null when the partner has no referral code to stamp on apply', async () => {
    findFirst.mockResolvedValue(partnerRow({ referralCode: null }));
    expect(await resolveEnrollmentPartner('concordia')).toBeNull();
  });

  it('returns null when every catalog slug is unknown, even if the partner row exists', async () => {
    findFirst.mockResolvedValue(partnerRow({
      programCatalog: [{ programSlug: 'not-a-real-program', featured: false, note: null }],
    }));
    expect(await resolveEnrollmentPartner('concordia')).toBeNull();
  });

  it('drops unknown catalog rows and still publishes when one known program remains', async () => {
    findFirst.mockResolvedValue(partnerRow({
      programCatalog: [
        { programSlug: 'not-a-real-program', featured: false, note: null },
        { programSlug: KNOWN_PROGRAM, featured: false, note: null },
      ],
    }));
    const page = await resolveEnrollmentPartner('concordia');
    expect(page?.programs.map((program) => program.slug)).toEqual([KNOWN_PROGRAM]);
  });

  it('replaces a banned free headline and empty blurb with stake-safe defaults', async () => {
    findFirst.mockResolvedValue(partnerRow({
      enrollmentHeadline: 'Free career training for students',
      enrollmentBlurb: '   ',
      sponsorshipTermLabel: null,
    }));
    const page = await resolveEnrollmentPartner('concordia');
    expect(page?.headline).toBe('Concordia students: launch your career with an industry certification');
    expect(page?.blurb).toMatch(/no cost to Concordia High School students/i);
    expect(page?.blurb).not.toMatch(/\bfree\b/i);
    expect(page?.termLabel).toBe(String(new Date().getUTCFullYear()));
  });
});
