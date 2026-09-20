import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import PasswordToggle from '@/components/forms/PasswordToggle';

afterEach(cleanup);

function Harness() {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <label htmlFor="pw">Password</label>
      <input id="pw" type={visible ? 'text' : 'password'} defaultValue="Secret1A" />
      <PasswordToggle
        visible={visible}
        onToggle={() => setVisible((v) => !v)}
        showLabel="Show password"
        hideLabel="Hide password"
        controls="pw"
        className="skin"
      />
    </div>
  );
}

describe('PasswordToggle (WAP-109 shared extraction)', () => {
  it('is a real button in the tab order with pressed state, name, controls and a decorative SVG glyph', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const input = screen.getByLabelText('Password');
    await user.click(input);
    await user.tab();

    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute('type', 'button');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'pw');
    expect(toggle).not.toHaveAttribute('tabindex', '-1');
    expect(toggle).toHaveClass('password-toggle', 'skin');
    expect(container.querySelector('.material-symbols-outlined')).toBeNull();
    expect(toggle.querySelector('svg[aria-hidden="true"]')).toBeTruthy();

    await user.keyboard('{Enter}');
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');

    await user.keyboard(' ');
    expect(input).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('is the only password reveal implementation on public and portal password forms', () => {
    const root = path.resolve(__dirname, '../..');
    const owners = [
      'app/(auth)/login/LoginForm.tsx',
      'app/(auth)/signup/SignupForm.tsx',
      'app/(auth)/reset-password/page.tsx',
      'app/apply/create-account/ApplyCreateAccountForm.tsx',
      'app/employers/signup/page.tsx',
    ];
    for (const rel of owners) {
      const source = readFileSync(path.join(root, rel), 'utf8');
      expect(source, `${rel} must render the shared PasswordToggle`).toContain("from '@/components/forms/PasswordToggle'");
      // No hand-rolled reveal button next to the shared one.
      expect(source, `${rel} must not hand-roll a show/hide button`).not.toMatch(/visibility_off|<EyeOff|<Eye\b/);
    }
  });

  it('keeps the geometry in one stylesheet rule with a 44px hit target', () => {
    const css = readFileSync(path.resolve(__dirname, '../../css/main.css'), 'utf8');
    const rule = css.match(/\.password-toggle \{([^}]+)\}/)?.[1] ?? '';
    expect(rule).toMatch(/min-width:\s*44px/);
    expect(rule).toMatch(/min-height:\s*44px/);
    expect(rule).toMatch(/position:\s*absolute/);
  });
});
