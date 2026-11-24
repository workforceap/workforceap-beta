import { describe, expect, it } from 'vitest';
import { isGuardedLocalPreview } from '@/lib/runtime/localPreview';

describe('isGuardedLocalPreview', () => {
  it('is true only with LOCAL_PREVIEW=1 outside Vercel', () => {
    expect(isGuardedLocalPreview({ LOCAL_PREVIEW: '1' })).toBe(true);
  });
  it('is false everywhere else, including any Vercel environment', () => {
    expect(isGuardedLocalPreview({})).toBe(false);
    expect(isGuardedLocalPreview({ LOCAL_PREVIEW: 'true' })).toBe(false);
    expect(isGuardedLocalPreview({ LOCAL_PREVIEW: '1', VERCEL: '1' })).toBe(false);
    expect(isGuardedLocalPreview({ LOCAL_PREVIEW: '1', VERCEL_ENV: 'production' })).toBe(false);
  });
});
