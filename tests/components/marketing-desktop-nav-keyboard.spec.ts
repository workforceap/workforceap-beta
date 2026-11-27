import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const layoutPath = path.resolve(root, 'marketing/src/layouts/Layout.astro');
const cssPath = path.resolve(root, 'marketing/src/styles/blend.css');
const builtPath = path.resolve(root, 'marketing/dist/programs/index.html');
const layout = readFileSync(layoutPath, 'utf8');
const css = readFileSync(cssPath, 'utf8');
const built = readFileSync(builtPath, 'utf8');
const script = layout.match(/<script is:inline data-nav-menus>([\s\S]*?)<\/script>/)?.[1];
const builtScript = built.match(/<script data-nav-menus>([\s\S]*?)<\/script>/)?.[1];

if (!script) throw new Error('desktop nav keyboard script is missing from Layout.astro');
if (statSync(builtPath).mtimeMs < Math.max(statSync(layoutPath).mtimeMs, statSync(cssPath).mtimeMs)) {
  throw new Error('marketing/dist is older than the nav source; run the marketing build before this test');
}
if (!builtScript?.includes('focusout') || builtScript.trim() !== script.trim()) {
  throw new Error('the built programs page does not contain the current nav script; rebuild marketing');
}

/** The three menus as the built programs page renders them. */
function desktopMenus() {
  const nav = built.match(/<nav class="top">[\s\S]*?<\/nav>/)?.[0];
  if (!nav) throw new Error('built programs page is missing the desktop nav');
  const drops = [...nav.matchAll(/<div class="navdrop[\s\S]*?<\/div>\s*<\/div>/g)].map((m) => m[0]);
  if (drops.length !== 3) {
    throw new Error(`expected 3 desktop menus on the built page, found ${drops.length}`);
  }
  for (const item of drops) {
    if (!/aria-expanded="false"/.test(item) || !/aria-controls="nav-menu-/.test(item)) {
      throw new Error('a built menu is missing aria-expanded or aria-controls');
    }
    if (!/id="nav-menu-/.test(item) || !/\shidden>/.test(item)) {
      throw new Error('a built menu is missing its id or the hidden attribute');
    }
  }
  return `<nav class="top">${drops.join('')}</nav>`;
}

const markup = `${desktopMenus()}
<nav class="mobilemenu" aria-label="Mobile">
  <details class="mob-acc"><summary>About Us</summary><a href="/faq">FAQ</a></details>
</nav>
<style>${css}</style>`;

function start() {
  if (!script) throw new Error('desktop nav keyboard script is missing from Layout.astro');
  runInNewContext(script, { document, window });
}

function press(key: string, target: Element = document.activeElement ?? document.body) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

/** jsdom does not move focus on Tab, so follow the browser's focusout order. */
function leaveTo(next: HTMLElement) {
  const from = document.activeElement as HTMLElement;
  const event = new FocusEvent('focusout', { bubbles: true, cancelable: true, relatedTarget: next });
  from.dispatchEvent(event);
  next.focus();
}

function trigger(name: string) {
  return [...document.querySelectorAll('nav.top .navdrop-trigger')].find(
    (el) => el.textContent?.replace(/\s+/g, ' ').trim().startsWith(name),
  ) as HTMLAnchorElement;
}

function menuOf(name: string) {
  const id = trigger(name).getAttribute('aria-controls');
  return document.getElementById(id!) as HTMLElement;
}

function point(type: 'pointerover' | 'pointerout', target: Element, related: Element | null = null) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, 'target', { value: target });
  Object.defineProperty(event, 'relatedTarget', { value: related });
  document.dispatchEvent(event);
}

