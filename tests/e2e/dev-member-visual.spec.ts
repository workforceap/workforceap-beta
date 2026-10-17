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
        await page.addStyleTag({
          content:
            '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;} html,body,.workspace-shell-root{overflow:visible!important;height:auto!important;}',
        });
        await expect(page).toHaveScreenshot(`dev-member-${view.slug}-${viewport.name}.png`, {
          fullPage: true,
          animations: 'disabled',
          caret: 'hide',
          maxDiffPixelRatio: 0.01,
        });
      }
    });
  }
});
