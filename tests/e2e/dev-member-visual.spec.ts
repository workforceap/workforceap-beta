import { expect, test } from '@playwright/test';
import { DEV_MEMBER_VIEWS, harnessPath } from '../../app/dev/member/harness/registry';
import { DEV_MEMBER_VIEWPORTS, openDevMember, stubDevMemberNoise } from './dev-member-helpers';

test.describe('dev member visual baselines', () => {
  test.describe.configure({ timeout: 180_000 });

  for (const viewport of DEV_MEMBER_VIEWPORTS) {
    test(`${viewport.name} ${viewport.width}: full state`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await stubDevMemberNoise(page);
      await page.emulateMedia({ colorScheme: 'light' });

      for (const view of DEV_MEMBER_VIEWS) {
        await openDevMember(page, harnessPath(view.slug, 'full'));
        await expect(page).toHaveScreenshot(`dev-member-${view.slug}-${viewport.name}.png`, {
          fullPage: true,
          animations: 'disabled',
          caret: 'hide',
          maxDiffPixelRatio: 0.03,
          mask: [page.locator('vercel-live-feedback, [data-vercel-toolbar], #vercel-live-feedback')],
        });
      }
    });
  }
});