/** jsdom does not apply author CSS, so read the rule the browser would use. */
function hoverShowsMenu() {
  const hidden = css.match(/\.navdrop-menu\[hidden\]\{([^}]*)\}/)?.[1] ?? '';
  const open = css.match(
    /\.navdrop:hover \.navdrop-menu,\.navdrop\.is-open \.navdrop-menu,\.navdrop:hover\.is-open \.navdrop-menu\{([^}]*)\}/,
  )?.[1] ?? '';
  const hiddenBeatsHover = /display\s*:\s*none\s*!important/.test(hidden);
  return (
    !hiddenBeatsHover &&
    /display\s*:\s*flex/.test(open) &&
    /visibility\s*:\s*visible/.test(open) &&
    /opacity\s*:\s*1/.test(open)
  );
}

beforeEach(() => {
  document.body.innerHTML = markup;
  start();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('desktop marketing menus from the keyboard', () => {
  it.each(['About Us', 'Programs', 'Sign in'])(
    'opens %s with Enter, moves focus in, and closes on Escape',
    (name) => {
      const button = trigger(name);
      button.focus();
      press('Enter', button);

      const menu = menuOf(name);
      expect(button).toHaveAttribute('aria-expanded', 'true');
      expect(menu.hidden).toBe(false);
      expect(button.parentElement).toHaveClass('is-open');
      expect(menu.querySelector('a')).toHaveFocus();

      press('Escape');
      expect(button).toHaveAttribute('aria-expanded', 'false');
      expect(menu.hidden).toBe(true);
      expect(button.parentElement).not.toHaveClass('is-open');
      expect(button).toHaveFocus();
    },
  );

  it('opens Sign in with Space and follows Member Sign In', () => {
    const button = trigger('Sign in');
    button.focus();
    press(' ', button);
    expect(button).toHaveAttribute('aria-expanded', 'true');

    const member = menuOf('Sign in').querySelector('a') as HTMLAnchorElement;
    expect(member).toHaveFocus();
    expect(member).toHaveAttribute('href', '/login?redirectTo=/dashboard');
    expect(member.textContent).toBe('Member Sign In');
  });

  it('opens with ArrowDown and closes when focus leaves the menu', () => {
    const about = trigger('About Us');
    about.focus();
    press('ArrowDown', about);
    const first = menuOf('About Us').querySelector('a') as HTMLAnchorElement;
    expect(first).toHaveFocus();

    leaveTo(trigger('Programs'));
    expect(about).toHaveAttribute('aria-expanded', 'false');
    expect(menuOf('About Us').hidden).toBe(true);
    expect(about.parentElement).not.toHaveClass('is-open');
  });

  it('opens from a click and leaves the mobile drawer on details/summary', () => {
    const programs = trigger('Programs');
    programs.click();
    expect(programs).toHaveAttribute('aria-expanded', 'true');
    expect(menuOf('Programs').hidden).toBe(false);

    const drawer = document.querySelector('.mobilemenu details') as HTMLDetailsElement;
    expect(drawer.open).toBe(false);
    drawer.querySelector('summary')!.click();
    expect(drawer.open).toBe(true);
  });

  it.each(['About Us', 'Programs', 'Sign in'])(
    'hover shows %s and leaving hides it, even while another menu is open',
    (name) => {
      expect(hoverShowsMenu()).toBe(true);
      const style = document.querySelector('style')?.textContent ?? '';
      expect(style).toContain('.navdrop:hover .navdrop-menu');
      expect(style).not.toContain('.navdrop-menu[hidden]{display:none!important}');

      const keyboard = name === 'Sign in' ? trigger('About Us') : trigger('Sign in');
      keyboard.focus();
      press('Enter', keyboard);

      const button = trigger(name);
      const menu = menuOf(name);
      expect(menu.hidden).toBe(true);
      expect(button.parentElement).not.toHaveClass('is-open');

      point('pointerover', button);
      expect(menu.hidden).toBe(false);
      expect(button).toHaveAttribute('aria-expanded', 'true');
      expect(button.parentElement).toHaveClass('is-open');
      expect(keyboard).toHaveAttribute('aria-expanded', 'false');

      point('pointerout', menu, document.body);
      expect(menu.hidden).toBe(true);
      expect(button).toHaveAttribute('aria-expanded', 'false');
      expect(button.parentElement).not.toHaveClass('is-open');
    },
  );
});
