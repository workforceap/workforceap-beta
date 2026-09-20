import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import JsonLdCourse from '@/components/JsonLdCourse';
import JsonLdEducationalOccupationalProgram from '@/components/JsonLdEducationalOccupationalProgram';
import { PROGRAMS } from '@/lib/content/programs';
import { getProgramComparisonTracks } from '@/lib/content/programComparisonTracks';
import { getTopProgramsFromQuiz } from '@/lib/content/quizProgramRecommendations';
import { createEmptyWeights, type QuizAnswers } from '@/lib/content/quizScoring';
import { programMatchesSearchQuery } from '@/lib/content/programCatalogSearch';

vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
import { getUser } from '@/lib/auth/server';
import { GET } from '@/app/api/member/program-comparison/route';

describe('program metadata uses curriculum facts without unsupported wage promises', () => {
  it.each(PROGRAMS.map((program) => [program.slug, program] as const))('%s', (_slug, program) => {
    for (const element of [
      <JsonLdCourse key="course" program={program} />,
      <JsonLdEducationalOccupationalProgram key="program" program={program} url={`https://example.test/programs/${program.slug}`} />,
    ]) {
      const markup = renderToStaticMarkup(element);
      const payload = JSON.parse(markup.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''));
      expect(payload.name).toBeTruthy();
      expect(payload.provider.name).toBeTruthy();
      expect(payload.description).toContain(program.duration);
      expect(payload).not.toHaveProperty('salaryUponCompletion');
      expect(payload.description).not.toMatch(/salary|\$\d/i);
    }
  });

  it('keeps an embedded closing script tag inert', () => {
    const program = { ...PROGRAMS[0], title: 'Example </script><script>alert(1)</script>' };
    const markup = renderToStaticMarkup(<JsonLdEducationalOccupationalProgram program={program} url="https://example.test/program" />);
    expect(markup.match(/<script/g)).toHaveLength(1);
    expect(markup).toContain('\\u003c/script>');
  });

  it('excludes historical salary ranges from authenticated comparisons', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'member' } as never);
    const response = await GET(new Request('https://example.test/api/member/program-comparison'));
    expect(response.status).toBe(200);
    const { tracks } = await response.json();
    expect(tracks).toHaveLength(getProgramComparisonTracks().length);
    for (const track of tracks) {
      expect(track).not.toHaveProperty('salary');
      expect(track.duration).toBeTruthy();
      expect(track.certs).toBeTruthy();
    }
  });

  it('preserves the authentication boundary', async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    const response = await GET(new Request('https://example.test/api/member/program-comparison'));
    expect(response.status).toBe(401);
  });

  it('breaks equal interest scores by catalog order rather than unsupported salary bands', () => {
    const answers: QuizAnswers = { q1: 'computers', q2: 'work_experience', q3: 'planning_ahead', q4: 'salary', q5: 'comfortable', q6: 'yes_computer' };
    const weights = { ...createEmptyWeights(), 'it-cyber': 10 };
    const expected = PROGRAMS.filter((program) => program.category === 'it-cyber').slice(0, 3).map((program) => program.slug);
    expect(getTopProgramsFromQuiz(weights, answers).map((program) => program.slug)).toEqual(expected);
  });

  it('carries no salary field on the catalog record, so search cannot match one (WAP-23)', () => {
    const fixture = PROGRAMS[0];
    expect('salary' in fixture).toBe(false);
    expect(JSON.stringify(PROGRAMS)).not.toMatch(/Starting salary|\$\d+K/);
    expect(programMatchesSearchQuery(fixture, 'unique wage marker')).toBe(false);
    expect(programMatchesSearchQuery(fixture, fixture.title)).toBe(true);
  });
});
