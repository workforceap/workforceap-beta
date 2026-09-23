import { expect, test, type Page } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
test.use(executablePath ? { launchOptions: { executablePath } } : {});

type ShellMetrics = {
  viewport: { width: number; height: number };
  document: { width: number; height: number };
  root: DOMRect;
  body: DOMRect;
  sidebar: DOMRect;
  main: DOMRect;
  mainScrollHeight: number;
};

async function readShellMetrics(page: Page): Promise<ShellMetrics> {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
      return element.getBoundingClientRect().toJSON();
    };
    const main = document.querySelector('.workspace-shell-main');
    if (!(main instanceof HTMLElement)) throw new Error('Missing workspace main');
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      document: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      },
      root: rect('.workspace-shell-root'),
      body: rect('.workspace-shell-body'),
      sidebar: rect('.workspace-sidebar'),
      main: rect('.workspace-shell-main'),
      mainScrollHeight: main.scrollHeight,
    };
  });
}

test.describe('desktop WorkspaceShell layout', () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 520 },
  ]) {
    test(`keeps the rail visible and main content fluid at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/dev/member/home');
      await expect(page.locator('.workspace-shell-root')).toBeVisible();

      const metrics = await readShellMetrics(page);
      expect(metrics.document.height).toBeLessThanOrEqual(metrics.viewport.height);
      expect(metrics.document.width).toBeLessThanOrEqual(metrics.viewport.width);
      expect(metrics.root.height).toBeCloseTo(metrics.viewport.height, 0);
      expect(metrics.sidebar.top).toBeCloseTo(metrics.body.top, 0);
      expect(metrics.sidebar.bottom).toBeLessThanOrEqual(metrics.viewport.height + 1);
      expect(metrics.main.left).toBeCloseTo(metrics.sidebar.right, 0);
      expect(metrics.main.right).toBeCloseTo(metrics.viewport.width, 0);
      expect(metrics.main.height).toBeCloseTo(metrics.body.height, 0);
      expect(metrics.mainScrollHeight).toBeGreaterThanOrEqual(Math.floor(metrics.main.height));

      const sidebar = page.locator('.workspace-sidebar');
      const footer = sidebar.locator('.workspace-sidebar-footer');
      const accountGroup = sidebar.locator('summary').filter({ hasText: 'Account & support' });
      const certificates = sidebar.getByRole('link', { name: 'My certificates' });
      const finalDestination = sidebar.getByRole('link', { name: 'Profile' });
      const language = sidebar.getByRole('combobox', { name: 'Select language' });
      const appearance = footer.getByRole('radiogroup', { name: 'Appearance' });
      const selectedTheme = appearance.getByRole('radio', { checked: true });
      const signOut = footer.getByRole('button', { name: 'Sign out' });
      await expect(selectedTheme).toBeVisible();
      await expect(selectedTheme).toHaveAttribute('tabindex', '0');
      await expect(signOut).toBeVisible();

      await accountGroup.focus();
      await page.keyboard.press('Enter');
      await expect(finalDestination).toBeVisible();
      await page.keyboard.press('Tab');
      await expect(certificates).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(finalDestination).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(language).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(selectedTheme).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(signOut).toBeFocused();
      expect(await signOut.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
      await page.keyboard.press('Shift+Tab');
      await expect(selectedTheme).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(language).toBeFocused();
    });
  }
});

test('mobile shell remains width-safe and contains keyboard focus in the drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dev/member/home');

  const menu = page.locator('.workspace-menu-btn');
  const drawer = page.locator('.workspace-sidebar');
  await expect(drawer).toHaveAttribute('aria-hidden', 'true');
  await expect(menu).toBeVisible();
  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);

  await menu.click();
  await expect(drawer).toHaveRole('dialog');
  await expect(drawer).not.toHaveAttribute('aria-hidden', 'true');
  const close = drawer.getByRole('button', { name: 'Close menu' });
  const signOut = drawer.getByRole('button', { name: 'Sign out' });
  await expect(signOut).toBeVisible();

  await close.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(signOut).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(drawer).toHaveAttribute('aria-hidden', 'true');
  await expect(menu).toBeFocused();
});

type FooterClearance = {
  footerPosition: string;
  footerZIndex: string;
  innerMinHeight: string;
  innerFlexShrink: string;
  bodyFlexShrink: string;
  footerMarginTop: string;
  saveVisible: boolean;
  saveFullyAboveFooter: boolean;
  nextStepsFullyAboveFooter: boolean;
  lastInnerFullyAboveFooter: boolean;
  saveOverlapsFooterAtCenter: boolean;
  nextStepsOverlapsFooterAtCenter: boolean;
};

async function readFooterClearance(page: Page): Promise<FooterClearance> {
  return page.evaluate(() => {
    const main = document.querySelector('.workspace-shell-main');
    const inner = document.querySelector('.workspace-shell-main-inner');
    const body = document.querySelector('.workspace-shell-main-body');
    const footer = document.querySelector('.dashboard-site-footer');
    if (!(main instanceof HTMLElement) || !(inner instanceof HTMLElement) || !(footer instanceof HTMLElement)) {
      throw new Error('Missing workspace main, inner, or site footer');
    }
    const intersects = (a: DOMRect, b: DOMRect) =>
      !(a.bottom <= b.top + 1 || a.top >= b.bottom - 1 || a.right <= b.left + 1 || a.left >= b.right - 1);
    const aboveFooter = (el: Element | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const rect = el.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      return rect.height > 0 && rect.bottom <= footerRect.top + 1;
    };

    const nextStepsHeading = [...inner.querySelectorAll('h2')].find((heading) => heading.textContent?.trim() === 'Next steps') ?? null;
    const save = [...inner.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Save screening') ?? null;

    // Mike B. screenshot state: Save screening and Next steps both in view while
    // the legal bar sat on top of them. Center the CTA, then check intersection.
    if (save instanceof HTMLElement) {
      save.scrollIntoView({ block: 'center', inline: 'nearest' });
    }
    const footerAtCenter = footer.getBoundingClientRect();
    const saveAtCenter = save instanceof HTMLElement ? save.getBoundingClientRect() : null;
    const nextAtCenter = nextStepsHeading instanceof HTMLElement ? nextStepsHeading.getBoundingClientRect() : null;
    const saveOverlapsFooterAtCenter = saveAtCenter != null && intersects(saveAtCenter, footerAtCenter);
    const nextStepsOverlapsFooterAtCenter = nextAtCenter != null && intersects(nextAtCenter, footerAtCenter);

    main.scrollTop = main.scrollHeight;
    document.documentElement.scrollTop = document.documentElement.scrollHeight;
    const lastContent =
      (body instanceof HTMLElement ? body : null) ??
      [...inner.children]
        .reverse()
        .find((el) => !el.classList.contains('dashboard-site-footer') && !el.classList.contains('admin-footer') && !el.classList.contains('portal-minimal-footer')) ??
      null;
    const lastInnerFullyAboveFooter = aboveFooter(lastContent);
    const nextStepsFullyAboveFooter = aboveFooter(nextStepsHeading);

    if (save instanceof HTMLElement) {
      save.scrollIntoView({ block: 'end', inline: 'nearest' });
    }
    const mainRect = main.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    const saveRect = save instanceof HTMLElement ? save.getBoundingClientRect() : null;
    const saveFullyVisible =
      saveRect != null &&
      saveRect.height > 0 &&
      saveRect.top >= mainRect.top - 1 &&
      saveRect.bottom <= Math.min(mainRect.bottom, footerRect.top) + 1;

    return {
      footerPosition: getComputedStyle(footer).position,
      footerZIndex: getComputedStyle(footer).zIndex,
      innerMinHeight: getComputedStyle(inner).minHeight,
      innerFlexShrink: getComputedStyle(inner).flexShrink,
      bodyFlexShrink: body instanceof HTMLElement ? getComputedStyle(body).flexShrink : 'missing',
      footerMarginTop: getComputedStyle(footer).marginTop,
      saveVisible: saveFullyVisible,
      saveFullyAboveFooter: aboveFooter(save),
      nextStepsFullyAboveFooter,
      lastInnerFullyAboveFooter,
      saveOverlapsFooterAtCenter,
      nextStepsOverlapsFooterAtCenter,
    };
  });
}

test.describe('site footer does not cover member content', () => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    test(`screening Save screening stays above the footer at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/dev/member/wioa-qualification');
      await expect(page.getByRole('button', { name: 'Save screening' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Next steps' })).toBeVisible();

      const clearance = await readFooterClearance(page);
      expect(clearance.footerPosition).toBe('static');
      expect(clearance.bodyFlexShrink).toBe('0');
      expect(clearance.footerMarginTop).toBe('0px');
      expect(clearance.saveOverlapsFooterAtCenter).toBe(false);
      expect(clearance.nextStepsOverlapsFooterAtCenter).toBe(false);
      expect(clearance.saveVisible).toBe(true);
      expect(clearance.saveFullyAboveFooter).toBe(true);
      expect(clearance.nextStepsFullyAboveFooter).toBe(true);
    });

    test(`member home last content stays above the footer at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/dev/member/home');
      await expect(page.locator('.dashboard-site-footer')).toBeVisible();
      const clearance = await readFooterClearance(page);
      expect(clearance.footerPosition).toBe('static');
      expect(clearance.lastInnerFullyAboveFooter).toBe(true);
    });
  }
});

/**
 * WAP-208: the staff header's meta row (view switcher + bell) could not shrink
 * at phone width — a later base rule (`flex-shrink: 0`) beat the phone rule in
 * css/portal-main-extracted.css — so at 390px the header ran 8px past the
 * screen and the notification bell was cut off.
 */
test.describe('staff header at phone width', () => {
  for (const width of [360, 375, 390]) {
    test(`fits the screen and keeps the bell and view switcher whole at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/dev/staff/admin-shell');
      const header = page.locator('.workspace-shell-header');
      await expect(header).toBeVisible();

      const m = await page.evaluate(() => {
        const box = (el: Element | null) => (el ? el.getBoundingClientRect().toJSON() : null);
        const headerEl = document.querySelector('.workspace-shell-header') as HTMLElement;
        const meta = headerEl.querySelector('.workspace-shell-header__meta');
        return {
          headerScroll: headerEl.scrollWidth,
          headerClient: headerEl.clientWidth,
          meta: box(meta),
          switcher: box(headerEl.querySelector('.super-admin-view-switcher')),
          actions: box(headerEl.querySelector('.portal-shell-header__actions')),
        };
      });

      expect(m.headerScroll).toBeLessThanOrEqual(m.headerClient);
      expect(m.actions, 'header actions (bell)').not.toBeNull();
      expect(m.actions!.right).toBeLessThanOrEqual(width);
      if (m.switcher && m.meta) {
        expect(m.switcher.left).toBeGreaterThanOrEqual(m.meta.left - 0.5);
      }
    });
  }
});
