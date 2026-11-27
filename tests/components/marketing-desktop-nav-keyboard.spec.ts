import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const layout = readFileSync(path.resolve(root, 'marketing/src/layouts/Layout.astro'), 'utf8');
const css = readFileSync(path.resolve(root, 'marketing/src/styles/blend.css'), 'utf8');
const built = readFileSync(path.resolve(root, 'marketing/dist/programs/index.html'), 'utf8');
const script = layout.match(/<script is:inline data-nav-menus>([\s\S]*?)<\/script>/)?.[1];

/** The three menus as the built programs page renders them. */
function desktopMenus() {
  const nav = built.match(/<nav class="top">[\s\S]*?<\/nav>/)?.[0];
  if (!nav) throw new Error('built programs page is missing the desktop nav');
  const drops = [...nav.matchAll(/<div class="navdrop[\s\S]*?<\/div>\s*<\/div>/g)].map((m) => m[0]);
  if (drops.length !== 3) {
    throw new Error(`expected 3 desktop menus on the built page, found ${drops.length}`);
  }
  for (const menu of drops) {
    if (!/aria-expanded="false"/.test(menu) || !/aria-controls="nav-menu-/.test(menu)) {
      throw new Error('a built menu is missing aria-expanded or aria-controls');
    }
    if (!/id="nav-menu-/.test(menu) || !/\shidden>/.test(menu)) {
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
    expect(menuOf('About Us').querySelector('a')).toHaveFocus();

    trigger('Programs').focus();
    expect(about).toHaveAttribute('aria-expanded', 'false');
    expect(menuOf('About Us').hidden).toBe(true);
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
