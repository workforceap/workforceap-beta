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
      await page.route(/elevenlabs|PortalVoiceSession/i, (route) => route.abort());

      for (const view of DEV_MEMBER_VIEWS) {
        await openDevMember(page, harnessPath(view.slug, 'full'));
        await page.evaluate(() => {
          const id = 'dev-member-visual-overflow';
          if (document.getElementById(id)) return;
          const style = document.createElement('style');
          style.id = id;
          style.textContent =
            'html,body,.workspace-shell-root{overflow:visible!important;height:auto!important;}';
          document.documentElement.appendChild(style);
        });
        await page.evaluate(async () => {
          if (document.fonts?.ready) await document.fonts.ready;
        });
        // Collect every view's diff; each mismatch still fails this test.
        await expect.soft(page).toHaveScreenshot(`dev-member-${view.slug}-${viewport.name}.png`, {
          fullPage: true,
          animations: 'disabled',
          caret: 'hide',
          maxDiffPixelRatio: 0.05,
          mask: [page.locator('vercel-live-feedback, [data-vercel-toolbar], #vercel-live-feedback')],
        });
      }
    });
  }
});
