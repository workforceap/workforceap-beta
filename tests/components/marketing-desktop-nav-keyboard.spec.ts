import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const source = readFileSync(
  path.resolve(__dirname, '../../marketing/src/layouts/Layout.astro'),
  'utf8',
);
const script = source.match(
  /<script is:inline data-nav-menus>([\s\S]*?)<\/script>/,
)?.[1];

/** The desktop menus as Layout.astro renders them, with the real hrefs. */
const markup = `
<nav class="top">
  <div class="navlinks">
    <div class="navdrop">
      <a class="navdrop-trigger" href="/about" aria-haspopup="true">About Us</a>
      <div class="navdrop-menu">
        <a href="/faq">FAQ</a>
        <a href="/donate">Donate</a>
      </div>
    </div>
    <div class="navdrop">
      <a class="navdrop-trigger" href="/programs" aria-haspopup="true">Programs</a>
      <div class="navdrop-menu">
        <a href="/find-your-path">Find Your Path</a>
        <a href="/program-comparison">Compare Programs</a>
      </div>
    </div>
  </div>
  <div class="navactions">
    <div class="navdrop navdrop--end">
      <a class="navdrop-trigger signin" href="/login">Sign in</a>
      <div class="navdrop-menu navdrop-menu--right">
        <a href="/login?redirectTo=/dashboard">Member Sign In</a>
        <a href="/login?redirectTo=/counselor">Counselor Sign In</a>
        <a href="/login?redirectTo=/employer">Employer Sign In</a>
        <a href="/login?redirectTo=/partner">Partner Sign In</a>
        <a href="/login?redirectTo=/admin">Admin Sign In</a>
      </div>
    </div>
  </div>
</nav>
<nav class="mobilemenu" aria-label="Mobile">
  <details class="mob-acc"><summary>About Us</summary><a href="/faq">FAQ</a></details>
</nav>`;

function start() {
  if (!script) throw new Error('desktop nav keyboard script is missing');
  runInNewContext(script, { document, window });
}

function press(key: string, target: Element = document.activeElement ?? document.body) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

function trigger(name: string) {
  return [...document.querySelectorAll('.navdrop-trigger')].find(
    (el) => el.textContent?.replace(/\s+/g, ' ').trim() === name,
  ) as HTMLAnchorElement;
}

function menuOf(name: string) {
  return trigger(name).nextElementSibling as HTMLElement;
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
      expect(menu.querySelector('a')).toHaveFocus();

      press('Escape');
      expect(button).toHaveAttribute('aria-expanded', 'false');
      expect(menu.hidden).toBe(true);
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
});
