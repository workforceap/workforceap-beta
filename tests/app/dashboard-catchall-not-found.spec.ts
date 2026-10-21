import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));

import CatchAll, {
  dynamicParams,
  generateStaticParams,
} from '@/app/(portal)/dashboard/[...slug]/page';

const root = process.cwd();

describe('dashboard catch-all preserves HTTP notFound', () => {
  it('rejects every slug at the routing layer and keeps the home skeleton off that segment', () => {
    expect(dynamicParams).toBe(false);
    expect(generateStaticParams()).toEqual([]);
    expect(() => CatchAll()).toThrow('NOT_FOUND');
    expect(existsSync(join(root, 'app/(portal)/dashboard/(home)/loading.tsx'))).toBe(true);
    expect(existsSync(join(root, 'app/(portal)/dashboard/loading.tsx'))).toBe(false);
    expect(existsSync(join(root, 'app/(portal)/dashboard/mentor/loading.tsx'))).toBe(false);
  });
});
