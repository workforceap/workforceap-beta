// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { catalogCourseDisplayName } from '@/lib/coursera/courseDisplayName';
import { getProgramBySlug } from '@/lib/content/programs';

const CYBER = 'cybersecurity-professional-certificate-google';
const IBM = 'it-support-professional-certificate-ibm';
const PROVIDER_ID = 'N0l8fiV4Ee6DuxLo8f8SVQ';
const COURSE_NAME = 'Introduction to Networking';

describe('catalogCourseDisplayName', () => {
  it('uses the attributed program slug before any provider ID', () => {
    const course = getProgramBySlug(IBM)?.courses.find((entry) => entry.name === 'Introduction to Technical Support');
    expect(course?.slug).toBeTruthy();
    expect(catalogCourseDisplayName({
      programSlug: IBM,
      courseSlug: course!.slug,
      courseraCourseId: `Course~${PROVIDER_ID}`,
    })).toBe(course!.name);
  });

  it('recovers a title from an exact provider ID only inside the already-attributed program', () => {
    expect(catalogCourseDisplayName({
      programSlug: CYBER,
      courseSlug: `${CYBER}-course-1`,
      courseraCourseId: `Course~${PROVIDER_ID}`,
    })).toBe(COURSE_NAME);
    expect(catalogCourseDisplayName({
      programSlug: CYBER,
      courseSlug: `${CYBER}-course-1`,
      courseraCourseId: PROVIDER_ID,
    })).toBe(COURSE_NAME);
  });

  it('does not borrow a provider title from another program or an unknown program', () => {
    expect(catalogCourseDisplayName({
      programSlug: IBM,
      courseSlug: 'unknown-program-course-17',
      courseraCourseId: PROVIDER_ID,
    })).toBeNull();
    expect(catalogCourseDisplayName({
      programSlug: 'not-a-catalog-program',
      courseSlug: `${CYBER}-course-1`,
      courseraCourseId: PROVIDER_ID,
    })).toBeNull();
  });

  it('returns null when the slug is unknown and the provider ID is missing or blank', () => {
    expect(catalogCourseDisplayName({
      programSlug: CYBER,
      courseSlug: `${CYBER}-course-1`,
    })).toBeNull();
    expect(catalogCourseDisplayName({
      programSlug: CYBER,
      courseSlug: `${CYBER}-course-1`,
      courseraCourseId: '   ',
    })).toBeNull();
    expect(catalogCourseDisplayName({
      programSlug: CYBER,
      courseSlug: `${CYBER}-course-1`,
      courseraCourseId: null,
    })).toBeNull();
  });

  it('names a discovered-only course from its own program slug without inventing a mapping', () => {
    expect(catalogCourseDisplayName({
      programSlug: 'comptia-network-plus-professional-certificate',
      courseSlug: 'intro-to-os-and-hardware-1b',
    })).toBe('Introduction to Contemporary Operating Systems and Hardware 1b');
    expect(catalogCourseDisplayName({
      programSlug: IBM,
      courseSlug: 'intro-to-os-and-hardware-1b',
    })).toBeNull();
  });
});
