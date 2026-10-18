import { expect, test } from '@playwright/test';
import { DEV_MEMBER_STATES, DEV_MEMBER_VIEWS, harnessPath } from '../../app/dev/member/harness/registry';
import {
  DEV_MEMBER_VIEWPORTS,
  collectPageErrors,
  expectCScreenPhoneLayout,
  expectDevMemberSmoke,
  openDevMember,
  stubDevMemberNoise,
} from './dev-member-helpers';

test.describe('dev member harness smoke', () => {
  for (const viewport of DEV_MEMBER_VIEWPORTS) {
    test(`${viewport.name} ${viewport.width}: every view × state`, async ({ page }) => {
      test.setTimeout(viewport.width === 1440 ? 240_000 : 300_000);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await stubDevMemberNoise(page);
      const errors = collectPageErrors(page);

      for (const view of DEV_MEMBER_VIEWS) {
        for (const state of DEV_MEMBER_STATES) {
          errors.length = 0;
          await openDevMember(page, harnessPath(view.slug, state));
          await expect(page.locator('[data-dev-member-harness]')).toHaveAttribute('data-dev-member-harness', view.slug);
          await expect(page.locator('[data-dev-member-harness]')).toHaveAttribute('data-dev-member-state', state);
          await expectDevMemberSmoke(page, errors);
          if (viewport.width === 390 && view.kind === 'c-kit') {
            await expectCScreenPhoneLayout(page);
          }
        }
      }
    });
  }
});
