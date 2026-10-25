import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LinkTabs } from '@/components/portal/kit/LinkTabs';

describe('LinkTabs horizontal overflow cue', () => {
  it('shows the continuation state only while more tabs are outside the visible strip', () => {
    render(
      <LinkTabs label="Workspace views" activeKey="today">
        <a className="wa-kit-tab" aria-current="page" href="/today">Today</a>
        <a className="wa-kit-tab" href="/replies">Awaiting reply</a>
        <a className="wa-kit-tab" href="/decisions">Decisions</a>
      </LinkTabs>,
    );

    const tabs = screen.getByRole('navigation', { name: 'Workspace views' });
    Object.defineProperties(tabs, {
      scrollWidth: { configurable: true, value: 480 },
      clientWidth: { configurable: true, value: 300 },
    });
    fireEvent.scroll(tabs);

    expect(tabs).toHaveAttribute('data-scrollable', 'true');
    expect(tabs).toHaveAttribute('data-scroll-start', 'true');
    expect(tabs).toHaveAttribute('data-scroll-end', 'false');

    tabs.scrollLeft = 180;
    fireEvent.scroll(tabs);
    expect(tabs).toHaveAttribute('data-scroll-start', 'false');
    expect(tabs).toHaveAttribute('data-scroll-end', 'true');
  });
});
