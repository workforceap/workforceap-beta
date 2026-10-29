import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfileSectionFocus } from '@/components/portal/ProfileSectionFocus';

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('ProfileSectionFocus', () => {
  it('focuses the settings section when requested', () => {
    const settings = document.createElement('div');
    settings.id = 'settings';
    settings.scrollIntoView = vi.fn();
    document.body.append(settings);
    const focus = vi.spyOn(settings, 'focus');

    render(<ProfileSectionFocus section="settings" />);

    expect(settings.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(settings.tabIndex).toBe(-1);
  });

  it('does not move focus for other sections', () => {
    const settings = document.createElement('div');
    settings.id = 'settings';
    document.body.append(settings);
    const focus = vi.spyOn(settings, 'focus');

    render(<ProfileSectionFocus section="profile" />);

    expect(focus).not.toHaveBeenCalled();
  });
});
