import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FeatureTile } from '@/components/portal/kit/FeatureTile';

afterEach(cleanup);

describe('FeatureTile heading order', () => {
  it('defaults to an h3 for tiles inside an h2 section', () => {
    render(<FeatureTile title="Career Toolkit" body="Resume audit." href="/dashboard/ai-tools" />);
    expect(screen.getByRole('heading', { level: 3, name: 'Career Toolkit' })).toBeInTheDocument();
  });

  it('follows the surrounding outline when a level is supplied', () => {
    render(<FeatureTile title="Programs" body="Browse programs." headingAs="h2" href="/programs" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Programs' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  });
});
