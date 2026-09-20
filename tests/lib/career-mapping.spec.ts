import { describe, it, expect } from 'vitest';
import {
  rankPrograms as autoMatchOccupationToPrograms,
  buildOccupationTokens,
  inferExperienceBand,
  type OccupationForMatch,
} from '@/lib/career/autoMatch';
import { PROGRAMS } from '@/lib/content/programs';

// ── helpers ──────────────────────────────────────────────────────────────────

function mockOcc(partial: Partial<OccupationForMatch> & { title: string }): OccupationForMatch {
  return {
    description: null,
    jobFamily: null,
    outlookSummary: null,
    skills: [],
    tasks: [],
    technologies: [],
    ...partial,
  };
}

// ── autoMatchOccupationToPrograms ────────────────────────────────────────────

describe('autoMatchOccupationToPrograms', () => {
  it('exact keyword match scores high', () => {
    // Occupation that shares many exact keywords with the Cybersecurity program
    const occ = mockOcc({
      title: 'Cybersecurity Analyst',
      description: 'Protect computer networks and respond to incidents',
      skills: [
        { skillName: 'Networking' },
        { skillName: 'Network security' },
        { skillName: 'Incident response' },
        { skillName: 'SIEM' },
      ],
      tasks: [{ taskText: 'Monitor network security incidents using SIEM tools' }],
    });

    const results = autoMatchOccupationToPrograms(occ, PROGRAMS);
    const cyber = results.find(
      (r) => r.programSlug === 'cybersecurity-professional-certificate-google'
    );

    expect(cyber).toBeDefined();
    expect(cyber!.score).toBeGreaterThanOrEqual(0.25);
    expect(cyber!.recommendationType).toBe('primary');
  });

  it('partial match scores medium', () => {
    // "networking" is an exact skill match against the Cybersecurity program;
    // a single overlapping keyword lands solidly in the bridge tier.
    const occ = mockOcc({
      title: 'Network Administrator',
      description: 'Manages servers',
      skills: [{ skillName: 'Networking' }],
      tasks: [{ taskText: 'Maintain office networks' }],
    });

    const results = autoMatchOccupationToPrograms(occ, PROGRAMS);
    const cyber = results.find(
      (r) => r.programSlug === 'cybersecurity-professional-certificate-google'
    );

    expect(cyber).toBeDefined();
    expect(cyber!.score).toBeGreaterThanOrEqual(0.1);
    expect(cyber!.score).toBeLessThan(0.25);
    expect(cyber!.recommendationType).toBe('bridge');
  });

  it('no match returns empty', () => {
    const occ = mockOcc({
      title: 'Quantum Poet',
      description: 'Writes cosmic verse',
      skills: [{ skillName: 'Rhyme' }],
      tasks: [{ taskText: 'Compose stanzas' }],
    });

    const results = autoMatchOccupationToPrograms(occ, PROGRAMS);
    expect(results).toHaveLength(0);
  });

  it('technology skills boost score', () => {
    const baseOcc = mockOcc({
      title: 'Software Developer',
      description: 'Build applications',
      skills: [{ skillName: 'JavaScript' }],
      tasks: [{ taskText: 'Develop production software' }],
    });

    const boostedOcc = mockOcc({
      title: 'Software Developer',
      description: 'Build applications',
      skills: [{ skillName: 'JavaScript' }],
      tasks: [{ taskText: 'Develop production software' }],
      technologies: [{ technologyName: 'React' }, { technologyName: 'Python' }],
    });

    const baseResults = autoMatchOccupationToPrograms(baseOcc, PROGRAMS);
    const boostedResults = autoMatchOccupationToPrograms(boostedOcc, PROGRAMS);

    // Find the AI and Software Developer program in both result sets.
    const baseData = baseResults.find(
      (r) => r.programSlug === 'software-developer-professional-certificate-ibm'
    );
    const boostedData = boostedResults.find(
      (r) => r.programSlug === 'software-developer-professional-certificate-ibm'
    );

    expect(baseData).toBeDefined();
    expect(boostedData).toBeDefined();
    expect(boostedData!.score).toBeGreaterThan(baseData!.score);
  });
});

// ── buildOccupationTokens ────────────────────────────────────────────────────

describe('buildOccupationTokens', () => {
  it('tokenizes title correctly', () => {
    const occ = mockOcc({ title: 'Senior Software Engineer' });
    const tokens = buildOccupationTokens(occ);

    expect(tokens.has('senior')).toBe(true);
    expect(tokens.has('software')).toBe(true);
    expect(tokens.has('engineer')).toBe(true);
    // Short words are dropped
    expect(tokens.has('it')).toBe(false);
  });

  it('extracts skills into tokens', () => {
    const occ = mockOcc({
      title: 'Analyst',
      skills: [
        { skillName: 'Python Programming' },
        { skillName: 'Data Analysis' },
      ],
    });
    const tokens = buildOccupationTokens(occ);

    expect(tokens.has('python')).toBe(true);
    expect(tokens.has('programming')).toBe(true);
    expect(tokens.has('data')).toBe(true);
    expect(tokens.has('analysis')).toBe(true);
  });

  it('includes technologies in token set', () => {
    const occ = mockOcc({
      title: 'Developer',
      technologies: [
        { technologyName: 'React.js' },
        { technologyName: 'Node.js' },
      ],
    });
    const tokens = buildOccupationTokens(occ);

    expect(tokens.has('react')).toBe(true);
    expect(tokens.has('node')).toBe(true);
  });
});

// ── inferExperienceBand ──────────────────────────────────────────────────────

describe('inferExperienceBand', () => {
  it('maps entry-level to beginner', () => {
    const occ = mockOcc({ title: 'Entry-Level Data Analyst' });
    expect(inferExperienceBand(occ)).toBe('beginner');
  });

  it('maps junior to beginner', () => {
    const occ = mockOcc({ title: 'Junior Web Developer' });
    expect(inferExperienceBand(occ)).toBe('beginner');
  });

  it('maps senior to experienced', () => {
    const occ = mockOcc({ title: 'Senior Software Engineer' });
    expect(inferExperienceBand(occ)).toBe('experienced');
  });

  it('maps lead to experienced', () => {
    const occ = mockOcc({ title: 'Lead DevOps Engineer' });
    expect(inferExperienceBand(occ)).toBe('experienced');
  });

  it('defaults to some_experience', () => {
    const occ = mockOcc({ title: 'Software Developer' });
    expect(inferExperienceBand(occ)).toBe('some_experience');
  });
});
