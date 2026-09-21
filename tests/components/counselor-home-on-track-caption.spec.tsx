import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatSparkTile } from '@/components/portal/kit';
import { CounselorHomeKit } from '@/components/portal/kit/pages/counselor/CounselorHomeKit';

/**
 * Counselor audit gap map, item 1: the Overview "On track" tile says what it
 * counts — members with neither a critical alert nor a warning flag, the
 * `evaluateMemberAttention` null case in lib/attention/evaluate.ts — instead
 * of standing alone as a bare number next to three tiles that do explain
 * themselves. "No risk alert" was wrong: a member in the Warning bucket (no
 * counselor contact 7+ days) has no risk alert yet is not counted on track.
 */
describe('StatSparkTile caption', () => {
  it('renders an optional muted definition line under the label', () => {
    render(<StatSparkTile icon={<span data-icon />} label="On track" value={8} tone="ok" caption="No alert or warning" />);
    const caption = screen.getByText('No alert or warning');
    expect(caption.className).toContain('wa-kit-meta');
    expect(caption.previousElementSibling).toHaveTextContent('On track');
  });

  it('renders nothing extra when no caption is given', () => {
    const { container } = render(<StatSparkTile icon={<span data-icon />} label="Assigned members" value={12} />);
    // The tile's other `.wa-kit-meta` is the trend slot's "No trend yet"
    // placeholder, which is not a caption and is covered by
    // tests/components/stat-tile-trend-slot.spec.tsx.
    expect(container.querySelector('.wa-kit-meta:not([data-testid="stat-trend-empty"])')).toBeNull();
  });
});

describe('CounselorHomeKit On track tile', () => {
  it('captions the On track count with "No alert or warning"', () => {
    render(<CounselorHomeKit firstName="Dana" assignedCount={8} onTrackCount={8} queueRows={[]} queueTotal={0} />);
    const caption = screen.getByText('No alert or warning');
    expect(caption.previousElementSibling).toHaveTextContent('On track');
  });

  it('leaves the other KPI tiles uncaptioned', () => {
    render(<CounselorHomeKit firstName="Dana" assignedCount={8} atRiskCount={2} needsReplyCount={1} onTrackCount={5} queueRows={[]} queueTotal={0} />);
    for (const label of ['Assigned members', 'Members with risk alerts', 'Awaiting reply']) {
      const tile = screen.getByText(label);
      expect(tile.nextElementSibling).toBeNull();
    }
  });
});
