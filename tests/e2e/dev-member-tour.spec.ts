import { expect, test, type Page } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
test.use(executablePath ? { launchOptions: { executablePath } } : {});

/**
 * WAP-230: the credential-free /dev/member lab runs the same guided member
 * tour as live /dashboard, so phone QA can check it without an account (the
 * WAP-228 bug went unseen for lack of this). Tour progress and completion
 * writes are stubbed so a run never touches a real user's tour state.
 */
async function stubTourWrites(page: Page) {
  await page.route('**/api/tours/**', (route) => route.fulfill({ status: 200, json: { ok: true } }));
  await page.route('**/api/onboarding/**', (route) => route.fulfill({ status: 200, json: { ok: true } }));
}

async function spotlightCovers(page: Page, target: string) {
  const [spot, anchor] = await Promise.all([
    page.getByTestId('guided-tour-spotlight').boundingBox(),
    page.locator(`[data-tour="${target}"]:visible`).first().boundingBox(),
  ]);
  if (!spot || !anchor) return false;
  const cx = anchor.x + anchor.width / 2;
  const cy = anchor.y + anchor.height / 2;
  return cx >= spot.x && cx <= spot.x + spot.width && cy >= spot.y && cy <= spot.y + spot.height;
}

test('desktop: the member tour runs in the lab and ends on the help menu', async ({ page }) => {
  await stubTourWrites(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/dev/member/home?tour=member.home', { waitUntil: 'networkidle' });

  const dialog = page.getByTestId('guided-tour-dialog');
  await expect(dialog).toContainText(/Step 1 of (\d+)/);
  const total = Number((await dialog.textContent())?.match(/Step 1 of (\d+)/)?.[1]);
  // Every step has a real anchor in the lab: home, program, jobs, AI tools,
  // messages, then the header identity (account) and the help menu.
  for (let n = 2; n <= total; n++) {
    await page.getByTestId('guided-tour-next').click();
    await expect(dialog).toContainText(`Step ${n} of ${total}`);
  }
  await expect.poll(() => spotlightCovers(page, 'tour-help')).toBe(true);
});

test('phone: the tour skips the closed drawer and spotlights the account link', async ({ page }) => {
  await stubTourWrites(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dev/member/home?tour=member.home', { waitUntil: 'networkidle' });

  await expect(page.getByTestId('guided-tour-dialog')).toBeVisible();
  // The nav steps sit in the closed drawer at this width (WAP-228), so the
  // first reachable step is the header identity link.
  await expect.poll(() => spotlightCovers(page, 'tour-account')).toBe(true);
});
